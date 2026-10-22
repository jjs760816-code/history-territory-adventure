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
  return challenge.question.choices.indexOf(q.choices[q.answer]);
}
export function wrongIndex(challenge) {
  return (correctIndex(challenge) + 1) % 4;
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
