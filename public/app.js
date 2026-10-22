// 역사 영토 원정대 — 클라이언트. 판정은 하지 않고 서버 응답만 보여 준다.
// 사용자·서버 텍스트는 모두 textContent 로 넣는다(innerHTML 미사용).
'use strict';

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
let META = null;
let STATE = null;
let selectedRegion = null;
let zoom = 1;

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}
function svg(tag, attrs = {}, text) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

async function api(path, { method = 'GET', body } = {}) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (method !== 'GET') {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body || {});
  }
  const res = await fetch(path, opt);
  let data = {};
  try { data = await res.json(); } catch { /* 빈 응답 */ }
  if (!res.ok) {
    const err = new Error(data.message || '요청을 처리하지 못했어요.');
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 3200);
}

const eraName = (id) => META.eras.find((e) => e.id === id)?.name ?? id;
const eraOrder = (id) => META.eras.find((e) => e.id === id)?.order ?? 99;
const cardById = (id) => META.cards.find((c) => c.id === id);
const regionMeta = (id) => META.regions.find((r) => r.id === id);
const regionState = (id) => STATE?.regions.find((r) => r.id === id);

// ── 시작 ──
async function boot() {
  META = await api('/api/meta');
  $('mapNotice').textContent = META.demo.mapNotice;
  const notices = $('startNotices');
  for (const k of ['notice', 'rivalNotice', 'questionReview']) notices.append(el('li', { text: META.demo[k] }));
  notices.append(el('li', { text: META.demo.storageNotice }));
  if (META.demo.judgeNotice) notices.append(el('li', { text: META.demo.judgeNotice }));
  $('demoNotice').textContent = META.demo.badge;
  setupStatic();
  try {
    STATE = await api('/api/state');
    showGame();
  } catch (e) {
    if (e.status !== 401) toast(e.message);
    $('startScreen').hidden = false;
  }
}

function setupStatic() {
  $('startForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('startError').textContent = '';
    try {
      await api('/api/session', { method: 'POST', body: { nickname: $('nickname').value } });
      STATE = await api('/api/state');
      showGame();
    } catch (e) { $('startError').textContent = e.message; }
  });
  $('logoutBtn').addEventListener('click', () => $('logoutDialog').showModal());
  $('logoutConfirmBtn').addEventListener('click', async () => {
    const button = $('logoutConfirmBtn');
    button.disabled = true;
    try {
      await api('/api/logout', { method: 'POST' });
      location.reload();
    } catch (e) {
      toast(e.message);
      button.disabled = false;
    }
  });
  document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDialog(b.dataset.open)));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  $('zoomIn').addEventListener('click', () => setZoom(zoom + 0.25));
  $('zoomOut').addEventListener('click', () => setZoom(zoom - 0.25));
  $('zoomReset').addEventListener('click', () => setZoom(1));
  $('reviewBtn').addEventListener('click', startReview);
  setupCreateForm();
  buildRules();
}

function setZoom(z) {
  zoom = Math.min(2.5, Math.max(1, z));
  // 프레임 높이 기준으로 가로·세로를 함께 키워 스크롤로 이동할 수 있게 한다.
  $('map').style.width = `${zoom * 100}%`;
  $('map').style.height = `${zoom * 100}%`;
}

function showGame() {
  $('startScreen').hidden = true;
  $('gameScreen').hidden = false;
  $('topnav').hidden = false;
  buildMap();
  render();
}

// ── 화면 그리기 ──
function render() {
  const p = STATE.player;
  $('playerName').textContent = `${p.nickname} 원정대`;
  $('eraName').textContent = eraName(p.era);
  $('eraSummary').textContent = META.eras.find((e) => e.id === p.era)?.summary ?? '';
  $('resXp').textContent = p.xp;
  $('resGrain').textContent = p.grain;
  $('resPop').textContent = p.population;
  $('resPower').textContent = p.power;
  $('resLand').textContent = `${STATE.regions.filter((r) => r.owner === 'player').length}곳`;
  renderAdvance();
  renderMissions();
  renderMap();
  renderRegionPanel();
}

function checkRow(c) {
  const pct = Math.min(100, Math.round((c.current / Math.max(1, c.need)) * 100));
  const fill = el('i');
  fill.style.width = `${pct}%`; // CSP: style 속성 대신 CSSOM 사용
  return el('div', {},
    el('div', { class: `check ${c.ok ? 'ok' : 'no'}` }, el('span', { text: c.label }), el('span', { text: `${c.current} / ${c.need}${c.ok ? ' ✓' : ''}` })),
    el('div', { class: 'bar', 'aria-hidden': 'true' }, fill));
}

