// 9개 시대 캠페인·미션 보상 장부·저장 이전·웹 체험판 하위 경로 빌드 검사
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tempDir, removeDir, startApp, newPlayer, answerRegion, correctIndex } from './helpers.mjs';
import { QUESTIONS, QUESTION_BY_ID } from '../lib/questions.mjs';
import { ERAS, ADVANCE_RULES, MISSIONS, MISSION_BY_ID, REGIONS, CARDS, MISSION_WEIGHTING } from '../lib/content.mjs';
import { openDb } from '../lib/db.mjs';
import { createGame } from '../lib/game.mjs';
import { buildPages } from '../scripts/build-pages.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const ORIGINAL_ERAS = ['paleolithic', 'neolithic', 'gojoseon'];
const NEW_ERAS = ['samguk', 'nambuk', 'goryeo', 'joseon', 'modern', 'republic'];

describe('캠페인 콘텐츠', () => {
  test('9개 시대: 처음 3개 시대 id·순서 보존, 새 시대 6개가 순서대로 이어진다', () => {
    assert.deepEqual(ERAS.map((e) => e.id), [...ORIGINAL_ERAS, ...NEW_ERAS]);
    ERAS.forEach((e, i) => {
      assert.equal(e.order, i);
      for (const k of ['name', 'short', 'period', 'summary', 'chapter']) assert.ok(e[k], `${e.id}.${k}`);
    });
    assert.deepEqual(REGIONS.map((r) => r.id), Array.from({ length: 16 }, (_, i) => `r${String(i + 1).padStart(2, '0')}`));
  });

  test('새 시대마다 8개 이상 자체 문제, 공식 기관 주소가 있는 출처, 모두 검수 대기, 연구 가설 출제 없음', () => {
    for (const era of NEW_ERAS) {
      const qs = QUESTIONS.filter((q) => q.era === era);
      assert.ok(qs.length >= 8, `${era}: ${qs.length}`);
      for (const q of qs) {
        assert.equal(q.reviewStatus, 'pending');
        assert.ok(q.sources.length && q.sources.every((s) => /https:\/\/[a-z0-9.-]+\.(go\.kr|or\.kr|org)/.test(s)), q.id);
        assert.ok(q.explanation.length >= 10 && q.objective, q.id);
        assert.doesNotMatch(`${q.question}${q.explanation}`, /박정재|가설/);
      }
    }
  });

  test('시대 발전 조건: 이전 시대에서 서로 다른 정답 6개 이상·필수 미션·늘어나는 경험치', () => {
    let prevXp = 0;
    for (let i = 1; i < ERAS.length; i++) {
      const rule = ADVANCE_RULES[ERAS[i].id];
      assert.ok(rule, ERAS[i].id);
      assert.equal(rule.from, ERAS[i - 1].id);
      assert.equal(rule.uniqueEra, ERAS[i - 1].id);
      assert.ok(rule.uniqueCorrect >= 6);
      assert.ok(rule.xp > prevXp);
      prevXp = rule.xp;
      const m = MISSION_BY_ID.get(rule.mission);
      assert.equal(m.era, rule.from);
      assert.equal(m.required, true);
    }
    assert.equal(ADVANCE_RULES.neolithic.xp, 60); // v1 수치 유지
    assert.equal(ADVANCE_RULES.gojoseon.xp, 150);
  });

  test('미션: 선사 시대 핵심 2~3개, 삼국 이후 사건·기회 4~11개, 보상·알림 문구·문제 연결이 모두 있다', () => {
    for (const era of ORIGINAL_ERAS) {
      const core = MISSIONS.filter((m) => m.era === era && m.kind === 'core').length;
      assert.ok(core >= 2 && core <= 4, `${era} core ${core}`);
    }
    for (const era of NEW_ERAS) {
      const ms = MISSIONS.filter((m) => m.era === era);
      const ev = ms.filter((m) => m.kind !== 'core').length;
      assert.ok(ev >= 4 && ev <= 11, `${era} event/opportunity ${ev}`);
      assert.ok(CARDS.some((c) => c.era === era), `${era} card`);
    }
    for (const m of MISSIONS) {
      for (const k of ['trigger', 'desc', 'rewardText', 'kind', 'action']) assert.ok(m[k], `${m.id}.${k}`);
      assert.ok(Number.isInteger(m.reward.xp) && Number.isInteger(m.reward.grain) && Number.isInteger(m.reward.population));
      if (m.reward.card) assert.ok(CARDS.some((c) => c.id === m.reward.card), m.id);
      for (const id of m.questionIds) assert.equal(QUESTION_BY_ID.get(id)?.era, m.era, `${m.id} → ${id}`);
      if (m.action === 'quiz') assert.ok(m.questionIds.length > 0, m.id);
    }
    assert.ok(MISSION_WEIGHTING.note.includes('공식 출제율은 아니에요'));
  });

  test('배경 이야기 자료: 장면 5개·안내 4단계·출처 id 연결', () => {
    const story = JSON.parse(readFileSync(join(ROOT, 'public/assets/story.json'), 'utf8'));
    assert.equal(story.slides.length, 5);
    assert.equal(story.tutorial.length, 4);
    const ids = new Set(story.sources.map((s) => s.id));
    for (const s of story.slides) for (const id of s.sourceIds) assert.ok(ids.has(id), id);
    // 화면 코드는 이야기 글을 따로 지어내지 않고 story.json 을 읽는다.
    const app = readFileSync(join(ROOT, 'public/app.js'), 'utf8');
    assert.ok(!app.includes(story.slides[0].paragraphs[0].slice(0, 20)));
    assert.match(app, /assets\/story\.json/);
  });
});

