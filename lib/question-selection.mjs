// 문제 고르기와 "보여 준 문제" 기록. 게임 규칙(game.mjs)이 지역·미션·복습 도전에서 쓴다.
//
// 원칙
// - "푼 문제"가 아니라 "보여 준 문제"를 기준으로 고른다. 도전을 받고 답하지 않은 문제도 보여 준 것으로 센다.
//   그래서 틀린 문제가 지역 도전에서 곧바로 다시 나오지 않는다(틀린 문제는 복습 미션에서 일부러 다시 푼다).
// - 고르는 순서: ① 한 번도 보여 주지 않은 문제 → ② 보여 줬지만 아직 처음 정답을 못 받은 문제(보상 가능)
//   → ③ 모두 맞힌 문제(복습 순환, 보상 없음). ②·③에서는 가장 오래전에 본 문제부터, 최근 본 문제는 피한다.
// - 문제 수는 유한하다. 다 보여 주면 repeat/reviewCycle 표시와 이유를 함께 돌려주고, 점령·시대 발전은 막지 않는다.
// - 방어 훈련·유물 탐구처럼 문제 id 가 정해진 활동은 고르지 않는다(학습 기록용 고정 문제). 표시만 붙인다.
//
// 저장: question_presentations(player_id, question_id, times, last_seq, last_at). 처음 만들 때 attempts·challenges
// 기록으로 채운다(여러 번 실행해도 같은 결과). 문제 id·버전·보상 기록은 건드리지 않는다.
import { randomInt } from 'node:crypto';

export const PRESENTATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS question_presentations (
  player_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  times INTEGER NOT NULL,
  last_seq INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, question_id)
);
`;
export const RECENT_WINDOW = 4;

export const SELECTION_REASONS = {
  fresh: '아직 보지 않은 문제예요.',
  retry_unsolved: '이 범위의 새 문제를 모두 봤어요. 아직 맞히지 못한 문제를 다시 내요(처음 맞히면 보상을 받아요).',
  review_cycle: '이 범위의 문제를 모두 맞혔어요. 복습으로 다시 내요. 문제 보상은 다시 받지 않지만 점령·훈련은 진행돼요.',
  explicit_review: '틀린 문제 복습이에요. 일부러 다시 내는 문제예요.',
  fixed_question: '이 활동은 정해진 문제 하나로 진행돼요.',
  fixed_question_repeat: '이 활동은 정해진 문제 하나로 진행돼요. 전에 본 문제예요.',
};

export function createPresentationLog(db, { now }) {
  db.exec(PRESENTATION_SCHEMA);
  // 이전 기록으로 한 번 채운다. attempts.id 는 전역 증가값이라 순서로 쓸 수 있다.
  db.exec(`INSERT OR IGNORE INTO question_presentations (player_id, question_id, times, last_seq, last_at)
    SELECT player_id, question_id, COUNT(*), MAX(id), MAX(created_at) FROM attempts GROUP BY player_id, question_id`);
  db.exec(`INSERT OR IGNORE INTO question_presentations (player_id, question_id, times, last_seq, last_at)
    SELECT player_id, question_id, 1, (SELECT COALESCE(MAX(id), 0) FROM attempts) + 1, MAX(created_at) FROM challenges GROUP BY player_id, question_id`);
  const S = {
    all: db.prepare('SELECT question_id, times, last_seq FROM question_presentations WHERE player_id = ?'),
    nextSeq: db.prepare('SELECT COALESCE(MAX(last_seq), 0) + 1 AS s FROM question_presentations WHERE player_id = ?'),
    ins: db.prepare('INSERT OR IGNORE INTO question_presentations (player_id, question_id, times, last_seq, last_at) VALUES (?,?,0,0,?)'),
    bump: db.prepare('UPDATE question_presentations SET times = times + 1, last_seq = ?, last_at = ? WHERE player_id = ? AND question_id = ?'),
  };
  return {
    // id → { times, lastSeq }
    seen(playerId) {
      return new Map(S.all.all(playerId).map((r) => [r.question_id, { times: r.times, lastSeq: r.last_seq }]));
    },
    record(playerId, questionId) {
      const t = now();
      const seq = S.nextSeq.get(playerId).s;
      S.ins.run(playerId, questionId, t);
      S.bump.run(seq, t, playerId, questionId);
    },
  };
}

// 최근에 본 문제 id(새것부터)
export function recentIds(seen, k = RECENT_WINDOW) {
  return [...seen.entries()].sort((a, b) => b[1].lastSeq - a[1].lastSeq).slice(0, k).map(([id]) => id);
}

// pool: 문제 객체 배열(이 활동에서 낼 수 있는 범위), seen: presentation 맵, solved: 처음 정답을 받은 문제 id 집합.
// rand(n): 0..n-1 정수(테스트에서 바꿀 수 있음).
export function pickQuestion(pool, { seen, solved, rand = randomInt, recent = RECENT_WINDOW }) {
  const unique = [...new Map(pool.filter(Boolean).map((q) => [q.id, q])).values()];
  if (!unique.length) return null;
  const fresh = unique.filter((q) => !seen.has(q.id));
  const unsolved = unique.filter((q) => seen.has(q.id) && !solved.has(q.id));
  const summary = (picked, reason) => {
    const freshLeft = fresh.filter((q) => q.id !== picked.id).length;
    return {
      question: picked,
      selection: {
        reason,
        message: SELECTION_REASONS[reason],
        repeat: reason !== 'fresh',
        reviewCycle: reason === 'review_cycle',
        poolSize: unique.length,
        freshRemaining: freshLeft,
        unsolvedRemaining: unique.filter((q) => !solved.has(q.id) && q.id !== picked.id).length,
        timesSeen: seen.get(picked.id)?.times || 0,
        // 범위에 남은 보상 가능 문제가 방금 본 그 문제뿐일 때만 true(예: 문제 1개짜리 미션을 바로 다시 도전).
        immediateRepeat: recentIds(seen, 1)[0] === picked.id,
      },
    };
  };
  if (fresh.length) return summary(fresh[rand(fresh.length)], 'fresh');
  const from = unsolved.length ? unsolved : unique;
  return summary(leastRecent(from, seen, rand, recent), unsolved.length ? 'retry_unsolved' : 'review_cycle');
}

// 최근 k 개(전역)에 든 문제는 다른 선택지가 있으면 피하고, 남은 것 가운데 오래된 절반에서 고른다.
export function leastRecent(cands, seen, rand = randomInt, recent = RECENT_WINDOW) {
  const k = Math.min(recent, Math.max(0, cands.length - 1));
  const avoid = new Set(recentIds(seen, k));
  const notRecent = cands.filter((q) => !avoid.has(q.id));
  let list = notRecent.length ? notRecent : cands;
  if (list.length > 1) {
    const last = recentIds(seen, 1)[0];
    const noImmediate = list.filter((q) => q.id !== last);
    if (noImmediate.length) list = noImmediate;
  }
  const sorted = [...list].sort((a, b) => (seen.get(a.id)?.lastSeq || 0) - (seen.get(b.id)?.lastSeq || 0));
  const oldest = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  return oldest[rand(oldest.length)];
}
