// 역사 탐험 1 — 클라이언트. 판정은 하지 않고 서버 응답만 보여 준다.
// 사용자·서버·자료 텍스트는 모두 textContent 로 넣는다(innerHTML 미사용).
'use strict';

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
let META = null;
let STATE = null;
let CARTO = null;
let selectedRegion = null;
let zoom = 1;
let mapView = 'game';        // 'game' | 'history'
let previewEra = 'paleolithic'; // 역사 지도 미리보기(플레이어 진행과 무관)
let siteFocus = null;          // 역사 지도에서 고른 유적/섬
let STORY = null;              // assets/story.json (배경 이야기·게임 안내)
let freshSession = false;      // 이번에 새로 시작한 원정대인지(배경 이야기 자동 표시)
const popupQueue = [];         // 미션 알림 대기열(다른 대화상자가 닫힌 뒤에만 띄움)
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// 저장소 하위 경로(GitHub Pages)에서도 맞는 주소가 되도록 문서 기준 상대 경로로 만든다.
const assetUrl = (p) => new URL(p, document.baseURI).href;

// 카드 그림: 3×3 아틀라스(행 우선). 비파형 동검은 아틀라스 6번을 쓰지 않고 코드로 그린 도식 사용.
// 삼국 이후 카드는 아직 삽화가 없어 코드로 그린 상징 도형(icon)을 쓴다.
const CARD_ART = {
  c_handaxe: 0, c_fire: 1, c_jeongok: 2, c_comb: 3, c_spindle: 4, c_amsa: 5, c_bipa: 'svg-bipa', c_dolmen: 7, c_dangun: 8,
};
const KIND_LABEL = { core: '핵심', event: '사건', opportunity: '기회' };
const STATUS_LABEL = { locked: '잠김', active: '진행 중', completed: '완료', rewarded: '보상 받음' };

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
// replaceChildren 은 null 을 "null" 글자로 넣으므로, 빈 자리를 걸러서 넣는다.
function setKids(node, ...kids) {
  replaceContent(node,...kids.flat().filter((k) => k != null && k !== false));
}
function replaceContent(target, ...children) {
  target.replaceChildren(...children.flat().filter((c) => c != null && c !== false));
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

function toast(msg, kind = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, 3400);
}
const sfx = (name) => { try { window.GameAudio?.play(name); } catch { /* 소리 실패는 무시 */ } };

const eraName = (id) => META.eras.find((e) => e.id === id)?.name ?? id;
const eraShort = (id) => META.eras.find((e) => e.id === id)?.short ?? eraName(id);
const eraMeta = (id) => META.eras.find((e) => e.id === id);
const missionMeta = (id) => META.missions.find((m) => m.id === id);
const missionState = (id) => STATE?.missions.find((m) => m.id === id);
// 역사 지도 미리보기는 지도 자료가 있는 시대(구석기·신석기·고조선)만 지원한다.
const historyEras = () => META.eras.filter((e) => (CARTO?.eraNotes ? Boolean(CARTO.eraNotes[e.id]) : e.order <= 2));
const judgeShort = () => META.demo.judgeShort || '서버가 확인';
const eraOrder = (id) => META.eras.find((e) => e.id === id)?.order ?? 99;
const cardById = (id) => META.cards.find((c) => c.id === id);
const regionMeta = (id) => META.regions.find((r) => r.id === id);
const regionState = (id) => STATE?.regions.find((r) => r.id === id);

// ── 시작 ──
const fetchJson = (p) => fetch(assetUrl(p)).then((r) => (r.ok ? r.json() : null)).catch(() => null);

// 웹 체험판: 브라우저 안 /api 가 준비될 때까지 기다린다(스크립트 실행 순서에 기대지 않음).
async function waitForWebApi() {
  if (document.documentElement.dataset.web !== 'pages') return;
  for (let i = 0; i < 600 && !window.__htaApiReady; i++) await new Promise((r) => setTimeout(r, 50));
  if (!window.__htaApiReady || !(await window.__htaApiReady)) throw new Error('게임 자료를 준비하지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.');
}

async function boot() {
  await waitForWebApi();
  const [meta, carto, story] = await Promise.all([api('/api/meta'), fetchJson('assets/cartography.json'), fetchJson('assets/story.json')]);
  META = meta;
  CARTO = carto;
  STORY = story;
  fillNotices();
  setupStatic();
  setupAudioToggles();
  setupStory();
  buildSources();
  try {
    STATE = await api('/api/state');
    showGame();
  } catch (e) {
    if (e.status !== 401) toast(e.message);
    $('startScreen').hidden = false;
  }
}

function noticeItems() {
  const items = [META.demo.notice, META.demo.judgeNotice, META.demo.rivalNotice, META.demo.questionReview,
    META.demo.storageNotice,
    META.laterEraMapNotice,
    META.missionWeighting?.note,
    '배경·안내인·카드 그림은 이 게임을 위해 만든 삽화예요. 실제 유물 사진이 아니며, 안내인 하람은 가상 인물이에요.'].filter(Boolean);
  items.splice(2, 0, CARTO?.notice || META.demo.mapNotice);
  return items;
}
function fillNotices() {
  $('demoNotice').textContent = META.demo.badge || META.demo.notice;
  for (const id of ['startNotices', 'gameNotices']) {
    const ul = $(id);
    replaceContent(ul,...noticeItems().map((t) => el('li', { text: t })));
  }
  $('mapNotice').textContent = CARTO
    ? '바탕은 현재 해안선 · 색칠한 구역은 게임 규칙이며 실제 국경이 아니에요.'
    : `${META.demo.mapNotice} (지도 자료를 불러오지 못해 구역만 표시해요.)`;
}

function setupStatic() {
  $('startForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    $('startError').textContent = '';
    try {
      await api('/api/session', { method: 'POST', body: { nickname: $('nickname').value } });
      STATE = await api('/api/state');
      freshSession = true; // 새 원정대: 배경 이야기 → 게임 안내 → 첫 미션 알림
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
  // 어떤 대화상자든 닫히면 기다리던 미션 알림을 띄운다(문제 풀이·이야기 도중에는 띄우지 않음).
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('close', () => setTimeout(flushPopups, 120)));
  $('missionBell').addEventListener('click', openMissionReplay);
  $('storyBtn').addEventListener('click', () => openStory('story'));
  $('openStory').addEventListener('click', () => openStory('story'));
  $('openTutorial').addEventListener('click', () => openStory('tutorial'));
  $('zoomIn').addEventListener('click', () => setZoom(zoom + 0.25));
  $('zoomOut').addEventListener('click', () => setZoom(zoom - 0.25));
  $('zoomReset').addEventListener('click', () => setZoom(1));
  $('mapExpand').addEventListener('click', () => setExpanded(!$('mapWrap').classList.contains('expanded')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('mapWrap').classList.contains('expanded') && !document.querySelector('dialog[open]')) setExpanded(false);
  });
  $('viewGame').addEventListener('click', () => setView('game'));
  $('viewHistory').addEventListener('click', () => setView('history'));
  $('regionSelect').addEventListener('change', (e) => {
    if (!e.target.value) return;
    if (mapView !== 'game') setView('game');
    selectRegion(e.target.value);
  });
  const tabs = $('eraTabs');
  for (const e of historyEras()) {
    const b = el('button', { type: 'button', role: 'tab', 'data-era': e.id, 'aria-selected': 'false', text: eraShort(e.id) });
    b.addEventListener('click', () => { previewEra = e.id; siteFocus = null; renderHistoryLayer(); });
    b.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      const btns = [...tabs.querySelectorAll('button')];
      const i = btns.indexOf(b) + (ev.key === 'ArrowRight' ? 1 : -1);
      const next = btns[(i + btns.length) % btns.length];
      next.focus(); next.click();
    });
    tabs.append(b);
  }
  $('reviewBtn').addEventListener('click', startReview);
  setupCreateForm();
  buildRules();
  if ('ResizeObserver' in window) new ResizeObserver(() => layoutLabels()).observe($('mapFrame'));
}

function setupAudioToggles() {
  const A = window.GameAudio;
  const music = $('musicToggle');
  const fx = $('sfxToggle');
  if (!A || !A.supported) {
    for (const b of [music, fx]) { b.disabled = true; b.title = '이 브라우저에서는 소리를 낼 수 없어요.'; }
    music.textContent = '배경음 미지원';
    fx.textContent = '효과음 미지원';
    return;
  }
  A.onChange((p) => {
    music.setAttribute('aria-pressed', String(p.music));
    music.textContent = p.music ? '배경음 켜짐' : '배경음 꺼짐';
    fx.setAttribute('aria-pressed', String(p.sfx));
    fx.textContent = p.sfx ? '효과음 켜짐' : '효과음 꺼짐';
  });
  music.addEventListener('click', () => A.setMusic(!A.music));
  fx.addEventListener('click', () => { A.setSfx(!A.sfx); if (A.sfx) A.play('select'); });
}

function setZoom(z) {
  zoom = Math.min(3, Math.max(1, z));
  // 프레임 기준으로 가로·세로를 함께 키워 스크롤로 이동할 수 있게 한다.
  $('map').style.width = `${zoom * 100}%`;
  $('map').style.height = `${zoom * 100}%`;
  layoutLabels();
}
function setExpanded(on) {
  $('mapWrap').classList.toggle('expanded', on);
  document.body.classList.toggle('map-open', on);
  $('mapExpand').setAttribute('aria-pressed', String(on));
  $('mapExpand').textContent = on ? '작게 보기' : '크게 보기';
  requestAnimationFrame(layoutLabels);
}

