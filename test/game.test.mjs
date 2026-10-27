import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir, removeDir, startApp, client, newPlayer, answerRegion, correctIndex, wrongIndex } from './helpers.mjs';
import { QUESTIONS } from '../lib/questions.mjs';
import { REGIONS, CARDS } from '../lib/content.mjs';
import { validateSubmission } from '../lib/game.mjs';

const PALEO_REGIONS = REGIONS.filter((r) => r.era === 'paleolithic').map((r) => r.id);

describe('콘텐츠', () => {
  // v1의 "카드 6~10장"은 첫 3개 시대 기준이었다. 9개 시대 캠페인에서는 처음 9장을 그대로 두고
  // 새 시대마다 1장 이상을 더하므로, 원래 카드 보존과 전체 상한(20장)을 검사한다.
  test('지역 12~20개, 문제 30개 이상, 처음 카드 9장 보존 + 카드 20장 이하', () => {
    assert.ok(REGIONS.length >= 12 && REGIONS.length <= 20);
    assert.ok(QUESTIONS.length >= 30);
    const original = ['c_handaxe', 'c_fire', 'c_jeongok', 'c_comb', 'c_spindle', 'c_amsa', 'c_bipa', 'c_dolmen', 'c_dangun'];
    for (const id of original) assert.ok(CARDS.some((c) => c.id === id), id);
    assert.ok(CARDS.length >= 6 && CARDS.length <= 20);
  });
  test('모든 문제는 필수 항목이 있고 검수 대기 상태다', () => {
    const ids = new Set();
    for (const q of QUESTIONS) {
      assert.ok(!ids.has(q.id)); ids.add(q.id);
      for (const k of ['id', 'version', 'era', 'topic', 'objective', 'difficulty', 'question', 'explanation']) assert.ok(q[k], `${q.id}.${k}`);
      assert.equal(q.choices.length, q.type === 'ox' ? 2 : 4);
      assert.equal(new Set(q.choices).size, q.choices.length, q.id);
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4);
      assert.equal(q.reviewStatus, 'pending');
      assert.ok(q.sources.length > 0);
    }
  });
  test('원본 데이터의 정답 위치가 한쪽에 몰리지 않는다', () => {
    const counts = [0, 0, 0, 0];
    for (const q of QUESTIONS) counts[q.answer]++;
    for (const c of counts) assert.ok(c >= 5, `정답 위치 분포 ${counts}`);
  });
  test('각 시대에 문제가 6개 이상 있어 발전 조건을 채울 수 있다', () => {
    for (const era of ['paleolithic', 'neolithic', 'gojoseon']) {
      assert.ok(QUESTIONS.filter((q) => q.era === era).length >= 6, era);
    }
  });
});

