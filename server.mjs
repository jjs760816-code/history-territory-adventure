// 역사 영토 원정대 — 로컬 1인 시연 서버 (Node.js 내장 모듈만 사용)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './lib/db.mjs';
import { createGame, GameError } from './lib/game.mjs';
import { buildMeta } from './lib/meta.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const COOKIE = 'hta_sid';
const MAX_BODY = 16 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.png': 'image/png', '.webp': 'image/webp', '.wav': 'audio/wav', '.json': 'application/json; charset=utf-8',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

const META = buildMeta();

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    } catch { /* 깨진 쿠키 값은 무시 → 세션 없음(401) */ }
  }
  return out;
}

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': typeof body === 'string' || Buffer.isBuffer(body) ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    const ct = req.headers['content-type'] || '';
    if (!ct.toLowerCase().startsWith('application/json')) {
      reject(new GameError(415, 'json_required', 'JSON 요청만 받아요.'));
      req.resume();
      return;
    }
    let size = 0;
    const chunks = [];
    let aborted = false;
    req.on('data', (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY) {
        aborted = true;
        reject(new GameError(413, 'too_large', '요청이 너무 커요.'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      if (!size) return resolveBody({});
      let parsed;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return reject(new GameError(400, 'bad_json', 'JSON 형식이 올바르지 않아요.'));
      }
      // null, 배열, 숫자, 문자열 등은 요청 객체로 받지 않는다.
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return reject(new GameError(400, 'bad_json', 'JSON 객체로 보내 주세요.'));
      }
      resolveBody(parsed);
    });
    req.on('error', reject);
  });
}

async function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' });
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, { error: 'bad_path' }); }
  if (rel === '/') rel = '/index.html';
  if (rel.includes('\0')) return send(res, 400, { error: 'bad_path' });
  const file = resolve(PUBLIC_DIR, '.' + rel);
  if (!file.startsWith(PUBLIC_DIR + sep)) return send(res, 404, { error: 'not_found' });
  const type = MIME[extname(file).toLowerCase()];
  if (!type) return send(res, 404, { error: 'not_found' });
  try {
    const s = await stat(file);
    if (!s.isFile()) return send(res, 404, { error: 'not_found' });
    const data = await readFile(file);
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    send(res, 404, { error: 'not_found' });
  }
}

export function createApp({ dataDir = process.env.DATA_DIR || join(ROOT, 'data') } = {}) {
  const db = openDb(dataDir);
  const game = createGame(db);
  const sessionHits = new Map(); // 간단한 세션 생성 제한(IP별)

  function limitSessions(ip) {
    const t = Date.now();
    const arr = (sessionHits.get(ip) || []).filter((x) => t - x < 10 * 60 * 1000);
    if (arr.length >= 30) throw new GameError(429, 'rate_limited', '잠시 후 다시 시도하세요.');
    arr.push(t);
    sessionHits.set(ip, arr);
  }

  async function handleApi(req, res, url) {
    const path = url.pathname;
    const method = req.method;
    if (method === 'POST') {
      // 다른 사이트에서 보낸 요청 차단(SameSite=Strict 쿠키와 함께 사용)
      const origin = req.headers.origin;
      if (origin && origin !== `http://${req.headers.host}`) throw new GameError(403, 'bad_origin', '허용되지 않은 출처예요.');
    }
    const cookies = parseCookies(req.headers.cookie);
    const playerId = game.playerIdForToken(cookies[COOKIE]);
    const needPlayer = () => {
      if (!playerId) throw new GameError(401, 'no_session', '먼저 닉네임으로 시작하세요.');
      return playerId;
    };

    if (method === 'GET' && path === '/api/meta') return send(res, 200, META);

    if (method === 'POST' && path === '/api/session') {
      const body = await readJson(req);
      limitSessions(req.socket.remoteAddress || 'unknown');
      const { token } = game.createPlayer(body.nickname);
      return send(res, 201, { ok: true }, {
        'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${60 * 60 * 24 * 30}`,
      });
    }
    if (method === 'POST' && path === '/api/logout') {
      await readJson(req);
      // 쿠키만 지우지 않고 서버 세션도 무효로 한다(공용 기기에서 남은 쿠키 복사본으로 다시 들어오지 못하게).
      game.revokeSession(playerId);
      return send(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
    }
    if (method === 'GET' && path === '/api/state') return send(res, 200, game.state(needPlayer()));

    const m = path.match(/^\/api\/regions\/([a-z0-9]{1,8})\/challenge$/);
    if (method === 'POST' && m) {
      await readJson(req);
      return send(res, 200, game.startRegionChallenge(needPlayer(), m[1]));
    }
    const mm = path.match(/^\/api\/missions\/([a-z0-9_]{1,48})\/challenge$/);
    if (method === 'POST' && mm) {
      await readJson(req);
      return send(res, 200, game.startMissionChallenge(needPlayer(), mm[1]));
    }
    if (method === 'POST' && path === '/api/review/challenge') {
      await readJson(req);
      return send(res, 200, game.startReviewChallenge(needPlayer()));
    }
    if (method === 'POST' && path === '/api/answer') {
      const body = await readJson(req);
      return send(res, 200, game.answer(needPlayer(), body.challengeId, body.answerText ?? body.choiceIndex, { requestId: body.requestId }));
    }
    if(path==='/api/market'&&method==='GET')return send(res,200,game.marketList(needPlayer()));
    const marketRoutes={'/api/market':'marketPost','/api/market/accept':'marketAccept','/api/market/cancel':'marketCancel'};
    if(method==='POST'&&Object.hasOwn(marketRoutes,path))return send(res,200,game[marketRoutes[path]](needPlayer(),await readJson(req)));
    const devRoutes = {avatar:'avatarSave',avatarUpgrade:'avatarUpgrade',upgrade:'upgrade',harvest:'harvest',skill:'skill',nation:'formNation',defense:'startDefense',faction:'chooseFaction',collection:'startCollection',join:'joinNation'};
    if (method === 'POST' && path.startsWith('/api/development/')) { const key=path.slice('/api/development/'.length); if(Object.hasOwn(devRoutes,key)) return send(res,200,game[devRoutes[key]](needPlayer(),await readJson(req))); }
    if (method === 'POST' && path === '/api/advance') {
      await readJson(req);
      return send(res, 200, game.advance(needPlayer()));
    }
    if (path === '/api/submissions') {
      if (method === 'POST') {
        const body = await readJson(req);
        return send(res, 201, game.submitQuestion(needPlayer(), body));
      }
      if (method === 'GET') return send(res, 200, { submissions: game.listSubmissions(needPlayer()) });
    }
    if (method === 'GET' && path === '/api/history') return send(res, 200, game.history(needPlayer()));
    throw new GameError(404, 'not_found', '없는 주소예요.');
  }

  const server = createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, { error: 'bad_url' }); }
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else await serveStatic(req, res, url.pathname);
    } catch (e) {
      if (e instanceof GameError) {
        send(res, e.status, { error: e.code, message: e.message, ...(e.extra || {}) });
      } else {
        console.error('[server error]', e?.message);
        send(res, 500, { error: 'server_error', message: '서버 오류가 났어요.' });
      }
    }
  });

  return { server, game, db, close: () => new Promise((r) => {
    server.close(() => { db.close(); r(); });
    server.closeAllConnections();
  }) };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3000);
  const { server } = createApp();
  server.listen(port, host, () => {
    console.log(`역사 영토 원정대(로컬 시연) → http://${host}:${port}`);
  });
}
