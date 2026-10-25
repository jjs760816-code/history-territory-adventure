// 역사 영토 원정대 — 절차적 WebAudio 소리(외부 음원 없음).
// 배경음: 직접 제작한 48초 합성 음원. 재생 실패 때만 오음계 합성으로 대체한다. 기존 곡·외부 샘플을 쓰지 않는다.
// 배경음·효과음은 따로 켜고 끄며 기본은 꺼짐. AudioContext 는 사용자 동작 뒤에만 만든다.
'use strict';

(function () {
  const PREF_KEY = 'hta_audio_v1';
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let musicTimer = null;
  let droneTimer = null;
  let musicTrack = null;
  let trackFailed = false;
  let unlocked = false;
  const prefs = { music: false, sfx: false };
  const listeners = new Set();

  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    prefs.music = saved.music === true;
    prefs.sfx = saved.sfx === true;
  } catch { /* 저장소를 못 쓰면 기본값(꺼짐) */ }

  function save() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* 무시 */ }
  }
  function notify() { listeners.forEach((fn) => { try { fn({ ...prefs, supported: Boolean(AC) }); } catch { /* 무시 */ } }); }

  // 사용자 동작 안에서만 호출된다.
  function ensureContext() {
    if (!AC) return false;
    try {
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.9;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        master.connect(comp).connect(ctx.destination);
        musicBus = ctx.createGain();
        musicBus.gain.value = 0.11;
        sfxBus = ctx.createGain();
        sfxBus.gain.value = 0.22;
        musicBus.connect(master);
        sfxBus.connect(master);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      unlocked = true;
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  // 뜯는 현 느낌: 삼각파 + 사인파, 저역 통과, 빠른 어택·지수 감쇠
  function pluck(bus, freq, when, { dur = 2.4, vol = 0.5, bright = 2200, type = 'triangle' } = {}) {
    if (!ctx) return;
    const t = when ?? ctx.currentTime;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(bright, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, bright * 0.25), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o1 = ctx.createOscillator();
    o1.type = type;
    o1.frequency.setValueAtTime(freq, t);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(freq * 2.003, t);
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    o1.connect(f);
    o2.connect(g2).connect(f);
    f.connect(g).connect(bus);
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  function pad(bus, freqs, when, dur, vol) {
    if (!ctx) return;
    const t = when ?? ctx.currentTime;
    for (const fr of freqs) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(fr, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(bus);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  // ── 배경음 ──
  const BASE = 196; // G3 부근
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19]; // 5음 음계(반음 단위)
  const hz = (semi) => BASE * Math.pow(2, semi / 12);
  let step = 4;

  function scheduleNote() {
    if (!ctx || !prefs.music || document.hidden) return;
    // 이웃 음으로 천천히 움직이는 무작위 걸음
    step = Math.max(0, Math.min(SCALE.length - 1, step + [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)]));
    const now = ctx.currentTime + 0.05;
    pluck(musicBus, hz(SCALE[step]), now, { dur: 3.2, vol: 0.32, bright: 1800 });
    if (Math.random() < 0.28) pluck(musicBus, hz(SCALE[Math.max(0, step - 2)]), now + 0.38, { dur: 2.6, vol: 0.2, bright: 1400 });
    musicTimer = setTimeout(scheduleNote, 1100 + Math.random() * 1500);
  }
  function scheduleDrone() {
    if (!ctx || !prefs.music || document.hidden) return;
    pad(musicBus, [hz(-12), hz(-5)], ctx.currentTime + 0.05, 9, 0.09);
    droneTimer = setTimeout(scheduleDrone, 8000);
  }
  function startMusic() {
    stopMusic();
    if (!ctx || !prefs.music || document.hidden) return;
    if (musicBus) musicBus.gain.setTargetAtTime(0.11, ctx.currentTime, 0.04);
    if (!trackFailed) {
      try {
        if (!musicTrack) {
          musicTrack = new Audio(new URL('assets/river-dawn.wav', document.baseURI).href);
          musicTrack.loop = true;
          musicTrack.preload = 'none';
          musicTrack.volume = 0.55;
        }
        musicTrack.play().catch(() => { trackFailed = true; if (prefs.music && !document.hidden) startMusic(); });
        return;
      } catch { trackFailed = true; }
    }
    // 파일을 재생할 수 없을 때만 낮은 음량의 합성 오음계로 대체한다.
    scheduleDrone();
    musicTimer = setTimeout(scheduleNote, 400);
  }
  function stopMusic() {
    clearTimeout(musicTimer); clearTimeout(droneTimer);
    musicTimer = null; droneTimer = null;
    if (musicTrack) musicTrack.pause();
    if (musicBus && ctx) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.025);
  }

  // ── 효과음 ──
  const CUES = {
    select() { pluck(sfxBus, hz(19), undefined, { dur: 0.5, vol: 0.28, bright: 3200 }); },
    correct() {
      const t = ctx.currentTime;
      pluck(sfxBus, hz(12), t, { dur: 0.9, vol: 0.4, bright: 3000 });
      pluck(sfxBus, hz(19), t + 0.12, { dur: 1.2, vol: 0.4, bright: 3200 });
    },
    wrong() {
      const t = ctx.currentTime;
      pluck(sfxBus, hz(4), t, { dur: 0.9, vol: 0.26, bright: 900, type: 'sine' });
      pluck(sfxBus, hz(0), t + 0.18, { dur: 1.1, vol: 0.22, bright: 800, type: 'sine' });
    },
    capture() {
      const t = ctx.currentTime;
      [0, 4, 7, 12, 16].forEach((s, i) => pluck(sfxBus, hz(s + 7), t + i * 0.11, { dur: 1.6, vol: 0.36, bright: 3400 }));
      pad(sfxBus, [hz(7), hz(14), hz(19)], t + 0.5, 2.2, 0.06);
    },
    era() {
      const t = ctx.currentTime;
      pad(sfxBus, [hz(-5), hz(2), hz(7), hz(14)], t, 3.6, 0.09);
      [7, 12, 14, 19, 24].forEach((s, i) => pluck(sfxBus, hz(s), t + 0.3 + i * 0.16, { dur: 2.2, vol: 0.3, bright: 3600 }));
    },
    card() {
      const t = ctx.currentTime;
      [24, 28, 31].forEach((s, i) => pluck(sfxBus, hz(s), t + i * 0.07, { dur: 0.8, vol: 0.2, bright: 5000, type: 'sine' }));
    },
  };

  function play(name) {
    if (!prefs.sfx || !ctx || !unlocked || document.hidden) return;
    try {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      CUES[name]?.();
    } catch { /* 소리 오류가 게임을 멈추지 않게 */ }
  }

  function setMusic(on) {
    prefs.music = Boolean(on);
    save();
    if (prefs.music) {
      if (ensureContext()) startMusic();
    } else stopMusic();
    notify();
  }
  function setSfx(on) {
    prefs.sfx = Boolean(on);
    save();
    if (prefs.sfx) ensureContext();
    if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(prefs.sfx ? 0.22 : 0, ctx.currentTime, 0.025);
    notify();
  }

  // 저장된 "켬" 설정은 첫 사용자 동작 때만 되살린다(자동 재생 없음).
  function onFirstGesture() {
    window.removeEventListener('pointerdown', onFirstGesture, true);
    window.removeEventListener('keydown', onFirstGesture, true);
    if (!prefs.music && !prefs.sfx) return;
    if (ensureContext() && prefs.music) startMusic();
  }
  window.addEventListener('pointerdown', onFirstGesture, true);
  window.addEventListener('keydown', onFirstGesture, true);

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) {
      stopMusic();
      ctx.suspend().catch(() => {});
    } else if (prefs.music || prefs.sfx) {
      ctx.resume().catch(() => {});
      if (prefs.music) startMusic();
    }
  });

  window.GameAudio = {
    supported: Boolean(AC),
    get music() { return prefs.music; },
    get sfx() { return prefs.sfx; },
    setMusic, setSfx, play,
    onChange(fn) { listeners.add(fn); fn({ ...prefs, supported: Boolean(AC) }); },
  };
})();
