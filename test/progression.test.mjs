// 문제 비반복 선택, 미션 중복 제거·선행 관계·용량, 전체 진행 도달 가능성을 확인한다.
// 실행: node --test game-source/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, answer, questionOf } from './helpers.mjs';
import { createGame } from '../lib/game.mjs';
import { QUESTIONS, QUESTION_BY_ID } from '../lib/questions.mjs';
import {
  MISSIONS, MISSION_BY_ID, MISSION_AUDIT, MISSION_NORMALIZATION, ADVANCE_RULES, ERAS, ERA_ORDER, REGIONS, CARDS,
} from '../lib/content.mjs';
import { COLLECTIONS, RAIDS } from '../lib/expansion-content.mjs';
import { pickQuestion, leastRecent } from '../lib/question-selection.mjs';
import { normalizeMissions, auditMissions, missionUniqueDemand, MAX_PREREQ } from '../lib/mission-progression.mjs';

const QUESTION_ERA = new Map(QUESTIONS.map((q) => [q.id, q.era]));
const eraPool = (era) => QUESTIONS.filter((q) => q.era === era);

// ── 콘텐츠 점검 ──
test('mission audit is clean: capacity, prerequisites exist, no cycles, required missions need no faction', () => {
  assert.deepEqual(MISSION_AUDIT, []);
});

test('no question first-correct is credited to two missions', () => {
  const owner = new Map();
  for (const m of MISSIONS) for (const id of m.cond.questions?.ids || []) {
    assert.ok(!owner.has(id), `${id} credited by ${owner.get(id)} and ${m.id}`);
    owner.set(id, m.id);
  }
});

test('no two missions share an identical goal', () => {
  const seen = new Map();
  for (const m of MISSIONS) {
    const key = JSON.stringify({ era: m.era, faction: m.faction || null, cond: m.cond });
    assert.ok(!seen.has(key), `${m.id} duplicates ${seen.get(key)}`);
    seen.set(key, m.id);
  }
});

test('every quiz mission is finishable within its question pool and selection pool', () => {
  for (const m of MISSIONS) {
    const q = m.cond.questions;
    if (q) {
      assert.ok(q.n >= 1 && q.n <= q.ids.length, `${m.id} n=${q.n} pool=${q.ids.length}`);
      for (const id of q.ids) assert.ok(m.questionIds.includes(id), `${m.id} cannot serve ${id}`);
    }
    for (const p of m.cond.missions || []) {
      const pm = MISSION_BY_ID.get(p);
      assert.ok(pm, `${m.id} -> ${p}`);
      assert.ok(ERA_ORDER[pm.era] <= ERA_ORDER[m.era]);
    }
    assert.ok((m.cond.missions || []).length <= MAX_PREREQ + 1, `${m.id} prerequisite chain is bounded`);
  }
});

test('advancement thresholds were raised but stay within each era question bank, and above the required-mission demand', () => {
  for (const [target, r] of Object.entries(ADVANCE_RULES)) {
    assert.ok(r.uniqueCorrect >= r.previousUniqueCorrect, target);
    assert.ok(r.uniqueCorrect <= eraPool(r.uniqueEra).length, `${target}: ${r.uniqueCorrect} > pool`);
    assert.ok(r.uniqueCorrect >= missionUniqueDemand(MISSIONS, r.mission), target);
    // 시대 문제 가운데 실제로 낼 수 있는 문제(지역·미션·유물·방어 훈련) 수가 기준 이상이어야 한다.
    const hasRegion = REGIONS.some((g) => g.era === r.uniqueEra);
    const reach = new Set(hasRegion ? eraPool(r.uniqueEra).map((q) => q.id) : []);
    for (const m of MISSIONS.filter((x) => x.era === r.uniqueEra && !x.faction)) m.questionIds.forEach((id) => reach.add(id));
    for (const c of [...COLLECTIONS, ...RAIDS]) if (QUESTION_ERA.get(c.questionId) === r.uniqueEra) reach.add(c.questionId);
    assert.ok(reach.size >= r.uniqueCorrect, `${target}: reachable ${reach.size} < ${r.uniqueCorrect}`);
  }
  assert.ok(Object.values(ADVANCE_RULES).some((r) => r.uniqueCorrect > r.previousUniqueCorrect));
});