function renderAdvance() {
  const box = $('advanceBox');
  box.replaceChildren();
  const a = STATE.advance;
  if (!a.target) {
    box.append(el('p', { text: '이번 시연판의 마지막 시대에 도착했어요! 다음 버전에서 여러 나라의 성장으로 이어져요.' }));
    return;
  }
  box.append(el('p', { class: 'small', text: `다음: ${a.targetName}` }));
  a.checks.forEach((c) => box.append(checkRow(c)));
  box.append(el('button', {
    type: 'button', class: 'primary', disabled: !a.ok, text: `${a.targetName}로 발전하기`,
    onclick: doAdvance,
  }));
}

function renderMissions() {
  const list = $('missionList');
  list.replaceChildren();
  for (const m of META.missions) {
    const st = STATE.missions.find((x) => x.id === m.id);
    const li = el('li', { class: st?.done ? 'done' : '' },
      el('div', { class: 'tag', text: `${eraName(m.era)} · ${m.required ? '시대 발전 필수' : '선택'}${st?.done ? ' · 완료' : ''}` }),
      el('strong', { text: m.name }),
      el('div', { class: 'small', text: m.desc }));
    st?.checks.forEach((c) => li.append(el('div', { class: 'small', text: `${c.label}: ${c.current}/${c.need}` })));
    list.append(li);
  }
}

function buildMap() {
  const map = $('map');
  map.replaceChildren();
  // 바다 위 섬 그림자(장식)
  map.append(svg('path', { class: 'land-shadow', d: 'M108,62 L150,30 L230,20 L304,26 L338,56 L304,130 L300,190 L296,282 L304,382 L304,474 L268,510 L120,522 L86,484 L94,382 L96,232 L90,186 L102,136 Z', transform: 'translate(4,5)' }));
  map.append(svg('text', { x: 72, y: 300, class: 'region-mark' }, '서해'));
  map.append(svg('text', { x: 316, y: 230, class: 'region-mark' }, '동해'));
  map.append(svg('text', { x: 230, y: 560, class: 'region-mark' }, '남해'));
  map.append(svg('text', { x: 356, y: 581, 'text-anchor': 'end', class: 'region-mark' }, '※ 시연용 지형 · 실제 국경 아님'));
  for (const r of META.regions) {
    const poly = svg('polygon', { points: r.points, class: 'region', tabindex: '0', role: 'button', 'data-id': r.id });
    poly.addEventListener('click', () => selectRegion(r.id));
    poly.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRegion(r.id); } });
    map.append(poly);
    // 지명은 낱말 단위로 줄을 나눠 지역 폭 안에 둔다(작은 섬은 한 줄, 표식은 섬 오른쪽 바다에).
    const [lx, ly] = r.label;
    const island = r.terrain === '섬';
    const words = island ? [r.name] : r.name.split(' ');
    const label = svg('text', { x: lx, y: ly, 'text-anchor': 'middle', class: 'region-label', 'data-label': r.id });
    const top = ly - ((words.length - 1) * 13) / 2;
    words.forEach((w, i) => label.append(svg('tspan', { x: lx, y: top + i * 13 }, w)));
    map.append(label);
    const mark = island ? { x: lx + 46, y: ly + 4, 'text-anchor': 'start' } : { x: lx, y: top + words.length * 13 + 4, 'text-anchor': 'middle' };
    map.append(svg('text', { ...mark, class: 'owner-mark', 'data-mark': r.id }, ''));
  }
}

function regionClass(r) {
  const st = regionState(r.id);
  if (st?.owner === 'player') return 'own';
  if (eraOrder(r.era) > eraOrder(STATE.player.era)) return 'locked';
  return st?.owner === 'rival' ? 'rival' : 'neutral';
}

function renderMap() {
  for (const r of META.regions) {
    const poly = document.querySelector(`polygon[data-id="${r.id}"]`);
    const cls = regionClass(r);
    poly.setAttribute('class', `region ${cls}${selectedRegion === r.id ? ' selected' : ''}`);
    const ownerText = { own: '우리 영토', locked: `${eraName(r.era)}에 열림`, rival: '시연용 경쟁 부족', neutral: '중립' }[cls];
    poly.setAttribute('aria-label', `${r.name}, ${r.terrain}, ${ownerText}`);
    document.querySelector(`[data-mark="${r.id}"]`).textContent = cls === 'own' ? '★' : cls === 'locked' ? '🔒' : cls === 'rival' ? '⚑' : '';
  }
}

