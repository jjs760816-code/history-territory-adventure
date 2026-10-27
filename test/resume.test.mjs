// 이어 하기: 새로고침·응답 유실·오프라인 대기·로그아웃·재시작 뒤에도 서버가 확정한 기록이 한 번만, 그대로 남는지 확인한다.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, questionOf, answer, tempDir, removeDir, startApp, client, newPlayer, correctIndex, wrongIndex } from './helpers.mjs';
import { RULES } from '../lib/content.mjs';
import '../public/resume.js';

const { createResumeStore, reconcile, classify, createSender } = globalThis.HistoryResume;

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    dump: () => [...m.entries()],
  };
}
const rightOf = (db, ch) => { const { q, order } = questionOf(db, ch.challengeId); return q.type === 'short' ? q.acceptedAnswers[0] : order.indexOf(q.answer); };
const FORBIDDEN = ['answer', 'acceptedAnswers', 'explanation', 'optionFeedback', 'correctChoice'];

test('용량 초과로 쓰기만 막힌 저장소에서도 현재 탭의 보낼 답을 잃지 않는다',()=>{
  const store=createResumeStore({storage:{getItem:()=>null,setItem:()=>{throw Error('quota')},removeItem(){},key:()=>null,length:0}});
  const account=store.forAccount('0123456789ab');const queued=account.queueAnswer('a'.repeat(32),1);
  assert.equal(account.pending().requestId,queued.requestId);account.markPending('uncertain');assert.equal(account.pending().status,'uncertain');
});

describe('서버: 이어 풀 도전(activeChallenge)', () => {
  test('새로고침해도 같은 문제·같은 보기 순서로 이어 풀고, 정답 정보는 보내지 않는다', () => {
    const f = fixture();
    try {
      const ch = f.game.startRegionChallenge(f.id, 'r05');
      const st = f.game.state(f.id);
      assert.equal(st.activeChallenge.challengeId, ch.challengeId);
      assert.deepEqual(st.activeChallenge.question.choices, ch.question.choices);
      assert.equal(st.activeChallenge.expiresAt, ch.expiresAt);
      assert.equal(st.activeChallenge.resumed, true);
      for (const k of FORBIDDEN) assert.ok(!(k in st.activeChallenge.question), k);
      assert.ok(!JSON.stringify(st.activeChallenge).includes('acceptedAnswers'));
      // 이어 연 문제로 답해도 판정·보상이 정상
      const r = answer(f.db, f.game, f.id, st.activeChallenge, true);
      assert.equal(r.correct, true);
      assert.equal(f.game.state(f.id).activeChallenge, null);
    } finally { f.close(); }
  });

  test('만료된 도전은 되살리지 않고 만료만 알린다(문제 없음), 답해도 보상 없음', () => {
    let t = 1_800_000_000_000;
    const f = fixture({ clock: () => t });
    try {
      const ch = f.game.startRegionChallenge(f.id, 'r05');
      const right = rightOf(f.db, ch);
      t += RULES.challengeTtlMs + 1;
      const st = f.game.state(f.id);
      assert.equal(st.activeChallenge.expired, true);
      assert.equal(st.activeChallenge.challengeId, ch.challengeId);
      assert.equal(st.activeChallenge.question, undefined);
      const xp = st.player.xp;
      assert.throws(() => f.game.answer(f.id, ch.challengeId, right, { requestId: 'req-expired-1' }), (e) => e.code === 'challenge_expired');
      // 같은 요청을 다시 보내도 계속 만료(되살아나지 않음)
      assert.throws(() => f.game.answer(f.id, ch.challengeId, right, { requestId: 'req-expired-1' }), (e) => e.code === 'challenge_expired');
      assert.equal(f.game.state(f.id).player.xp, xp);
      assert.equal(f.game.state(f.id).activeChallenge, null);
    } finally { f.close(); }
  });
});

