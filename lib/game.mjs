import {createAvatar} from './avatar.mjs';
import { createMarket } from './market.mjs';
import { createDevelopment } from './development.mjs';
// 게임 규칙과 서버 판정. 정답·보상·소유권은 여기서만 확정한다.
import { randomBytes, randomInt, createHash, randomUUID } from 'node:crypto';
import { tx } from './db.mjs';
import { migrateSchema } from './schema.mjs';
import { QUESTIONS, QUESTION_BY_ID } from './questions.mjs';
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
  };

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
    const st = stats(playerId);
    const t = now();
    const receipts = [];
    for (const m of MISSIONS) {
      if (missionLocked(m, st) || st.rewardedMissions.has(m.id)) continue;
      if (!condMet(m.cond, st).ok) continue;
      const { xp, grain, population, card } = m.reward;
      const ins = S.insReward.run(playerId, `m:${m.id}`, xp, grain, population, t);
      if (!ins.changes) continue;
      S.addRes.run(xp, grain, population, t, playerId);
      if (card) { S.insCard.run(playerId, card, t); db.prepare('INSERT OR IGNORE INTO card_grants VALUES(?,?)').run(playerId,card); }
      receipts.push(receiptOf(m, { xp, grain, population, created_at: t }));
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

  function issueChallenge(playerId, q, regionId, mode, missionId = null) {
    S.delChallenges.run(playerId); // 한 번에 하나의 도전만 유효
    const order = shuffledOrder(q.choices.length);
    const id = randomBytes(16).toString('hex');
    S.insChallenge.run(id, playerId, q.id, q.version, regionId, mode, JSON.stringify(order), now(), missionId);
    // 정답·해설은 포함하지 않는다.
    return {
      challengeId: id,
      mode,
      regionId,
      missionId,
      question: {
        era: q.era, topic: q.topic, difficulty: q.difficulty, objective: q.objective,
        text: q.question, choices: order.map((i) => q.choices[i]),
        reviewStatus: q.reviewStatus, origin: q.origin, myth: q.myth, sources: q.sources,
      },
    };
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

    state: publicState,
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
    startCollection(playerId,{collectionId}){requirePlayer(playerId);const c=development.state(playerId).collections.find(c=>c.id===collectionId);if(!c||ERA_ORDER[c.era]>ERA_ORDER[requirePlayer(playerId).era])throw new GameError(403,'collection_locked','해당 시대에 들어서면 탐구할 수 있어요.');return tx(db,()=>issueChallenge(playerId,QUESTION_BY_ID.get(c.questionId),null,'collection',null));},
    startDefense(playerId,body){requirePlayer(playerId);return tx(db,()=>{const {raid,risk}=development.prepareDefense(playerId,body);const ch=issueChallenge(playerId,QUESTION_BY_ID.get(raid.questionId),body.regionId,'defense',null);db.prepare('INSERT INTO defense_challenges VALUES(?,?,?,?)').run(ch.challengeId,playerId,body.regionId,raid.id);return{...ch,risk,raidId:raid.id};});},

    startRegionChallenge(playerId, regionId) {
      const p = requirePlayer(playerId);
      const region = REGION_BY_ID.get(regionId);
      if (!region) throw new GameError(404, 'no_region', '없는 지역이에요.');
      if (ERA_ORDER[region.era] > ERA_ORDER[p.era]) {
        throw new GameError(403, 'era_locked', `${ERAS.find((e) => e.id === region.era).name}에 들어서야 도전할 수 있어요.`);
      }
      const pool = QUESTIONS.filter((q) => q.era === region.era);
      const solved = new Set(S.rewardKeys.all(playerId).map((r) => r.reward_key.slice(2)));
      const fresh = pool.filter((q) => !solved.has(q.id));
      const from = fresh.length ? fresh : pool;
      const q = from[randomInt(from.length)];
      return tx(db, () => issueChallenge(playerId, q, regionId, 'region'));
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
      const pool = m.questionIds.map((id) => QUESTION_BY_ID.get(id)).filter(Boolean);
      if (m.action !== 'quiz' || !pool.length) {
        const how = m.action === 'region' ? '지도에서 지역을 골라 점령하는 미션이에요.' : '학습 기록에서 틀린 문제를 복습하는 미션이에요.';
        throw new GameError(400, 'mission_not_quiz', how, { action: m.action });
      }
      const solved = new Set(S.rewardKeys.all(playerId).map((r) => r.reward_key.slice(2)));
      const fresh = pool.filter((q) => !solved.has(q.id));
      const from = fresh.length ? fresh : pool; // 다 풀었으면 복습용(보상 없음)
      const q = from[randomInt(from.length)];
      return tx(db, () => issueChallenge(playerId, q, null, 'mission', m.id));
    },

    startReviewChallenge(playerId) {
      requirePlayer(playerId);
      const wrong = S.lastAttempts.all(playerId).filter((a) => !a.correct).map((a) => QUESTION_BY_ID.get(a.question_id)).filter(Boolean);
      if (!wrong.length) throw new GameError(404, 'no_review', '복습할 틀린 문제가 없어요.');
      const q = wrong[randomInt(wrong.length)];
      return tx(db, () => issueChallenge(playerId, q, null, 'review'));
    },

    answer(playerId, challengeId, choiceIndex) {
      requirePlayer(playerId);
      if (typeof challengeId !== 'string' || !/^[0-9a-f]{32}$/.test(challengeId)) {
        throw new GameError(400, 'bad_challenge', '문제 정보가 올바르지 않아요.');
      }
      if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 3) {
        throw new GameError(400, 'bad_choice', '보기를 하나 골라 주세요.');
      }
      const result = tx(db, () => {
        const ch = S.getChallenge.get(challengeId, playerId);
        if (!ch) throw new GameError(409, 'challenge_used', '이미 답했거나 만료된 문제예요. 새 문제를 받아 주세요.');
        S.delChallenge.run(ch.id); // 1회용: 같은 답변 재전송 차단
        if (now() - ch.created_at > RULES.challengeTtlMs) return { expired: true }; // 삭제는 커밋
        const q = loadQuestion(ch.question_id, ch.question_version);
        if (!q) throw new GameError(500, 'question_missing', '문제를 찾을 수 없어요.');
        const order = JSON.parse(ch.choice_order);
        if (choiceIndex >= order.length) throw new GameError(400, 'bad_choice', '보기를 하나 골라 주세요.');
        const correct = order[choiceIndex] === q.answer;
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
        return {
          correct, defense, upkeep,
          correctChoice: q.choices[q.answer],
          explanation: q.explanation,
          reward,
          territory,
          mission,
          missionsCompleted,
          newCards,
          state,
        };
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
