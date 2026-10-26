// 미션 정규화와 점검. content.mjs 가 원본 미션과 확장 미션(expansion-content.mjs)을 합친 "뒤"에 한 번 적용한다.
// 원본 파일(확장 콘텐츠·문제 은행)은 고치지 않고, 여기서 계산한 결과만 게임 규칙으로 쓴다.
//
// 규칙
// 1) 한 문제의 "처음 정답"은 문제 미션(cond.questions) 하나의 진행에만 쓰인다(문제 소유권).
//    여러 미션이 같은 문제를 가지면 더 좁은 주제의 미션이 소유한다.
//    순서: 일반 미션 > 나라 선택(faction) 미션 → 문제 수가 적은 미션 → 필수가 아닌 미션 → 먼저 정의된 미션.
// 2) 문제를 빼앗긴 미션은 남은 자기 문제로 같은 개수(n)를 채울 수 있으면 그대로 둔다.
//    모자라면 n 을 남은 문제 수로 줄이고, 빼앗긴 문제를 소유한 미션(최대 MAX_PREREQ 개)을 선행 미션으로 삼는다.
//    → 같은 정답으로 두 미션을 동시에 채우던 중복이 "앞 미션 완료 → 정리 미션" 순서로 바뀐다.
// 3) 선행 미션이 하나뿐인 순수 정리 미션은 그 시대 필수 미션을 선행으로 더해 같은 목표의 중복을 없앤다.
// 4) 시대 전체 정답 수를 세는 미션(cond.uniqueCorrect)은 출제 범위만 다른 미션이 소유하지 않은 문제로 좁힌다.
// 5) 선행 관계는 같거나 앞 시대, 나라 선택이 맞는 미션만 허용하고 순환이 생기면 그 연결을 버린다.
// 이미 받은 미션 보상·카드는 rewards/player_cards 기록으로 유지된다(정규화는 앞으로의 조건만 바꾼다).

export const MAX_PREREQ = 3;

const clone = (v) => JSON.parse(JSON.stringify(v));
const uniq = (a) => [...new Set(a)];