function showGame() {
  $('startScreen').hidden = true;
  $('gameScreen').hidden = false;
  $('topnav').hidden = false;
  window.scrollTo({top:0,behavior:'instant'});
  previewEra = historyEras().some((e) => e.id === STATE.player.era) ? STATE.player.era : (historyEras().at(-1)?.id ?? 'paleolithic');
  buildMap();
  buildRegionSelect();
  render();
  setGuide(`${STATE.player.nickname} 원정대, 반가워요! 지도에서 구역을 골라 문제를 풀거나, 아래 사건판의 미션에 도전해 보세요.`);
  requestAnimationFrame(layoutLabels);
  if (freshSession && STORY) {
    // 새 원정대: 배경 이야기 → 게임 안내 → (닫히면) 첫 미션 알림. 게임 화면은 이미 뒤에 준비되어 있다.
    freshSession = false;
    queueNewMissions('원정을 시작했어요. 첫 미션이 열렸어요!');
    openStory('story');
  } else {
    queueNewMissions('지난번 이후 새로 열린 미션이에요.');
    flushPopups();
  }
}

function setGuide(text) { $('guideLine').textContent = text; }

// ── 화면 그리기 ──
function render() {
  const p = STATE.player;
  $('playerName').textContent = `${p.nickname} 원정대`;
  $('eraName').textContent = eraName(p.era);
  $('eraSummary').textContent = META.eras.find((e) => e.id === p.era)?.summary ?? '';
  const land = STATE.regions.filter((r) => r.owner === 'player').length;
  for (const [a, b, v] of [['resXp', 'hudXp', p.xp], ['resGrain', 'hudGrain', p.grain], ['resPop', 'hudPop', p.population], ['resPower', 'hudPower', p.power]]) {
    $(a).textContent = v; $(b).textContent = v;
  }
  $('resLand').textContent = `${land}곳`;
  const era = eraMeta(p.era);
  $('chapterEra').textContent = `${eraName(p.era)} · ${era?.period ?? ''}`;
  // 역사 지도 자료(eraNotes)가 없는 뒤 시대는 시대 요약을 제목으로 쓴다.
  $('chapterTitle').textContent = CARTO?.eraNotes?.[p.era]?.title ?? era?.summary ?? '';
  $('gameScreen').dataset.era = p.era;
  window.HistoryJourney?.update(p.era);
  renderAdvance();
  renderMissions();
  renderBoard();
  updateBell();
  renderMap();
  renderRegionSelect();
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
  replaceContent(box,);
  const a = STATE.advance;
  if (!a.target) {
    box.append(el('p', { text: '마지막 시대인 대한민국에 도착했어요! 남은 미션과 복습으로 배움을 이어 가 보세요.' }));
    return;
  }
  box.append(el('p', { class: 'small', text: `다음: ${a.targetName}` }));
  a.checks.forEach((c) => box.append(checkRow(c)));
  box.append(el('button', {
    type: 'button', class: 'primary', disabled: !a.ok, text: `${a.targetName}로 발전하기`,
    onclick: doAdvance,
  }));
}

// ── 미션 ──
// 미션 상태·보상은 서버(웹 체험판은 브라우저 안 같은 규칙)가 정한다. 화면은 받은 상태만 보여 준다.
const openMissions = () => STATE.missions.filter((s) => s.status === 'active' || s.status === 'completed');
const progressText = (s) => (s?.progress ? `${s.progress.current}/${s.progress.need}` : '');

function missionsForEra(eraId) {
  // 같은 시대 안에서는 핵심 → 추천 가중치가 큰 사건·기회 순서로 보여 준다.
  return META.missions.filter((m) => m.era === eraId)
    .sort((a, b) => (b.kind === 'core') - (a.kind === 'core') || (b.recommendWeight || 0) - (a.recommendWeight || 0));
}

// 왼쪽 칸: 지금 시대 미션과 지난 시대에 남은 미션만 짧게
function renderMissions() {
  const list = $('missionList');
  replaceContent(list,);
  const cur = eraOrder(STATE.player.era);
  const shown = META.missions.filter((m) => {
    const s = missionState(m.id);
    return m.era === STATE.player.era || (eraOrder(m.era) < cur && s && s.status !== 'rewarded');
  });
  for (const m of shown) {
    const s = missionState(m.id);
    list.append(el('li', { class: `ms-${s.status}` },
      el('button', { type: 'button', class: 'mission-row', onclick: () => openMission(m.id) },
        el('span', { class: `kind k-${m.kind}`, text: KIND_LABEL[m.kind] }),
        el('span', { class: 'mname', text: m.name }),
        el('span', { class: 'mstat', text: s.status === 'rewarded' ? '✓ 보상' : progressText(s) }))));
  }
  if (!shown.length) list.append(el('li', { class: 'small', text: '이번 시대 미션을 모두 마쳤어요.' }));
}

function missionCard(m, compact = false) {
  const s = missionState(m.id);
  const pct = s?.progress ? Math.min(100, Math.round((s.progress.current / Math.max(1, s.progress.need)) * 100)) : 0;
  const fill = el('i');
  fill.style.width = `${pct}%`;
  const actions = el('div', { class: 'mc-actions' },
    el('button', { type: 'button', text: '목표 보기', onclick: () => openMission(m.id) }),
    s.status === 'locked' || s.status === 'rewarded' ? null : missionActionButton(m));
  return el('article', { class: `mission-card ms-${s.status} k-${m.kind}${compact ? ' compact' : ''}` },
    el('div', { class: 'mc-top' },
      el('span', { class: `kind k-${m.kind}`, text: KIND_LABEL[m.kind] }),
      m.required ? el('span', { class: 'pill', text: '시대 발전 필수' }) : null,
      el('span', { class: `pill st-${s.status}`, text: STATUS_LABEL[s.status] })),
    el('h4', { text: m.name }),
    el('p', { class: 'mc-trigger', text: m.trigger }),
    compact ? null : el('p', { class: 'small', text: m.desc }),
    s.progress ? el('div', { class: 'bar', 'aria-hidden': 'true' }, fill) : null,
    el('p', { class: 'mc-reward' }, el('strong', { text: s.status === 'rewarded' ? '받은 보상 ' : '보상 ' }), m.rewardText),
    actions);
}

function missionActionButton(m, { onBefore } = {}) {
  const go = (fn) => () => { onBefore?.(); fn(); };
  if (m.action === 'quiz') return el('button', { type: 'button', class: 'primary', text: '도전하기', onclick: go(() => startMission(m.id)) });
  if (m.action === 'review') {
    return el('button', { type: 'button', class: 'primary', text: '복습하기', disabled: !STATE.stats.reviewPending, onclick: go(startReview) });
  }
  return el('button', { type: 'button', class: 'primary', text: '지도에서 고르기', onclick: go(focusMap) });
}

function focusMap() {
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  if (mapView !== 'game') setView('game');
  $('mapWrap').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  setGuide('색이 밝은 중립 구역이나 ⚑ 경쟁 구역을 골라 문제를 풀어 점령해 보세요. 작은 구역은 “지역 고르기” 목록이 편해요.');
}

// 사건판: 이번 시대 요약·미션 카드·다음 시대 미리보기(길잡이)
function renderBoard() {
  const p = STATE.player;
  const era = eraMeta(p.era);
  $('boardPeriod').textContent = `${era.name} · ${era.period}`;
  $('boardChapter').textContent = era.chapter;
  $('boardNote').textContent = era.order > 2 ? META.laterEraMapNotice : '';
  const cards = $('missionCards');
  replaceContent(cards,...missionsForEra(p.era).map((m) => missionCard(m)));
  const road = $('roadmap');
  replaceContent(road,);
  const cur = era.order;
  for (const e of META.eras) {
    const state = e.order < cur ? 'past' : e.order === cur ? 'current' : e.order === cur + 1 ? 'next' : 'future';
    const li = el('li', { class: `rm-${state}`, 'aria-current': state === 'current' ? 'step' : null },
      el('span', { class: 'rm-dot', 'aria-hidden': 'true' }),
      el('span', { class: 'rm-name', text: e.short }),
      el('span', { class: 'rm-period', text: e.period }));
    if (state === 'next') {
      const n = META.missions.filter((m) => m.era === e.id).length;
      li.append(el('span', { class: 'rm-preview', text: `다음 시대 · 미션 ${n}개가 기다려요(잠김)` }));
    }
    road.append(li);
  }
}

function updateBell() {
  const bell = $('missionBell');
  const unseen = popupQueue.filter((p) => p.type === 'new').reduce((n, p) => n + p.missions.length, 0);
  const open = openMissions().length;
  bell.hidden = !STATE || (!unseen && !open);
  bell.classList.toggle('has-new', unseen > 0);
  bell.firstChild.textContent = unseen ? '새 미션 ' : '진행 중 미션 ';
  $('missionBellCount').textContent = String(unseen || open);
}