describe('서버: 응답 유실 뒤 같은 요청 다시 보내기', () => {
  test('커밋 뒤 응답을 잃어도 같은 요청 번호면 저장 결과를 돌려주고 보상은 한 번만', () => {
    const f = fixture();
    try {
      const ch = f.game.startRegionChallenge(f.id, 'r05');
      const right = rightOf(f.db, ch);
      const xp0 = f.game.state(f.id).player.xp;
      const first = f.game.answer(f.id, ch.challengeId, right, { requestId: 'req-lost-0001' }); // 응답이 사라졌다고 가정
      const xp1 = f.game.state(f.id).player.xp;
      assert.ok(xp1 > xp0);
      const again = f.game.answer(f.id, ch.challengeId, right, { requestId: 'req-lost-0001' });
      assert.equal(again.replayed, true);
      assert.equal(again.correct, true);
      assert.deepEqual(again.reward, first.reward);
      assert.deepEqual(again.territory, first.territory);
      assert.equal(again.state.player.xp, xp1);
      assert.equal(f.game.state(f.id).player.xp, xp1);
      assert.equal(f.db.prepare('SELECT COUNT(*) n FROM attempts WHERE player_id = ?').get(f.id).n, 1);
      // 요청 번호가 없거나, 다르거나, 답이 다르면 예전처럼 막는다
      assert.throws(() => f.game.answer(f.id, ch.challengeId, right), (e) => e.code === 'challenge_used');
      assert.throws(() => f.game.answer(f.id, ch.challengeId, right, { requestId: 'req-other-0001' }), (e) => e.code === 'challenge_used');
      const other = typeof right === 'string' ? '다른답' : (right + 1) % ch.question.choices.length;
      assert.throws(() => f.game.answer(f.id, ch.challengeId, other, { requestId: 'req-lost-0001' }), (e) => e.code === 'challenge_used');
      // 다른 학생은 같은 도전·요청 번호로 결과를 받을 수 없다
      const otherPlayer = f.game.createPlayer('다른학생').playerId;
      assert.throws(() => f.game.answer(otherPlayer, ch.challengeId, right, { requestId: 'req-lost-0001' }), (e) => e.code === 'challenge_used');
    } finally { f.close(); }
  });

  test('영수증은 플레이어별 최근 몇 개만 남긴다(저장 파일 크기 제한)', () => {
    const f = fixture();
    try {
      for (let i = 0; i < 9; i++) {
        const ch = f.game.startRegionChallenge(f.id, 'r05');
        f.game.answer(f.id, ch.challengeId, rightOf(f.db, ch), { requestId: `req-keep-${String(i).padStart(4, '0')}` });
      }
      assert.ok(f.db.prepare('SELECT COUNT(*) n FROM answer_receipts WHERE player_id = ?').get(f.id).n <= 5);
    } finally { f.close(); }
  });
});