function selectRegion(id) {
  selectedRegion = id;
  renderMap();
  renderRegionPanel();
}

function renderRegionPanel() {
  const panel = $('regionPanel');
  if (!selectedRegion) return;
  const r = regionMeta(selectedRegion);
  const st = regionState(r.id);
  const cls = regionClass(r);
  const ownerText = cls === 'own' ? '우리 영토' : st.owner === 'rival' ? '시연용 경쟁 부족(컴퓨터 설정, 실제 사용자 아님)' : '중립 지역';
  const info = el('dl', { class: 'region-info' },
    el('dt', { text: '지형' }), el('dd', { text: r.terrain }),
    el('dt', { text: '문제 시대' }), el('dd', { text: eraName(r.era) }),
    el('dt', { text: '현재 주인' }), el('dd', { text: ownerText }));
  if (st.owner === 'rival') {
    info.append(el('dt', { text: '도전 진행' }), el('dd', { text: `정답 ${st.rivalWins} / ${META.rules.rivalWinsNeeded}번 (채우면 점령)` }));
  }
  const actions = el('div', { class: 'actions' });
  if (cls === 'locked') {
    actions.append(el('p', { class: 'small', text: `${eraName(r.era)}에 들어서야 이 지역 문제를 풀 수 있어요.` }));
  } else {
    actions.append(el('button', {
      type: 'button', class: 'primary big',
      text: cls === 'own' ? '연습 문제 풀기' : st.owner === 'rival' ? '지역 도전하기' : '문제 풀고 점령하기',
      onclick: () => startRegion(r.id),
    }));
    actions.append(el('p', { class: 'small', text: cls === 'own' ? '이미 우리 땅이에요. 처음 맞히는 문제는 경험치를 줘요.' : '정답을 맞히면 서버가 확인한 뒤 점령해요.' }));
  }
  panel.replaceChildren(el('h2', { text: r.name }), el('p', { class: 'small', text: '시연용 지형 이름이에요. 실제 역사 지명·국경과 다를 수 있어요.' }), info, actions);
}

// ── 문제 풀이 ──
async function startRegion(regionId) {
  try { showQuiz(await api(`/api/regions/${regionId}/challenge`, { method: 'POST' })); } catch (e) { toast(e.message); }
}
async function startReview() {
  try {
    $('historyDialog').close();
    showQuiz(await api('/api/review/challenge', { method: 'POST' }));
  } catch (e) { toast(e.message); }
}

function showQuiz(ch) {
  const q = ch.question;
  const body = $('quizBody');
  const head = el('div', {},
    el('span', { class: 'pill', text: eraName(q.era) }),
    el('span', { class: 'pill', text: q.topic }),
    el('span', { class: 'pill', text: `난이도 ${q.difficulty}` }),
    el('span', { class: 'pill pending', text: '자체 제작 · 검수 대기' }),
    q.myth ? el('span', { class: 'pill myth', text: '신화 해석 문제' }) : null,
    ch.mode === 'review' ? el('span', { class: 'pill', text: '복습' }) : null);
  const choices = el('div', { class: 'quiz-choices' });
  q.choices.forEach((c, i) => {
    choices.append(el('button', {
      type: 'button', onclick: () => submitAnswer(ch, i, choices),
    }, el('span', { class: 'num', text: `${i + 1}.` }), c));
  });
  body.replaceChildren(
    el('div', { class: 'dlg-head' }, el('h2', { text: ch.regionId ? regionMeta(ch.regionId).name : '복습 문제' }),
      el('button', { type: 'button', class: 'close', text: '닫기', onclick: () => $('quizDialog').close() })),
    head,
    el('p', { class: 'small', text: `학습 목표: ${q.objective}` }),
    el('p', { class: 'quiz-q', text: q.text }),
    choices,
    el('p', { class: 'small', text: `검수 때 확인할 자료: ${q.sources.join(', ')}` }));
  $('quizDialog').showModal();
}