// 미션 자세히 보기(조건·진행·정확한 보상·받은 기록)
function openMission(id) {
  const m = missionMeta(id);
  const s = missionState(id);
  if (!m || !s) return;
  const body = $('missionDlgBody');
  $('missionDlgTitle').textContent = m.name;
  const rows = el('dl', { class: 'mission-facts' },
    el('dt', { text: '시대' }), el('dd', { text: `${eraName(m.era)} (${eraMeta(m.era).period})` }),
    el('dt', { text: '종류' }), el('dd', { text: `${KIND_LABEL[m.kind]} 미션${m.required ? ' · 시대 발전 필수' : ''}` }),
    el('dt', { text: '열린 까닭' }), el('dd', { text: m.trigger }),
    el('dt', { text: '목표' }), el('dd', { text: m.desc }),
    el('dt', { text: '상태' }), el('dd', { text: s.status === 'locked' ? `잠김 · ${eraName(m.era)}에 들어서면 열려요` : STATUS_LABEL[s.status] }),
    el('dt', { text: '보상' }), el('dd', { text: `${m.rewardText} (한 번만)` }));
  const prog = el('div', { class: 'mission-progress' });
  (s.checks || []).forEach((c) => prog.append(checkRow(c)));
  const receipt = s.receipt
    ? el('div', { class: 'receipt' },
      el('h3', { text: '보상 받은 기록' }),
      el('p', { text: `경험치 +${s.receipt.xp} · 식량 +${s.receipt.grain} · 인구 +${s.receipt.population}${s.receipt.card ? ` · 카드 「${cardById(s.receipt.card)?.name}」` : ''}` }),
      el('p', { class: 'small', text: new Date(s.receipt.at).toLocaleString('ko-KR') }))
    : null;
  const actions = el('div', { class: 'actions-row' },
    s.status === 'active' || s.status === 'completed' ? missionActionButton(m, { onBefore: () => $('missionDialog').close() }) : null,
    el('button', { type: 'button', text: '닫기', onclick: () => $('missionDialog').close() }));
  setKids(body, rows, prog, receipt, actions);
  if (!$('missionDialog').open) $('missionDialog').showModal();
}

async function startMission(id) {
  try { showQuiz(await api(`/api/missions/${id}/challenge`, { method: 'POST' })); } catch (e) { toast(e.message); }
}

// ── 미션 알림(대기열) ──
// 알린 미션은 플레이어별로 이 브라우저에 기억해 새로고침해도 다시 쏟아지지 않게 한다.
const memSeen = new Map();
function seenKey() { return `hta_seen_missions_v1:${STATE.player.ref}`; }
function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey()) || '[]')); } catch { return new Set(memSeen.get(seenKey()) || []); }
}
function saveSeen(set) {
  memSeen.set(seenKey(), [...set]);
  try { localStorage.setItem(seenKey(), JSON.stringify([...set])); } catch { /* 저장 못 하면 이번 탭에서만 기억 */ }
}

function queueNewMissions(reason) {
  const seen = loadSeen();
  const queued = new Set(popupQueue.filter((p) => p.type === 'new').flatMap((p) => p.missions));
  const fresh = window.MissionRecommendations
    ? window.MissionRecommendations.select(META.missions, STATE, seen, queued)
    : openMissions().map((s) => s.id).filter((id) => !seen.has(id) && !queued.has(id));
  if (fresh.length) popupQueue.push({ type: 'new', missions: fresh, reason });
  updateBell();
}

function queueDone(receipts) {
  if (!receipts?.length) return;
  const last = popupQueue.at(-1);
  if (last?.type === 'done') last.receipts.push(...receipts); // 연달아 끝난 미션은 한 번에
  else popupQueue.push({ type: 'done', receipts: [...receipts] });
}

function flushPopups() {
  if (!STATE || $('gameScreen').hidden) return;
  if (document.querySelector('dialog[open]') || $('flourish').classList.contains('show')) return; // 다른 창을 덮지 않음
  const next = popupQueue.shift();
  if (!next) { updateBell(); return; }
  if (next.type === 'new') showNewMissions(next.missions, next.reason);
  else showDone(next.receipts);
  updateBell();
}

function showNewMissions(ids, reason) {
  const seen = loadSeen();
  ids.forEach((id) => seen.add(id));
  saveSeen(seen);
  const ms = ids.map(missionMeta).filter(Boolean);
  const MAX = 4;
  const body = $('missionPopBody');
  $('missionPopTitle').textContent = ms.length > 1 ? `새 미션 ${ms.length}개` : '새 미션';
  const closeThen = () => $('missionPopup').close();
  replaceContent(body,
    el('p', { class: 'pop-reason', text: reason }),
    META.missionWeighting?.note ? el('p', {class:'small',text:META.missionWeighting.note}) : null,
    el('div', { class: 'pop-list' }, ms.slice(0, MAX).map((m) => el('article', { class: `pop-mission k-${m.kind}` },
      el('div', { class: 'mc-top' }, el('span', { class: `kind k-${m.kind}`, text: KIND_LABEL[m.kind] }), el('strong', { text: m.name })),
      el('p', { class: 'mc-trigger', text: m.trigger }),
      el('p', { class: 'small', text: m.desc }),
      el('p', { class: 'mc-reward' }, el('strong', { text: '보상 ' }), m.rewardText),
      el('div', { class: 'mc-actions' },
        el('button', { type: 'button', text: '목표 보기', onclick: () => { closeThen(); openMission(m.id); } }),
        missionActionButton(m, { onBefore: closeThen }))))),
    ms.length > MAX ? el('p', { class: 'small', text: `나머지 ${ms.length - MAX}개는 지도 아래 사건판에서 볼 수 있어요.` }) : null,
    el('p', { class: 'small', text: '“나중에”를 눌러도 사건판과 위쪽 미션 단추에서 언제든 다시 볼 수 있어요.' }));
  $('missionPopup').showModal();
}

function showDone(receipts) {
  const body = $('missionPopBody');
  $('missionPopTitle').textContent = receipts.length > 1 ? `미션 ${receipts.length}개 완료!` : '미션 완료!';
  replaceContent(body,
    el('p', { class: 'pop-reason', text: `조건을 채워 보상을 받았어요(${judgeShort()}). 같은 미션 보상은 다시 받지 않아요.` }),
    el('ul', { class: 'receipts' }, receipts.map((r) => el('li', {},
      el('strong', { text: r.name }),
      el('span', { text: ` 경험치 +${r.xp} · 식량 +${r.grain} · 인구 +${r.population}` }),
      r.card ? el('figure', { class: 'reveal-card mini' }, cardArt(cardById(r.card), false), el('figcaption', { text: `카드 · ${cardById(r.card).name}` })) : null))));
  sfx('capture');
  $('missionPopup').showModal();
}

// 위쪽 미션 단추: 기다리는 알림이 있으면 보여 주고, 없으면 진행 중 미션을 다시 보여 준다.
function openMissionReplay() {
  if (popupQueue.length) { flushPopups(); return; }
  const ids = openMissions().map((s) => s.id);
  if (!ids.length) { toast('지금 진행 중인 미션이 없어요.'); return; }
  showNewMissions(ids, '지금 진행 중인 미션이에요.');
}

