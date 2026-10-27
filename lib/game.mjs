import { normalizeAnswer, misconceptionFact } from './question-quality.mjs';
import {createAvatar} from './avatar.mjs';
import { createMarket } from './market.mjs';
import { createDevelopment } from './development.mjs';
// 게임 규칙과 서버 판정. 정답·보상·소유권은 여기서만 확정한다.
import { randomBytes, randomInt, createHash, randomUUID } from 'node:crypto';
import { tx } from './db.mjs';
import { migrateSchema } from './schema.mjs';
import { QUESTIONS, QUESTION_BY_ID } from './questions.mjs';
import { createPresentationLog, pickQuestion, leastRecent, SELECTION_REASONS } from './question-selection.mjs';
import {
  ERAS, ERA_ORDER, ADVANCE_RULES, RULES, REGIONS, REGION_BY_ID, CARDS, MISSIONS, MISSION_BY_ID,
} from './content.mjs';

export class GameError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const BANNED_WORDS = ['씨발', '시발', '개새', '병신', '좆', '닥쳐', '꺼져', '미친놈', 'fuck', 'shit'];
const PHONE_RE = /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const RRN_RE = /\d{6}[-\s]?[1-4]\d{6}/;
const NICK_RE = /^[가-힣a-zA-Z0-9_ ]{2,12}$/;

export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');

function shuffledOrder(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hasBanned(text) {
  const t = String(text).toLowerCase().replace(/\s+/g, '');
  return BANNED_WORDS.some((w) => t.includes(w));
}
function hasPersonalInfo(text) {
  const t = String(text);
  return PHONE_RE.test(t) || EMAIL_RE.test(t) || RRN_RE.test(t);
}

export function validateNickname(raw) {
  if (typeof raw !== 'string') throw new GameError(400, 'bad_nickname', '닉네임을 입력하세요.');
  const nick = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!NICK_RE.test(nick)) {
    throw new GameError(400, 'bad_nickname', '닉네임은 한글·영문·숫자 2~12자로 입력하세요.');
  }
  if (hasBanned(nick)) throw new GameError(400, 'bad_nickname', '사용할 수 없는 낱말이 들어 있어요.');
  if (hasPersonalInfo(nick) || /\d{6,}/.test(nick.replace(/[\s_]/g, ''))) {
    throw new GameError(400, 'bad_nickname', '전화번호 같은 개인정보는 닉네임으로 쓸 수 없어요.');
  }
  return nick;
}

// 문제 제출 형식 검사. 역사적 사실 여부는 판단하지 않는다(사람 검토 필요).
export function validateSubmission(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, errors: ['요청 형식이 올바르지 않아요.'] };
  }
  const str = (v) => (typeof v === 'string' ? v.normalize('NFC').trim() : null);
  const question = str(body.question);
  const explanation = str(body.explanation);
  const source = str(body.source);
  const era = str(body.era);
  const regionId = body.regionId == null || body.regionId === '' ? null : str(body.regionId);
  const choices = Array.isArray(body.choices) ? body.choices.map(str) : null;
  const answerIndex = body.answerIndex;

  if (!question || question.length < 10 || question.length > 200) errors.push('문제는 10~200자로 써 주세요.');
  if (!choices || choices.length !== 4) errors.push('보기는 정확히 4개가 필요해요.');
  else {
    if (choices.some((c) => !c || c.length < 1 || c.length > 60)) errors.push('보기는 각각 1~60자로 써 주세요.');
    const set = new Set(choices.filter(Boolean).map((c) => c.replace(/\s+/g, '')));
    if (set.size !== choices.length) errors.push('보기끼리 서로 달라야 해요.');
  }
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 3) errors.push('정답 보기를 하나 골라 주세요.');
  if (!explanation || explanation.length < 10 || explanation.length > 300) errors.push('해설은 10~300자로 써 주세요.');
  if (!source || source.length < 4 || source.length > 200) errors.push('참고 자료(책 이름, 기관, 주소 등)를 4~200자로 적어 주세요.');
  if (!era || !Object.hasOwn(ERA_ORDER, era)) errors.push('시대를 골라 주세요.');
  if (regionId !== null && !REGION_BY_ID.has(regionId)) errors.push('지역이 올바르지 않아요.');

  const allText = [question, explanation, source, ...(choices || [])].filter(Boolean).join(' ');
  if (hasBanned(allText)) errors.push('바르지 않은 말이 들어 있어요.');
  if (hasPersonalInfo(allText)) errors.push('전화번호·이메일 같은 개인정보는 넣지 마세요.');

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], clean: { question, choices, answerIndex, explanation, source, era, regionId } };
}

const eraNameOf = (id) => ERAS.find((e) => e.id === id)?.name ?? id;
const MISSION_ID_RE = /^m_[a-z0-9_]{1,40}$/;