describe('미션 API', () => {
  let dir, app;
  before(async () => { dir = tempDir(); app = await startApp(dir); });
  after(async () => { await app.close(); removeDir(dir); });

  const solveMission = async (c, id) => {
    const ch = await c.post(`/api/missions/${id}/challenge`);
    assert.equal(ch.status, 200, JSON.stringify(ch.json));
    const r = await c.post('/api/answer', { challengeId: ch.json.challengeId, choiceIndex: correctIndex(ch.json) });
    assert.equal(r.status, 200);
    return { ch: ch.json, r: r.json };
  };

  test('새 원정대의 미션 상태: 지금 시대는 진행 중, 뒤 시대는 잠김(진행·보상 정보 없음)', async () => {
    const c = await newPlayer(app.base, '상태확인');
    const st = (await c.get('/api/state')).json;
    assert.match(st.player.ref, /^[0-9a-f]{12}$/);
    const s = (id) => st.missions.find((m) => m.id === id);
    assert.equal(s('m_tools').status, 'active');
    assert.deepEqual(s('m_tools').progress, { current: 0, need: 2 });
    assert.equal(s('m_sg_found').status, 'locked');
    assert.equal(s('m_sg_found').progress, null);
    assert.equal(s('m_sg_found').receipt, null);
    assert.equal(st.missions.length, MISSIONS.length);
  });

  test('미션 보상은 한 번만: 영수증·자원 증가가 정확하고, 같은 문제 반복으로 다시 받을 수 없다', async () => {
    const c = await newPlayer(app.base, '보상확인');
    const m = MISSION_BY_ID.get('m_tools');
    let last;
    for (let i = 0; i < 5; i++) {
      const before = (await c.get('/api/state')).json.player;
      last = await solveMission(c, 'm_tools');
      assert.ok(m.questionIds.includes(QUESTIONS.find((q) => q.question === last.ch.question.text).id));
      if (last.r.missionsCompleted.length) {
        const rc = last.r.missionsCompleted.find((x) => x.id === 'm_tools');
        assert.deepEqual({ xp: rc.xp, grain: rc.grain, population: rc.population }, { xp: m.reward.xp, grain: m.reward.grain, population: m.reward.population });
        const sumXp = last.r.missionsCompleted.reduce((s, x) => s + x.xp, 0);
        assert.equal(last.r.state.player.xp - before.xp, last.r.reward.xp + sumXp);
        break;
      }
    }
    const st = (await c.get('/api/state')).json;
    const ms = st.missions.find((x) => x.id === 'm_tools');
    assert.equal(ms.status, 'rewarded');
    assert.equal(ms.receipt.xp, m.reward.xp);
    // 이미 끝난 미션도 연습은 되지만 보상은 없다
    for (let i = 0; i < 4; i++) {
      const before = (await c.get('/api/state')).json.player;
      const { r } = await solveMission(c, 'm_tools');
      assert.ok(!r.missionsCompleted.some((x) => x.id === 'm_tools'));
      if (r.reward.repeat) assert.equal(r.state.player.xp, before.xp + r.missionsCompleted.reduce((s, x) => s + x.xp, 0));
    }
  });

  test('잠긴·없는·문제 없는 미션과 재사용·다른 세션 접근을 막는다', async () => {
    const c = await newPlayer(app.base, '잠금확인');
    assert.equal((await c.post('/api/missions/m_sg_found/challenge')).json.error, 'mission_locked');
    assert.equal((await c.post('/api/missions/m_rp_core/challenge')).status, 403);
    assert.equal((await c.post('/api/missions/m_nope/challenge')).status, 404);
    assert.equal((await c.post('/api/missions/toString/challenge')).status, 404);
    assert.equal((await c.post('/api/missions/__proto__/challenge')).status, 404);
    const camp = await c.post('/api/missions/m_camp/challenge');
    assert.equal(camp.status, 400);
    assert.equal(camp.json.action, 'region');
    const ch = await c.post('/api/missions/m_life/challenge');
    const other = await newPlayer(app.base, '남의도전');
    assert.equal((await other.post('/api/answer', { challengeId: ch.json.challengeId, choiceIndex: 0 })).status, 409);
    assert.equal((await c.post('/api/answer', { challengeId: ch.json.challengeId, choiceIndex: correctIndex(ch.json) })).status, 200);
    assert.equal((await c.post('/api/answer', { challengeId: ch.json.challengeId, choiceIndex: correctIndex(ch.json) })).status, 409);
    const anon = (await import('./helpers.mjs')).client(app.base);
    assert.equal((await anon.post('/api/missions/m_life/challenge')).status, 401);
  });

  test('미션 문제는 그 미션에 정해 둔 문제에서만 나오고 정답·해설이 없다', async () => {
    const c = await newPlayer(app.base, '연결확인');
    const texts = new Set(MISSION_BY_ID.get('m_life').questionIds.map((id) => QUESTION_BY_ID.get(id).question));
    for (let i = 0; i < 25; i++) {
      const ch = await c.post('/api/missions/m_life/challenge');
      assert.ok(texts.has(ch.json.question.text));
      assert.equal(ch.json.missionId, 'm_life');
      assert.doesNotMatch(JSON.stringify(ch.json), /"answer"|"explanation"/);
    }
  });

  test('처음 원정부터 대한민국까지 실제 문제 풀이 API만으로 9개 시대를 모두 지난다', async () => {
    const c = await newPlayer(app.base, '끝까지원정');
    const st = async () => (await c.get('/api/state')).json;
    const status = (s, id) => s.missions.find((m) => m.id === id).status;
    const margins = [];
    for (let i = 0; i < ERAS.length; i++) {
      const era = ERAS[i].id;
      let s = await st();
      assert.equal(s.player.era, era);
      // 1) 지도 점령이 필요한 미션은 그 시대 지역에서(정답만)
      for (const m of MISSIONS.filter((x) => x.era === era && x.action === 'region')) {
        const regions = REGIONS.filter((r) => r.era === era).map((r) => r.id);
        for (let k = 0; k < 20 && status(await st(), m.id) !== 'rewarded'; k++) await answerRegion(c, regions[k % regions.length]);
        assert.equal(status(await st(), m.id), 'rewarded', m.id);
      }
      // 2) 문제 미션
      for (const m of MISSIONS.filter((x) => x.era === era && x.action === 'quiz')) {
        for (let k = 0; k < 12 && status(await st(), m.id) === 'active'; k++) await solveMission(c, m.id);
      }
      s = await st();
      if (!s.advance.target) { assert.equal(era, 'republic'); break; }
      // 3) 아직 모자라면 그 시대 남은 문제를 더 풀기(필요한 만큼만)
      const quizMission = MISSIONS.filter((x) => x.era === era && x.action === 'quiz').sort((a, b) => b.questionIds.length - a.questionIds.length)[0];
      const fresh = QUESTIONS.filter((q) => q.era === era && !MISSIONS.some((m) => m.questionIds.includes(q.id)));
      const eraRegions = REGIONS.filter((r) => r.era === era).map((r) => r.id);
      for (let k = 0; k < 30 && !(await st()).advance.ok; k++) {
        if (fresh.length && i <= 2) await answerRegion(c, eraRegions[k % eraRegions.length]);
        else await solveMission(c, quizMission.id);
      }
      s = await st();
      assert.equal(s.advance.ok, true, `${era}: ${JSON.stringify(s.advance.checks)}`);
      margins.push({ era, xp: s.player.xp - ADVANCE_RULES[s.advance.target].xp, power: s.player.power - ADVANCE_RULES[s.advance.target].power });
      const adv = await c.post('/api/advance');
      assert.equal(adv.status, 200, JSON.stringify(adv.json));
      assert.equal(adv.json.era, ERAS[i + 1].id);
    }
    const fin = await st();
    assert.equal(fin.player.era, 'republic');
    assert.equal(fin.eraLog.length, 9);
    assert.equal((await c.post('/api/advance')).json.error, 'max_era');
    // 새 시대 카드도 미션 보상으로 실제로 받는다
    for (const id of ['c_gaya_iron', 'c_hunmin', 'c_provisional', 'c_constitution']) assert.ok(fin.cards.some((x) => x.id === id), id);
    console.log('[journey margins]', JSON.stringify(margins));
  });
});