async function submitAnswer(ch, idx, choicesBox) {
  choicesBox.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  try {
    const r = await api('/api/answer', { method: 'POST', body: { challengeId: ch.challengeId, choiceIndex: idx } });
    STATE = r.state;
    const box = el('div', { class: `result ${r.correct ? 'ok' : 'bad'}` },
      el('h3', { text: r.correct ? '정답이에요!' : '아쉬워요, 오답이에요.' }),
      el('p', {}, el('strong', { text: '정답: ' }), r.correctChoice),
      el('p', { text: r.explanation }));
    const lines = [];
    if (r.reward.firstCorrect) lines.push(`처음 맞힌 문제 보상: 경험치 +${r.reward.xp}, 식량 +${r.reward.grain}, 인구 +${r.reward.population}`);
    if (r.reward.repeat) lines.push('이미 보상을 받은 문제라 이번엔 기록만 남겨요.');
    if (!r.correct) lines.push('틀린 문제는 "학습 기록·복습"에서 다시 풀 수 있어요.');
    if (r.territory?.captured) lines.push(`🎉 ${regionMeta(r.territory.regionId).name} 점령! 식량 +${r.territory.grain}, 인구 +${r.territory.population}`);
    else if (r.territory?.rivalWins != null) lines.push(`지역 도전 진행: ${r.territory.rivalWins} / ${r.territory.need}`);
    for (const cid of r.newCards) lines.push(`🃏 새 카드: ${cardById(cid).name}`);
    lines.forEach((t) => box.append(el('p', { text: t })));
    box.append(el('div', { class: 'actions' },
      ch.regionId ? el('button', { type: 'button', class: 'primary', text: '다음 문제', onclick: () => startRegion(ch.regionId) })
        : el('button', { type: 'button', class: 'primary', text: '다른 복습 문제', onclick: startReview }),
      el('button', { type: 'button', text: '지도로 돌아가기', onclick: () => $('quizDialog').close() })));
    $('quizBody').append(box);
    box.scrollIntoView({ block: 'nearest' });
    render();
  } catch (e) {
    toast(e.message);
    $('quizDialog').close();
  }
}

async function doAdvance() {
  try {
    const r = await api('/api/advance', { method: 'POST' });
    STATE = r.state;
    render();
    const cards = r.newCards.map((c) => cardById(c).name).join(', ');
    toast(`${eraName(r.era)}에 들어섰어요!${cards ? ` 새 카드: ${cards}` : ''}`);
  } catch (e) { toast(e.message); }
}

// ── 대화상자 ──
async function openDialog(id) {
  try {
    if (id === 'cardsDialog') renderCards();
    if (id === 'historyDialog') await renderHistory();
    if (id === 'createDialog') await renderSubmissions();
    $(id).showModal();
  } catch (e) { toast(e.message); }
}

function renderCards() {
  const owned = new Set(STATE.cards.map((c) => c.id));
  const grid = $('cardGrid');
  grid.replaceChildren();
  for (const c of META.cards) {
    const has = owned.has(c.id);
    grid.append(el('article', { class: `tcard${has ? '' : ' locked'}` },
      el('span', { class: 'pill', text: c.type }),
      el('span', { class: 'pill', text: eraName(c.era) }),
      c.myth ? el('span', { class: 'pill myth', text: '신화·설화' }) : null,
      el('h4', { text: has ? `✓ ${c.name}` : c.name }),
      el('p', { text: c.history }),
      el('p', {}, el('strong', { text: '효과: ' }), c.effectText),
      el('p', { class: 'small', text: `얻는 방법: ${c.howTo}` })));
  }
}

async function renderHistory() {
  const h = await api('/api/history');
  $('reviewInfo').textContent = `복습할 문제 ${STATE.stats.reviewPending}개 · 지금까지 ${STATE.stats.totalAttempts}번 풀고 ${STATE.stats.totalCorrect}번 맞혔어요.`;
  $('reviewBtn').disabled = STATE.stats.reviewPending === 0;
  const notes = $('notesList');
  notes.replaceChildren();
  if (!h.notes.length) notes.append(el('li', { text: '아직 푼 문제가 없어요.' }));
  for (const n of h.notes) {
    const li = el('li', {}, el('span', { class: 'pill', text: eraName(n.era) }), el('strong', { text: n.text }));
    if (n.lastCorrect) li.append(el('div', { class: 'small', text: `정답: ${n.answer} — ${n.explanation}` }));
    else li.append(el('div', { class: 'small', text: '마지막에 틀린 문제예요. 복습으로 다시 도전하면 정답과 해설을 볼 수 있어요.' }));
    notes.append(li);
  }
  const list = $('attemptList');
  list.replaceChildren();
  for (const a of h.attempts.slice(0, 30)) {
    list.append(el('li', { class: a.correct ? 'ok' : 'bad', text: `${a.correct ? '○' : '✕'} [${eraName(a.era)} · ${a.topic}] ${a.text} (${new Date(a.at).toLocaleString('ko-KR')})` }));
  }
}

