// 지역 발전·수확·방어 훈련·수집 도감·나라 세우기 패널. 결과는 모두 서버가 확정한다.
// 화면에는 서버가 돌려준 상태만 그리고, 누르기 전에 미리 바꾸지 않는다.
'use strict';
(() => {
  const NAME_RE = /^[가-힣A-Za-z0-9]{2,12}$/;
  const MAX_LEVEL = 3;
  const ui = {
    state: null, meta: null, panel: null, dialog: null,
    regionId: null, pending: null, status: {}, nameDraft: '', open: new Set(),
  };

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = String(v);
      else if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'disabled' || k === 'open') n[k] = Boolean(v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(typeof c === 'string' ? document.createTextNode(c) : c);
    return n;
  }

  async function post(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    let data = {};
    try { data = await res.json(); } catch { /* 빈 응답 */ }
    if (!res.ok) throw new Error(data.message || data.error || '요청을 처리하지 못했어요. 잠시 뒤 다시 해 보세요.');
    return data;
  }
  const refresh = () => window.dispatchEvent(new Event('history:refresh'));

  const eras = () => ui.meta?.eras || [];
  const eraName = (id) => eras().find((e) => e.id === id)?.name ?? id ?? '';
  const eraOrder = (id) => { const e = eras().find((x) => x.id === id); return e?.order ?? eras().indexOf(e); };
  const grain = () => Number(ui.state?.player?.grain ?? 0);
  const playerEra = () => ui.state?.player?.era;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  function ownedRegions(dev) {
    const all = Array.isArray(dev.regions) ? dev.regions : [];
    const map = Array.isArray(ui.state?.regions) ? ui.state.regions : null;
    if (!map) return all;
    return all.filter((r) => map.find((m) => m.id === r.id)?.owner === 'player');
  }

  function setStatus(section, text, kind = '') { ui.status[section] = { text, kind }; }
  function statusLine(section) {
    const s = ui.status[section];
    return el('p', { class: `devp-status ${s?.kind || ''}`, role: 'status', 'aria-live': 'polite', text: s?.text || '' });
  }

  async function run(key, section, pendingText, fn) {
    if (ui.pending) return;
    ui.pending = key;
    setStatus(section, pendingText, 'busy');
    render();
    try {
      const msg = await fn();
      setStatus(section, msg, 'ok');
      refresh();
    } catch (e) {
      setStatus(section, e.message, 'bad');
    } finally {
      ui.pending = null;
      render();
    }
  }

  // ── 요약 ──
  function summary(dev) {
    const chip = (label, value, hint) => el('div', { class: 'devp-chip', title: hint || null },
      el('span', { class: 'devp-chip-label', text: label }), el('strong', { text: String(value) }));
    return el('div', { class: 'devp-chips', role: 'list', 'aria-label': '발전 현황' },
      ...[
        chip('발전 단계 합계', num(dev.totalLevels)),
        chip('경제', num(dev.economy)),
        chip('기술', num(dev.technology)),
        chip('군사', num(dev.military)),
        chip('힘 보너스', `+${num(dev.powerBonus)}`, '서버가 계산한 발전 보너스'),
        chip('수확량', num(dev.farmYield), '농경 스킬과 활성 카드 효과를 포함한 수확량'),
        chip('방어 성공', num(dev.defenseWins)),
      ].map((c) => { c.setAttribute('role', 'listitem'); return c; }));
  }

  // ── 지역 발전 ──
  function pips(level) {
    const box = el('span', { class: 'devp-pips', 'aria-hidden': 'true' });
    for (let i = 1; i <= MAX_LEVEL; i++) box.append(el('span', { class: i <= level ? 'on' : '' }));
    return box;
  }

  function buildingCard(region, b) {
    const level = num(region[b.id]);
    const maxed = level >= MAX_LEVEL;
    const costs = region.nextCosts || {};
    const cost = maxed ? null : (costs[b.id] ?? (Array.isArray(b.costs) ? b.costs[level] : null));
    const eraLocked = b.minEra && playerEra() && eraOrder(playerEra()) < eraOrder(b.minEra);
    const short = cost != null && grain() < cost;
    const key = `up:${region.id}:${b.id}`;
    let reason = '';
    if (maxed) reason = '가장 높은 단계예요.';
    else if (eraLocked) reason = `${eraName(b.minEra)}부터 지을 수 있어요.`;
    else if (cost == null) reason = '지금은 올릴 수 없어요.';
    else if (short) reason = `식량이 ${cost - grain()} 모자라요.`;
    const reasonId = `devp-why-${region.id}-${b.id}`;
    const btn = el('button', {
      type: 'button', class: 'primary', 'data-dev-key': key,
      disabled: Boolean(ui.pending) || maxed || eraLocked || cost == null || short,
      'aria-describedby': reason ? reasonId : null,
      text: ui.pending === key ? '올리는 중…' : maxed ? '완성' : `${level + 1}단계로 올리기 · 식량 -${cost ?? '?'}`,
      onclick: () => run(key, 'build', `${region.name} ${b.name}을(를) 올리는 중이에요…`, async () => {
        const r = await post('/api/development/upgrade', { regionId: region.id, type: b.id, expectedLevel: level });
        return `${region.name} ${b.name} ${level + 1}단계 완성! 식량 -${r.cost ?? cost}`;
      }),
    });
    return el('article', { class: `devp-bcard${maxed ? ' maxed' : ''}${eraLocked ? ' locked' : ''}`, 'data-type': b.id },
      el('header', {},
        el('h4', { text: b.name }),
        el('span', { class: 'devp-level' }, pips(level), el('span', { text: `${level} / ${MAX_LEVEL}단계` }))),
      b.description ? el('p', { class: 'devp-desc', text: b.description }) : null,
      el('p', { class: 'devp-effect' }, el('strong', { text: maxed ? '효과: ' : `${level + 1}단계 효과: ` }), b.effectText || '서버가 계산해요.'),
      b.minEra ? el('p', { class: 'small', text: `열리는 시대: ${eraName(b.minEra)}` }) : null,
      btn,
      reason ? el('p', { class: 'devp-why', id: reasonId, text: reason }) : null);
  }

  function buildSection(dev, regions, region) {
    const buildings = ui.meta?.development?.buildings || [];
    const sec = el('section', { class: 'devp-sec', 'aria-labelledby': 'devpBuildH' },
      el('h3', { id: 'devpBuildH', text: '🏘️ 지역 발전' }));
    if (!regions.length) {
      sec.append(el('p', { class: 'devp-empty', text: '아직 우리 영토가 없어요. 지도에서 문제를 풀어 지역을 먼저 점령해 보세요.' }));
      return sec;
    }
    const sel = el('select', { id: 'devpRegion', 'data-dev-key': 'region', onchange: (e) => { ui.regionId = e.target.value; render(); } });
    for (const r of regions) {
      const o = el('option', { value: r.id, text: `${r.name} (발전 ${num(r.village) + num(r.farm) + num(r.lab) + num(r.fort)}단계)` });
      if (r.id === region.id) o.selected = true;
      sel.append(o);
    }
    sec.append(
      el('div', { class: 'devp-regionbar' },
        el('label', { for: 'devpRegion', text: '발전시킬 우리 지역' }), sel,
        el('p', { class: 'small devp-regionfacts', text: `인구 보너스 +${num(region.populationBonus)} · 방어력 ${num(region.defense)} · 내 식량 ${grain()}` })),
      el('p', { class: 'hint warn devp-note', text: '개발에는 식량을 쓰지만 투자 국력으로 전환돼요. 농경지의 수확과 연구 시설의 지식 점수를 활용해 성장 방향을 골라요.' }),
      el('div', { class: 'devp-bgrid' }, buildings.map((b) => buildingCard(region, b))),
      statusLine('build'));
    return sec;
  }

  // ── 수확 ──
  function harvestSection(dev, regions) {
    const farms = regions.reduce((s, r) => s + num(r.farm), 0);
    const done = Boolean(dev.harvested);
    const key = 'harvest';
    const why = done ? `${eraName(playerEra())}의 수확은 이미 했어요. 다음 시대에 다시 할 수 있어요.`
      : farms <= 0 ? '논밭을 1단계 이상 지어야 수확할 수 있어요.' : '';
    return el('section', { class: 'devp-sec devp-harvest', 'aria-labelledby': 'devpHarvH' },
      el('h3', { id: 'devpHarvH', text: '🌾 시대 수확' }),
      el('p', { text: `논밭 ${farms}단계 → 예상 수확 식량 +${num(dev.farmYield)} (농경 스킬·활성 카드 효과 포함)` }),
      el('p', { class: 'hint warn', text: '수확은 시대마다 한 번만 할 수 있어요. 수확한 뒤에 논밭을 더 올려도 이번 시대에는 다시 수확되지 않으니, 논밭을 다 올린 뒤 수확하는 게 좋아요.' }),
      el('button', {
        type: 'button', class: 'primary', 'data-dev-key': key,
        disabled: Boolean(ui.pending) || done || farms <= 0,
        text: ui.pending === key ? '수확하는 중…' : done ? '이번 시대 수확 완료' : `수확하기 · 식량 +${num(dev.farmYield)}`,
        onclick: () => run(key, 'harvest', '곡식을 거두는 중이에요…', async () => {
          const r = await post('/api/development/harvest', { era: playerEra() });
          return `수확 완료! 식량 +${r.yield ?? dev.farmYield}`;
        }),
      }),
      why ? el('p', { class: 'devp-why', text: why }) : null,
      statusLine('harvest'));
  }

  // ── 방어 훈련 ──
  function riskFor(region) {
    const fort = num(region?.fort);
    return Math.min(Math.max(0, 8 - 3 * fort - num(ui.state.development?.skills?.military) - num(ui.state.development?.defenseReduction)), grain());
  }

  function raidCard(raid, region) {
    const fort = num(region?.fort);
    const key = `raid:${raid.id}`;
    const state = raid.cleared ? 'cleared' : raid.locked ? 'locked' : 'open';
    const stateText = { cleared: '막아 냄 · 완료', locked: '아직 열리지 않음', open: '훈련 가능' }[state];
    const rw = raid.reward || {};
    let why = '';
    if (state === 'cleared') why = '한 번 막아 낸 침입은 어느 지역에서든 다시 보상을 받을 수 없어요.';
    else if (state === 'locked') why = `${eraName(raid.era)}에 들어서면 열려요.`;
    else if (!region) why = '먼저 위에서 우리 지역을 골라 주세요.';
    else if (fort < 1) why = `${region.name}에 성곽을 1단계 이상 지어야 훈련할 수 있어요.`;
    const btn = state === 'open' ? el('button', {
      type: 'button', class: 'primary', 'data-dev-key': key,
      disabled: Boolean(ui.pending) || !region || fort < 1,
      text: ui.pending === key ? '문제 준비 중…' : `${region ? region.name : '지역'}에서 방어 훈련`,
      onclick: () => startDefense(raid, region),
    }) : null;
    return el('article', { class: `devp-raid ${state}` },
      el('header', {},
        el('h4', { text: raid.name }),
        el('span', { class: `pill devp-rstate ${state}`, text: stateText })),
      el('p', { class: 'small', text: [eraName(raid.era), raid.year].filter(Boolean).join(' · ') }),
      raid.description ? el('p', { class: 'devp-desc', text: raid.description }) : null,
      el('p', { class: 'small', text: `첫 방어 성공 보너스: 경험치 +${num(rw.xp)} · 식량 +${num(rw.grain)} · 인구 +${num(rw.population)}` }),
      btn, why ? el('p', { class: 'devp-why', text: why }) : null);
  }

  function defenseSection(dev, region) {
    const raids = Array.isArray(dev.raids) ? dev.raids : [];
    const open = raids.filter((r) => !r.cleared && !r.locked);
    const rest = raids.filter((r) => r.cleared || r.locked);
    const fort = num(region?.fort);
    const risk = region ? riskFor(region) : null;
    const sec = el('section', { class: 'devp-sec', 'aria-labelledby': 'devpDefH' },
      el('h3', { id: 'devpDefH', text: '🛡️ 방어 훈련' }),
      el('p', { class: 'devp-fiction', text: '역사 속 침입 사건을 배우는 가상 훈련이에요. 실제 역사를 바꾸거나 다른 사용자와 싸우는 것이 아니며, 오답이어도 영토는 잃지 않아요.' }));
    if (region) {
      sec.append(el('div', { class: `devp-risk${risk === 0 ? ' safe' : ''}` },
        el('strong', { text: `${region.name} · 성곽 ${fort}단계` }),
        el('span', {
          text: fort < 1 ? '성곽이 없어 훈련을 시작할 수 없어요.'
            : risk === 0 ? '오답이어도 잃는 식량이 없어요.'
              : `훈련을 시작하기 전 확인: 오답이면 식량 최대 ${risk}를 잃어요. (8 - 성곽×3, 가진 식량까지만)`,
        })));
    }
    sec.append(el('p', { class: 'small', text: '처음 맞힌 문제라면 기본 학습 보상을 받고, 침입을 처음 막으면 방어 보너스를 한 번 더 받아요. 이 정답은 진행 중인 미션에도 반영될 수 있어요.' }));
    if (open.length) sec.append(el('div', { class: 'devp-rgrid' }, open.map((r) => raidCard(r, region))));
    else sec.append(el('p', { class: 'devp-empty', text: raids.length ? '지금 훈련할 수 있는 침입이 없어요. 다음 시대로 나아가 보세요.' : '방어 훈련 정보가 아직 없어요.' }));
    if (rest.length) {
      const cleared = rest.filter((r) => r.cleared).length;
      sec.append(details('raids', `완료·잠긴 침입 보기 (완료 ${cleared} · 잠김 ${rest.length - cleared})`,
        el('div', { class: 'devp-rgrid' }, rest.map((r) => raidCard(r, region)))));
    }
    sec.append(statusLine('defense'));
    return sec;
  }

  // ── 수집 도감 ──
  function collectionSection(dev) {
    const list = Array.isArray(dev.collections) ? dev.collections : [];
    const owned = list.filter((c) => c.owned).length;
    const grid = el('div', { class: 'devp-cgrid' }, list.map((c) => el('article', { class: `devp-col${c.owned ? ' owned' : ''}` },
      el('div', { class: 'devp-col-top' },
        el('span', { class: 'pill', text: c.kind || '기록' }),
        el('span', { class: 'small', text: eraName(c.era) })),
      el('h4', { text: c.owned ? c.name : `${c.name} (잠김)` }),
      window.HistoryPhotos?.figure(c.name,c.era,false),
      el('p', { class: 'devp-desc', text: c.owned ? (c.history || '') : `${c.requirementText || '관련 문제 정답'} · ${c.questionText||''}` }),
      c.owned ? el('p',{class:'pill',text:c.active?'효과 적용 중':'수집 보관 · 시대 효과 종료'}):null,
      el('button',{type:'button',text:'카드 탐구 문제',disabled:Boolean(ui.pending)||eraOrder(playerEra())<eraOrder(c.era),onclick:()=>window.dispatchEvent(new CustomEvent('history:collection',{detail:c.id}))}),
      c.effectText ? el('p', { class: 'small' }, el('strong', { text: '효과: ' }), c.effectText) : null,
      c.owned && Array.isArray(c.sources) && c.sources.length ? el('p', { class: 'small devp-src', text: `확인할 자료: ${c.sources.join(', ')}` }) : null)));
    return el('section', { class: 'devp-sec', 'aria-labelledby': 'devpColH' },
      el('h3', { id: 'devpColH', text: `📜 수집 도감 (${owned} / ${list.length})` }),
      el('p', { class: 'small', text: '디지털 학습 기록이에요. 실제 유물을 가진다는 뜻이 아니며, 효과는 서버가 계산해요.' }),
      list.length ? details('collections', owned ? `도감 펼치기 · 모은 기록 ${owned}개` : '도감 펼치기', grid)
        : el('p', { class: 'devp-empty', text: '도감 정보가 아직 없어요.' }));
  }

  // ── 나라 세우기 ──
  function nationSection(dev) {
    const n = dev.nation || {};
    const sec = el('section', { class: 'devp-sec devp-nation', 'aria-labelledby': 'devpNatH' },
      el('h3', { id: 'devpNatH', text: '👑 나라 세우기' }));
    if (n.formed) {
      sec.append(el('div', { class: 'devp-crest' },
        el('p', { class: 'eyebrow', text: '나의 나라' }),
        el('p', { class: 'devp-nname', text: n.name || '' }),
        el('dl', {},
          el('dt', { text: '등급' }), el('dd', { text: n.rank || '-' }),
          el('dt', { text: '점수' }), el('dd', { text: String(num(n.score)) }))));
    } else {
      const reqs = Array.isArray(n.requirements) ? n.requirements : [];
      sec.append(el('ul', { class: 'devp-reqs' }, reqs.map((q) => el('li', { class: q.ok ? 'ok' : '' },
        el('span', { class: 'devp-mark', 'aria-hidden': 'true', text: q.ok ? '✓' : '·' }),
        el('span', { text: q.label }),
        el('span', { class: 'devp-reqv', text: `${q.current} / ${q.need}${q.ok ? ' 달성' : ''}` })))));
      const valid = NAME_RE.test(ui.nameDraft);
      const key = 'nation';
      const input = el('input', {
        id: 'devpNationName', type: 'text', maxlength: '12', autocomplete: 'off', spellcheck: 'false',
        'data-dev-key': 'nation-name', 'aria-describedby': 'devpNationHelp', placeholder: '예: 푸른강나라',
        oninput: (e) => { ui.nameDraft = e.target.value.trim(); syncNationButton(); },
      });
      input.value = ui.nameDraft;
      const btn = el('button', {
        type: 'submit', class: 'primary', 'data-dev-key': key, id: 'devpNationBtn',
        disabled: Boolean(ui.pending) || !n.canForm || !valid,
        text: ui.pending === key ? '세우는 중…' : '나라 세우기 · 식량 -20',
      });
      sec.append(el('form', {
        class: 'devp-nform', novalidate: true,
        onsubmit: (e) => {
          e.preventDefault();
          if (!NAME_RE.test(ui.nameDraft)) { setStatus('nation', '이름은 한글·영문·숫자 2~12자로 지어 주세요.', 'bad'); render(); return; }
          const name = ui.nameDraft;
          run(key, 'nation', '나라를 세우는 중이에요…', async () => {
            await post('/api/development/nation', { name });
            ui.nameDraft = '';
            return `「${name}」을(를) 세웠어요!`;
          });
        },
      },
      el('label', { for: 'devpNationName', text: '나라 이름' }),
      el('div', { class: 'devp-nrow' }, input, btn),
      el('p', { class: 'small', id: 'devpNationHelp', text: '한글·영문·숫자 2~12자. 실명, 학교, 연락처 같은 개인정보는 넣지 마세요. 세울 때 식량 20이 들어요.' }),
      !n.canForm ? el('p', { class: 'devp-why', text: '위 조건을 모두 채우면 세울 수 있어요.' }) : null));
    }
    if (n.notice) sec.append(el('p', { class: 'small', text: n.notice }));
    sec.append(
      el('p', { class: 'devp-honest', text: ui.meta?.demo?.mode==='web-single-player'?'현재 웹 체험판은 개인 저장이에요. 다른 브라우저와 국가는 공유되지 않아요.':'같은 공용 서버의 국가 구성원 가운데 성장 점수 1위가 왕이 돼요. 현대 대한민국의 제도와는 다른 역사 게임 규칙이에요.' }),
      statusLine('nation'));
    return sec;
  }

  function syncNationButton() {
    const btn = document.getElementById('devpNationBtn');
    const n = ui.state?.development?.nation;
    if (btn) btn.disabled = Boolean(ui.pending) || !n?.canForm || !NAME_RE.test(ui.nameDraft);
  }

  function details(key, label, body) {
    const d = el('details', { class: 'devp-details', open: ui.open.has(key) },
      el('summary', { text: label }), body);
    d.addEventListener('toggle', () => { if (d.open) ui.open.add(key); else ui.open.delete(key); });
    return d;
  }

  // ── 방어 문제 창 ──
  function ensureDialog() {
    if (ui.dialog) return ui.dialog;
    const d = el('dialog', { id: 'developmentDefenseDialog', class: 'dlg devp-dialog', 'aria-labelledby': 'devpDlgTitle' });
    // 버튼으로만 닫는다.
    d.addEventListener('cancel', (e) => e.preventDefault());
    document.body.append(d);
    ui.dialog = d;
    return d;
  }

  async function startDefense(raid, region) {
    const key = `raid:${raid.id}`;
    if (ui.pending) return;
    ui.pending = key;
    setStatus('defense', `${raid.name} 훈련 문제를 준비하는 중이에요…`, 'busy');
    render();
    let ch = null;
    try {
      ch = await post('/api/development/defense', { regionId: region.id, raidId: raid.id });
      setStatus('defense', '');
    } catch (e) {
      setStatus('defense', e.message, 'bad');
    } finally {
      ui.pending = null;
      render();
    }
    if (ch) showDefense(ch, raid, region);
  }

  function showDefense(ch, raid, region) {
    const d = ensureDialog();
    const q = ch.question || {};
    const loss = num(ch.risk?.grainLoss);
    const msg = el('p', { class: 'devp-status', role: 'status', 'aria-live': 'polite' });
    const choices = el('div', { class: 'quiz-choices' });
    const resultBox = el('div', {});
    const closeBtn = el('button', { type: 'button', text: '그만두기', onclick: () => d.close() });
    (q.choices || []).forEach((c, i) => {
      choices.append(el('button', { type: 'button', onclick: () => answer(i) },
        el('span', { class: 'num', text: String(i + 1) }), el('span', { text: c })));
    });

    async function answer(idx) {
      const btns = [...choices.querySelectorAll('button')];
      btns.forEach((b) => { b.disabled = true; });
      closeBtn.disabled = true;
      msg.textContent = '답을 확인하는 중이에요…';
      msg.className = 'devp-status busy';
      try {
        const r = await post('/api/answer', { challengeId: ch.challengeId, choiceIndex: idx });
        msg.textContent = '';
        msg.className = 'devp-status';
        btns[idx].classList.add(r.correct ? 'picked-ok' : 'picked-bad');
        resultBox.replaceChildren(resultView(r));
        closeBtn.textContent = '닫기';
        closeBtn.disabled = false;
        closeBtn.classList.add('primary');
        refresh();
        closeBtn.focus();
      } catch (e) {
        msg.textContent = e.message;
        msg.className = 'devp-status bad';
        btns.forEach((b) => { b.disabled = false; });
        closeBtn.disabled = false;
      }
    }

    d.replaceChildren(
      el('div', { class: 'dlg-head' },
        el('h2', { id: 'devpDlgTitle', text: `방어 훈련 · ${raid.name}` })),
      el('div', { class: 'pills' },
        el('span', { class: 'pill', text: eraName(q.era || raid.era) }),
        raid.year ? el('span', { class: 'pill', text: String(raid.year) }) : null,
        el('span', { class: 'pill', text: `${region.name} · 성곽 ${num(region.fort)}단계` }),
        el('span', { class: 'pill pending', text: '가상 훈련' })),
      el('p', { class: `devp-risk${loss === 0 ? ' safe' : ''}`, text: loss > 0 ? `오답이면 식량 ${loss}를 잃어요. 영토는 잃지 않아요.` : '오답이어도 잃는 식량이 없어요.' }),
      el('p', { class: 'quiz-q', text: q.text || '' }),
      choices, msg, resultBox,
      el('div', { class: 'actions-row devp-dlg-actions' }, closeBtn));
    if (!d.open) d.showModal();
    choices.querySelector('button')?.focus();
  }

  function resultView(r) {
    const box = el('div', { class: `result ${r.correct ? 'ok' : 'bad'}` },
      el('h3', { text: r.correct ? '막아 냈어요! 정답이에요.' : '아쉬워요, 오답이에요.' }));
    if (r.correctChoice != null) box.append(el('p', {}, el('strong', { text: '정답: ' }), String(r.correctChoice)));
    if (r.explanation) box.append(el('p', { text: r.explanation }));
    const lines = [];
    const rw = r.reward || {};
    if (rw.firstCorrect) lines.push(`처음 맞힌 문제 학습 보상: 경험치 +${num(rw.xp)} · 식량 +${num(rw.grain)} · 인구 +${num(rw.population)}`);
    else if (rw.repeat) lines.push('이미 학습 보상을 받은 문제라 이번엔 기록만 남겨요.');
    const df = r.defense;
    if (df) {
      if (df.cleared && df.reward) lines.push(`방어 보너스: 경험치 +${num(df.reward.xp)} · 식량 +${num(df.reward.grain)} · 인구 +${num(df.reward.population)}`);
      else if (df.cleared) lines.push('이 침입을 막아 낸 기록이 남았어요.');
      if (num(df.grainLost) > 0) lines.push(`훈련에서 식량 ${num(df.grainLost)}를 잃었어요. 영토는 그대로예요.`);
      else if (!r.correct) lines.push('잃은 식량은 없어요. 영토도 그대로예요.');
    }
    for (const m of r.missionsCompleted || []) lines.push(`미션 「${m.name}」 완료! 경험치 +${num(m.xp)} · 식량 +${num(m.grain)} · 인구 +${num(m.population)}`);
    if(r.upkeep) lines.push(`학습 4회 식량 정산: −${num(r.upkeep.grainLost)}`);
    if (!r.correct) lines.push('틀린 문제는 학습 기록·복습에서 다시 풀 수 있어요.');
    lines.forEach((t) => box.append(el('p', { text: t })));
    return box;
  }

  // ── 그리기 ──
  function render() {
    const dev = ui.state?.development;
    const wrap = document.getElementById('mapWrap');
    if (!ui.panel) {
      if (!wrap) return;
      ui.panel = el('section', { id: 'developmentPanel', class: 'devp', 'aria-labelledby': 'devpTitle' });
      wrap.append(ui.panel);
    }
    if (!dev) { ui.panel.hidden = true; return; }
    ui.panel.hidden = false;

    const active = document.activeElement;
    const focusKey = ui.panel.contains(active) ? active.getAttribute('data-dev-key') : null;
    const caret = focusKey === 'nation-name' ? active.selectionStart : null;

    const regions = ownedRegions(dev);
    if (!regions.some((r) => r.id === ui.regionId)) ui.regionId = regions[0]?.id ?? null;
    const region = regions.find((r) => r.id === ui.regionId) || null;
    const notice = ui.meta?.development?.notice;

    ui.panel.replaceChildren(
      el('header', { class: 'devp-head' },
        el('p', { class: 'eyebrow', text: '역사 탐험 · 발전' }),
        el('h2', { id: 'devpTitle', text: '우리 마을 키우기' }),
        el('p', { class: 'small', text: '문제로 얻은 식량으로 지역을 발전시키고, 나라를 세워 보세요. 모든 결과는 서버가 확정해요.' })),
      summary(dev),
      notice ? el('p', { class: 'small devp-notice', text: notice }) : null,
      el('div', { class: 'devp-body' },
        buildSection(dev, regions, region),
        harvestSection(dev, regions),
        defenseSection(dev, region),
        collectionSection(dev),
        nationSection(dev)));

    if (focusKey) {
      const target = ui.panel.querySelector(`[data-dev-key="${CSS.escape(focusKey)}"]`);
      if (target && !target.disabled) {
        target.focus({ preventScroll: true });
        if (caret != null && target.setSelectionRange) target.setSelectionRange(caret, caret);
      }
    }
  }

  window.HistoryDevelopment = {
    update(state, meta) {
      ui.state = state || null;
      ui.meta = meta || ui.meta;
      render();
    },
  };
})();