describe('서버 API', () => {
  let dir, app;
  before(async () => { dir = tempDir(); app = await startApp(dir); });
  after(async () => { await app.close(); removeDir(dir); });

  test('정적 경로로 서버 파일·정답·저장 데이터가 노출되지 않는다', async () => {
    const c = client(app.base);
    const ok = await c.get('/');
    assert.equal(ok.status, 200);
    assert.match(ok.text, /역사 탐험 1/);
    for (const p of ['/lib/questions.mjs', '/server.mjs', '/../lib/questions.mjs', '/%2e%2e/lib/questions.mjs',
      '/..%2flib%2fquestions.mjs', '/data/game.sqlite', '/%2e%2e/data/game.sqlite', '/package.json']) {
      const r = await c.get(p);
      assert.equal(r.status, 404, p);
      assert.doesNotMatch(r.text, /answer:/);
    }
  });

  test('메타·출제 응답에 정답과 해설이 없다', async () => {
    const c = await newPlayer(app.base, '비밀확인');
    const meta = await c.get('/api/meta');
    const metaText = meta.text;
    for (const q of QUESTIONS) assert.ok(!metaText.includes(q.explanation));
    const ch = await c.post(`/api/regions/${PALEO_REGIONS[0]}/challenge`);
    assert.equal(ch.status, 200);
    const s = JSON.stringify(ch.json);
    assert.doesNotMatch(s, /"answer"|"explanation"|correct/i);
    assert.equal(ch.json.question.choices.length, ch.json.question.type==='short'?0:ch.json.question.type==='ox'?2:4);
    assert.equal(ch.json.question.reviewStatus, 'pending');
  });

  test('보기 순서가 섞여 정답 화면 위치가 고정되지 않는다', async () => {
    const c = await newPlayer(app.base, '섞기확인');
    const seen = new Set();
    for (let i = 0; i < 60 && seen.size < 4; i++) {
      const ch = await c.post(`/api/regions/${PALEO_REGIONS[0]}/challenge`);
      seen.add(correctIndex(ch.json));
    }
    assert.equal(seen.size, 4);
  });

  test('오답: 보상 없음, 점령 없음, 복습 목록에 추가', async () => {
    const c = await newPlayer(app.base, '오답확인');
    const before = (await c.get('/api/state')).json;
    const r = await answerRegion(c, PALEO_REGIONS[0], { correct: false });
    assert.equal(r.status, 200);
    assert.equal(r.json.correct, false);
    assert.equal(r.json.reward.xp, 0);
    assert.equal(r.json.territory, null);
    const st = r.json.state;
    assert.equal(st.player.xp, before.player.xp);
    assert.equal(st.player.grain, before.player.grain);
    assert.equal(st.regions.find((x) => x.id === PALEO_REGIONS[0]).owner, 'neutral');
    assert.equal(st.stats.reviewPending, 1);
    // 복습 문제는 틀린 문제에서 나온다
    const rv = await c.post('/api/review/challenge');
    assert.equal(rv.status, 200);
    assert.equal(rv.json.question.text, r.challenge.question.text);
    const ans = await c.post('/api/answer', { challengeId: rv.json.challengeId, choiceIndex: correctIndex(rv.json) });
    assert.equal(ans.json.correct, true);
    assert.equal(ans.json.reward.firstCorrect, true);
    assert.equal(ans.json.state.stats.reviewPending, 0);
    assert.ok(ans.json.state.missions.find((m) => m.id === 'm_review').done);
  });

  test('같은 답변 재전송과 반복 정답은 중복 보상하지 않는다', async () => {
    const c = await newPlayer(app.base, '중복확인');
    const ch = await c.post(`/api/regions/${PALEO_REGIONS[0]}/challenge`);
    const body = { challengeId: ch.json.challengeId, choiceIndex: correctIndex(ch.json) };
    const [a, b] = await Promise.all([c.post('/api/answer', body), c.post('/api/answer', body)]);
    const ok = [a, b].filter((r) => r.status === 200);
    const dup = [a, b].filter((r) => r.status === 409);
    assert.equal(ok.length, 1);
    assert.equal(dup.length, 1);
    const xpAfterFirst = ok[0].json.state.player.xp;
    const grainAfterFirst = ok[0].json.state.player.grain;

    // 구석기 문제를 모두 처음 맞힌 뒤에는 같은 문제가 다시 나와도 보상이 없다
    for (let i = 0; i < QUESTIONS.filter(q=>q.era==='paleolithic').length+2; i++) await answerRegion(c, PALEO_REGIONS[i % PALEO_REGIONS.length]);
    const st = (await c.get('/api/state')).json;
    assert.equal(st.stats.uniqueCorrect.paleolithic, QUESTIONS.filter(q=>q.era==='paleolithic').length);
    const r = await answerRegion(c, PALEO_REGIONS[0]);
    assert.equal(r.json.correct, true);
    assert.equal(r.json.reward.repeat, true);
    assert.equal(r.json.reward.xp, 0);
    assert.equal(r.json.state.player.xp, st.player.xp);
    assert.equal(r.json.state.player.grain, st.player.grain);
    assert.ok(xpAfterFirst > 0 && grainAfterFirst > 20);
  });

  test('시대 조건: 잠긴 지역 도전 불가, 조건 전 발전 불가, 조건 충족 후 발전', async () => {
    const c = await newPlayer(app.base, '시대확인');
    const neo = REGIONS.find((r) => r.era === 'neolithic').id;
    const locked = await c.post(`/api/regions/${neo}/challenge`);
    assert.equal(locked.status, 403);
    assert.equal(locked.json.error, 'era_locked');

    const early = await c.post('/api/advance');
    assert.equal(early.status, 400);
    assert.equal(early.json.error, 'advance_locked');
    assert.ok(Array.isArray(early.json.checks));

    // 한 지역만 반복해서 경험치를 쌓아도 영토 미션이 없으면 발전 불가
    for (let i = 0; i < 10; i++) await answerRegion(c, PALEO_REGIONS[0]);
    let st = (await c.get('/api/state')).json;
    assert.ok(st.player.xp >= 60);
    assert.equal(st.advance.ok, false);
    assert.equal((await c.post('/api/advance')).status, 400);

    for (const id of PALEO_REGIONS.slice(1, 3)) await answerRegion(c, id);
    st = (await c.get('/api/state')).json;
    assert.equal(st.advance.ok, true, JSON.stringify(st.advance.checks));
    const [x, y] = await Promise.all([c.post('/api/advance'), c.post('/api/advance')]);
    assert.deepEqual([x.status, y.status].sort(), [200, 400]);
    st = (await c.get('/api/state')).json;
    assert.equal(st.player.era, 'neolithic');
    assert.ok(st.cards.some((cd) => cd.id === 'c_comb'));
    assert.equal((await c.post(`/api/regions/${neo}/challenge`)).status, 200);
  });

  test('경쟁 부족 지역은 정답 2번이 필요하고 오답은 진행을 늘리지 않는다', async () => {
    // 내부 API 로 고조선까지 빠르게 진행
    const c = await newPlayer(app.base, '경쟁확인');
    for (const id of PALEO_REGIONS) await answerRegion(c, id);
    for (let i = 0; i < 6; i++) await answerRegion(c, PALEO_REGIONS[0]);
    assert.equal((await c.post('/api/advance')).status, 200);
    const neoRegions = REGIONS.filter((r) => r.era === 'neolithic').map((r) => r.id);
    for (const id of neoRegions) await answerRegion(c, id);
    for (let i = 0; i < 4; i++) await answerRegion(c, neoRegions[0]);
    const adv = await c.post('/api/advance');
    assert.equal(adv.status, 200, JSON.stringify(adv.json));
    const rival = REGIONS.find((r) => r.owner === 'rival' && r.era === 'gojoseon').id;
    let r = await answerRegion(c, rival, { correct: false });
    assert.equal(r.json.state.regions.find((x) => x.id === rival).rivalWins, 0);
    r = await answerRegion(c, rival);
    assert.equal(r.json.territory.rivalWins, 1);
    assert.equal(r.json.state.regions.find((x) => x.id === rival).owner, 'rival');
    r = await answerRegion(c, rival);
    assert.equal(r.json.territory.captured, true);
    assert.equal(r.json.state.regions.find((x) => x.id === rival).owner, 'player');
    // 이미 점령한 지역은 다시 점령 보상을 주지 않는다
    const before = r.json.state.player;
    r = await answerRegion(c, rival);
    assert.equal(r.json.territory.alreadyOwned, true);
    // 늘어난 인구 = 문제 보상 + (이번 답으로 끝난 미션 보상). 점령 보상(+3)은 다시 붙지 않는다.
    const missionPop = r.json.missionsCompleted.reduce((s, m) => s + m.population, 0);
    assert.equal(r.json.state.player.population - before.population, r.json.reward.population + missionPop);
  });

  test('세션 격리: 다른 플레이어의 문제에 답할 수 없고 상태가 섞이지 않는다', async () => {
    const a = await newPlayer(app.base, '플레이어A');
    const b = await newPlayer(app.base, '플레이어B');
    const ch = await a.post(`/api/regions/${PALEO_REGIONS[0]}/challenge`);
    const stolen = await b.post('/api/answer', { challengeId: ch.json.challengeId, choiceIndex: correctIndex(ch.json) });
    assert.equal(stolen.status, 409);
    assert.equal((await b.get('/api/state')).json.player.xp, 0);
    const own = await a.post('/api/answer', { challengeId: ch.json.challengeId, choiceIndex: correctIndex(ch.json) });
    assert.equal(own.status, 200);
    assert.equal((await b.get('/api/state')).json.regions.find((x) => x.id === PALEO_REGIONS[0]).owner, 'neutral');
    assert.equal((await a.get('/api/state')).json.player.nickname, '플레이어A');
    const anon = client(app.base);
    assert.equal((await anon.get('/api/state')).status, 401);
    anon.cookie = 'hta_sid=forged-token-value-1234567890';
    assert.equal((await anon.get('/api/state')).status, 401);
  });

  test('클라이언트가 보낸 경험치·시대·소유권은 무시된다', async () => {
    const c = await newPlayer(app.base, '조작시도');
    const r = await c.post('/api/answer', { challengeId: 'x'.repeat(32), choiceIndex: 0, xp: 9999, era: 'gojoseon' });
    assert.equal(r.status, 400);
    assert.equal((await c.post('/api/state', { xp: 9999 })).status, 404);
    const st = (await c.get('/api/state')).json;
    assert.equal(st.player.xp, 0);
    assert.equal(st.player.era, 'paleolithic');
  });

  test('비정상 입력을 거부한다', async () => {
    const c = client(app.base);
    for (const nickname of ['', 'a', '<script>alert(1)</script>', 'x'.repeat(13), '씨발이', 123, null]) {
      const r = await c.post('/api/session', { nickname });
      assert.equal(r.status, 400, String(nickname));
    }
    const p = await newPlayer(app.base, '입력확인');
    assert.equal((await p.req('/api/answer', { method: 'POST', raw: '{bad json', headers: { 'content-type': 'application/json' } })).status, 400);
    assert.equal((await p.req('/api/answer', { method: 'POST', raw: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 415);
    assert.equal((await p.req('/api/submissions', { method: 'POST', raw: JSON.stringify({ q: 'x'.repeat(20000) }), headers: { 'content-type': 'application/json' } })).status, 413);
    let ch = await p.post(`/api/regions/${PALEO_REGIONS[0]}/challenge`);
    // 보기 번호 검사는 단답형이 아닌 문제로 확인한다.
    for (let i=0;ch.json.question.type==='short'&&i<50;i++) ch=await p.post(`/api/regions/${PALEO_REGIONS[0]}/challenge`);
    assert.notEqual(ch.json.question.type,'short');
    for (const choiceIndex of [-1, 4, 1.5, '0', null]) {
      const r = await p.post('/api/answer', { challengeId: ch.json.challengeId, choiceIndex });
      assert.equal(r.status, 400, String(choiceIndex));
    }
    // 잘못된 입력 후에도 원래 도전은 유효
    assert.equal((await p.post('/api/answer', { challengeId: ch.json.challengeId, choiceIndex: wrongIndex(ch.json) })).status, 200);
    assert.equal((await p.post('/api/regions/zz99/challenge')).status, 404);
    assert.equal((await p.post('/api/regions/../challenge')).status, 404);
    const cross = await p.req('/api/advance', { method: 'POST', body: {}, headers: { origin: 'http://evil.example' } });
    assert.equal(cross.status, 403);
  });

  test('제출 문제: 형식 검사, 검토 대기 저장, 출제·보상에 쓰이지 않음', async () => {
    const c = await newPlayer(app.base, '출제자');
    const bad = await c.post('/api/submissions', { question: '짧음', choices: ['a', 'a'], answerIndex: 7, era: 'x' });
    assert.equal(bad.status, 400);
    assert.ok(bad.json.errors.length >= 4);
    const pii = await c.post('/api/submissions', {
      era: 'paleolithic', question: '연락처 010-1234-5678 로 알려 주세요. 뗀석기는?',
      choices: ['가', '나', '다', '라'], answerIndex: 0, explanation: '설명입니다. 충분히 긴 설명.', source: '교과서',
    });
    assert.equal(pii.status, 400);
    const noSource = await c.post('/api/submissions', {
      era: 'paleolithic', question: '구석기 시대 사람들이 처음 사용한 도구는?',
      choices: ['뗀석기', '철검', '청동 거울', '자기'], answerIndex: 0, explanation: '구석기 사람들은 뗀석기를 썼어요.', source: '',
    });
    assert.equal(noSource.status, 400);

    const marker = '<img src=x onerror=alert(1)> 제출 전용 표식 문제입니다';
    const ok = await c.post('/api/submissions', {
      era: 'paleolithic', regionId: PALEO_REGIONS[0], question: marker,
      choices: ['뗀석기', '철검', '청동 거울', '자기'], answerIndex: 0,
      explanation: '구석기 사람들은 뗀석기를 썼어요.', source: '초등 사회 교과서 5-2',
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.status, 'pending_review');
    assert.equal(ok.json.aiReview, 'not_connected');
    const mine = await c.get('/api/submissions');
    assert.equal(mine.json.submissions.length, 1);
    assert.equal(mine.json.submissions[0].question, marker); // 그대로 저장, 화면은 textContent 로 표시

    const before = (await c.get('/api/state')).json.player;
    for (let i = 0; i < 40; i++) {
      const ch = await c.post(`/api/regions/${PALEO_REGIONS[0]}/challenge`);
      assert.notEqual(ch.json.question.text, marker);
    }
    const after = (await c.get('/api/state')).json.player;
    assert.deepEqual(after, before);
    // 다른 플레이어는 남의 제출을 볼 수 없다
    const other = await newPlayer(app.base, '다른학생');
    assert.equal((await other.get('/api/submissions')).json.submissions.length, 0);
  });

  test('학습 기록은 틀린 문제의 정답을 숨긴다', async () => {
    const c = await newPlayer(app.base, '기록확인');
    const wrong = await answerRegion(c, PALEO_REGIONS[0], { correct: false });
    const h = (await c.get('/api/history')).json;
    assert.equal(h.attempts.length, 1);
    const note = h.notes[0];
    assert.equal(note.lastCorrect, false);
    assert.equal(note.answer, null);
    assert.equal(note.explanation, null);
    assert.equal(note.text, wrong.challenge.question.text);
  });
});

describe('저장 복원', () => {
  test('서버를 다시 시작해도 플레이어·영토·카드·기록·제출이 복원된다', async () => {
    const dir = tempDir();
    try {
      let app = await startApp(dir);
      const c = await newPlayer(app.base, '복원확인');
      for (const id of PALEO_REGIONS.slice(0, 3)) await answerRegion(c, id);
      await answerRegion(c, PALEO_REGIONS[3], { correct: false });
      await c.post('/api/submissions', {
        era: 'neolithic', question: '신석기 시대의 대표적인 토기는 무엇일까요?',
        choices: ['빗살무늬 토기', '청자', '백자', '분청사기'], answerIndex: 0,
        explanation: '신석기 시대에는 빗살무늬 토기를 만들었어요.', source: '국립중앙박물관 누리집',
      });
      const pending = await c.post(`/api/regions/${PALEO_REGIONS[4]}/challenge`);
      const before = (await c.get('/api/state')).json;
      const histBefore = (await c.get('/api/history')).json;
      await app.close();

      app = await startApp(dir);
      const c2 = client(app.base);
      c2.cookie = c.cookie;
      const after = (await c2.get('/api/state')).json;
      assert.deepEqual(after, before);
      assert.deepEqual((await c2.get('/api/history')).json, histBefore);
      assert.equal((await c2.get('/api/submissions')).json.submissions.length, 1);
      // 재시작 전 받은 문제도 이어서 답할 수 있고, 한 번만 처리된다
      const ans = await c2.post('/api/answer', { challengeId: pending.json.challengeId, choiceIndex: correctIndex(pending.json) });
      assert.equal(ans.status, 200);
      assert.equal((await c2.post('/api/answer', { challengeId: pending.json.challengeId, choiceIndex: 0 })).status, 409);
      await app.close();
    } finally {
      removeDir(dir);
    }
  });
});

describe('형식 검사 단위', () => {
  test('정상 제출은 통과하고 보기 중복은 거부한다', () => {
    const base = {
      era: 'gojoseon', question: '고조선을 세운 인물로 전해지는 사람은?',
      choices: ['단군왕검', '주몽', '온조', '박혁거세'], answerIndex: 0,
      explanation: '건국 이야기에서 단군왕검이 고조선을 세웠다고 전해요.', source: '삼국유사(교과서 인용)',
    };
    assert.equal(validateSubmission(base).ok, true);
    assert.equal(validateSubmission({ ...base, choices: ['단군왕검', '단군 왕검', '온조', '주몽'] }).ok, false);
    assert.equal(validateSubmission({ ...base, regionId: 'nope' }).ok, false);
    assert.equal(validateSubmission({ ...base, explanation: '메일 me@example.com 으로 문의하세요.' }).ok, false);
    assert.equal(validateSubmission([]).ok, false);
  });
});