// TOPIC: 조건이 바뀐 미션의 자동 설명에 쓰는 주제 이름. 없으면 미션 이름을 쓴다.
export function normalizeMissions(rawMissions, { questionEra, eraOrder, topics = {}, descOverrides = {}, prerequisites = {} }) {
  const exists = (id) => questionEra.has(id);
  const missions = rawMissions.map((m, index) => {
    const out = { ...m, index, cond: clone(m.cond || {}), questionIds: uniq(m.questionIds || []).filter(exists) };
    if (out.cond.questions) {
      out.cond.questions.ids = uniq(out.cond.questions.ids).filter(exists);
    }
    return out;
  });
  const byId = new Map(missions.map((m) => [m.id, m]));
  const credit = missions.filter((m) => m.cond.questions);
  const rank = (m) => [m.faction ? 1 : 0, m.cond.questions.ids.length, m.required ? 1 : 0, m.index];
  const better = (a, b) => {
    const ra = rank(a), rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i];
    return false;
  };
  const owner = new Map();
  for (const m of credit) {
    for (const id of m.cond.questions.ids) {
      const cur = owner.get(id);
      if (!cur || better(m, cur)) owner.set(id, m);
    }
  }

  const reqOf = new Map(); // id -> Set(prereq id)
  const reaches = (from, target, seen = new Set()) => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    for (const n of reqOf.get(from) || []) if (reaches(n, target, seen)) return true;
    return false;
  };
  const canRequire = (m, p) => p && p.id !== m.id
    && eraOrder[p.era] <= eraOrder[m.era]
    && (!p.faction || p.faction === m.faction)
    && !reaches(p.id, m.id);
  const addReq = (m, p) => {
    if (!canRequire(m, p)) return false;
    if (!reqOf.has(m.id)) reqOf.set(m.id, new Set());
    reqOf.get(m.id).add(p.id);
    return true;
  };

  const changes = [];
  // 소유권이 정해진 순서(좁은 미션 먼저)로 처리해 선행 관계가 한 방향으로만 생기게 한다.
  for (const m of [...credit].sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0))) {
    const before = { ids: [...m.cond.questions.ids], n: m.cond.questions.n };
    const exclusive = before.ids.filter((id) => owner.get(id) === m);
    const stripped = before.ids.filter((id) => owner.get(id) !== m);
    const n = Math.min(before.n, before.ids.length);
    if (!stripped.length && n === before.n) continue;
    const newN = Math.min(n, exclusive.length);
    const deficit = before.n - newN;
    const owners = new Map();
    for (const id of stripped) {
      const o = owner.get(id);
      owners.set(o.id, (owners.get(o.id) || 0) + 1);
    }
    const added = [];
    if (deficit > 0) {
      const ordered = [...owners.entries()]
        .sort((a, b) => b[1] - a[1] || byId.get(a[0]).index - byId.get(b[0]).index)
        .map(([id]) => byId.get(id));
      for (const p of ordered) {
        if (added.length >= MAX_PREREQ) break;
        if (addReq(m, p)) added.push(p.id);
      }
      if (!exclusive.length && added.length === 1) {
        const core = missions.find((x) => x.required && x.era === m.era && x.id !== m.id);
        if (core && addReq(m, core)) added.push(core.id);
      }
    }
    m.cond.questions = newN > 0 ? { ids: exclusive, n: newN } : undefined;
    if (!m.cond.questions) delete m.cond.questions;
    if (added.length) m.cond.missions = uniq([...(m.cond.missions || []), ...added]);
    m.questionIds = exclusive.length ? exclusive : [];
    m.requires = m.cond.missions || [];
    m.normalized = {
      before, after: { ids: exclusive, n: newN }, movedTo: Object.fromEntries(stripped.map((id) => [id, owner.get(id).id])),
      requires: m.requires, reason: deficit > 0 ? 'shared_questions_to_prerequisite' : 'shared_questions_removed',
    };
    changes.push({ id: m.id, ...m.normalized });
  }

  // 시대 전체 정답 수 미션: 출제 범위를 주인 없는 문제로 좁힌다(조건 자체는 그대로).
  for (const m of missions) {
    if (m.cond.questions || !m.cond.uniqueCorrect || !m.questionIds.length) continue;
    const free = m.questionIds.filter((id) => !owner.has(id));
    if (free.length && free.length !== m.questionIds.length) {
      changes.push({ id: m.id, reason: 'aggregate_pool_narrowed', before: { ids: m.questionIds }, after: { ids: free } });
      m.questionIds = free;
    }
  }

  // 사건·기회는 전용 문제 수를 높이고, 한 문제 사건은 관련 앞 사건을 더해 순차 목표로 만든다.
  for (const m of missions) {
    if (!['event', 'opportunity'].includes(m.kind)) continue;
    const q = m.cond.questions;
    const oldN = q?.n;
    if (q && q.n < q.ids.length) q.n++;
    const extra = (prerequisites[m.id] || []).filter((id) => addReq(m, byId.get(id)));
    if (extra.length) m.cond.missions = uniq([...(m.cond.missions || []), ...extra]);
    if (q?.n !== oldN || extra.length) {
      m.normalized ||= { reason: 'higher_event_goal' };
      changes.push({ id: m.id, reason: 'higher_event_goal', beforeN: oldN, afterN: q?.n, requires: m.cond.missions || [] });
    }
  }

  const nameOf = (id) => byId.get(id)?.name || id;
  for (const m of missions) {
    m.requires = m.cond.missions || [];
    if (!m.normalized) continue;
    if (descOverrides[m.id]) { m.desc = descOverrides[m.id]; continue; }
    const topic = topics[m.id] || m.name;
    const pre = m.requires.map((id) => `「${nameOf(id)}」`).join('·');
    const q = m.cond.questions;
    if (q && pre) m.desc = `먼저 ${pre} 미션을 마치고, ${topic} 문제 ${q.n}개를 처음으로 맞히세요.`;
    else if (q) m.desc = `${topic} 문제 ${q.n === q.ids.length && q.n > 1 ? `${q.n}개를 모두` : `가운데 ${q.n}개를`} 처음으로 맞히세요.`;
    else if (pre) m.desc = `정리 미션: ${pre} 미션을 모두 마쳐 ${topic}을 정리하세요.`;
  }
  for (const m of missions) delete m.index;
  return { missions, changes, owner: new Map([...owner].map(([q, m]) => [q, m.id])) };
}