// ── 지도 ──
function buildMap() {
  const map = $('map');
  replaceContent(map,);
  const vb = CARTO?.viewBox ?? [0, 0, 1000, 1040];
  map.setAttribute('viewBox', vb.join(' '));
  const [vx, vy, vw, vh] = vb;

  const defs = svg('defs');
  defs.append(
    grad('seaGrad', [['0%', '#f3ecda'], ['100%', '#e2e3d2']]),
    grad('landGrad', [['0%', '#f6edd3'], ['100%', '#eadbb4']]),
  );
  const engr = svg('pattern', { id: 'engrave', width: 8, height: 8, patternUnits: 'userSpaceOnUse' });
  engr.append(svg('path', { d: 'M0,7.5 H8', stroke: '#9fb3ad', 'stroke-width': 0.6, opacity: 0.35 }));
  const hatch = svg('pattern', { id: 'hatch', width: 10, height: 10, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  hatch.append(svg('rect', { width: 10, height: 10, fill: 'rgba(120,112,98,0.28)' }), svg('path', { d: 'M0,0 V10', stroke: 'rgba(70,60,48,0.35)', 'stroke-width': 2 }));
  defs.append(engr, hatch);
  if (CARTO) {
    const cl = svg('clipPath', { id: 'clipLand' });
    cl.append(svg('path', { d: CARTO.landPath, 'clip-rule': 'evenodd' }));
    const cg = svg('clipPath', { id: 'clipGame' });
    cg.append(svg('path', { d: CARTO.gameAreaPath }));
    defs.append(cl, cg);
  }
  map.append(defs);

  // 바다(상아색 동판 느낌)
  map.append(svg('rect', { x: vx, y: vy, width: vw, height: vh, fill: 'url(#seaGrad)' }));
  map.append(svg('rect', { x: vx, y: vy, width: vw, height: vh, fill: 'url(#engrave)' }));

  const base = svg('g', { id: 'layerBase' });
  if (CARTO) {
    base.append(svg('path', { d: CARTO.landPath, class: 'land-shadow', transform: 'translate(3,5)' }));
    base.append(svg('path', { d: CARTO.landPath, class: 'land' }));
  }
  map.append(base);

  // 게임 구역: 육지 ∩ 게임 영역으로 이중 클리핑
  const outer = svg('g', CARTO ? { 'clip-path': 'url(#clipLand)' } : {});
  const inner = svg('g', CARTO ? { 'clip-path': 'url(#clipGame)', id: 'layerGame' } : { id: 'layerGame' });
  for (const r of META.regions) {
    const poly = svg('polygon', { points: r.points, class: 'region', tabindex: '0', role: 'button', 'data-id': r.id });
    poly.addEventListener('click', () => selectRegion(r.id));
    poly.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRegion(r.id); } });
    inner.append(poly);
  }
  outer.append(inner);
  map.append(outer);

  // 강과 산(두 보기 공통, 구역 위에 얇게)
  if (CARTO) {
    const phys = svg('g', { id: 'layerPhys', 'pointer-events': 'none' });
    phys.append(svg('path', { d: CARTO.landPath, class: 'coast' }));
    for (const rv of CARTO.rivers) phys.append(svg('path', { d: rv.d, class: rv.name ? 'river major' : 'river' }));
    for (const [x, y] of CARTO.mountains) {
      phys.append(svg('path', { d: `M${x - 9},${y + 5} L${x - 2},${y - 6} L${x + 2},${y - 1} L${x + 5},${y - 4} L${x + 11},${y + 5}`, class: 'mtn' }));
    }
    map.append(phys);
  }

  // 역사 지도 층
  map.append(svg('g', { id: 'layerHistory' }));

  // 게임 지명 층
  const gl = svg('g', { id: 'layerGameLabels', 'pointer-events': 'none' });
  for (const r of META.regions) {
    const t = svg('text', { class: 'game-label', 'data-label': r.id, 'text-anchor': 'middle' });
    t.append(svg('tspan', { class: 'mk', 'data-mark': r.id }, ''), svg('tspan', {}, r.name));
    gl.append(t);
  }
  map.append(gl);

  // 울릉도·독도: 실제 크기보다 키우지 않고 점 표식으로 선택 가능하게
  if (CARTO?.islands) {
    const isl = svg('g', { id: 'layerIslands' });
    for (const i of CARTO.islands) {
      const [x, y] = i.point;
      const g = svg('g', { class: 'island-mark', tabindex: '0', role: 'button', 'aria-label': `${i.name} 정보` });
      g.append(svg('circle', { cx: x, cy: y, r: 16, class: 'hit' }), svg('circle', { cx: x, cy: y, r: 4.5, class: 'dot' }),
        svg('text', { x: x + 9, y: y - 8, class: 'island-label' }, i.name));
      const open = () => showSite({ name: i.name, kind: 'island' });
      g.addEventListener('click', open);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      isl.append(g);
    }
    map.append(isl);
  }

  // 나침반·축척(근사)
  if (CARTO) {
    const cx = vx + vw - 70; const cy = vy + vh - 80;
    const comp = svg('g', { class: 'compass', 'pointer-events': 'none', 'aria-hidden': 'true' });
    comp.append(svg('circle', { cx, cy, r: 34, class: 'ring' }),
      svg('path', { d: `M${cx},${cy - 30} L${cx + 7},${cy} L${cx},${cy + 30} L${cx - 7},${cy} Z`, class: 'needle' }),
      svg('path', { d: `M${cx},${cy - 30} L${cx + 7},${cy} L${cx - 7},${cy} Z`, class: 'needle-n' }),
      svg('text', { x: cx, y: cy - 40, 'text-anchor': 'middle', class: 'compass-n' }, '북'));
    map.append(comp);
    const len = CARTO.scale200km || 126;
    const sx = vx + 30; const sy = vy + vh - 30;
    const sc = svg('g', { class: 'scalebar', 'pointer-events': 'none', 'aria-hidden': 'true' });
    sc.append(svg('rect', { x: sx, y: sy - 6, width: len / 2, height: 6, class: 'sb-a' }),
      svg('rect', { x: sx + len / 2, y: sy - 6, width: len / 2, height: 6, class: 'sb-b' }),
      svg('text', { x: sx, y: sy - 12, class: 'scale-text' }, '약 200km (근사)'));
    map.append(sc);
    // 지도첩 판의 이중 테두리(장식)
    map.append(svg('rect', { x: vx + 2, y: vy + 2, width: vw - 4, height: vh - 4, class: 'neat-outer', 'pointer-events': 'none' }),
      svg('rect', { x: vx + 9, y: vy + 9, width: vw - 18, height: vh - 18, class: 'neat-inner', 'pointer-events': 'none' }));
  }
  applyView();
}

function grad(id, stops) {
  const g = svg('linearGradient', { id, x1: 0, y1: 0, x2: 0.4, y2: 1 });
  for (const [o, c] of stops) g.append(svg('stop', { offset: o, 'stop-color': c }));
  return g;
}

function regionClass(r) {
  const st = regionState(r.id);
  if (st?.owner === 'player') return 'own';
  if (eraOrder(r.era) > eraOrder(STATE.player.era)) return 'locked';
  return st?.owner === 'rival' ? 'rival' : 'neutral';
}
const OWNER_TEXT = { own: '우리 영토', neutral: '중립', rival: '시연용 경쟁 부족' };

function renderMap() {
  for (const r of META.regions) {
    const poly = document.querySelector(`polygon[data-id="${r.id}"]`);
    if (!poly) continue;
    const cls = regionClass(r);
    const pulse = poly.classList.contains('pulse') ? ' pulse' : '';
    poly.setAttribute('class', `region ${cls}${selectedRegion === r.id ? ' selected' : ''}${pulse}`);
    const ownerText = cls === 'locked' ? `${eraName(r.era)}에 열림` : OWNER_TEXT[cls];
    poly.setAttribute('aria-label', `${r.name}, ${r.terrain}, ${ownerText}`);
    const mk = document.querySelector(`[data-mark="${r.id}"]`);
    mk.textContent = cls === 'own' ? '★ ' : cls === 'rival' ? '⚑ ' : '';
    mk.closest('text').setAttribute('class', `game-label ${cls}${selectedRegion === r.id ? ' selected' : ''}`);
  }
  layoutLabels();
}

// 라벨 크기를 화면 배율에 맞추고(최소 글자 크기 유지), 우선순위대로 겹치지 않는 자리에만 놓는다.
// 자리가 없는 지명은 숨기되(★·⚑ 표식은 가능하면 유지) 구역 색, 지역 목록, 접근성 이름으로 계속 확인할 수 있다.
// 확대하면 글자가 상대적으로 작아져 더 많은 지명이 나타난다.
const boxHit = (a, b, pad) => Math.abs(a.x - b.x) * 2 < a.w + b.w + pad && Math.abs(a.y - b.y) * 2 < a.h + b.h + pad;
function labelScale() {
  const map = $('map');
  const vb = CARTO?.viewBox ?? [0, 0, 1000, 1040];
  const w = map.clientWidth; const h = map.clientHeight;
  if (!w || !h) return null;
  const scale = Math.min(w / vb[2], h / vb[3]);
  return Math.max(12, Math.min(34, 12.5 / scale));
}
function layoutLabels() {
  const map = $('map');
  if (!map || $('gameScreen').hidden) return;
  const fu = labelScale();
  if (!fu) return;
  map.style.setProperty('--fu', `${fu}px`);
  const pad = fu * 0.9; // 글자 사이 여백(겹침뿐 아니라 붙어 보이는 것도 피함)
  const placed = [];
  for (const t of document.querySelectorAll('.island-label')) {
    const m = measure(t);
    if (m) placed.push(boxOf(m));
  }
  if (mapView === 'history') { layoutHistoryLabels(fu, pad, placed); return; }
  const rank = (r) => {
    if (r.id === selectedRegion) return 0;
    const cls = regionClass(r);
    return cls === 'own' || cls === 'rival' ? 1 : cls === 'neutral' ? 2 : 3;
  };
  const order = META.regions.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i);
  for (const { r } of order) {
    const t = document.querySelector(`[data-label="${r.id}"]`);
    if (!t) continue;
    const mark = t.querySelector('.mk');
    const name = t.querySelector('.mk + tspan');
    name.textContent = r.name;
    t.style.display = '';
    const baseY = r.label[1] + fu * 0.35;
    t.setAttribute('x', r.label[0]);
    t.setAttribute('y', baseY);
    const m = measure(t) || { x: r.label[0] - (r.name.length + (mark.textContent ? 1.2 : 0)) * fu * 0.475, y: r.label[1] - fu * 0.6, width: (r.name.length + (mark.textContent ? 1.2 : 0)) * fu * 0.95, height: fu * 1.2 };
    const cyOff = m.y + m.height / 2 - baseY;
    let spot = null;
    for (const dy of [0, -0.8, 0.8, -1.5, 1.5]) {
      const y = baseY + dy * m.height;
      const b = { x: m.x + m.width / 2, y: y + cyOff, w: m.width, h: m.height, ty: y };
      if (!placed.some((p) => boxHit(p, b, pad))) { spot = b; break; }
    }
    if (!spot && mark.textContent) {
      // 이름 자리가 없으면 소유 표식만 남긴다.
      const b = { x: r.label[0], y: baseY + cyOff, w: fu * 1.1, h: m.height, ty: baseY };
      if (!placed.some((p) => boxHit(p, b, 0))) { spot = b; name.textContent = ''; }
    }
    t.style.display = spot ? '' : 'none';
    if (!spot) continue;
    placed.push(spot);
    t.setAttribute('y', spot.ty);
  }
}

