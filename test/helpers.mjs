import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';
import { QUESTIONS } from '../lib/questions.mjs';

export function tempDir() {
  return mkdtempSync(join(tmpdir(), 'hta-test-'));
}
export function removeDir(d) {
  rmSync(d, { recursive: true, force: true });
}

export async function startApp(dataDir) {
  const app = createApp({ dataDir });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const { port } = app.server.address();
  app.base = `http://127.0.0.1:${port}`;
  return app;
}

// 쿠키를 기억하는 간단한 클라이언트
export function client(base) {
  let cookie = '';
  async function req(path, { method = 'GET', body, headers = {}, raw } = {}) {
    const h = { ...headers };
    if (cookie) h.cookie = cookie;
    let payload;
    if (raw !== undefined) payload = raw;
    else if (method !== 'GET') { h['content-type'] = h['content-type'] || 'application/json'; payload = JSON.stringify(body || {}); }
    const res = await fetch(base + path, { method, headers: h, body: payload });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 정적 파일 등 */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  return {
    req,
    get cookie() { return cookie; },
    set cookie(v) { cookie = v; },
    post: (p, body) => req(p, { method: 'POST', body }),
    get: (p) => req(p),
  };
}

// 테스트에서만 정답을 찾는다(서버 모듈을 직접 읽음).
export function correctIndex(challenge) {
  const q = QUESTIONS.find((x) => x.question === challenge.question.text);
  if (!q) throw new Error('문제를 찾지 못함');
  return q.type === 'short' ? q.acceptedAnswers[0] : challenge.question.choices.indexOf(q.choices[q.answer]);
}
export function wrongIndex(challenge) {
  return challenge.question.type === 'short' ? '다른답' : (correctIndex(challenge) + 1) % challenge.question.choices.length;
}

export async function newPlayer(base, nickname = '탐험가') {
  const c = client(base);
  const r = await c.post('/api/session', { nickname });
  if (r.status !== 201) throw new Error(`session ${r.status} ${r.text}`);
  return c;
}

export async function answerRegion(c, regionId, { correct = true } = {}) {
  const ch = await c.post(`/api/regions/${regionId}/challenge`);
  if (ch.status !== 200) return ch;
  const idx = correct ? correctIndex(ch.json) : wrongIndex(ch.json);
  const r = await c.post('/api/answer', { challengeId: ch.json.challengeId, choiceIndex: idx });
  r.challenge = ch.json;
  return r;
}

import {openDb} from '../lib/db.mjs';
import {createGame} from '../lib/game.mjs';
import {QUESTION_BY_ID} from '../lib/questions.mjs';
export function fixture({ nickname = '검증하기', clock } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'progression-'));
  const db = openDb(dir);
  let t = 1_700_000_000_000;
  const now = clock || (() => (t += 1000));
  const game = createGame(db, { now });
  const id = nickname ? game.createPlayer(nickname).playerId : null;
  const close = () => { db.close(); rmSync(dir, { recursive: true, force: true }); };
  return { db, game, id, dir, now, close };
}

export function questionOf(db, challengeId) {
  const row = db.prepare('SELECT question_id, choice_order FROM challenges WHERE id = ?').get(challengeId);
  return { q: QUESTION_BY_ID.get(row.question_id), order: JSON.parse(row.choice_order) };
}
export function answer(db, game, id, ch, correct = true) {
  const { q, order } = questionOf(db, ch.challengeId);
  if(q.type === 'short') return game.answer(id,ch.challengeId,correct?q.acceptedAnswers[0]:'다른답');
  const right = order.indexOf(q.answer);
  return game.answer(id, ch.challengeId, correct ? right : (right + 1) % order.length);
}