test('known overlaps are normalized into sequential prerequisites', () => {
  const byId = Object.fromEntries(MISSION_NORMALIZATION.map((c) => [c.id, c]));
  // 「가야의 철」과 가야 선택 미션은 같은 목표(sg-03 하나)였다 → 가야 선택 미션은 정리 미션이 된다.
  assert.deepEqual(MISSION_BY_ID.get('m_sg_gaya').cond.questions.ids, ['sg-03']);
  assert.equal(MISSION_BY_ID.get('m_faction_gaya').cond.questions, undefined);
  assert.ok(MISSION_BY_ID.get('m_faction_gaya').requires.includes('m_sg_gaya'));
  assert.ok(MISSION_BY_ID.get('m_faction_gaya').requires.length >= 2);
  assert.ok(!MISSION_BY_ID.get('m_sg_found').cond.questions.ids.includes('sg-03'));
  // 필수 미션도 같은 정답을 나눠 쓰지 않고 앞 사건 미션을 선행으로 삼는다.
  assert.deepEqual(MISSION_BY_ID.get('m_md_core').requires, ['m_md_open', 'm_md_march', 'm_md_gov']);
  assert.deepEqual(MISSION_BY_ID.get('m_nb_core').requires, ['m_nb_king', 'm_nb_balhae']);
  assert.ok(byId.m_md_core && byId.m_nb_core);
  // 정규화 덕분에 필수 미션의 서로 다른 정답 요구가 늘었다(유한한 범위 안에서).
  assert.equal(missionUniqueDemand(MISSIONS, 'm_md_core'), 5);
  assert.equal(missionUniqueDemand(MISSIONS, 'm_nb_core'), 6);
  // 카드와 연결된 미션은 그대로 끝낼 수 있다.
  for (const c of CARDS.filter((x) => x.cond.mission)) assert.ok(MISSION_BY_ID.has(c.cond.mission), c.id);
});

test('normalizer: identical goals and supersets become prerequisites; cycles and foreign factions are refused', () => {
  const qe = new Map(['a', 'b', 'c', 'd'].map((id) => [id, 'x']));
  const eraOrder = { x: 0 };
  const raw = [
    { id: 'core', era: 'x', required: true, action: 'quiz', cond: { questions: { ids: ['a', 'b', 'c'], n: 2 } }, questionIds: ['a', 'b', 'c'] },
    { id: 'ev1', era: 'x', action: 'quiz', cond: { questions: { ids: ['a'], n: 1 } }, questionIds: ['a'] },
    { id: 'ev2', era: 'x', action: 'quiz', cond: { questions: { ids: ['b', 'c'], n: 2 } }, questionIds: ['b', 'c'] },
    { id: 'dup', era: 'x', action: 'quiz', cond: { questions: { ids: ['a'], n: 1 } }, questionIds: ['a'] },
    { id: 'fx', era: 'x', faction: 'f1', action: 'quiz', cond: { questions: { ids: ['d'], n: 1 } }, questionIds: ['d'] },
    { id: 'fy', era: 'x', faction: 'f2', action: 'quiz', cond: { questions: { ids: ['d', 'zz'], n: 2 } }, questionIds: ['d', 'zz'] },
  ];
  const { missions } = normalizeMissions(raw, { questionEra: qe, eraOrder });
  const by = Object.fromEntries(missions.map((m) => [m.id, m]));
  assert.equal(by.core.cond.questions, undefined);
  assert.deepEqual(by.core.requires.sort(), ['ev1', 'ev2']);
  assert.deepEqual(by.dup.requires.sort(), ['core', 'ev1']); // 같은 목표 → 선행 2개(중복 아님)
  assert.deepEqual(by.fy.requires, []); // 다른 나라 선택 미션은 선행으로 쓸 수 없다
  const issues = auditMissions(missions, { questionEra: qe, eraOrder });
  assert.ok(issues.some((s) => s.includes('fy')), 'unfinishable foreign-faction mission is reported');
  assert.ok(!issues.some((s) => s.includes('순환')));
});