function measure(t) {
  try {
    const b = t.getBBox();
    if (b && b.width > 0) return { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch { /* 측정 불가 → 추정값 사용 */ }
  return null;
}
const boxOf = (m) => ({ x: m.x + m.width / 2, y: m.y + m.height / 2, w: m.width, h: m.height });

function layoutHistoryLabels(fu, pad, placed) {
  const culture = document.querySelector('.culture-label');
  const cm = culture && measure(culture);
  if (cm) placed.push(boxOf(cm));
  for (const s of document.querySelectorAll('.site-label')) {
    const m = measure(s);
    if (m) placed.push(boxOf(m));
  }
  const kindRank = { region: 0, sea: 1, mountain: 2, place: 3, river: 4 };
  const labels = [...document.querySelectorAll('.hist-label')]
    .sort((a, b) => (kindRank[a.dataset.kind] ?? 9) - (kindRank[b.dataset.kind] ?? 9));
  for (const t of labels) {
    t.style.display = '';
    const m = measure(t);
    if (!m) continue;
    const b = boxOf(m);
    const ok = !placed.some((p) => boxHit(p, b, pad));
    t.style.display = ok ? '' : 'none';
    if (ok) placed.push(b);
  }
}

function setView(v) {
  mapView = v;
  siteFocus = null;
  applyView();
  if (v === 'game') $('siteInfo').hidden = true;
  sfx('select');
}
function applyView() {
  const hist = mapView === 'history';
  $('viewGame').setAttribute('aria-pressed', String(!hist));
  $('viewHistory').setAttribute('aria-pressed', String(hist));
  $('eraTabs').hidden = !hist;
  $('legendGame').hidden = hist;
  $('legendHistory').hidden = !hist;
  $('map').classList.toggle('view-history', hist);
  $('map').classList.toggle('view-game', !hist);
  $('map').setAttribute('aria-label', hist ? '역사 지도: 현재 해안선 바탕 위의 유적과 문화 범위 참고' : '점령 지도: 현재 해안선 바탕 위의 게임 구역(실제 국경 아님)');
  if (hist) renderHistoryLayer();
  else {
    if (!siteFocus) $('siteInfo').hidden = true;
    layoutLabels();
  }
}

function renderHistoryLayer() {
  const layer = $('layerHistory');
  if (!layer) return;
  replaceContent(layer,);
  document.querySelectorAll('#eraTabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.era === previewEra)));
  if (!CARTO) { renderSiteInfo(); return; }
  if (previewEra === 'gojoseon' && CARTO.culturePath) {
    layer.append(svg('path', { d: CARTO.culturePath, class: 'culture' }));
    const pts = (CARTO.culturePath.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    let sx = 0; let sy = 0; let n = 0; let maxY = -Infinity;
    for (let i = 0; i + 1 < pts.length; i += 2) { sx += pts[i]; sy += pts[i + 1]; n++; maxY = Math.max(maxY, pts[i + 1]); }
    if (n) {
      // 강 이름과 덜 겹치도록 범위 안쪽 아래편에 둔다.
      const lx = sx / n; const ly = sy / n + (maxY - sy / n) * 0.35;
      const t = svg('text', { x: lx, y: ly, 'text-anchor': 'middle', class: 'culture-label' });
      t.append(svg('tspan', { x: lx, dy: 0 }, '고조선 문화 범위 참고'), svg('tspan', { x: lx, dy: '1.25em' }, '확정 국경 아님'));
      layer.append(t);
    }
  }
  for (const l of CARTO.labels || []) {
    layer.append(svg('text', { x: l.point[0], y: l.point[1], 'text-anchor': 'middle', class: `hist-label k-${l.kind}`, 'data-kind': l.kind }, l.text));
  }
  for (const s of (CARTO.sites || []).filter((x) => x.era === previewEra)) {
    const [x, y] = s.point;
    const [dx, dy] = s.labelOffset || [12, -8];
    const g = svg('g', { class: `site era-${s.era}${siteFocus?.name === s.name ? ' active' : ''}`, tabindex: '0', role: 'button', 'aria-label': `${s.name} 유적 정보` });
    g.append(
      svg('line', { x1: x, y1: y, x2: x + dx * 0.85, y2: y + dy, class: 'leader' }),
      svg('circle', { cx: x, cy: y, r: 18, class: 'hit' }),
      svg('circle', { cx: x, cy: y, r: 7, class: 'site-dot' }),
      svg('text', { x: x + dx, y: y + dy + 5, 'text-anchor': dx < 0 ? 'end' : 'start', class: 'site-label' }, s.name));
    const open = () => showSite(s);
    g.addEventListener('click', open);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    layer.append(g);
  }
  renderSiteInfo();
  layoutLabels();
}

function showSite(s) {
  siteFocus = s;
  sfx('select');
  if (mapView === 'history') renderHistoryLayer();
  else renderSiteInfo();
  const box = $('siteInfo');
  const rect = box.getBoundingClientRect();
  if (!box.hidden && (rect.bottom > window.innerHeight || rect.top < 0)) {
    box.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
  }
}

// 유적·섬 정보 영역. 게임 지역 패널(#regionPanel)과 분리되어 있다.
function renderSiteInfo() {
  const box = $('siteInfo');
  const note = CARTO?.eraNotes?.[previewEra];
  replaceContent(box,);
  if (siteFocus?.kind === 'island') {
    box.append(el('h3', { text: siteFocus.name }),
      el('p', { text: '현재 해안선 자료에 따른 위치를 점으로 표시했어요. 작은 섬이라 실제 크기보다 키우지 않았어요.' }),
      el('p', { class: 'small', text: '섬 표식은 정보용이며 게임 점령 구역의 경계를 뜻하지 않아요.' }),
      el('button', { type: 'button', class: 'linkish', text: '닫기', onclick: () => {
        siteFocus = null;
        if (mapView === 'history') renderSiteInfo(); else box.hidden = true;
      } }));
    box.hidden = false;
    return;
  }
  if (mapView !== 'history') { box.hidden = true; return; }
  if (siteFocus) {
    const r = regionMeta(siteFocus.regionId);
    box.append(
      el('p', { class: 'eyebrow', text: `${eraName(siteFocus.era)} 유적` }),
      el('h3', { text: siteFocus.name }),
      el('p', { text: siteFocus.note }),
      r ? el('p', { class: 'small', text: `게임 구역으로는 “${r.name}” 안에 있어요. 유적 정보는 게임의 점령·시대 잠금과 별개예요.` }) : null,
      el('button', { type: 'button', class: 'linkish', text: '← 시대 설명으로', onclick: () => { siteFocus = null; renderHistoryLayer(); } }));
  } else if (note) {
    box.append(el('p', { class: 'eyebrow', text: `${note.subtitle} · 미리보기` }), el('h3', { text: note.title }), el('p', { text: note.description }),
      el('p', { class: 'small', text: '시대 미리보기는 내 원정대의 진행과 상관없이 볼 수 있어요. 유적 점을 누르면 설명이 나와요.' }));
  }
  box.hidden = false;
}

function buildRegionSelect() {
  const sel = $('regionSelect');
  replaceContent(sel,el('option', { value: '', text: '지역 목록' }));
  for (const r of META.regions) sel.append(el('option', { value: r.id, text: r.name }));
}
function renderRegionSelect() {
  const sel = $('regionSelect');
  for (const opt of sel.options) {
    if (!opt.value) continue;
    const r = regionMeta(opt.value);
    const cls = regionClass(r);
    opt.textContent = `${r.name} · ${cls === 'locked' ? `${eraShort(r.era)}에 열림` : OWNER_TEXT[cls]}`;
  }
  sel.value = selectedRegion || '';
}

function selectRegion(id) {
  selectedRegion = id;
  renderMap();
  renderRegionSelect();
  renderRegionPanel();
  sfx('select');
  const r = regionMeta(id);
  const cls = regionClass(r);
  setGuide(cls === 'locked'
    ? `${r.name}은(는) ${eraName(r.era)} 문제로 도전하는 구역이에요. 시대를 발전시키면 열려요.`
    : cls === 'own' ? `${r.name}은(는) 이미 우리 영토예요. 아직 안 푼 문제로 공부를 이어 갈 수 있어요.`
      : `${r.name}: ${r.terrain} 지형이에요. ${eraName(r.era)} 문제를 맞히면 ${judgeShort()}한 뒤 점령해요.`);
  if (window.matchMedia('(max-width: 900px)').matches && !$('mapWrap').classList.contains('expanded')) {
    $('regionPanel').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
  }
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
    actions.append(el('p', { class: 'small', text: `${eraName(r.era)}에 들어서야 이 구역 문제를 풀 수 있어요.` }));
  } else {
    actions.append(el('button', {
      type: 'button', class: 'primary big',
      text: cls === 'own' ? '연습 문제 풀기' : st.owner === 'rival' ? '지역 도전하기' : '문제 풀고 점령하기',
      onclick: () => startRegion(r.id),
    }));
    actions.append(el('p', { class: 'small', text: cls === 'own' ? '이미 우리 땅이에요. 처음 맞히는 문제는 경험치를 줘요.' : `정답을 맞히면 ${judgeShort()}한 뒤 점령해요.` }));
  }
  // 삼국 이후에는 지역 문제는 그 지역의 선사 시대 내용이고, 지금 시대 공부는 미션으로 한다.
  const later = eraOrder(STATE.player.era) > 2
    ? el('p', { class: 'small note', text: `이 구역 문제는 ${eraName(r.era)} 내용이에요. ${eraName(STATE.player.era)} 공부는 지도 아래 사건판의 미션으로 해요.` })
    : null;
  replaceContent(panel,
    el('p', { class: 'eyebrow', text: '구역 기록' }),
    el('h2', { text: r.name }),
    el('p', { class: 'small', text: '게임용 구역이에요. 실제 역사 국경이 아니에요.' }),
    info, actions, later);
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
  const head = el('div', { class: 'pills' },
    el('span', { class: 'pill', text: eraName(q.era) }),
    el('span', { class: 'pill', text: q.topic }),
    el('span', { class: 'pill', text: `난이도 ${q.difficulty}` }),
    el('span', { class: 'pill pending', text: '자체 제작 · 검수 대기' }),
    q.myth ? el('span', { class: 'pill myth', text: '신화 해석 문제' }) : null,
    ch.mode === 'review' ? el('span', { class: 'pill', text: '복습' }) : null,
    ch.missionId ? el('span', { class: 'pill', text: `미션 · ${missionMeta(ch.missionId)?.name ?? ''}` }) : null);
  const title = ch.missionId ? missionMeta(ch.missionId)?.name ?? '미션 문제' : ch.regionId ? regionMeta(ch.regionId).name : '복습 문제';
  const choices = el('div', { class: 'quiz-choices' });
  q.choices.forEach((c, i) => {
    choices.append(el('button', {
      type: 'button', onclick: () => submitAnswer(ch, i, choices),
    }, el('span', { class: 'num', text: `${i + 1}` }), el('span', { text: c })));
  });
  replaceContent(body,
    el('div', { class: 'dlg-head' }, el('h2', { text: title }),
      el('button', { type: 'button', class: 'close', text: '닫기', onclick: () => $('quizDialog').close() })),
    head,
    el('p', { class: 'small', text: `학습 목표: ${q.objective}` }),
    el('p', { class: 'quiz-q', text: q.text }),
    choices,
    el('p', { class: 'small', text: `검수 때 확인할 자료: ${q.sources.join(', ')}` }));
  $('quizDialog').showModal();
}

async function submitAnswer(ch, idx, choicesBox) {
  const btns = [...choicesBox.querySelectorAll('button')];
  btns.forEach((b) => { b.disabled = true; });
  try {
    const r = await api('/api/answer', { method: 'POST', body: { challengeId: ch.challengeId, choiceIndex: idx } });
    STATE = r.state;
    btns[idx].classList.add(r.correct ? 'picked-ok' : 'picked-bad');
    const box = el('div', { class: `result ${r.correct ? 'ok' : 'bad'}` },
      el('h3', { text: r.correct ? '정답이에요!' : '아쉬워요, 오답이에요.' }),
      el('p', {}, el('strong', { text: '정답: ' }), r.correctChoice),
      el('p', { text: r.explanation }));
    const lines = [];
    if (r.reward.firstCorrect) lines.push(`처음 맞힌 문제 보상: 경험치 +${r.reward.xp}, 식량 +${r.reward.grain}, 인구 +${r.reward.population}`);
    if (r.reward.repeat) lines.push('이미 보상을 받은 문제라 이번엔 기록만 남겨요.');
    if (!r.correct) lines.push('틀린 문제는 “학습 기록·복습”에서 다시 풀 수 있어요.');
    if (r.territory?.captured) lines.push(`${regionMeta(r.territory.regionId).name} 점령! 식량 +${r.territory.grain}, 인구 +${r.territory.population}`);
    else if (r.territory?.rivalWins != null) lines.push(`지역 도전 진행: ${r.territory.rivalWins} / ${r.territory.need}`);
    if (r.mission && r.mission.status !== 'rewarded') lines.push(`미션 「${missionMeta(r.mission.id)?.name}」 진행: ${progressText(r.mission)}`);
    for (const rc of r.missionsCompleted || []) lines.push(`미션 「${rc.name}」 완료! 경험치 +${rc.xp}, 식량 +${rc.grain}, 인구 +${rc.population}`);
    lines.push(`판정: ${judgeShort()}`);
    lines.forEach((t) => box.append(el('p', { text: t })));
    if (r.newCards.length) {
      const reveal = el('div', { class: 'card-reveal' });
      for (const cid of r.newCards) {
        const c = cardById(cid);
        reveal.append(el('figure', { class: 'reveal-card' }, cardArt(c, false), el('figcaption', { text: `새 카드 · ${c.name}` })));
      }
      box.append(reveal);
    }
    let next;
    if (ch.missionId) {
      const done = ['rewarded', 'completed'].includes(r.mission?.status);
      next = done
        ? el('button', { type: 'button', class: 'primary', text: '사건판으로', onclick: () => { $('quizDialog').close(); $('eventBoard').scrollIntoView({ block: 'start' }); } })
        : el('button', { type: 'button', class: 'primary', text: '이 미션 다음 문제', onclick: () => startMission(ch.missionId) });
    } else if (ch.regionId) next = el('button', { type: 'button', class: 'primary', text: '다음 문제', onclick: () => startRegion(ch.regionId) });
    else next = el('button', { type: 'button', class: 'primary', text: '다른 복습 문제', onclick: startReview });
    box.append(el('div', { class: 'actions' }, next,
      el('button', { type: 'button', text: '지도로 돌아가기', onclick: () => $('quizDialog').close() })));
    // 완료 알림은 문제 창이 닫힌 뒤에 띄운다(답 화면을 가리지 않음).
    queueDone(r.missionsCompleted);
    $('quizBody').append(box);
    box.scrollIntoView({ block: 'nearest' });
    // 서버가 확정한 결과에만 소리·연출을 붙인다.
    sfx(r.correct ? 'correct' : 'wrong');
    if (r.territory?.captured) {
      setTimeout(() => sfx('capture'), 350);
      pulseRegion(r.territory.regionId);
      toast(`${regionMeta(r.territory.regionId).name} 점령!`, 'gold');
      setGuide(`${regionMeta(r.territory.regionId).name}을(를) 얻었어요! 시대 발전 조건도 함께 확인해 보세요.`);
    } else if (r.correct) {
      setGuide(r.reward.firstCorrect ? '잘했어요! 처음 맞힌 문제라 보상을 받았어요.' : '정답이에요. 이미 보상받은 문제라 기록만 남겼어요.');
    } else {
      setGuide('괜찮아요. 해설을 읽고 나중에 복습에서 다시 풀어 봐요.');
    }
    if (r.newCards.length) setTimeout(() => sfx('card'), 900);
    render();
    queueNewMissions('풀이 진행에 맞춰 새 미션을 추천해요. 목표와 보상을 살펴보세요.');
  } catch (e) {
    toast(e.message);
    $('quizDialog').close();
  }
}

function pulseRegion(id) {
  const poly = document.querySelector(`polygon[data-id="${id}"]`);
  if (!poly || reducedMotion) return;
  poly.classList.add('pulse');
  setTimeout(() => { poly.classList.remove('pulse'); }, 1800);
}

async function doAdvance() {
  try {
    const r = await api('/api/advance', { method: 'POST' });
    STATE = r.state;
    if (historyEras().some((e) => e.id === r.era)) previewEra = r.era;
    render();
    if (mapView === 'history') renderHistoryLayer();
    sfx('era');
    const era = eraMeta(r.era);
    showFlourish(eraName(r.era), CARTO?.eraNotes?.[r.era]?.title ?? era?.period ?? '');
    const cards = r.newCards.map((c) => cardById(c).name).join(', ');
    toast(`${eraName(r.era)}에 들어섰어요!${cards ? ` 새 카드: ${cards}` : ''}`, 'gold');
    setGuide(era.order > 2
      ? `${eraName(r.era)}에 들어섰어요! 지도 아래 사건판에서 새 미션을 골라 보세요.`
      : `${eraName(r.era)}에 들어섰어요! 새로 열린 구역을 찾아보세요.`);
    if (r.newCards.length) setTimeout(() => sfx('card'), 1400);
    queueDone(r.missionsCompleted);
    queueNewMissions(`${eraName(r.era)}에 들어서서 새 미션이 열렸어요.`);
    // 시대 연출이 끝난 뒤 알림
    setTimeout(flushPopups, reducedMotion ? 1700 : 2900);
  } catch (e) { toast(e.message); }
}

function showFlourish(title, sub) {
  const f = $('flourish');
  replaceContent(f,el('p', { class: 'fl-eyebrow', text: '새 시대' }), el('p', { class: 'fl-title', text: title }), sub ? el('p', { class: 'fl-sub', text: sub }) : null);
  f.classList.remove('show');
  void f.offsetWidth;
  f.classList.add('show');
  setTimeout(() => f.classList.remove('show'), reducedMotion ? 1600 : 2800);
}

// ── 카드 그림 ──
function cardArt(c, locked) {
  const wrap = el('div', { class: `card-art${locked ? ' locked' : ''}`, role: 'img', 'aria-label': `${c.name} 삽화${locked ? '(미획득)' : ''}` });
  const idx = CARD_ART[c.id];
  if (idx === 'svg-bipa') {
    wrap.classList.add('drawn');
    wrap.append(bipaDagger());
  } else if (Number.isInteger(idx)) {
    const a = el('div', { class: 'atlas' });
    a.style.backgroundPosition = `${(idx % 3) * 50}% ${Math.floor(idx / 3) * 50}%`;
    wrap.append(a);
  } else if (c.icon) {
    wrap.classList.add('drawn', `era-${c.era}`);
    wrap.append(cardGlyph(c.icon));
  }
  return wrap;
}

// 삽화가 아직 없는 카드의 단순 상징 도형(글자를 그림에 넣지 않음). 실제 유물의 모습을 정밀하게 그린 것이 아니다.
function cardGlyph(kind) {
  const s = svg('svg', { viewBox: '0 0 100 100', class: 'glyph', 'aria-hidden': 'true' });
  const ink = { fill: 'none', stroke: '#3c3222', 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
  const metal = { fill: '#8c8f86', stroke: '#3c3222', 'stroke-width': 2 };
  const paper = { fill: '#f3e7c6', stroke: '#3c3222', 'stroke-width': 2 };
  const wood = { fill: '#a77b47', stroke: '#3c3222', 'stroke-width': 2 };
  const shapes = {
    // 덩이쇠: 양 끝이 넓게 벌어진 납작한 쇠판 두 장
    iron: [svg('path', { d: 'M18,40 L30,46 L70,46 L82,40 L82,54 L70,50 L30,50 L18,54 Z', ...metal }),
      svg('path', { d: 'M18,58 L30,64 L70,64 L82,58 L82,72 L70,68 L30,68 L18,72 Z', ...metal })],
    // 절집: 겹지붕과 기둥
    temple: [svg('path', { d: 'M14,40 Q50,22 86,40 L76,40 L76,44 L24,44 L24,40 Z', fill: '#4c5a4f', stroke: '#3c3222', 'stroke-width': 2 }),
      svg('rect', { x: 28, y: 44, width: 44, height: 30, fill: '#c6553f', stroke: '#3c3222', 'stroke-width': 2 }),
      svg('path', { d: 'M38,44 V74 M50,44 V74 M62,44 V74', ...ink }),
      svg('rect', { x: 20, y: 74, width: 60, height: 8, ...paper })],
    // 목판: 판 위에 새긴 줄과 양쪽 마구리
    woodblock: [svg('rect', { x: 18, y: 26, width: 64, height: 48, rx: 3, ...wood }),
      svg('rect', { x: 12, y: 24, width: 8, height: 52, rx: 2, ...wood }), svg('rect', { x: 80, y: 24, width: 8, height: 52, rx: 2, ...wood }),
      svg('path', { d: 'M30,34 V66 M40,34 V66 M50,34 V66 M60,34 V66 M70,34 V66', ...ink, stroke: '#5b3d1e' })],
    // 훈민정음: 닿소리 모양(ㄱ·ㄴ·ㅁ·ㅅ·ㅇ)을 선으로
    hangul: [svg('rect', { x: 14, y: 16, width: 72, height: 68, rx: 4, ...paper }),
      svg('path', { d: 'M24,28 H40 V44 M58,28 V44 H74 M24,56 H40 V72 H24 Z M58,72 L66,56 L74,72', ...ink }),
      svg('circle', { cx: 50, cy: 50, r: 6, ...ink })],
    // 도장(임시 정부 문서): 네모 도장과 끈
    seal: [svg('rect', { x: 22, y: 30, width: 56, height: 48, rx: 4, ...paper }),
      svg('rect', { x: 34, y: 40, width: 32, height: 28, rx: 2, fill: 'none', stroke: '#9e2b22', 'stroke-width': 3 }),
      svg('path', { d: 'M42,48 H58 M42,54 H58 M42,60 H58', fill: 'none', stroke: '#9e2b22', 'stroke-width': 2.4 }),
      svg('path', { d: 'M50,30 V18', ...ink })],
    // 두루마리 문서(헌법): 말린 종이와 줄글
    scroll: [svg('rect', { x: 24, y: 22, width: 52, height: 56, ...paper }),
      svg('rect', { x: 18, y: 16, width: 64, height: 8, rx: 4, ...wood }), svg('rect', { x: 18, y: 76, width: 64, height: 8, rx: 4, ...wood }),
      svg('path', { d: 'M32,34 H68 M32,42 H68 M32,50 H68 M32,58 H60 M32,66 H54', ...ink, 'stroke-width': 2 })],
  };
  s.append(...(shapes[kind] || [svg('circle', { cx: 50, cy: 50, r: 22, ...paper })]));
  return s;
}

// ── 배경 이야기·게임 안내 ──
// assets/story.json 의 글을 그대로 보여 준다(내용을 바꾸거나 만들어 넣지 않음).
let storyPages = [];
let storyIndex = 0;

function setupStory() {
  const list = $('howtoList');
  replaceContent(list,...(STORY?.tutorial || []).map((t) => el('li', {}, el('strong', { text: t.title }), el('span', { text: t.body }))));
  $('openStory').hidden = !STORY;
  $('openTutorial').hidden = !STORY;
  $('storyBtn').hidden = !STORY;
  if (!STORY) return;
  $('storyPrev').addEventListener('click', () => goStory(storyIndex - 1));
  $('storyNext').addEventListener('click', () => {
    if (storyIndex >= storyPages.length - 1) $('storyDialog').close();
    else goStory(storyIndex + 1);
  });
  $('storySkip').addEventListener('click', () => {
    const tut = storyPages.findIndex((p) => p.kind === 'tutorial');
    if (tut > storyIndex) goStory(tut); else $('storyDialog').close();
  });
  $('storyClose').addEventListener('click', () => $('storyDialog').close());
  $('storyDialog').addEventListener('keydown', (e) => {
    if (e.target.closest('summary, a')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); if (storyIndex < storyPages.length - 1) goStory(storyIndex + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); if (storyIndex > 0) goStory(storyIndex - 1); }
  });
}

function openStory(mode) {
  if (!STORY) return;
  const tutorial = { kind: 'tutorial' };
  storyPages = mode === 'tutorial' ? [tutorial] : [...STORY.slides.map((s) => ({ kind: 'slide', s })), tutorial];
  goStory(0);
  if (!$('storyDialog').open) $('storyDialog').showModal();
  $('storyNext').focus();
}

function goStory(i) {
  storyIndex = Math.max(0, Math.min(storyPages.length - 1, i));
  const page = storyPages[storyIndex];
  const last = storyIndex === storyPages.length - 1;
  const inGame = !$('gameScreen').hidden;
  const scene = $('storyScene');
  const text = $('storyText');
  const srcList = $('storySourceList');
  replaceContent(srcList,);
  if (page.kind === 'slide') {
    const s = page.s;
    scene.className = `story-scene scene-${s.scene}`;
    $('storyEyebrow').textContent = s.eyebrow;
    $('storyTitle').textContent = s.title;
    replaceContent(text,...s.paragraphs.map((p) => el('p', { text: p })));
    $('storyLabel').textContent = s.label;
    const srcs = (s.sourceIds || []).map((id) => STORY.sources.find((x) => x.id === id)).filter(Boolean);
    srcs.forEach((x) => srcList.append(el('li', {}, safeLink(x.url, x.title), el('div', { class: 'small', text: x.note }))));
    $('storySources').hidden = !srcs.length;
  } else {
    scene.className = 'story-scene scene-tutorial';
    $('storyEyebrow').textContent = '게임 안내';
    $('storyTitle').textContent = '이렇게 놀아요';
    replaceContent(text,el('ol', { class: 'tutorial-steps' }, STORY.tutorial.map((t, n) => el('li', {},
      el('span', { class: 'step-no', 'aria-hidden': 'true', text: String(n + 1) }),
      el('div', {}, el('strong', { text: t.title }), el('p', { text: t.body }))))));
    $('storyLabel').textContent = STORY.notice;
    $('storySources').hidden = true;
  }
  $('storySources').open = false;
  const dots = $('storyDots');
  replaceContent(dots,...storyPages.map((_, n) => el('li', { class: n === storyIndex ? 'on' : '', 'aria-current': n === storyIndex ? 'step' : null })));
  $('storyPage').textContent = `${storyIndex + 1} / ${storyPages.length}`;
  $('storyPrev').disabled = storyIndex === 0;
  $('storyNext').textContent = last ? (inGame ? '원정 계속하기' : '닫기') : '다음';
  $('storySkip').hidden = last;
  $('storySkip').textContent = page.kind === 'slide' ? '이야기 건너뛰기' : '건너뛰기';
}

// 비파형 동검 도식: 좁은 끝, 가운데 등대(능), 둥글고 넓은 아래 날, 짧은 슴베. 날개 장식 없음.
function bipaDagger() {
  const s = svg('svg', { viewBox: '0 0 100 140', class: 'bipa', 'aria-hidden': 'true' });
  const defs = svg('defs');
  const g = svg('linearGradient', { id: `bronze${Math.random().toString(36).slice(2, 7)}`, x1: 0, x2: 1, y1: 0, y2: 0 });
  g.append(svg('stop', { offset: '0%', 'stop-color': '#5d6b4f' }), svg('stop', { offset: '45%', 'stop-color': '#b08a4a' }),
    svg('stop', { offset: '55%', 'stop-color': '#d6b26a' }), svg('stop', { offset: '100%', 'stop-color': '#6f6a44' }));
  defs.append(g);
  s.append(defs);
  const fill = `url(#${g.getAttribute('id')})`;
  s.append(
    svg('path', { d: 'M50,8 C52.5,22 54.5,36 55.5,50 C56,56 58.5,60 61,64 C66,72 67,86 62,98 C59,104 55,107 53,108 L47,108 C45,107 41,104 38,98 C33,86 34,72 39,64 C41.5,60 44,56 44.5,50 C45.5,36 47.5,22 50,8 Z', fill, stroke: '#3c3222', 'stroke-width': 1.4 }),
    svg('path', { d: 'M50,12 L50,106', stroke: '#f1dc9c', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0.85 }),
    svg('path', { d: 'M50,12 L50,106', stroke: '#4a3d26', 'stroke-width': 0.6, opacity: 0.6, transform: 'translate(1.6,0)' }),
    svg('rect', { x: 46.5, y: 108, width: 7, height: 18, rx: 1.5, fill: '#6b5a3a', stroke: '#3c3222', 'stroke-width': 1.2 }),
  );
  return s;
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
  replaceContent(grid,);
  for (const c of META.cards) {
    const has = owned.has(c.id);
    grid.append(el('article', { class: `tcard${has ? '' : ' locked'}` },
      cardArt(c, !has),
      el('div', { class: 'tcard-body' },
        el('div', { class: 'pills' },
          el('span', { class: 'pill', text: c.type }),
          el('span', { class: 'pill', text: eraShort(c.era) }),
          c.myth ? el('span', { class: 'pill myth', text: '신화·설화' }) : null,
          el('span', { class: `pill ${has ? 'have' : ''}`, text: has ? '획득' : '미획득' })),
        el('h4', { text: c.name }),
        el('p', { text: c.history }),
        el('p', {}, el('strong', { text: '효과: ' }), c.effectText),
        el('p', { class: 'small', text: `얻는 방법: ${c.howTo}` }),
        c.id === 'c_bipa' ? el('p', { class: 'small', text: '그림: 코드로 그린 단순 도식(유물 사진 아님)' }) : el('p', { class: 'small', text: '그림: 게임용 삽화(유물 사진 아님)' }))));
  }
}

async function renderHistory() {
  const h = await api('/api/history');
  $('reviewInfo').textContent = `복습할 문제 ${STATE.stats.reviewPending}개 · 지금까지 ${STATE.stats.totalAttempts}번 풀고 ${STATE.stats.totalCorrect}번 맞혔어요.`;
  $('reviewBtn').disabled = STATE.stats.reviewPending === 0;
  const notes = $('notesList');
  replaceContent(notes,);
  if (!h.notes.length) notes.append(el('li', { text: '아직 푼 문제가 없어요.' }));
  for (const n of h.notes) {
    const li = el('li', {}, el('span', { class: 'pill', text: eraName(n.era) }), el('strong', { text: n.text }));
    if (n.lastCorrect) li.append(el('div', { class: 'small', text: `정답: ${n.answer} — ${n.explanation}` }));
    else li.append(el('div', { class: 'small', text: '마지막에 틀린 문제예요. 복습으로 다시 도전하면 정답과 해설을 볼 수 있어요.' }));
    notes.append(li);
  }
  const list = $('attemptList');
  replaceContent(list,);
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
    replaceContent(errs,);
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
      toast('형식 검사를 통과해 “검토 대기”로 저장했어요. (AI 검토 미연결)');
      await renderSubmissions();
    } catch (e) {
      (e.data?.errors || [e.message]).forEach((m) => errs.append(el('li', { text: m })));
    }
  });
}