describe('브라우저 보관함(resume.js)', () => {
  const A = 'aaaaaaaaaaaa';
  const B = 'bbbbbbbbbbbb';
  const ch = { challengeId: 'c'.repeat(32), mode: 'region', regionId: 'r05', expiresAt: 1, question: { type: 'short', text: '문제', choices: [], answerHint: 'ㅈㅁㄷㄲ', sources: [] } };

  test('초안은 탐험대별로 나뉘어 다른 학생에게 보이지 않고, 비밀번호·토큰은 저장하지 않는다', () => {
    const storage = fakeStorage();
    const store = createResumeStore({ storage });
    const a = store.forAccount(A);
    a.setChallenge(ch);
    a.saveDraft(ch.challengeId, '주먹');
    a.saveUi({ view: 'history', regionId: 'r05' });
    store.rememberUser('학생가');
    // 새로고침: 새 보관함 객체로 다시 읽음
    const again = createResumeStore({ storage }).forAccount(A);
    assert.equal(again.draftFor(ch.challengeId), '주먹');
    assert.deepEqual(again.snapshot().ui, { view: 'history', regionId: 'r05' });
    // 다른 학생 로그인
    const b = createResumeStore({ storage }).forAccount(B);
    assert.equal(b.draftFor(ch.challengeId), null);
    assert.deepEqual(b.snapshot(), {});
    assert.equal(reconcile(b.snapshot(), { ...ch }).draft, null);
    // 이상한 ref 는 저장하지 않음
    createResumeStore({ storage }).forAccount('../x').saveDraft('x', 'y');
    for (const [k, v] of storage.dump()) assert.doesNotMatch(k + v, /password|token|history_session|hta_sid/i);
    // 공용 기기 로그아웃: 모두 지움
    createResumeStore({ storage }).clearAll();
    assert.equal(storage.length, 0);
    assert.equal(createResumeStore({ storage }).lastUser(), null);
  });

  test('서버 상태와 맞추기: 이어 풀기·만료·이미 처리된 문제·닫은 문제', () => {
    const snap = { challenge: { challengeId: ch.challengeId }, draft: { challengeId: ch.challengeId, value: '주먹' } };
    let plan = reconcile(snap, ch);
    assert.equal(plan.open, ch);
    assert.equal(plan.draft, '주먹');
    plan = reconcile(snap, { challengeId: ch.challengeId, expired: true });
    assert.equal(plan.open, null);
    assert.equal(plan.notice, 'expired');
    plan = reconcile(snap, null);
    assert.equal(plan.notice, 'stale');
    assert.equal(plan.clearChallenge, true);
    plan = reconcile({ ...snap, dismissed: ch.challengeId }, ch);
    assert.equal(plan.open, null);
    // 다른 문제가 서버에 있으면 예전 초안은 붙이지 않음
    plan = reconcile(snap, { ...ch, challengeId: 'd'.repeat(32) });
    assert.equal(plan.draft, null);
    // 보낼 답이 있으면 서버에 문제가 없어도 보관한 문제 화면으로 다시 보냄
    plan = reconcile({ ...snap, pending: { challengeId: ch.challengeId } }, null);
    assert.equal(plan.open.challengeId, ch.challengeId);
    assert.ok(plan.pending);
  });

  test('응답 분류: 로그인 오류는 연결 오류처럼 되풀이하지 않는다', () => {
    assert.equal(classify(200, {}), 'saved');
    assert.equal(classify(401, { error: 'no_session' }), 'auth');
    assert.equal(classify(403, { error: 'password_change_required' }), 'auth');
    assert.equal(classify(409, { error: 'challenge_expired' }), 'expired');
    assert.equal(classify(409, { error: 'challenge_used' }), 'gone');
    assert.equal(classify(409, { message: '동시 요청이 많아요.' }), 'retry');
    assert.equal(classify(503, {}), 'retry');
    assert.equal(classify(400, { error: 'bad_choice' }), 'rejected');
  });

  test('다른 문제의 답이 남아 있으면 덮어쓰지 않는다', () => {
    const a = createResumeStore({ storage: fakeStorage() }).forAccount(A);
    const p = a.queueAnswer('1'.repeat(32), 2);
    assert.equal(a.queueAnswer('1'.repeat(32), 3).requestId, p.requestId); // 같은 문제: 같은 요청 번호
    assert.equal(a.queueAnswer('2'.repeat(32), 1), null);
    assert.equal(a.pending().challengeId, '1'.repeat(32));
  });
});