export function createGame(db, { now = () => Date.now() } = {}) {
  migrateSchema(db); // 이전 저장 파일에 새 열 추가(데이터는 그대로)
  const presented = createPresentationLog(db, { now }); // 보여 준 문제 기록(지난 attempts·challenges 로 한 번 채움)
  // 문제 버전 저장(이미 있으면 유지)
  const insVersion = db.prepare('INSERT OR IGNORE INTO question_versions (id, version, data, saved_at) VALUES (?, ?, ?, ?)');
  tx(db, () => { for (const q of QUESTIONS) insVersion.run(q.id, q.version, JSON.stringify(q), now()); });
  const getVersion = db.prepare('SELECT data FROM question_versions WHERE id = ? AND version = ?');
  const loadQuestion = (id, version) => {
    const q = QUESTION_BY_ID.get(id);
    if (q && q.version === version) return q;
    const row = getVersion.get(id, version);
    return row ? JSON.parse(row.data) : null;
  };

  const S = {
    playerById: db.prepare('SELECT * FROM players WHERE id = ?'),
    playerByToken: db.prepare('SELECT * FROM players WHERE token_hash = ?'),
    insPlayer: db.prepare('INSERT INTO players (id, token_hash, nickname, era, xp, grain, population, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'),
    addRes: db.prepare('UPDATE players SET xp = xp + ?, grain = grain + ?, population = population + ?, updated_at = ? WHERE id = ?'),
    setEra: db.prepare('UPDATE players SET era = ?, updated_at = ? WHERE id = ? AND era = ?'),
    insRegion: db.prepare('INSERT INTO player_regions (player_id, region_id, owner, rival_wins) VALUES (?,?,?,0)'),
    regions: db.prepare('SELECT region_id, owner, rival_wins, captured_at FROM player_regions WHERE player_id = ?'),
    region: db.prepare('SELECT owner, rival_wins FROM player_regions WHERE player_id = ? AND region_id = ?'),
    capture: db.prepare("UPDATE player_regions SET owner = 'player', captured_at = ? WHERE player_id = ? AND region_id = ? AND owner != 'player'"),
    rivalWin: db.prepare("UPDATE player_regions SET rival_wins = rival_wins + 1 WHERE player_id = ? AND region_id = ? AND owner = 'rival'"),
    delChallenges: db.prepare('DELETE FROM challenges WHERE player_id = ?'),
    insChallenge: db.prepare('INSERT INTO challenges (id, player_id, question_id, question_version, region_id, mode, choice_order, created_at, mission_id) VALUES (?,?,?,?,?,?,?,?,?)'),
    missionRewards: db.prepare("SELECT reward_key, xp, grain, population, created_at FROM rewards WHERE player_id = ? AND reward_key LIKE 'm:%'"),
    allPlayers: db.prepare('SELECT id FROM players'),
    getChallenge: db.prepare('SELECT * FROM challenges WHERE id = ? AND player_id = ?'),
    delChallenge: db.prepare('DELETE FROM challenges WHERE id = ?'),
    insAttempt: db.prepare('INSERT INTO attempts (player_id, question_id, question_version, region_id, mode, correct, created_at) VALUES (?,?,?,?,?,?,?)'),
    insReward: db.prepare('INSERT OR IGNORE INTO rewards (player_id, reward_key, xp, grain, population, created_at) VALUES (?,?,?,?,?,?)'),
    rewardKeys: db.prepare("SELECT reward_key FROM rewards WHERE player_id = ? AND reward_key LIKE 'q:%'"),
    cards: db.prepare('SELECT card_id, acquired_at FROM player_cards WHERE player_id = ?'),
    insCard: db.prepare('INSERT OR IGNORE INTO player_cards (player_id, card_id, acquired_at) VALUES (?,?,?)'),
    insEra: db.prepare('INSERT OR IGNORE INTO era_log (player_id, era, entered_at) VALUES (?,?,?)'),
    eraLog: db.prepare('SELECT era, entered_at FROM era_log WHERE player_id = ? ORDER BY entered_at'),
    reviewCorrect: db.prepare("SELECT COUNT(*) AS n FROM attempts WHERE player_id = ? AND mode = 'review' AND correct = 1"),
    attempts: db.prepare('SELECT question_id, question_version, region_id, mode, correct, created_at FROM attempts WHERE player_id = ? ORDER BY id DESC LIMIT ?'),
    lastAttempts: db.prepare('SELECT question_id, correct FROM attempts WHERE id IN (SELECT MAX(id) FROM attempts WHERE player_id = ? GROUP BY question_id)'),
    counts: db.prepare('SELECT COUNT(*) AS total, SUM(correct) AS correct FROM attempts WHERE player_id = ?'),
    insSubmission: db.prepare('INSERT INTO submissions (id, player_id, data, status, ai_review, format_check, created_at) VALUES (?,?,?,?,?,?,?)'),
    submissions: db.prepare('SELECT id, data, status, ai_review, format_check, created_at FROM submissions WHERE player_id = ? ORDER BY created_at DESC'),
    countSubmissions: db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE player_id = ?'),
    activeChallenge: db.prepare('SELECT * FROM challenges WHERE player_id = ? ORDER BY created_at DESC LIMIT 1'),
    getReceipt: db.prepare('SELECT * FROM answer_receipts WHERE challenge_id = ? AND player_id = ?'),
    insReceipt: db.prepare('INSERT OR REPLACE INTO answer_receipts (challenge_id, player_id, request_id, answer_key, result, created_at) VALUES (?,?,?,?,?,?)'),
    pruneReceipts: db.prepare('DELETE FROM answer_receipts WHERE player_id = ? AND (created_at < ? OR challenge_id NOT IN (SELECT challenge_id FROM answer_receipts WHERE player_id = ? ORDER BY created_at DESC LIMIT ?))'),
    setToken: db.prepare('UPDATE players SET token_hash = ? WHERE id = ?'),
  };
  // 영수증은 최근 몇 개만, 며칠만 둔다(공용 저장 파일 크기 제한). 없어져도 보상은 이미 서버에 확정돼 있다.
  const RECEIPT_KEEP = 5;
  const RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
  const answerKey = (v) => (typeof v === 'string' ? `s:${v.normalize('NFC').trim().slice(0, 100)}` : `n:${String(v).slice(0, 20)}`);

  function requirePlayer(playerId) {
    const p = S.playerById.get(playerId);
    if (!p) throw new GameError(401, 'no_session', '먼저 닉네임으로 시작하세요.');
    return p;
  }

  const avatar = createAvatar(db,(status,code,message)=>{throw new GameError(status,code,message);});
  const development = createDevelopment(db, {now, validateName:validateNickname,fail:(status,code,message)=>{throw new GameError(status,code,message);}});

  const market=createMarket(db,{now,fail:(status,code,message)=>{throw new GameError(status,code,message);}});
  // ── 통계 계산 ──
  function stats(playerId) {
    const p = requirePlayer(playerId);
    const regions = S.regions.all(playerId);
    const owned = regions.filter((r) => r.owner === 'player').map((r) => REGION_BY_ID.get(r.region_id)).filter(Boolean);
    const uniqueCorrect = Object.fromEntries(ERAS.map((e) => [e.id, 0]));
    const solved = new Set();
    for (const { reward_key } of S.rewardKeys.all(playerId)) {
      const q = QUESTION_BY_ID.get(reward_key.slice(2));
      if (q) { uniqueCorrect[q.era]++; solved.add(q.id); }
    }
    const rewardedMissions = new Map(S.missionRewards.all(playerId).map((r) => [r.reward_key.slice(2), r]));
    const cardIds = new Set(S.cards.all(playerId).map((c) => c.card_id));
    const cardPower = CARDS.filter((c) => cardIds.has(c.id)).reduce((s, c) => s + (c.effect.power || 0), 0);
    const power = p.population + Math.floor(p.grain / 2) + owned.length * 8 + cardPower + development.effects(playerId).powerBonus;
    return {
      p, regions, owned, uniqueCorrect, solved, rewardedMissions, cardIds, cardPower, power,
      reviewCorrect: S.reviewCorrect.get(playerId).n,
      rivalCaptured: owned.filter((r) => r.owner === 'rival').length,
    };
  }

  function condMet(cond, st) {
    const checks = [];
    if (cond.territories != null) checks.push({ label: '보유 영토', current: st.owned.length, need: cond.territories });
    if (cond.uniqueCorrect) {
      const era = ERAS.find((e) => e.id === cond.uniqueCorrect.era).name;
      checks.push({ label: `${era} 문제 처음 맞힘`, current: st.uniqueCorrect[cond.uniqueCorrect.era], need: cond.uniqueCorrect.n });
    }
    if (cond.capturedEra) {
      const era = ERAS.find((e) => e.id === cond.capturedEra.era).name;
      checks.push({ label: `${era} 지역 점령`, current: st.owned.filter((r) => r.era === cond.capturedEra.era).length, need: cond.capturedEra.n });
    }
    if (cond.capturedTerrain) {
      const c = cond.capturedTerrain;
      checks.push({ label: `${c.terrains.join('·')} 신석기 지역 점령`, current: st.owned.filter((r) => r.era === c.era && c.terrains.includes(r.terrain)).length, need: c.n });
    }
    if (cond.reviewCorrect != null) checks.push({ label: '복습 정답', current: st.reviewCorrect, need: cond.reviewCorrect });
    if (cond.rivalCaptured != null) checks.push({ label: '시연용 경쟁 부족 지역 점령', current: st.rivalCaptured, need: cond.rivalCaptured });
    if (cond.era) checks.push({ label: `${ERAS.find((e) => e.id === cond.era).name} 진입`, current: ERA_ORDER[st.p.era], need: ERA_ORDER[cond.era] });
    if (cond.questions) {
      const n = cond.questions.ids.filter((id) => st.solved.has(id)).length;
      checks.push({ label: '미션 문제 처음 맞힘', current: n, need: cond.questions.n });
    }
    if (cond.mission) checks.push({ label: '미션 완료', current: st.rewardedMissions.has(cond.mission) ? 1 : 0, need: 1 });
    for (const id of cond.missions || []) {
      checks.push({ label: `선행 미션: ${MISSION_BY_ID.get(id)?.name ?? id}`, current: st.rewardedMissions.has(id) ? 1 : 0, need: 1, mission: id });
    }
    for (const c of checks) c.ok = c.current >= c.need;
    return { ok: checks.every((c) => c.ok), checks };
  }

  const missionLocked = (m, st) => ERA_ORDER[m.era] > ERA_ORDER[st.p.era] || (m.faction && development.state(st.p.id).faction?.id !== m.faction);
  function receiptOf(m, row) {
    return { id: m.id, name: m.name, xp: row.xp, grain: row.grain, population: row.population, card: m.reward.card || null, at: row.created_at };
  }

  // 상태: locked(뒤 시대) | active(진행 중) | completed(조건 충족, 보상 처리 전) | rewarded(보상 받음)
  function missionStatus(st) {
    return MISSIONS.map((m) => {
      const r = condMet(m.cond, st);
      const locked = missionLocked(m, st);
      const row = st.rewardedMissions.get(m.id);
      const status = row ? 'rewarded' : locked ? 'locked' : r.ok ? 'completed' : 'active';
      const progress = r.checks.reduce((a, c) => ({ current: a.current + Math.min(c.current, c.need), need: a.need + c.need }), { current: 0, need: 0 });
      return {
        id: m.id, status, done: status === 'rewarded' || status === 'completed',
        checks: locked ? [] : r.checks, progress: locked ? null : progress,
        receipt: row ? receiptOf(m, row) : null,
      };
    });
  }

  // 지금 시대까지 열린 미션 가운데 조건을 채운 것에 보상을 한 번만 준다(rewards 의 'm:<id>' 기본키로 중복 차단).
  // 반드시 tx 안에서 부른다.
  function settleMissions(playerId) {
    const t = now();
    const receipts = [];
    // 선행 미션이 뒤에 정의돼 있을 수 있어, 새로 보상한 미션이 없을 때까지 다시 본다(미션 수만큼이 상한).
    for (let pass = 0, more = true; more && pass <= MISSIONS.length; pass++) {
      more = false;
      const st = stats(playerId);
      for (const m of MISSIONS) {
        if (missionLocked(m, st) || st.rewardedMissions.has(m.id)) continue;
        if (!condMet(m.cond, st).ok) continue;
        const { xp, grain, population, card } = m.reward;
        const ins = S.insReward.run(playerId, `m:${m.id}`, xp, grain, population, t);
        if (!ins.changes) continue;
        S.addRes.run(xp, grain, population, t, playerId);
        if (card) { S.insCard.run(playerId, card, t); db.prepare('INSERT OR IGNORE INTO card_grants VALUES(?,?)').run(playerId,card); }
        receipts.push(receiptOf(m, { xp, grain, population, created_at: t }));
        more = true;
      }
    }
    return receipts;
  }

  function advanceStatus(st) {
    const next = ERAS.find((e) => e.order === ERA_ORDER[st.p.era] + 1);
    if (!next) return { target: null, ok: false, checks: [] };
    const rule = ADVANCE_RULES[next.id];
    const mission = MISSIONS.find((m) => m.id === rule.mission);
    const checks = [
      { label: '경험치', current: st.p.xp, need: rule.xp },
      { label: `${ERAS.find((e) => e.id === rule.uniqueEra).name} 문제 처음 맞힘(서로 다른 문제)`, current: st.uniqueCorrect[rule.uniqueEra], need: rule.uniqueCorrect },
      { label: '국력', current: st.power, need: rule.power },
      { label: `필수 미션: ${mission.name}`, current: condMet(mission.cond, st).ok ? 1 : 0, need: 1 },
    ];
    for (const c of checks) c.ok = c.current >= c.need;
    return { target: next.id, targetName: next.name, ok: checks.every((c) => c.ok), checks };
  }

  // 조건을 만족한 카드 지급(중복은 PRIMARY KEY 로 차단)
  function grantCards(playerId) {
    const st = stats(playerId);
    const gained = [];
    for (const c of CARDS) {
      if (st.cardIds.has(c.id) || db.prepare('SELECT 1 FROM card_grants WHERE player_id=? AND card_id=?').get(playerId,c.id)) continue;
      if (condMet(c.cond, st).ok) {
        const r = S.insCard.run(playerId, c.id, now());
        if (r.changes) {gained.push(c.id);db.prepare('INSERT OR IGNORE INTO card_grants VALUES(?,?)').run(playerId,c.id);}
      }
    }
    return gained;
  }

  // 저장 이전(v1 → v2): 미션 보상이 없던 시절에 이미 조건을 채운 미션을 한 번만 정산한다.
  // 진행 기록은 지우지 않고, 뒤 시대 미션은 정산하지 않는다. 여러 번 실행해도 결과가 같다.
  for (const { id } of S.allPlayers.all()) {
    tx(db, () => { settleMissions(id); grantCards(id); });
  }

  function publicState(playerId) {
    const st = stats(playerId);
    const lastAttempts = S.lastAttempts.all(playerId);
    const counts = S.counts.get(playerId);
    return {
      avatar: avatar.state(playerId),
      development: development.state(playerId),
      player: {
        // ref: 브라우저에서 "이미 알린 미션"을 플레이어별로 기억할 때 쓰는 비밀이 아닌 짧은 이름표
        ref: createHash('sha256').update(`ref:${st.p.id}`).digest('hex').slice(0, 12),
        nickname: st.p.nickname, era: st.p.era, xp: st.p.xp, grain: st.p.grain,
        population: st.p.population, power: st.power, cardPower: st.cardPower,
      },
      regions: st.regions.map((r) => ({ id: r.region_id, owner: r.owner, rivalWins: r.rival_wins })),
      cards: S.cards.all(playerId).map((c) => ({ id: c.card_id, acquiredAt: c.acquired_at })),
      missions: missionStatus(st),
      advance: advanceStatus(st),
      eraLog: S.eraLog.all(playerId).map((e) => ({ era: e.era, enteredAt: e.entered_at })),
      stats: {
        uniqueCorrect: st.uniqueCorrect,
        totalAttempts: counts.total,
        totalCorrect: counts.correct || 0,
        reviewPending: lastAttempts.filter((a) => !a.correct).length,
        submissions: S.countSubmissions.get(playerId).n,
      },
    };
  }

  // selection: { reason, message, repeat, reviewCycle, ... } (lib/question-selection.mjs). 화면은 repeat/reviewCycle 로
  // "다시 나온 문제"·"복습 순환"을 알릴 수 있다.
  function issueChallenge(playerId, q, regionId, mode, missionId = null, selection = null) {
    S.delChallenges.run(playerId); // 한 번에 하나의 도전만 유효
    const order = q.type === 'ox' ? [0, 1] : q.type === 'short' ? [] : shuffledOrder(q.choices.length);
    const id = randomBytes(16).toString('hex');
    const t = now();
    S.insChallenge.run(id, playerId, q.id, q.version, regionId, mode, JSON.stringify(order), t, missionId);
    presented.record(playerId, q.id);
    return publicChallenge({ id, q, order, regionId, mode, missionId, createdAt: t, selection });
  }

  // 화면에 보내는 문제 모양. 정답·해설은 포함하지 않는다(새로 낼 때와 이어 풀 때 같은 모양).
  function publicChallenge({ id, q, order, regionId, mode, missionId, createdAt, selection }) {
    const sel = selection || {};
    return {
      challengeId: id,
      mode,
      regionId,
      missionId,
      expiresAt: createdAt + RULES.challengeTtlMs,
      repeat: Boolean(sel.repeat),
      reviewCycle: Boolean(sel.reviewCycle),
      selection: sel,
      question: {
        era: q.era, topic: q.topic, difficulty: q.difficulty, objective: q.objective,
        id: q.id, version: q.version, type: q.type || 'mcq',
        text: q.question, choices: order.map((i) => q.choices[i]),
        hints: q.hints || [], answerHint: q.type === 'short' ? q.answerHint : undefined, answerLength: q.type === 'short' ? q.answerLength : undefined,
        reviewStatus: q.reviewStatus, origin: q.origin, myth: q.myth, sources: q.sources,
      },
    };
  }

  // 이어 풀기: 아직 답하지 않은 도전을 같은 모양으로 다시 보여 준다. 만료된 도전은 되살리지 않고
  // { expired: true } 만 알린다(문제·정답 없음). 저장한 보기 순서를 그대로 쓰므로 화면 위치가 바뀌지 않는다.
  function activeChallenge(playerId) {
    const ch = S.activeChallenge.get(playerId);
    if (!ch) return null;
    const expiresAt = ch.created_at + RULES.challengeTtlMs;
    const base = { challengeId: ch.id, mode: ch.mode, regionId: ch.region_id, missionId: ch.mission_id };
    if (now() > expiresAt) return { ...base, expired: true, expiresAt };
    const q = loadQuestion(ch.question_id, ch.question_version);
    if (!q) return null;
    const out = publicChallenge({
      id: ch.id, q, order: JSON.parse(ch.choice_order), regionId: ch.region_id, mode: ch.mode, missionId: ch.mission_id,
      createdAt: ch.created_at, selection: { resumed: true },
    });
    out.resumed = true;
    if (ch.mode === 'defense') {
      const d = db.prepare('SELECT raid_id FROM defense_challenges WHERE challenge_id = ?').get(ch.id);
      if (d) out.raidId = d.raid_id;
    }
    return out;
  }

  const solvedIds = (playerId) => new Set(S.rewardKeys.all(playerId).map((r) => r.reward_key.slice(2)));
  // 방어 훈련·유물 탐구: 정해진 문제(학습 기록)라 고르지 않고, 다시 나온 문제인지만 알린다.
  function fixedSelection(playerId, q) {
    const seen = presented.seen(playerId).get(q.id);
    const reason = seen ? 'fixed_question_repeat' : 'fixed_question';
    return { reason, message: SELECTION_REASONS[reason], repeat: Boolean(seen), reviewCycle: Boolean(seen) && solvedIds(playerId).has(q.id), poolSize: 1, timesSeen: seen?.times || 0 };
  }

  // 미션 도전 범위: 자기 문제 + 아직 끝나지 않은 선행 미션의 문제(정리 미션은 선행 미션 문제로 진행된다).
  function missionPool(m, rewarded, seenMissions = new Set()) {
    if (seenMissions.has(m.id)) return [];
    seenMissions.add(m.id);
    const ids = [...m.questionIds];
    for (const p of m.requires || []) {
      const pm = MISSION_BY_ID.get(p);
      if (pm && !rewarded.has(p) && pm.action === 'quiz') ids.push(...missionPool(pm, rewarded, seenMissions).map((q) => q.id));
    }
    return [...new Set(ids)].map((id) => QUESTION_BY_ID.get(id)).filter(Boolean);
  }

  return {
    createPlayer(rawNickname) {
      const nickname = validateNickname(rawNickname);
      const token = randomBytes(32).toString('base64url');
      const id = randomUUID();
      const t = now();
      tx(db, () => {
        S.insPlayer.run(id, hashToken(token), nickname, 'paleolithic', RULES.start.xp, RULES.start.grain, RULES.start.population, t, t);
        for (const r of REGIONS) S.insRegion.run(id, r.id, r.owner);
        S.insEra.run(id, 'paleolithic', t);
      });
      return { token, playerId: id };
    },

    playerIdForToken(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
      const p = S.playerByToken.get(hashToken(token));
      return p ? p.id : null;
    },

    // 로그아웃: 이 탐험대의 세션 토큰을 새 임의 값으로 바꿔 기존 쿠키를 무효로 만든다.
    revokeSession(playerId) {
      if (playerId) S.setToken.run(hashToken(randomBytes(32).toString('base64url')), playerId);
    },

    // 첫 화면 상태에는 이어 풀 도전(activeChallenge)을 함께 준다. 다른 응답의 state 에는 넣지 않는다.
    state(playerId) {
      return { ...publicState(playerId), activeChallenge: activeChallenge(playerId) };
    },
    marketList(id){requirePlayer(id);return market.list(id);},
    marketPost(id,body){requirePlayer(id);return tx(db,()=>market.post(id,body));},
    marketAccept(id,body){requirePlayer(id);return tx(db,()=>market.accept(id,body));},
    marketCancel(id,body){requirePlayer(id);return tx(db,()=>market.cancel(id,body));},
    avatarSave(playerId,body){requirePlayer(playerId);return tx(db,()=>({...avatar.save(playerId,body),state:publicState(playerId)}));},
    avatarUpgrade(playerId,body){requirePlayer(playerId);return tx(db,()=>({...avatar.upgrade(playerId,body),state:publicState(playerId)}));},
    chooseFaction(playerId,body){requirePlayer(playerId);return tx(db,()=>({...development.faction(playerId,body),state:publicState(playerId)}));},
    upgrade(playerId,body){requirePlayer(playerId);return tx(db,()=>({...development.upgrade(playerId,body),state:publicState(playerId)}));},
    harvest(playerId,body){requirePlayer(playerId);return tx(db,()=>({...development.harvest(playerId,body),state:publicState(playerId)}));},
    skill(playerId,body){requirePlayer(playerId);return tx(db,()=>({...development.skill(playerId,body),state:publicState(playerId)}));},
    joinNation(playerId,body){requirePlayer(playerId);return tx(db,()=>({...development.joinNation(playerId,body),state:publicState(playerId)}));},
    formNation(playerId,body){requirePlayer(playerId);return tx(db,()=>({...development.nation(playerId,body),state:publicState(playerId)}));},
    startCollection(playerId,{collectionId}){requirePlayer(playerId);const c=development.state(playerId).collections.find(c=>c.id===collectionId);if(!c||ERA_ORDER[c.era]>ERA_ORDER[requirePlayer(playerId).era])throw new GameError(403,'collection_locked','해당 시대에 들어서면 탐구할 수 있어요.');const q=QUESTION_BY_ID.get(c.questionId);return tx(db,()=>issueChallenge(playerId,q,null,'collection',null,fixedSelection(playerId,q)));},
    startDefense(playerId,body){requirePlayer(playerId);return tx(db,()=>{const {raid,risk}=development.prepareDefense(playerId,body);const q=QUESTION_BY_ID.get(raid.questionId);const ch=issueChallenge(playerId,q,body.regionId,'defense',null,fixedSelection(playerId,q));db.prepare('INSERT INTO defense_challenges VALUES(?,?,?,?)').run(ch.challengeId,playerId,body.regionId,raid.id);return{...ch,risk,raidId:raid.id};});},

    startRegionChallenge(playerId, regionId) {
      const p = requirePlayer(playerId);
      const region = REGION_BY_ID.get(regionId);
      if (!region) throw new GameError(404, 'no_region', '없는 지역이에요.');
      if (ERA_ORDER[region.era] > ERA_ORDER[p.era]) {
        throw new GameError(403, 'era_locked', `${ERAS.find((e) => e.id === region.era).name}에 들어서야 도전할 수 있어요.`);
      }
      // 그 시대 문제 가운데 한 번도 보여 주지 않은 문제를 먼저 낸다(모드 상관없이 플레이어 전체 기록 기준).
      // 다 보여 줬으면 repeat/reviewCycle 표시와 함께 다시 낸다. 정답이면 점령은 그대로 진행된다(막히지 않음).
      return tx(db, () => {
        const pool = QUESTIONS.filter((q) => q.era === region.era);
        const pick = pickQuestion(pool, { seen: presented.seen(playerId), solved: solvedIds(playerId) });
        if (!pick) throw new GameError(404, 'no_question', '이 시대 문제가 아직 없어요.');
        return issueChallenge(playerId, pick.question, regionId, 'region', null, { scope: 'region', ...pick.selection });
      });
    },

    // 미션 문제: 미션에 정해 둔 문제 가운데서만 낸다. 뒤 시대 미션은 잠겨 있다.
    // 영토를 다시 점령하지 않아도 삼국 이후 시대를 배울 수 있게 하는 길이다.
    startMissionChallenge(playerId, missionId) {
      const p = requirePlayer(playerId);
      if (typeof missionId !== 'string' || !MISSION_ID_RE.test(missionId) || !MISSION_BY_ID.has(missionId)) {
        throw new GameError(404, 'no_mission', '없는 미션이에요.');
      }
      const m = MISSION_BY_ID.get(missionId);
      if (ERA_ORDER[m.era] > ERA_ORDER[p.era] || (m.faction && development.state(playerId).faction?.id !== m.faction)) {
        throw new GameError(403, 'mission_locked', `${eraNameOf(m.era)}에 들어서야 할 수 있는 미션이에요.`);
      }
      if (m.action !== 'quiz') {
        const how = m.action === 'region' ? '지도에서 지역을 골라 점령하는 미션이에요.' : '학습 기록에서 틀린 문제를 복습하는 미션이에요.';
        throw new GameError(400, 'mission_not_quiz', how, { action: m.action });
      }
      return tx(db, () => {
        const rewarded = new Set(S.missionRewards.all(playerId).map((r) => r.reward_key.slice(2)));
        const solved = solvedIds(playerId);
        // 이미 보상을 받은 미션: 아직 처음 정답을 받지 못한 자기 문제만 계속 낸다(삼국 이후 시대 문제는 미션으로만 닿기 때문).
        // 그런 문제가 없으면 새 도전을 내지 않는다 — 다 맞힌 문제를 되풀이해 얻을 것이 없고, 복습은 복습 미션에서 한다.
        if (rewarded.has(m.id) && !m.questionIds.some((qid) => QUESTION_BY_ID.has(qid) && !solved.has(qid))) {
          throw new GameError(409, 'mission_complete', '이미 완료한 미션이에요. 다른 미션이나 틀린 문제 복습을 해 보세요.', { missionId: m.id });
        }
        const pool = missionPool(m, rewarded);
        if (!pool.length) throw new GameError(400, 'mission_not_quiz', '이 미션은 낼 문제가 없어요.', { action: m.action });
        // 처음 정답을 받을 수 있는 문제(진행에 쓰이는 문제)를 먼저 고르고, 그 안에서 안 본 문제를 먼저 낸다.
        const open = pool.filter((q) => !solved.has(q.id));
        const pick = pickQuestion(open.length ? open : pool, { seen: presented.seen(playerId), solved });
        const selection = { scope: 'mission', missionRewarded: rewarded.has(m.id), ...pick.selection };
        if (!open.length) {
          // 범위의 문제를 모두 맞혔는데 미션이 남아 있다(예: 지역 점령·시대 조건). 문제는 복습으로만 낸다.
          Object.assign(selection, { repeat: true, reviewCycle: true, reason: 'review_cycle', message: SELECTION_REASONS.review_cycle });
        }
        const via = m.questionIds.includes(pick.question.id) ? null
          : (m.requires || []).find((p) => MISSION_BY_ID.get(p)?.questionIds.includes(pick.question.id)) || null;
        if (via) selection.viaMission = via; // 정리 미션: 선행 미션의 문제로 진행한다
        return issueChallenge(playerId, pick.question, null, 'mission', m.id, selection);
      });
    },

    startReviewChallenge(playerId) {
      requirePlayer(playerId);
      const wrong = S.lastAttempts.all(playerId).filter((a) => !a.correct).map((a) => QUESTION_BY_ID.get(a.question_id)).filter(Boolean);
      if (!wrong.length) throw new GameError(404, 'no_review', '복습할 틀린 문제가 없어요.');
      // 복습은 일부러 다시 내는 모드다. 틀린 문제가 여럿이면 방금 본 문제는 피하고 오래된 것부터 낸다.
      return tx(db, () => {
        const seen = presented.seen(playerId);
        const q = leastRecent(wrong, seen);
        const selection = { scope: 'review', reason: 'explicit_review', message: SELECTION_REASONS.explicit_review, repeat: true, reviewCycle: false, poolSize: wrong.length, timesSeen: seen.get(q.id)?.times || 0 };
        return issueChallenge(playerId, q, null, 'review', null, selection);
      });
    },

    // requestId: 브라우저가 답을 보내기 전에 만들어 보관하는 요청 번호. 응답을 못 받아 같은 번호·같은 답으로
    // 다시 보내면 판정과 보상을 다시 하지 않고 저장한 결과를 돌려준다(replayed: true). 번호가 없거나 다르면 예전처럼 막는다.
    answer(playerId, challengeId, choiceIndex, { requestId = null } = {}) {
      requirePlayer(playerId);
      if (typeof challengeId !== 'string' || !/^[0-9a-f]{32}$/.test(challengeId)) {
        throw new GameError(400, 'bad_challenge', '문제 정보가 올바르지 않아요.');
      }
      const reqId = typeof requestId === 'string' && REQUEST_ID_RE.test(requestId) ? requestId : null;
      const key = answerKey(choiceIndex);
      const receipt = (t, result) => {
        S.insReceipt.run(challengeId, playerId, reqId, key, JSON.stringify(result), t);
        S.pruneReceipts.run(playerId, t - RECEIPT_TTL_MS, playerId, RECEIPT_KEEP);
      };
      const result = tx(db, () => {
        const ch = S.getChallenge.get(challengeId, playerId);
        if (!ch) {
          const rc = reqId ? S.getReceipt.get(challengeId, playerId) : null;
          if (rc && rc.request_id === reqId && rc.answer_key === key) {
            const saved = JSON.parse(rc.result);
            if (saved.expired) return { expired: true };
            const state = publicState(playerId);
            const mission = saved.missionId ? { id: saved.missionId, ...state.missions.find((x) => x.id === saved.missionId) } : null;
            const { missionId: _m, ...rest } = saved;
            return { ...rest, mission, state, replayed: true };
          }
          throw new GameError(409, 'challenge_used', '이미 답했거나 만료된 문제예요. 새 문제를 받아 주세요.');
        }
        S.delChallenge.run(ch.id); // 1회용: 같은 답변 재전송 차단
        if (now() - ch.created_at > RULES.challengeTtlMs) { receipt(now(), { expired: true }); return { expired: true }; } // 삭제는 커밋
        const q = loadQuestion(ch.question_id, ch.question_version);
        if (!q) throw new GameError(500, 'question_missing', '문제를 찾을 수 없어요.');
        const order = JSON.parse(ch.choice_order);
        const short = q.type === 'short';
        if (short && (typeof choiceIndex !== 'string' || !choiceIndex.trim() || choiceIndex.length > 80)) throw new GameError(400, 'bad_answer', '답을 1~80자로 입력해 주세요.');
        if (!short && (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= order.length)) throw new GameError(400, 'bad_choice', '보기를 하나 골라 주세요.');
        const correct = short ? q.acceptedAnswers.some(a => normalizeAnswer(a) === normalizeAnswer(choiceIndex)) : order[choiceIndex] === q.answer;
        const selectedChoice = short ? choiceIndex.trim() : q.choices[order[choiceIndex]];
        const feedback = correct ? null : short ? `입력한 답은 「${selectedChoice}」예요. ${misconceptionFact(selectedChoice)} 초성 ${q.answerHint}과 자료의 단서를 함께 확인해 보세요. ${q.explanation}` : q.optionFeedback?.[order[choiceIndex]] || `「${selectedChoice}」와 정답을 비교해 보세요. ${q.explanation}`;
        const t = now();
        S.insAttempt.run(playerId, q.id, q.version, ch.region_id, ch.mode, correct ? 1 : 0, t);

        const before = stats(playerId);
        const reward = { xp: 0, grain: 0, population: 0, firstCorrect: false, repeat: false };
        if (correct) {
          const xp = RULES.firstCorrect.xpBase + RULES.firstCorrect.xpPerDifficulty * (q.difficulty - 1) + (/문화|토기|유물|청자|훈민|직지|불교|석굴|첨성|신종/.test(q.topic) ? development.effects(playerId).skills.culture : 0);
          let grain = RULES.firstCorrect.grain;
          for (const c of CARDS) {
            if (before.cardIds.has(c.id) && c.effect.grainOnFirstCorrectEra === q.era) grain += c.effect.amount;
          }
          const pop = RULES.firstCorrect.population;
          const ins = S.insReward.run(playerId, `q:${q.id}`, xp, grain, pop, t);
          if (ins.changes) {
            S.addRes.run(xp, grain, pop, t, playerId);
            Object.assign(reward, { xp, grain, population: pop, firstCorrect: true });
          } else {
            reward.repeat = true;
          }
        }

        let territory = null;
        if (correct && ch.mode === 'region' && ch.region_id) {
          const reg = S.region.get(playerId, ch.region_id);
          if (reg && reg.owner === 'rival') {
            S.rivalWin.run(playerId, ch.region_id);
            const wins = reg.rival_wins + 1;
            territory = { regionId: ch.region_id, rivalWins: wins, need: RULES.rivalWinsNeeded, captured: false };
          }
          const now2 = S.region.get(playerId, ch.region_id);
          const canCapture = now2 && (now2.owner === 'neutral' || (now2.owner === 'rival' && now2.rival_wins >= RULES.rivalWinsNeeded));
          if (canCapture) {
            const cap = S.capture.run(t, playerId, ch.region_id); // 현재 소유권 재확인 후 갱신
            if (cap.changes) {
              let pop = RULES.capture.population;
              for (const c of CARDS) if (before.cardIds.has(c.id) && c.effect.populationOnCapture) pop += c.effect.populationOnCapture;
              const ins = S.insReward.run(playerId, `capture:${ch.region_id}`, 0, RULES.capture.grain, pop, t);
              const gain = ins.changes ? { grain: RULES.capture.grain, population: pop } : { grain: 0, population: 0 };
              if (ins.changes) S.addRes.run(0, gain.grain, gain.population, t, playerId);
              territory = { regionId: ch.region_id, captured: true, ...gain };
            }
          } else if (now2 && now2.owner === 'player' && !territory) {
            territory = { regionId: ch.region_id, captured: false, alreadyOwned: true };
          }
        }

        const defense = development.settleDefense(playerId,ch,correct);
        const upkeep = reward.repeat ? null : development.upkeep(playerId);
        // 미션 보상 → 카드 순서로 정산(같은 거래 안)
        const missionsCompleted = settleMissions(playerId);
        const newCards = [...missionsCompleted.map((r) => r.card).filter(Boolean), ...grantCards(playerId)];
        const state = publicState(playerId);
        const mission = ch.mission_id ? { id: ch.mission_id, ...state.missions.find((x) => x.id === ch.mission_id) } : null;
        const judged = {
          correct, defense, upkeep,
          correctChoice: q.type === 'short' ? q.acceptedAnswers[0] : q.choices[q.answer],
          selectedChoice, feedback, questionVersion: q.version,
          explanation: q.explanation,
          reward,
          territory,
          missionsCompleted,
          newCards,
        };
        // 같은 거래 안에서 영수증 저장: 보상이 확정됐다면 영수증도 함께 확정된다.
        receipt(t, { ...judged, missionId: ch.mission_id || null });
        return { ...judged, mission, state };
      });
      if (result.expired) throw new GameError(409, 'challenge_expired', '시간이 지나 만료된 문제예요. 새 문제를 받아 주세요.');
      return result;
    },

    advance(playerId) {
      requirePlayer(playerId);
      return tx(db, () => {
        const st = stats(playerId);
        const adv = advanceStatus(st);
        if (!adv.target) throw new GameError(400, 'max_era', '마지막 시대(대한민국)에 도착했어요.');
        if (!adv.ok) throw new GameError(400, 'advance_locked', '아직 시대 발전 조건을 채우지 못했어요.', { checks: adv.checks });
        const r = S.setEra.run(adv.target, now(), playerId, st.p.era);
        if (!r.changes) throw new GameError(409, 'advance_conflict', '이미 처리된 요청이에요.');
        S.insEra.run(playerId, adv.target, now());
        const missionsCompleted = settleMissions(playerId);
        const newCards = [...missionsCompleted.map((x) => x.card).filter(Boolean), ...grantCards(playerId)];
        return { era: adv.target, newCards, missionsCompleted, state: publicState(playerId) };
      });
    },

    submitQuestion(playerId, body) {
      requirePlayer(playerId);
      const v = validateSubmission(body);
      if (!v.ok) throw new GameError(400, 'invalid_submission', '형식 검사를 통과하지 못했어요.', { errors: v.errors });
      if (S.countSubmissions.get(playerId).n >= 50) throw new GameError(429, 'too_many', '제출한 문제가 너무 많아요.');
      const id = randomUUID();
      S.insSubmission.run(id, playerId, JSON.stringify(v.clean), 'pending_review', 'not_connected', 'passed', now());
      return { id, status: 'pending_review', aiReview: 'not_connected' };
    },

    listSubmissions(playerId) {
      requirePlayer(playerId);
      return S.submissions.all(playerId).map((s) => ({
        id: s.id, ...JSON.parse(s.data), status: s.status, aiReview: s.ai_review,
        formatCheck: s.format_check, createdAt: s.created_at,
      }));
    },

    // 학습 기록: 답한 뒤에만 해설과 정답을 보여 준다.
    history(playerId, limit = 60) {
      requirePlayer(playerId);
      const rows = S.attempts.all(playerId, Math.min(Math.max(limit, 1), 200));
      const last = new Map(S.lastAttempts.all(playerId).map((a) => [a.question_id, a.correct]));
      const attempts = rows.map((a) => {
        const q = loadQuestion(a.question_id, a.question_version);
        return {
          questionId: a.question_id, era: q?.era, topic: q?.topic, text: q?.question,
          correct: Boolean(a.correct), mode: a.mode, regionId: a.region_id, at: a.created_at,
        };
      });
      // 도감(학습 노트): 한 번이라도 시도한 문제의 해설
      const notes = [...last.keys()].map((id) => {
        const q = QUESTION_BY_ID.get(id);
        if (!q) return null;
        const solved = last.get(id) === 1;
        return {
          questionId: id, era: q.era, topic: q.topic, text: q.question,
          lastCorrect: solved,
          // 틀린 채로 남은 문제는 복습을 위해 정답을 숨긴다.
          answer: solved ? q.choices[q.answer] : null,
          explanation: solved ? q.explanation : null,
          reviewStatus: q.reviewStatus,
        };
      }).filter(Boolean);
      return { attempts, notes };
    },
  };
}