// 미션이 실제로 끝낼 수 있는지, 같은 정답이 두 미션에 쓰이지 않는지, 선행 관계가 바른지 점검한다.
// 결과 issues 가 비어 있어야 한다(테스트에서 확인).
export function auditMissions(missions, { questionEra, eraOrder, advanceRules = {} }) {
  const issues = [];
  const byId = new Map(missions.map((m) => [m.id, m]));
  const seen = new Map();
  for (const m of missions) {
    const q = m.cond?.questions;
    if (q) {
      if (q.n < 1 || q.n > q.ids.length) issues.push(`${m.id}: 필요 개수 ${q.n} > 문제 ${q.ids.length}`);
      for (const id of q.ids) {
        if (!questionEra.has(id)) issues.push(`${m.id}: 없는 문제 ${id}`);
        else if (eraOrder[questionEra.get(id)] > eraOrder[m.era]) issues.push(`${m.id}: 뒤 시대 문제 ${id}`);
        if (seen.has(id)) issues.push(`${id}: ${seen.get(id)}·${m.id} 두 미션이 같은 정답을 씀`);
        else seen.set(id, m.id);
      }
    }
    if (m.action === 'quiz' && !q && !(m.cond?.missions || []).length && !m.cond?.uniqueCorrect) issues.push(`${m.id}: 풀 문제도 선행 미션도 없음`);
    for (const p of m.cond?.missions || []) {
      const pm = byId.get(p);
      if (!pm) { issues.push(`${m.id}: 없는 선행 미션 ${p}`); continue; }
      if (eraOrder[pm.era] > eraOrder[m.era]) issues.push(`${m.id}: 뒤 시대 선행 ${p}`);
      if (pm.faction && pm.faction !== m.faction) issues.push(`${m.id}: 다른 나라 선택 미션 ${p}을 선행으로 씀`);
    }
  }
  // 순환 검사
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { issues.push(`순환: ${[...path, id].join(' → ')}`); return; }
    state.set(id, 1);
    for (const p of byId.get(id)?.cond?.missions || []) visit(p, [...path, id]);
    state.set(id, 2);
  };
  for (const m of missions) visit(m.id, []);
  // 필수 미션은 나라 선택 없이 끝낼 수 있어야 한다.
  const needsFaction = (id, stack = new Set()) => {
    const m = byId.get(id);
    if (!m || stack.has(id)) return false;
    if (m.faction) return true;
    stack.add(id);
    return (m.cond?.missions || []).some((p) => needsFaction(p, stack));
  };
  for (const [era, rule] of Object.entries(advanceRules)) {
    const m = byId.get(rule.mission);
    if (!m) { issues.push(`${era}: 필수 미션 ${rule.mission} 없음`); continue; }
    if (!m.required) issues.push(`${era}: ${m.id} 가 required 가 아님`);
    if (m.era !== rule.from) issues.push(`${era}: 필수 미션 시대 ${m.era} ≠ ${rule.from}`);
    if (needsFaction(m.id)) issues.push(`${era}: 필수 미션이 나라 선택 미션에 기대고 있음`);
    const pool = [...questionEra.values()].filter((e) => e === rule.uniqueEra).length;
    if (rule.uniqueCorrect > pool) issues.push(`${era}: 서로 다른 정답 ${rule.uniqueCorrect} > 문제 ${pool}`);
  }
  return issues;
}

// 필수 미션(선행 포함)을 마치는 데 필요한 서로 다른 첫 정답 수(최소). 지역 점령 미션은 0으로 센다.
export function missionUniqueDemand(missions, id, seen = new Set()) {
  const byId = new Map(missions.map((m) => [m.id, m]));
  const walk = (mid) => {
    if (seen.has(mid)) return 0;
    seen.add(mid);
    const m = byId.get(mid);
    if (!m) return 0;
    return (m.cond?.questions?.n || 0) + (m.cond?.missions || []).reduce((s, p) => s + walk(p), 0);
  };
  return walk(id);
}