describe('HTTP: 오프라인 대기·응답 유실·로그아웃·재시작', () => {
  let dir;
  let app;
  before(async () => { dir = tempDir(); app = await startApp(dir); });
  after(async () => { await app.close(); removeDir(dir); });

  // 실제 서버로 보내되, 원하면 서버가 처리한 뒤 응답만 잃은 것처럼 만든다.
  const transport = (c, ctl) => async (path, body) => {
    ctl.calls++;
    if (ctl.offline) throw new TypeError('Failed to fetch');
    const r = await c.post(path, body);
    if (ctl.dropAfterCommit) { ctl.dropAfterCommit = false; throw new TypeError('network lost after commit'); }
    return { status: r.status, data: r.json };
  };

  test('새로고침 중 퀴즈: 같은 문제 이어 풀기 + 단답 초안 복원', async () => {
    const c = await newPlayer(app.base, '새로고침');
    const ch = (await c.post('/api/regions/r05/challenge')).json;
    const storage = fakeStorage();
    const st1 = (await c.get('/api/state')).json;
    const acct = createResumeStore({ storage }).forAccount(st1.player.ref);
    acct.setChallenge(ch);
    acct.saveDraft(ch.challengeId, '쓰던 답');
    // 새로고침
    const st2 = (await c.get('/api/state')).json;
    const plan = reconcile(createResumeStore({ storage }).forAccount(st2.player.ref).snapshot(), st2.activeChallenge);
    assert.equal(plan.open.challengeId, ch.challengeId);
    assert.deepEqual(plan.open.question.choices, ch.question.choices);
    assert.equal(plan.draft, '쓰던 답');
  });

  test('오프라인에서 답 보관 → 연결 뒤 응답 유실 → 다시 보내기: 보상 한 번, 결과 복원', async () => {
    const c = await newPlayer(app.base, '오프라인');
    const ch = (await c.post('/api/regions/r05/challenge')).json;
    const st0 = (await c.get('/api/state')).json;
    const acct = createResumeStore({ storage: fakeStorage() }).forAccount(st0.player.ref);
    const ctl = { calls: 0, offline: true, dropAfterCommit: false };
    let online = false;
    const sender = createSender({ post: transport(c, ctl), isOnline: () => online });

    acct.setChallenge(ch);
    const queued = acct.queueAnswer(ch.challengeId, correctIndex(ch));
    assert.equal(queued.status, 'unsent');
    let out = await sender.send(acct);
    assert.equal(out.kind, 'offline');
    assert.equal(ctl.calls, 0); // 오프라인이면 보내지 않음
    assert.equal(acct.pending().status, 'unsent');

    // 연결됨: 서버는 커밋했지만 응답을 잃음
    online = true; ctl.offline = false; ctl.dropAfterCommit = true;
    out = await sender.send(acct);
    assert.equal(out.kind, 'offline');
    assert.equal(out.uncertain, true);
    assert.equal(acct.pending().status, 'uncertain');
    const xpCommitted = (await c.get('/api/state')).json.player.xp;
    assert.ok(xpCommitted > st0.player.xp, '서버는 이미 저장함');

    // 동시에 두 번 눌러도 한 요청만
    const [o1, o2] = await Promise.all([sender.send(acct), sender.send(acct)]);
    assert.equal(o1, o2);
    assert.equal(o1.kind, 'saved');
    assert.equal(o1.result.replayed, true);
    assert.equal(o1.result.correct, true);
    assert.equal(ctl.calls, 2);
    assert.equal(acct.pending(), null);
    assert.equal(acct.snapshot().challenge, null);
    assert.equal((await c.get('/api/state')).json.player.xp, xpCommitted);
    const hist = (await c.get('/api/history')).json;
    assert.equal(hist.attempts.length, 1);
  });

  test('로그인 끊김(401)은 보관한 답을 지우지 않고 연결 오류로 되풀이하지 않는다', async () => {
    const c = await newPlayer(app.base, '세션끊김');
    const ch = (await c.post('/api/regions/r05/challenge')).json;
    const ref = (await c.get('/api/state')).json.player.ref;
    const cookie = c.cookie;
    c.cookie = '';
    const acct = createResumeStore({ storage: fakeStorage() }).forAccount(ref);
    acct.queueAnswer(ch.challengeId, wrongIndex(ch));
    const ctl = { calls: 0 };
    const out = await createSender({ post: transport(c, ctl) }).send(acct);
    assert.equal(out.kind, 'auth');
    assert.ok(acct.pending());
    // 다시 로그인(같은 쿠키)하면 이어서 보냄
    c.cookie = cookie;
    const again = await createSender({ post: transport(c, ctl) }).send(acct);
    assert.equal(again.kind, 'saved');
    assert.equal(again.result.correct, false);
  });

  test('로그아웃은 서버 세션도 끝낸다(남은 쿠키 복사본 사용 불가)', async () => {
    const c = await newPlayer(app.base, '로그아웃');
    const copy = c.cookie;
    assert.equal((await c.post('/api/logout')).status, 200);
    const stolen = client(app.base);
    stolen.cookie = copy;
    assert.equal((await stolen.get('/api/state')).status, 401);
  });

  test('서버 재시작 뒤에도 이어 풀 도전·영수증 복원', async () => {
    const d = tempDir();
    try {
      let a = await startApp(d);
      const c = await newPlayer(a.base, '재시작');
      const ch = (await c.post('/api/regions/r05/challenge')).json;
      await a.close();
      a = await startApp(d);
      const c2 = client(a.base);
      c2.cookie = c.cookie;
      const st = (await c2.get('/api/state')).json;
      assert.equal(st.activeChallenge.challengeId, ch.challengeId);
      const body = { challengeId: ch.challengeId, choiceIndex: correctIndex(ch), requestId: 'req-restart-01' };
      const first = await c2.post('/api/answer', body);
      assert.equal(first.status, 200);
      await a.close();
      a = await startApp(d);
      const c3 = client(a.base);
      c3.cookie = c.cookie;
      const replay = await c3.post('/api/answer', body);
      assert.equal(replay.status, 200);
      assert.equal(replay.json.replayed, true);
      assert.equal(replay.json.state.player.xp, first.json.state.player.xp);
      await a.close();
    } finally { removeDir(d); }
  });
});
