// 이어 하기 보관함. 새로고침·창 닫힘·인터넷 끊김에도 풀던 문제·쓰던 답·보내지 못한 답을 잃지 않게 한다.
// - 탐험대별(player.ref)로 나눠 저장한다. 다른 학생으로 로그인하면 이전 학생의 답 초안은 보이지 않는다.
// - 비밀번호·로그인 토큰은 저장하지 않는다(로그인 유지는 서버의 HttpOnly 쿠키가 맡는다). 아이디만 선택적으로 기억한다.
// - 판정·보상은 하지 않는다. 보관한 답은 서버에 다시 보내고, 서버가 같은 요청 번호면 한 번만 처리한다.
'use strict';
(function (root) {
  const PREFIX = 'hta_resume_v1:';
  const USER_KEY = 'hta_last_user_v1';
  const REF_RE = /^[0-9a-f]{12}$/;
  const USER_RE = /^[A-Za-z0-9_가-힣]{3,16}$/;

  function memoryStorage() {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)); },
      removeItem: (k) => { m.delete(k); },
      key: (i) => [...m.keys()][i] ?? null,
      get length() { return m.size; },
    };
  }

  // 저장소를 못 쓰면(사생활 보호 모드·용량 부족) 이번 탭 메모리에만 기억한다.
  function safeStorage(storage) {
    const mem = memoryStorage();
    const s = storage || mem;
    const tryOr = (fn, fallback) => { try { return fn(); } catch { return fallback(); } };
    return {
      get: (k) => mem.getItem(k) ?? tryOr(() => s.getItem(k), () => null),
      set: (k, v) => tryOr(() => { s.setItem(k, v); mem.removeItem(k); }, () => mem.setItem(k, v)),
      remove: (k) => { tryOr(() => s.removeItem(k), () => null); mem.removeItem(k); },
      keys: () => {
        const out = new Set();
        tryOr(() => { for (let i = 0; i < s.length; i++) out.add(s.key(i)); }, () => null);
        for (let i = 0; i < mem.length; i++) out.add(mem.key(i));
        return [...out].filter(Boolean);
      },
    };
  }

  function randomId() {
    const b = new Uint8Array(16);
    root.crypto.getRandomValues(b);
    let s = '';
    for (const x of b) s += x.toString(16).padStart(2, '0');
    return s;
  }

  // 화면에 다시 그릴 만큼만(서버가 보낸 공개 문제 모양 그대로, 정답 없음)
  function slimChallenge(ch) {
    if (!ch || typeof ch.challengeId !== 'string' || !ch.question) return null;
    const q = ch.question;
    return {
      challengeId: ch.challengeId, mode: ch.mode, regionId: ch.regionId ?? null, missionId: ch.missionId ?? null,
      expiresAt: ch.expiresAt ?? null, repeat: Boolean(ch.repeat), selection: ch.selection ? { message: ch.selection.message } : {},
      question: {
        era: q.era, topic: q.topic, difficulty: q.difficulty, objective: q.objective, id: q.id, version: q.version, type: q.type,
        text: q.text, choices: q.choices, hints: q.hints, answerHint: q.answerHint, answerLength: q.answerLength,
        myth: q.myth, sources: q.sources,
      },
    };
  }

  function createResumeStore({ storage, now = () => Date.now() } = {}) {
    const st = safeStorage(storage);

    function forAccount(ref) {
      // ref 가 없거나 이상하면 저장하지 않는 빈 보관함(다른 학생 기록과 섞이지 않게)
      const key = typeof ref === 'string' && REF_RE.test(ref) ? PREFIX + ref : null;
      let scratch = {};
      const read = () => {
        if (!key) return scratch;
        try { const d = JSON.parse(st.get(key) || '{}'); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
      };
      const write = (d) => {
        d.savedAt = now();
        if (!key) { scratch = d; return; }
        st.set(key, JSON.stringify(d));
      };
      const update = (fn) => { const d = read(); fn(d); write(d); return d; };

      return {
        ref: key ? ref : null,
        snapshot: read,
        saveSubmission(values) { update((d) => { d.submission = values; }); },
        saveUi(patch) {
          update((d) => {
            const ui = { ...(d.ui || {}) };
            if (patch.view === 'game' || patch.view === 'history') ui.view = patch.view;
            if ('regionId' in patch) ui.regionId = typeof patch.regionId === 'string' ? patch.regionId.slice(0, 8) : null;
            d.ui = ui;
          });
        },
        setChallenge(ch) {
          const slim = slimChallenge(ch);
          if (!slim) return;
          update((d) => {
            if (d.draft?.challengeId !== slim.challengeId) d.draft = null;
            d.challenge = slim;
            d.dismissed = null;
          });
        },
        dismissChallenge(challengeId) { update((d) => { if (d.challenge?.challengeId === challengeId) d.dismissed = challengeId; }); },
        saveDraft(challengeId, value) {
          update((d) => { if (d.challenge?.challengeId === challengeId) d.draft = { challengeId, value: String(value).slice(0, 80) }; });
        },
        draftFor(challengeId) { const d = read().draft; return d?.challengeId === challengeId ? d.value : null; },
        // 보내기 전에 먼저 저장한다. 같은 문제의 답이 이미 보관돼 있으면 그대로 쓴다(요청 번호 유지 → 중복 보상 없음).
        // 다른 문제의 답이 아직 남아 있으면 덮어쓰지 않고 null 을 돌려준다(그 답을 먼저 보내야 함).
        queueAnswer(challengeId, answer) {
          let out = null;
          update((d) => {
            if (d.pending?.challengeId === challengeId) { out = d.pending; return; }
            if (d.pending) return;
            const a = typeof answer === 'string' ? { answerText: answer.slice(0, 80) } : { choiceIndex: answer };
            out = d.pending = { requestId: randomId(), challengeId, answer: a, status: 'unsent', createdAt: now(), attempts: 0 };
          });
          return out;
        },
        pending: () => read().pending || null,
        markPending(status, extra = {}) { update((d) => { if (d.pending) Object.assign(d.pending, extra, { status }); }); },
        // 서버가 확정(또는 만료·이미 처리)한 문제: 보관한 답·초안·문제를 지운다.
        finishChallenge(challengeId) {
          update((d) => {
            if (d.pending?.challengeId === challengeId) d.pending = null;
            if (d.challenge?.challengeId === challengeId) { d.challenge = null; d.dismissed = null; }
            if (d.draft?.challengeId === challengeId) d.draft = null;
          });
        },
        clear() { scratch = {}; if (key) st.remove(key); },
      };
    }

    return {
      forAccount,
      // 공용 기기 로그아웃: 이 브라우저의 모든 탐험대 이어 하기 기록과 기억한 아이디를 지운다.
      clearAll() {
        for (const k of st.keys()) if (k.startsWith(PREFIX)) st.remove(k);
        st.remove(USER_KEY);
      },
      rememberUser(name) { if (typeof name === 'string' && USER_RE.test(name)) st.set(USER_KEY, name); },
      lastUser() { const v = st.get(USER_KEY); return typeof v === 'string' && USER_RE.test(v) ? v : null; },
      forgetUser() { st.remove(USER_KEY); },
    };
  }

  // 새로 불러온 서버 상태(activeChallenge)와 브라우저 보관함을 맞춘다. 서버가 기준이다.
  // - 보낼 답이 있으면 먼저 다시 보낸다(open: 그 문제 화면).
  // - 만료된 도전은 되살리지 않는다(notice: 'expired').
  // - 브라우저에만 남은 문제(이미 처리됐거나 다른 기기에서 새 문제를 받음)는 지운다(notice: 'stale').
  function reconcile(snapshot, active) {
    const snap = snapshot || {};
    const out = { open: null, draft: null, pending: snap.pending || null, notice: null, clearChallenge: false };
    if (out.pending) {
      const id = out.pending.challengeId;
      out.open = active && !active.expired && active.challengeId === id ? active : snap.challenge?.challengeId === id ? snap.challenge : null;
      return out;
    }
    if (active?.expired) {
      if (snap.challenge?.challengeId === active.challengeId) { out.notice = 'expired'; out.clearChallenge = true; }
      return out;
    }
    if (active) {
      if (snap.dismissed === active.challengeId) return out;
      out.open = active;
      out.draft = snap.draft?.challengeId === active.challengeId ? snap.draft.value : null;
      return out;
    }
    if (snap.challenge) { out.notice = 'stale'; out.clearChallenge = true; }
    return out;
  }

  // 서버 응답 분류. 로그인 오류는 연결 오류처럼 되풀이하지 않는다.
  function classify(status, data) {
    const code = data?.error;
    if (status >= 200 && status < 300) return 'saved';
    if (status === 401 || code === 'password_change_required') return 'auth';
    if (code === 'challenge_expired') return 'expired';
    if (code === 'challenge_used') return 'gone';
    if (status === 429 || status >= 500 || (status === 409 && !code)) return 'retry';
    return 'rejected';
  }

  // 보관한 답 보내기. 탐험대마다 한 번에 하나만 보낸다(겹쳐 누르거나 online 이벤트가 겹쳐도 한 요청).
  function createSender({ post, isOnline = () => true }) {
    const inflight = new Map();
    async function run(account) {
      const p = account.pending();
      if (!p) return { kind: 'none' };
      if (!isOnline()) return { kind: 'offline', pending: p };
      account.markPending('sending', { attempts: (p.attempts || 0) + 1, lastTriedAt: Date.now() });
      let res;
      try {
        res = await post('/api/answer', { challengeId: p.challengeId, ...p.answer, requestId: p.requestId });
      } catch {
        // 요청이 서버에 닿았는지 알 수 없다 → '확인 대기'. 다시 보내도 서버가 한 번만 처리한다.
        account.markPending('uncertain');
        return { kind: 'offline', uncertain: true, pending: account.pending() };
      }
      const kind = classify(res.status, res.data);
      if (kind === 'saved') { account.finishChallenge(p.challengeId); return { kind, result: res.data, pending: p }; }
      if (kind === 'auth') { account.markPending(p.status === 'unsent' ? 'unsent' : 'uncertain'); return { kind, message: res.data?.message, pending: account.pending() }; }
      if (kind === 'retry') { account.markPending('uncertain'); return { kind, message: res.data?.message, pending: account.pending() }; }
      account.finishChallenge(p.challengeId);
      return { kind, message: res.data?.message, pending: p };
    }
    return {
      send(account) {
        const k = account.ref || '';
        if (inflight.has(k)) return inflight.get(k);
        const pr = run(account).finally(() => inflight.delete(k));
        inflight.set(k, pr);
        return pr;
      },
    };
  }

  root.HistoryResume = { createResumeStore, reconcile, classify, createSender, randomId };
})(globalThis);
