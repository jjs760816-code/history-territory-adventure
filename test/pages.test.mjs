// 웹 체험판(GitHub Pages) 빌드: 빌드 결과물을 Node 에서 그대로 불러 같은 규칙으로 동작하는지 확인한다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPages } from '../scripts/build-pages.mjs';
import { createHash as nodeCreateHash, randomBytes as nodeRandomBytes } from 'node:crypto';
import { tempDir, removeDir, correctIndex, wrongIndex } from './helpers.mjs';

let dir, out, SQL, createLocalApi, shim;

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}
function apiClient(api) {
  const call = (method, path, body) => {
    const r = api.handle(method, path, body === undefined ? undefined : JSON.stringify(body));
    return { status: r.status, json: r.body };
  };
  return { get: (p) => call('GET', p), post: (p, b = {}) => call('POST', p, b), raw: (p, text) => api.handle('POST', p, text) };
}

before(async () => {
  dir = tempDir();
  out = await buildPages(join(dir, 'dist'));
  SQL = await createRequire(import.meta.url)(join(out, 'vendor', 'sql-wasm.js'))();
  ({ createLocalApi } = await import(pathToFileURL(join(out, 'lib', 'local-api.mjs')).href));
  shim = await import(pathToFileURL(join(out, 'lib', 'crypto-shim.mjs')).href);
});
after(() => removeDir(dir));

test('pages: 빌드에 필요한 파일이 있고 HTML 경로가 하위 경로용 상대 경로다', () => {
  for (const f of ['index.html', 'app.js', 'style.css', 'web-entry.mjs', '.nojekyll', 'vendor/sql-wasm.js', 'vendor/sql-wasm.wasm', 'lib/game.mjs', 'lib/db.mjs', 'lib/local-api.mjs']) {
    assert.ok(existsSync(join(out, f)), f);
  }
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  assert.match(html, /"node:crypto":"\.\/lib\/crypto-shim\.mjs"/);
  assert.doesNotMatch(html, /(src|href)="\//);
  assert.ok(html.indexOf('web-entry.mjs') < html.indexOf('src="app.js"'));
  assert.doesNotMatch(readFileSync(join(out, 'lib', 'db.mjs'), 'utf8'), /from 'node:sqlite'/);
});

test('pages: 브라우저용 crypto 대체가 node:crypto 와 같은 값을 낸다', () => {
  for (const s of ['', 'abc', '가나다라'.repeat(40), nodeRandomBytes(48).toString('base64url')]) {
    assert.equal(shim.createHash('sha256').update(s).digest('hex'), nodeCreateHash('sha256').update(s).digest('hex'));
  }
  assert.match(shim.randomBytes(16).toString('hex'), /^[0-9a-f]{32}$/);
  assert.match(shim.randomBytes(32).toString('base64url'), /^[A-Za-z0-9_-]{43}$/);
  const seen = new Set();
  for (let i = 0; i < 400; i++) { const v = shim.randomInt(4); assert.ok(v >= 0 && v < 4); seen.add(v); }
  assert.equal(seen.size, 4);
});

test('pages: 시작 → 오답·복습 → 점령 → 두 번의 시대 발전 → 새로고침 후 복원', () => {
  const storage = memoryStorage();
  let c = apiClient(createLocalApi({ SQL, storage }));
  const meta = c.get('/api/meta').json;
  assert.equal(meta.demo.mode, 'web-single-player');
  assert.ok(meta.cards.every((card) => !('cond' in card)));
  assert.equal(c.get('/api/state').status, 401);
  assert.equal(c.post('/api/session', { nickname: '01012345678' }).status, 400);
  assert.equal(c.post('/api/session', { nickname: '웹탐험가' }).status, 201);

  const play = (region, correct = true) => {
    const ch = c.post(`/api/regions/${region}/challenge`);
    assert.equal(ch.status, 200);
    assert.ok(!('answer' in ch.json.question) && !('explanation' in ch.json.question));
    const r = c.post('/api/answer', { challengeId: ch.json.challengeId, choiceIndex: correct ? correctIndex(ch.json) : wrongIndex(ch.json) });
    assert.equal(r.status, 200);
    assert.equal(r.json.correct, correct);
    // 같은 도전 재전송은 거부
    assert.equal(c.post('/api/answer', { challengeId: ch.json.challengeId, choiceIndex: 0 }).status, 409);
    return r.json;
  };

  assert.equal(c.post('/api/regions/r03/challenge').status, 403); // 신석기 지역 잠김
  assert.equal(play('r05', false).state.player.xp, 0);
  const rev = c.post('/api/review/challenge').json;
  assert.equal(c.post('/api/answer', { challengeId: rev.challengeId, choiceIndex: correctIndex(rev) }).json.correct, true);
  assert.equal(play('r05').territory.captured, true);
  for (let i = 0; i < 6; i++) play(['r05', 'r08', 'r09'][i % 3]);
  assert.equal(c.post('/api/advance').json.era, 'neolithic');
  for (let i = 0; i < 6; i++) play(['r03', 'r06'][i % 2]);
  assert.equal(c.post('/api/advance').json.era, 'gojoseon');
  assert.equal(c.post('/api/advance').status, 400);

  const sub = c.post('/api/submissions', {
    era: 'gojoseon', regionId: null, question: '고인돌은 어느 시대의 무덤일까요?', choices: ['구석기', '신석기', '청동기', '조선'],
    answerIndex: 2, explanation: '고인돌은 청동기 시대 지배층의 무덤이에요.', source: '국립중앙박물관 누리집',
  });
  assert.equal(sub.status, 201);
  assert.equal(sub.json.status, 'pending_review');
  assert.equal(c.raw('/api/answer', 'null').status, 400);
  assert.equal(c.raw('/api/answer', '{').status, 400);

  const beforeReload = c.get('/api/state').json;
  // 새로고침: 같은 저장소로 새 인스턴스
  c = apiClient(createLocalApi({ SQL, storage }));
  const afterReload = c.get('/api/state').json;
  assert.deepEqual(afterReload.player, beforeReload.player);
  assert.deepEqual(afterReload.regions, beforeReload.regions);
  assert.equal(afterReload.eraLog.length, 3);
  assert.equal(c.get('/api/submissions').json.submissions.length, 1);

  // 처음으로: 연결만 끊긴다
  assert.equal(c.post('/api/logout').status, 200);
  assert.equal(c.get('/api/state').status, 401);
});

test('pages: 깨진 저장본이 있어도 새로 시작할 수 있다', () => {
  const storage = memoryStorage();
  storage.setItem('hta_web_db_v1', 'not-base64-@@@');
  const c = apiClient(createLocalApi({ SQL, storage }));
  assert.equal(c.post('/api/session', { nickname: '새출발' }).status, 201);
  assert.equal(c.get('/api/state').status, 200);
});