// ── 선택 알고리즘(순수 함수) ──
test('pickQuestion prefers never-presented, then unsolved least-recent, then review cycle', () => {
  const pool = ['a', 'b', 'c'].map((id) => ({ id }));
  const first = (n) => 0;
  let seen = new Map();
  const r1 = pickQuestion(pool, { seen, solved: new Set(), rand: first });
  assert.equal(r1.selection.reason, 'fresh');
  assert.equal(r1.selection.repeat, false);
  seen = new Map([['a', { times: 1, lastSeq: 1 }], ['b', { times: 1, lastSeq: 2 }]]);
  assert.equal(pickQuestion(pool, { seen, solved: new Set(['a']), rand: first }).question.id, 'c');
  seen.set('c', { times: 1, lastSeq: 3 });
  const r2 = pickQuestion(pool, { seen, solved: new Set(['a']), rand: first });
  assert.equal(r2.selection.reason, 'retry_unsolved');
  assert.equal(r2.selection.repeat, true);
  assert.equal(r2.selection.reviewCycle, false);
  assert.notEqual(r2.question.id, 'a'); // 맞힌 문제는 보상 가능한 문제가 있는 동안 내지 않는다
  assert.notEqual(r2.question.id, 'c'); // 방금 본 문제는 피한다
  const r3 = pickQuestion(pool, { seen, solved: new Set(['a', 'b', 'c']), rand: first });
  assert.equal(r3.selection.reason, 'review_cycle');
  assert.equal(r3.selection.reviewCycle, true);
  assert.ok(r3.selection.message.length > 0);
  assert.equal(pickQuestion([], { seen, solved: new Set() }), null);
});

test('leastRecent never returns the immediately previous question when an alternative exists', () => {
  const pool = ['a', 'b'].map((id) => ({ id }));
  for (let i = 0; i < 20; i++) {
    const seen = new Map([['a', { times: 3, lastSeq: 10 }], ['b', { times: 3, lastSeq: 11 }]]);
    assert.equal(leastRecent(pool, seen, (n) => i % n).id, 'a');
  }
  assert.equal(leastRecent([{ id: 'a' }], new Map([['a', { times: 1, lastSeq: 1 }]])).id, 'a');
});

// ── 게임 흐름 ──
test('region challenges show every era question once before any repeat, even when answers are wrong', () => {
  const { db, game, id, close } = fixture();
  try {
    const region = REGIONS.find((r) => r.era === 'paleolithic');
    const size = eraPool('paleolithic').length;
    const shown = [];
    for (let i = 0; i < size; i++) {
      const ch = game.startRegionChallenge(id, region.id);
      assert.equal(ch.repeat, false, `challenge ${i}`);
      assert.equal(ch.reviewCycle, false);
      shown.push(questionOf(db, ch.challengeId).q.id);
      answer(db, game, id, ch, false); // 일부러 틀림: 예전에는 틀린 문제가 바로 다시 나왔다
    }
    assert.equal(new Set(shown).size, size);
    const again = game.startRegionChallenge(id, region.id);
    assert.equal(again.repeat, true);
    assert.equal(again.reviewCycle, false); // 아직 맞히지 못한 문제가 남아 있다
    assert.equal(again.selection.reason, 'retry_unsolved');
    assert.notEqual(questionOf(db, again.challengeId).q.id, shown.at(-1));
    // 반복 문제라도 정답이면 점령은 진행된다(영토 진행이 막히지 않음).
    const res = answer(db, game, id, again, true);
    assert.ok(res.territory?.captured, 'neutral region captured on a repeated question');
  } finally { close(); }
});

test('issued but unanswered challenges count as presented', () => {
  const { db, game, id, close } = fixture();
  try {
    const region = REGIONS.find((r) => r.era === 'paleolithic');
    const ids = new Set();
    for (let i = 0; i < 5; i++) ids.add(questionOf(db, game.startRegionChallenge(id, region.id).challengeId).q.id);
    assert.equal(ids.size, 5);
  } finally { close(); }
});

test('exhausted pool returns explicit reviewCycle with rationale and never blocks', () => {
  const { db, game, id, close } = fixture();
  try {
    const region = REGIONS.find((r) => r.era === 'paleolithic');
    const size = eraPool('paleolithic').length;
    let prev = null;
    for (let i = 0; i < size; i++) answer(db, game, id, game.startRegionChallenge(id, region.id), true);
    for (let i = 0; i < 6; i++) {
      const ch = game.startRegionChallenge(id, region.id);
      const qid = questionOf(db, ch.challengeId).q.id;
      assert.equal(ch.reviewCycle, true);
      assert.equal(ch.repeat, true);
      assert.equal(ch.selection.reason, 'review_cycle');
      assert.equal(ch.selection.poolSize, size);
      assert.notEqual(qid, prev, 'no immediate repeat in review cycle');
      prev = qid;
      const res = answer(db, game, id, ch, true);
      assert.equal(res.reward.repeat, true);
      assert.equal(res.reward.xp, 0);
    }
  } finally { close(); }
});