function setupCreateForm() {
  const eraSel = $('createEra');
  META.eras.forEach((e) => eraSel.append(el('option', { value: e.id, text: e.name })));
  const regSel = $('createRegion');
  META.regions.forEach((r) => regSel.append(el('option', { value: r.id, text: r.name })));
  const ci = $('choiceInputs');
  for (let i = 0; i < 4; i++) {
    ci.append(el('div', { class: 'choice-row' },
      el('input', { type: 'radio', name: 'answer', value: String(i), 'aria-label': `${i + 1}번 보기가 정답`, required: i === 0 }),
      el('input', { type: 'text', name: `choice${i}`, maxlength: '60', placeholder: `${i + 1}번 보기`, required: true })));
  }
  $('createForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const errs = $('createErrors');
    errs.replaceChildren();
    const ans = f.querySelector('input[name=answer]:checked');
    const body = {
      era: f.era.value, regionId: f.regionId.value || null,
      question: f.question.value, explanation: f.explanation.value, source: f.source.value,
      choices: [0, 1, 2, 3].map((i) => f[`choice${i}`].value),
      answerIndex: ans ? Number(ans.value) : -1,
    };
    try {
      await api('/api/submissions', { method: 'POST', body });
      f.reset();
      toast('형식 검사를 통과해 "검토 대기"로 저장했어요. (AI 검토 미연결)');
      await renderSubmissions();
    } catch (e) {
      (e.data?.errors || [e.message]).forEach((m) => errs.append(el('li', { text: m })));
    }
  });
}

async function renderSubmissions() {
  const { submissions } = await api('/api/submissions');
  const list = $('mySubmissions');
  list.replaceChildren();
  if (!submissions.length) list.append(el('li', { text: '아직 낸 문제가 없어요.' }));
  for (const s of submissions) {
    list.append(el('li', {},
      el('span', { class: 'pill pending', text: '검토 대기' }),
      el('span', { class: 'pill', text: 'AI 검토 미연결' }),
      el('strong', { text: s.question }),
      el('div', { class: 'small', text: `보기: ${s.choices.join(' / ')} · 내가 고른 정답: ${s.choices[s.answerIndex]}` }),
      el('div', { class: 'small', text: `참고 자료: ${s.source}` })));
  }
}

function buildRules() {
  const R = META.rules;
  const b = $('rulesBody');
  const ul = (items) => el('ul', {}, items.map((t) => el('li', { text: t })));
  const advance = Object.entries(META.advanceRules).map(([to, r]) =>
    `${eraName(r.from)} → ${eraName(to)}: 경험치 ${r.xp} 이상, ${eraName(r.uniqueEra)} 서로 다른 문제 ${r.uniqueCorrect}개 처음 맞힘, 국력 ${r.power} 이상, 필수 미션 "${META.missions.find((m) => m.id === r.mission).name}" 완료`);
  b.replaceChildren(
    el('h3', { text: '시작 값' }),
    ul([`식량 ${R.start.grain}, 인구 ${R.start.population}, 경험치 ${R.start.xp}, 시대: 구석기`]),
    el('h3', { text: '보상' }),
    ul([
      `처음 맞힌 문제: 경험치 ${R.firstCorrect.xpBase} + ${R.firstCorrect.xpPerDifficulty}×(난이도-1), 식량 +${R.firstCorrect.grain}, 인구 +${R.firstCorrect.population}`,
      '같은 문제를 다시 맞히면 보상 없음(기록만). 틀려도 자원이 줄지 않아요.',
      `중립 지역 점령: 그 지역 문제 정답 1번 → 식량 +${R.capture.grain}, 인구 +${R.capture.population} (지역마다 한 번)`,
      `경쟁 부족 지역: 정답 ${R.rivalWinsNeeded}번이면 점령`,
      '정답 판정, 보상, 점령은 모두 서버에서 확인해요. 문제는 한 번 답하면 다시 제출할 수 없어요.',
    ]),
    el('h3', { text: '국력' }), ul([R.powerFormula]),
    el('h3', { text: '시대 발전 조건' }), ul(advance),
    el('h3', { text: '이 시연판에 대해' }),
    ul([META.demo.notice, META.demo.rivalNotice, META.demo.mapNotice, META.demo.questionReview,
      '오래 접속하지 않아도 자원이나 영토를 잃지 않아요.']));
}

boot().catch((e) => { document.body.prepend(el('p', { class: 'error', text: `시작하지 못했어요: ${e.message}` })); });