describe('저장 이전(v1 저장 파일)', () => {
  test('미션 보상이 없던 저장본: 열 추가·조건을 채운 미션만 한 번 정산·다시 열어도 그대로', () => {
    const dir = tempDir();
    try {
      let db = openDb(dir);
      let game = createGame(db);
      const { playerId } = game.createPlayer('옛저장');
      const ans = (ch) => game.answer(playerId, ch.challengeId, correctIndex(ch));
      for (const r of ['r05', 'r08', 'r09', 'r10']) ans(game.startRegionChallenge(playerId, r));
      const done = game.state(playerId).missions.filter((m) => m.status === 'rewarded').map((m) => m.id);
      assert.ok(done.includes('m_camp'));
      // v1 저장본 흉내: 미션 보상 기록과 그만큼의 자원을 되돌리고, challenges 표를 mission_id 없는 옛 모양으로
      const sum = db.prepare("SELECT SUM(xp) xp, SUM(grain) grain, SUM(population) pop FROM rewards WHERE reward_key LIKE 'm:%'").get();
      db.prepare("DELETE FROM rewards WHERE reward_key LIKE 'm:%'").run();
      db.prepare('UPDATE players SET xp = xp - ?, grain = grain - ?, population = population - ?').run(sum.xp, sum.grain, sum.pop);
      db.exec('DROP TABLE challenges; CREATE TABLE challenges (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, question_id TEXT NOT NULL, question_version INTEGER NOT NULL, region_id TEXT, mode TEXT NOT NULL, choice_order TEXT NOT NULL, created_at INTEGER NOT NULL)');
      const oldPlayer = game.state(playerId).player;
      db.close();

      db = openDb(dir);
      game = createGame(db); // 이전 실행
      assert.ok(db.prepare('PRAGMA table_info(challenges)').all().some((c) => c.name === 'mission_id'));
      const migrated = game.state(playerId);
      assert.equal(migrated.player.xp, oldPlayer.xp + sum.xp);
      assert.deepEqual(migrated.missions.filter((m) => m.status === 'rewarded').map((m) => m.id).sort(), [...done].sort());
      assert.ok(migrated.missions.filter((m) => m.status === 'locked').every((m) => !m.receipt)); // 뒤 시대 미션 정산 없음
      db.close();

      db = openDb(dir);
      game = createGame(db); // 두 번째로 열어도 더하지 않는다
      assert.deepEqual(game.state(playerId).player, migrated.player);
      assert.ok(game.startMissionChallenge(playerId, 'm_life').challengeId); // 새 열로 미션 도전 저장
      db.close();
    } finally { removeDir(dir); }
  });
});