test('explicit wrong-answer review may repeat by design and says so', () => {
  const { db, game, id, close } = fixture();
  try {
    const region = REGIONS.find((r) => r.era === 'paleolithic');
    answer(db, game, id, game.startRegionChallenge(id, region.id), false);
    const ch = game.startReviewChallenge(id);
    assert.equal(ch.repeat, true);
    assert.equal(ch.selection.reason, 'explicit_review');
    assert.equal(ch.reviewCycle, false);
  } finally { close(); }
});

function setEra(db, id, era) {
  db.prepare('UPDATE players SET era = ? WHERE id = ?').run(era, id);
}

test('one correct answer settles at most one question mission; capstone follows prerequisites', () => {
  const { db, game, id, close } = fixture();
  try {
    setEra(db, id, 'modern');
    const solveMission = (mid) => {
      const receipts = [];
      for (let guard = 0; guard < 10 && game.state(id).missions.find((x) => x.id === mid).status !== 'rewarded'; guard++) {
        const ch = game.startMissionChallenge(id, mid);
        receipts.push(answer(db, game, id, ch, true).missionsCompleted.map((r) => r.id));
      }
      return receipts;
    };
    // 임시 정부 문제(md-08)는 이제 「대한민국 임시 정부」 미션만 채운다.
    const gov = solveMission('m_md_gov');
    assert.deepEqual(gov.flat(), ['m_md_gov']);
    assert.notEqual(game.state(id).missions.find((x) => x.id === 'm_md_core').status, 'rewarded');
    // 정리 미션(필수)에 도전하면 남은 선행 미션의 문제가 나온다.
    const ch = game.startMissionChallenge(id, 'm_md_core');
    assert.ok(['m_md_open', 'm_md_march'].includes(ch.selection.viaMission));
    answer(db, game, id, ch, true);
    solveMission('m_md_open');
    const last = solveMission('m_md_march').flat();
    assert.deepEqual(last.sort(), ['m_md_core', 'm_md_march'].sort()); // 마지막 선행 완료 → 정리 미션
    const adv = game.state(id).advance.checks.find((c) => c.label.startsWith('필수 미션'));
    assert.equal(adv.ok, true);
  } finally { close(); }
});

test('rewarded mission keeps serving only unsolved questions, then refuses new challenges', () => {
  const { db, game, id, close } = fixture();
  try {
    setEra(db, id, 'samguk');
    const m = MISSION_BY_ID.get('m_bank_samguk');
    const served = new Set();
    for (let i = 0; i < m.questionIds.length; i++) {
      const ch = game.startMissionChallenge(id, m.id);
      const qid = questionOf(db, ch.challengeId).q.id;
      assert.ok(!served.has(qid), 'never re-serves a solved question');
      served.add(qid);
      answer(db, game, id, ch, true);
    }
    assert.equal(game.state(id).missions.find((x) => x.id === m.id).status, 'rewarded');
    assert.throws(() => game.startMissionChallenge(id, m.id), (e) => e.code === 'mission_complete');
  } finally { close(); }
});

test('existing rewards are grandfathered and old attempts seed the presentation log', () => {
  const { db, game, id, close } = fixture();
  try {
    // 예전 규칙에서 sg-03 하나로 받은 가야 선택 미션 보상과 카드.
    db.prepare("INSERT INTO rewards VALUES (?, 'm:m_faction_gaya', 15, 8, 3, 1)").run(id);
    db.prepare("INSERT INTO rewards VALUES (?, 'm:m_md_core', 25, 8, 5, 1)").run(id);
    // 예전 기록: 지역 도전에서 본 문제(새 기록 표가 생기기 전).
    db.prepare('DELETE FROM question_presentations').run();
    const old = eraPool('paleolithic').slice(0, 10).map((q) => q.id);
    for (const qid of old) db.prepare("INSERT INTO attempts (player_id, question_id, question_version, region_id, mode, correct, created_at) VALUES (?, ?, 1, NULL, 'region', 0, 1)").run(id, qid);
    const before = game.state(id).player;
    const reopened = createGame(db); // 저장을 다시 여는 것과 같다(정산·기록 채움이 다시 실행됨)
    const st = reopened.state(id);
    assert.equal(st.missions.find((x) => x.id === 'm_faction_gaya').status, 'rewarded');
    assert.equal(st.missions.find((x) => x.id === 'm_md_core').status, 'rewarded');
    assert.equal(st.player.xp, before.xp, 'no resource loss or re-grant');
    const region = REGIONS.find((r) => r.era === 'paleolithic');
    const shown = new Set();
    for (let i = 0; i < eraPool('paleolithic').length - old.length; i++) shown.add(questionOf(db, reopened.startRegionChallenge(id, region.id).challengeId).q.id);
    for (const qid of old) assert.ok(!shown.has(qid), `${qid} was already presented before the upgrade`);
  } finally { close(); }
});

