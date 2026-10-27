// 공용 Worker 이어 하기: R2 저장 파일 기준으로 응답 유실 재전송·로그아웃 세션 무효·비밀번호 초기화·재로그인 뒤 이어 풀기를 확인한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker from '../dist/server/index.js';
import { QUESTIONS } from '../lib/questions.mjs';

class Bucket {
  data = null; etag = null;
  async get() { if (!this.data) return null; const b = this.data.slice(), etag = this.etag; return { etag, httpEtag: '"' + etag + '"', arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; }
  async put(k, data, { onlyIf }) {
    if (onlyIf.get('If-Match') && onlyIf.get('If-Match') !== '"' + this.etag + '"') return null;
    if (onlyIf.get('If-None-Match') === '*' && this.etag) return null;
    this.data = new Uint8Array(data).slice(); this.etag = createHash('sha256').update(this.data).digest('hex'); return { etag: this.etag };
  }
}
globalThis.WorkerGlobalScope = class {}; globalThis.self = globalThis;
const env = { BUCKET: new Bucket(), AUTH_PEPPER: 'resume-test-only-not-a-real-secret', ADMIN_OWNER_EMAIL: 'teacher@example.test' };
function client(extraHeaders = {}) {
  let cookie = '';
  return {
    get cookie() { return cookie; }, set cookie(v) { cookie = v; },
    async call(path, body) {
      const r = await worker.fetch(new Request('https://game.example' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'https://game.example', ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      return { status: r.status, json: await r.json() };
    },
  };
}
const answerOf = (ch) => { const q = QUESTIONS.find((x) => x.question === ch.question.text); return q.type === 'short' ? { answerText: q.acceptedAnswers[0] } : { choiceIndex: ch.question.choices.indexOf(q.choices[q.answer]) }; };

test('공유 Worker: 응답을 잃은 답을 같은 요청 번호로 다시 보내면 저장 결과만 돌려주고 보상은 한 번', async () => {
  const s = client();
  assert.equal((await s.call('/api/auth/register', { username: '이어학생', password: 'Resume92!x' })).status, 201);
  const ch = (await s.call('/api/regions/r05/challenge', {})).json;
  const body = { challengeId: ch.challengeId, ...answerOf(ch), requestId: 'worker-req-0001' };
  const first = await s.call('/api/answer', body); // 브라우저는 이 응답을 잃었다고 가정
  assert.equal(first.status, 200);
  const replay = await s.call('/api/answer', body);
  assert.equal(replay.status, 200);
  assert.equal(replay.json.replayed, true);
  assert.deepEqual(replay.json.reward, first.json.reward);
  assert.equal(replay.json.state.player.xp, first.json.state.player.xp);
  assert.equal((await s.call('/api/state')).json.player.xp, first.json.state.player.xp);
  assert.equal((await s.call('/api/history')).json.attempts.length, 1);
  // 요청 번호 없이 다시 보내면 예전처럼 막힘
  assert.equal((await s.call('/api/answer', { challengeId: ch.challengeId, ...answerOf(ch) })).json.error, 'challenge_used');
});

test('공유 Worker: 다시 로그인하면 풀던 문제를 이어 풀고, 로그아웃은 서버 세션을 끝낸다', async () => {
  const s = client();
  assert.equal((await s.call('/api/auth/register', { username: '재로그인', password: 'Resume92!y' })).status, 201);
  const ch = (await s.call('/api/regions/r05/challenge', {})).json;
  const copy = s.cookie;
  assert.equal((await s.call('/api/logout', {})).status, 200);
  assert.equal(s.cookie, 'history_session=');
  const stolen = client(); stolen.cookie = copy;
  assert.equal((await stolen.call('/api/state')).status, 401, '로그아웃 뒤 남은 쿠키 복사본은 쓸 수 없음');
  const again = client();
  assert.equal((await again.call('/api/auth/login', { username: '재로그인', password: 'Resume92!y' })).status, 200);
  const st = (await again.call('/api/state')).json;
  assert.equal(st.activeChallenge.challengeId, ch.challengeId);
  assert.deepEqual(st.activeChallenge.question.choices, ch.question.choices);
  assert.ok(!('answer' in st.activeChallenge.question));
  const r = await again.call('/api/answer', { challengeId: ch.challengeId, ...answerOf(ch), requestId: 'worker-req-0002' });
  assert.equal(r.status, 200);
  assert.equal(r.json.correct, true);
});

test('공유 Worker: 비밀번호 초기화는 기존 세션을 끊고, 보관한 답은 다시 로그인한 뒤 보낼 수 있다', async () => {
  const admin = client({ 'oai-authenticated-user-email': 'teacher@example.test' });
  assert.equal((await admin.call('/api/auth/register', { username: '이어선생님', password: 'Teacher92!z' })).status, 201);
  const s = client();
  await s.call('/api/auth/register', { username: '초기화학생', password: 'Before92!z' });
  const ch = (await s.call('/api/regions/r05/challenge', {})).json;
  const reset = await admin.call('/api/admin/reset', { username: '초기화학생' });
  assert.equal(reset.status, 200);
  const body = { challengeId: ch.challengeId, ...answerOf(ch), requestId: 'worker-req-0003' };
  const blocked = await s.call('/api/answer', body);
  assert.equal(blocked.status, 401); // 로그인 오류: 브라우저는 연결 오류처럼 되풀이하지 않고 보관
  assert.equal((await s.call('/api/auth/login', { username: '초기화학생', password: reset.json.temporaryPassword })).status, 200);
  assert.equal((await s.call('/api/answer', body)).json.error, 'password_change_required');
  assert.equal((await s.call('/api/auth/password', { currentPassword: reset.json.temporaryPassword, newPassword: 'After92!zz' })).status, 200);
  const ok = await s.call('/api/answer', body);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.correct, true);
});