describe('웹 체험판 빌드(하위 경로)', () => {
  let dir, out, server, base;
  before(async () => {
    dir = tempDir();
    out = await buildPages(join(dir, 'dist'));
    // GitHub 프로젝트 페이지처럼 /hta-repo/ 아래에서 제공
    server = createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      if (!url.pathname.startsWith('/hta-repo/')) { res.writeHead(404).end(); return; }
      const file = join(out, decodeURIComponent(url.pathname.slice('/hta-repo/'.length)) || 'index.html');
      if (!file.startsWith(out) || !existsSync(file)) { res.writeHead(404).end(); return; }
      res.writeHead(200).end(readFileSync(file));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/hta-repo/`;
  });
  after(() => { server.close(); removeDir(dir); });

  test('그림·소리·이야기·지도·모든 규칙 모듈이 복사되고 절대 경로가 없다', () => {
    for (const f of ['assets/story.json', 'assets/river-dawn.wav', 'assets/cartography.json', 'assets/valley-background.webp',
      'assets/guide-haram.webp', 'assets/artifact-atlas.webp', 'audio.js', 'app.js', 'style.css',
      'lib/map-regions.mjs', 'lib/questions-campaign.mjs', 'lib/event-weights.mjs', 'lib/schema.mjs', 'lib/meta.mjs']) {
      assert.ok(existsSync(join(out, f)), f);
    }
    for (const f of ['app.js', 'style.css', 'audio.js', 'index.html']) {
      assert.doesNotMatch(readFileSync(join(out, f), 'utf8'), /['"(]\/assets\//, f);
    }
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    assert.match(html, /<html lang="ko" data-web="pages">/);
    const order = ['type="importmap"', 'vendor/sql-wasm.js', 'web-entry.mjs', 'src="audio.js"', 'src="app.js"'].map((s) => html.indexOf(s));
    assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), JSON.stringify(order));
  });

  test('하위 경로에서 HTML·CSS가 가리키는 파일이 모두 열린다', async () => {
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    const css = readFileSync(join(out, 'style.css'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => new URL(m[1], base).href)
      .concat([...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => new URL(m[1], new URL('style.css', base)).href))
      .concat(['assets/story.json', 'assets/cartography.json', 'assets/river-dawn.wav'].map((p) => new URL(p, base).href));
    assert.ok(refs.length >= 8);
    for (const u of new Set(refs.filter((x) => x.startsWith(base)))) {
      const r = await fetch(u);
      assert.equal(r.status, 200, u);
      await r.arrayBuffer();
    }
  });

  test('웹 체험판도 같은 미션 규칙: 잠금·보상 한 번·새로고침 뒤 영수증 유지', async () => {
    const SQL = await createRequire(import.meta.url)(join(out, 'vendor', 'sql-wasm.js'))();
    const { createLocalApi } = await import(pathToFileURL(join(out, 'lib', 'local-api.mjs')).href);
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    const call = (api, method, path, body) => { const r = api.handle(method, path, body === undefined ? undefined : JSON.stringify(body)); return { status: r.status, json: r.body }; };
    let api = createLocalApi({ SQL, storage });
    assert.equal(call(api, 'GET', '/api/meta').json.demo.judgeShort, '이 브라우저에서 확인');
    assert.equal(call(api, 'POST', '/api/session', { nickname: '웹미션' }).status, 201);
    assert.equal(call(api, 'POST', '/api/missions/m_sg_found/challenge', {}).status, 403);
    let rewarded = false;
    for (let i = 0; i < 6 && !rewarded; i++) {
      const ch = call(api, 'POST', '/api/missions/m_tools/challenge', {}).json;
      const r = call(api, 'POST', '/api/answer', { challengeId: ch.challengeId, choiceIndex: correctIndex(ch) }).json;
      rewarded = r.state.missions.find((m) => m.id === 'm_tools').status === 'rewarded';
    }
    assert.ok(rewarded);
    const before = call(api, 'GET', '/api/state').json;
    api = createLocalApi({ SQL, storage }); // 새로고침
    const after = call(api, 'GET', '/api/state').json;
    assert.deepEqual(after.player, before.player);
    assert.deepEqual(after.missions.find((m) => m.id === 'm_tools').receipt, before.missions.find((m) => m.id === 'm_tools').receipt);
  });
});

// 확장자 import 경고 방지용(사용하지 않는 import 정리)
void extname;