test('full campaign stays reachable with mistakes: paleolithic → republic without factions', () => {
  const { db, game, id, close } = fixture();
  try {
    let answers = 0;
    for (let guard = 0; guard < 2500 && game.state(id).advance.target; guard++) {
      const st = game.state(id);
      if (st.advance.ok) { game.advance(id); continue; }
      const era = st.player.era;
      let ch = null;
      const cands = st.missions
        .filter((x) => x.status !== 'locked' && MISSION_BY_ID.get(x.id).action === 'quiz')
        .sort((a, b) => (MISSION_BY_ID.get(b.id).era === era) - (MISSION_BY_ID.get(a.id).era === era));
      for (const x of cands) {
        try { const c = game.startMissionChallenge(id, x.id); if (!c.reviewCycle) { ch = c; break; } } catch { /* 완료·잠김 */ }
      }
      if (!ch) {
        const owned = new Set(st.regions.filter((r) => r.owner === 'player').map((r) => r.id));
        const open = REGIONS.filter((r) => ERA_ORDER[r.era] <= ERA_ORDER[era]);
        const reg = open.find((r) => r.era === era && !owned.has(r.id)) || open.find((r) => !owned.has(r.id)) || open[0];
        ch = game.startRegionChallenge(id, reg.id);
      }
      answer(db, game, id, ch, answers++ % 4 !== 3); // 4번에 1번은 틀린다
    }
    const st = game.state(id);
    assert.equal(st.player.era, ERAS.at(-1).id, JSON.stringify(st.advance));
    // 같은 문제를 연달아 두 번 받은 적이 없다.
    const seq = db.prepare('SELECT question_id FROM attempts WHERE player_id = ? ORDER BY id').all(id).map((r) => r.question_id);
    assert.ok(seq.every((qid) => QUESTION_BY_ID.has(qid)));
    const immediate = seq.filter((qid, i) => i > 0 && seq[i - 1] === qid).length;
    // 바로 다시 나온 문제는 "미션에 남은 마지막 미해결 문제를 방금 틀린 뒤 같은 미션에 다시 도전한" 경우뿐이다.
    const rows = db.prepare('SELECT question_id, mode, correct FROM attempts WHERE player_id = ? ORDER BY id').all(id);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].question_id !== rows[i - 1].question_id) continue;
      assert.equal(rows[i].mode, 'mission');
      assert.equal(rows[i - 1].correct, 0, 'only a wrong answer is retried immediately');
    }
    assert.ok(immediate <= rows.filter((r) => !r.correct).length);
  } finally { close(); }
});

test('single-question mission retry after a wrong answer is allowed and flagged', () => {
  const { db, game, id, close } = fixture();
  try {
    setEra(db, id, 'samguk');
    const first = game.startMissionChallenge(id, 'm_theme_paleolithic');
    assert.equal(first.repeat, false);
    answer(db, game, id, first, false);
    const retry = game.startMissionChallenge(id, 'm_theme_paleolithic');
    assert.equal(retry.repeat, true);
    assert.equal(retry.selection.reason, 'retry_unsolved');
    assert.equal(retry.selection.immediateRepeat, true);
    assert.equal(retry.reviewCycle, false);
    answer(db, game, id, retry, true);
    assert.throws(() => game.startMissionChallenge(id, 'm_theme_paleolithic'), (e) => e.code === 'mission_complete');
  } finally { close(); }
});


test('event and opportunity goals are higher with distinct, reachable prerequisites', () => {
  assert.equal(MISSION_BY_ID.get('m_sg_han').cond.questions.n, 3);
  assert.equal(MISSION_BY_ID.get('m_bank_samguk').cond.questions.n, 3);
  assert.equal(MISSION_BY_ID.get('m_sg_culture').cond.questions.n, 2);
  assert.ok(MISSION_BY_ID.get('m_war_01').requires.includes('m_sg_salsu'));
  assert.ok(MISSION_BY_ID.get('m_war_06').requires.includes('m_war_05'));
  for (const m of MISSIONS.filter((m) => ['event', 'opportunity'].includes(m.kind))) {
    const q=m.cond.questions;
    if(q) assert.ok(q.n <= q.ids.length);
    for (const id of m.requires) assert.ok(m.desc.includes(MISSION_BY_ID.get(id).name));
  }
  assert.deepEqual(MISSION_AUDIT, []);
});
