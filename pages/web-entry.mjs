// 웹 체험판 시작점. app.js 의 /api 요청을 브라우저 안의 local-api 로 돌린다(app.js 는 수정 없이 그대로 쓴다).
import { createLocalApi } from './lib/local-api.mjs';

const ready = (async () => {
  const SQL = await globalThis.initSqlJs({ locateFile: (f) => new URL(`vendor/${f}`, document.baseURI).href });
  let storage;
  try { storage = window.localStorage; storage.getItem('probe'); } catch {
    const mem = new Map(); // 저장소를 못 쓰면 이번 탭에서만 기억
    storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  }
  return createLocalApi({ SQL, storage });
})();

const realFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const path = typeof input === 'string' ? input : input.url;
  if (!path.startsWith('/api/')) return realFetch(input, init);
  const api = await ready;
  const { status, body } = api.handle((init.method || 'GET').toUpperCase(), path, init.body);
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