async function renderSubmissions() {
  const { submissions } = await api('/api/submissions');
  const list = $('mySubmissions');
  replaceContent(list,);
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

function safeLink(url, text) {
  let u = null;
  try { u = new URL(url); } catch { /* 잘못된 주소 */ }
  if (!u || u.protocol !== 'https:') return el('span', { text });
  const a = el('a', { href: u.href, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer', text });
  return el('span', {}, a, el('span', { class: 'small', text: ` (${u.hostname}, 새 창)` }));
}

function buildSources() {
  const body = $('sourceBody');
  const ul = (items) => el('ul', {}, items.map((t) => (t instanceof Node ? el('li', {}, t) : el('li', { text: t }))));
  const srcList = (CARTO?.sources || []).map((s) => el('div', {}, safeLink(s.url, s.title), el('div', { class: 'small', text: s.detail })));
  replaceContent(body,
    el('h3', { text: '지도 자료' }),
    srcList.length ? ul(srcList) : el('p', { text: '지도 자료를 불러오지 못했어요.' }),
    el('h3', { text: '지도를 읽을 때 알아 두기' }),
    ul([
      '바탕 해안선과 강은 현재 지형 자료예요. 옛 해안선을 복원한 것이 아니에요.',
      '고조선 점선은 문화 범위를 참고해 단순하게 새로 그린 근사치예요. 확정된 국경이 아니에요.',
      '비상교육 자료(PDF 14쪽 · 교과서 15쪽)는 고등 한국사 교과서 연계 보조 자료예요. 초등 교과서 자체가 아니에요.',
      '색칠한 구역은 게임 규칙을 위한 칸이며 실제 역사 국경이 아니에요. 유적 정보는 점령·시대 잠금과 별개예요.',
      '현대 국가 경계선은 그리지 않았어요.',
      CARTO?.notice || META.demo.mapNotice,
    ]),
    el('h3', { text: '그림과 소리' }),
    ul([
      '배경 풍경, 안내인 하람, 카드 그림은 이 게임을 위해 만든 삽화예요. 실제 유물·유적 사진이 아니에요.',
      '안내인 하람은 가상 인물이에요.',
      '비파형 동검 카드 그림은 코드로 그린 단순 도식이에요.',
      '배경음은 이 게임을 위해 새로 합성한 음원(river-dawn.wav)을 쓰고, 불러오지 못하면 브라우저에서 즉석으로 만든 소리로 바꿔요. 효과음은 즉석 소리(WebAudio)예요. 둘 다 기본은 꺼져 있어요.',
    ]),
    el('h3', { text: '문제' }),
    ul([META.demo.questionReview, '문제에 붙은 “검수 때 확인할 자료”는 확인 완료를 뜻하지 않아요.',
      '박정재 교수의 기후·이동 설명 같은 연구 가설은 채점 문제로 내지 않아요.']),
    el('h3', { text: '미션 배치' }),
    ul([META.missionWeighting?.note,
      META.missionWeighting?.source ? safeLink(META.missionWeighting.source, `${META.missionWeighting.exam ?? '한국사능력검정시험'} 공개 자료`) : null,
      '삼국 이후 카드 그림은 코드로 그린 단순 상징 도형이에요.'].filter(Boolean)),
    STORY ? el('h3', { text: '배경 이야기 참고 자료' }) : null,
    STORY ? ul([STORY.notice, ...STORY.sources.map((s) => el('div', {}, safeLink(s.url, s.title), el('div', { class: 'small', text: s.note })))]) : null,
  );
}

function buildRules() {
  const R = META.rules;
  const b = $('rulesBody');
  const ul = (items) => el('ul', {}, items.map((t) => el('li', { text: t })));
  const advance = Object.entries(META.advanceRules).map(([to, r]) =>
    `${eraName(r.from)} → ${eraName(to)}: 경험치 ${r.xp} 이상, ${eraName(r.uniqueEra)} 서로 다른 문제 ${r.uniqueCorrect}개 처음 맞힘, 국력 ${r.power} 이상, 필수 미션 "${META.missions.find((m) => m.id === r.mission).name}" 완료`);
  replaceContent(b,
    el('h3', { text: '시작 값' }),
    ul([`식량 ${R.start.grain}, 인구 ${R.start.population}, 경험치 ${R.start.xp}, 시대: 구석기`]),
    el('h3', { text: '보상' }),
    ul([
      `처음 맞힌 문제: 경험치 ${R.firstCorrect.xpBase} + ${R.firstCorrect.xpPerDifficulty}×(난이도-1), 식량 +${R.firstCorrect.grain}, 인구 +${R.firstCorrect.population}`,
      '같은 문제를 다시 맞히면 보상 없음(기록만). 틀려도 자원이 줄지 않아요.',
      `중립 지역 점령: 그 지역 문제 정답 1번 → 식량 +${R.capture.grain}, 인구 +${R.capture.population} (지역마다 한 번)`,
      `경쟁 부족 지역: 정답 ${R.rivalWinsNeeded}번이면 점령`,
      `정답 판정, 보상, 점령: ${META.demo.judgeNotice || judgeShort()} 문제는 한 번 답하면 다시 제출할 수 없어요.`,
    ]),
    el('h3', { text: '미션' }),
    ul([R.missionRule,
      '미션 보상(경험치·식량·인구, 일부는 카드)은 미션마다 정해져 있고 목표 보기에서 미리 확인할 수 있어요.',
      '미션 문제도 처음 맞힌 문제만 문제 보상을 줘요. 같은 문제를 다시 풀어 미션을 채울 수는 없어요.']),
    el('h3', { text: '국력' }), ul([R.powerFormula]),
    el('h3', { text: '시대 발전 조건' }), ul(advance),
    el('h3', { text: '이 시연판에 대해' }),
    ul([META.demo.notice, META.demo.rivalNotice, META.demo.mapNotice, META.demo.questionReview,
      '오래 접속하지 않아도 자원이나 영토를 잃지 않아요.']));
}

boot().catch((e) => { document.body.prepend(el('p', { class: 'error', text: `시작하지 못했어요: ${e.message}` })); });
