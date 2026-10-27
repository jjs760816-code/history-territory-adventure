// 웹 체험판의 "브라우저 안 서버". server.mjs 의 /api 라우팅을 같은 게임 규칙(lib/game.mjs)으로 처리하고,
// 저장소는 이 브라우저의 localStorage 에 SQLite 파일 그대로 보관한다.
import { openBrowserDb } from './db.mjs';
import { createGame, GameError } from './game.mjs';
import { buildMeta } from './meta.mjs';

const DB_KEY = 'hta_web_db_v1';
const TOKEN_KEY = 'hta_web_token';
const MAX_BODY = 16 * 1024;

export const WEB_DEMO = {
  mode: 'web-single-player',
  badge: '웹 1인 체험판 · 온라인 경쟁 미구현',
  notice: '웹 1인 체험판입니다. 방 기반 온라인 경쟁·실시간 동기화는 아직 구현되지 않았어요.',
  storageNotice: '기록은 이 브라우저에만 저장돼요(다른 기기·브라우저와 공유되지 않음). 학생 실명·연락처는 받지 않아요.',
  judgeNotice: '체험판은 정답 판정을 이 브라우저 안에서 해요. 수업용 정식 판정은 로컬 서버판(npm start)을 쓰세요.',
  judgeShort: '이 브라우저에서 확인',
};

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(text) {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function parseBody(text) {
  if (text == null || text === '') return {};
  if (text.length > MAX_BODY) throw new GameError(413, 'too_large', '요청이 너무 커요.');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new GameError(400, 'bad_json', 'JSON 형식이 올바르지 않아요.'); }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new GameError(400, 'bad_json', 'JSON 객체로 보내 주세요.');
  }
  return parsed;
}

export function createLocalApi({ SQL, storage, now }) {
  let bytes = null;
  try {
    const saved = storage.getItem(DB_KEY);
    if (saved) bytes = fromBase64(saved);
  } catch { bytes = null; }
  let db;
  try { db = openBrowserDb(SQL, bytes); } catch { db = openBrowserDb(SQL, null); } // 깨진 저장본은 새로 시작
  const game = createGame(db, now ? { now } : {});
  const META = buildMeta(WEB_DEMO);

  const save = () => {
    try { storage.setItem(DB_KEY, toBase64(db.export())); } catch { /* 저장 공간 부족·사생활 보호 모드: 이번 탭에서만 유지 */ }
  };
  const getToken = () => { try { return storage.getItem(TOKEN_KEY); } catch { return null; } };
  const setToken = (t) => { try { if (t) storage.setItem(TOKEN_KEY, t); else storage.removeItem(TOKEN_KEY); } catch { /* 무시 */ } };

  function route(method, path, bodyText) {
    const playerId = game.playerIdForToken(getToken());
    const needPlayer = () => {
      if (!playerId) throw new GameError(401, 'no_session', '먼저 닉네임으로 시작하세요.');
      return playerId;
    };
    const body = method === 'POST' ? parseBody(bodyText) : {};

    if (method === 'GET' && path === '/api/meta') return [200, META];
    if (method === 'POST' && path === '/api/session') {
      const { token } = game.createPlayer(body.nickname);
      setToken(token);
      return [201, { ok: true }];
    }
    if (method === 'POST' && path === '/api/logout') { setToken(null); return [200, { ok: true }]; }
    if (method === 'GET' && path === '/api/state') return [200, game.state(needPlayer())];
    const m = path.match(/^\/api\/regions\/([a-z0-9]{1,8})\/challenge$/);
    if (method === 'POST' && m) return [200, game.startRegionChallenge(needPlayer(), m[1])];
    const mm = path.match(/^\/api\/missions\/([a-z0-9_]{1,48})\/challenge$/);
    if (method === 'POST' && mm) return [200, game.startMissionChallenge(needPlayer(), mm[1])];
    if (method === 'POST' && path === '/api/review/challenge') return [200, game.startReviewChallenge(needPlayer())];
    if (method === 'POST' && path === '/api/answer') return [200, game.answer(needPlayer(), body.challengeId, body.answerText ?? body.choiceIndex, { requestId: body.requestId })];
    if(path.startsWith('/api/market'))throw new GameError(409,'shared_server_required','유저 간 시장은 공용 서버 연결 후 이용할 수 있어요. 현재 웹판은 브라우저마다 별도 저장해요.');
    const devRoutes = {avatar:'avatarSave',avatarUpgrade:'avatarUpgrade',upgrade:'upgrade',harvest:'harvest',skill:'skill',nation:'formNation',defense:'startDefense',faction:'chooseFaction',collection:'startCollection',join:'joinNation'};
    if (method === 'POST' && path.startsWith('/api/development/')) { const key=path.slice('/api/development/'.length); if(Object.hasOwn(devRoutes,key)) return [200, game[devRoutes[key]](needPlayer(),body)]; }
    if (method === 'POST' && path === '/api/advance') return [200, game.advance(needPlayer())];
    if (path === '/api/submissions') {
      if (method === 'POST') return [201, game.submitQuestion(needPlayer(), body)];
      if (method === 'GET') return [200, { submissions: game.listSubmissions(needPlayer()) }];
    }
    if (method === 'GET' && path === '/api/history') return [200, game.history(needPlayer())];
    throw new GameError(404, 'not_found', '없는 주소예요.');
  }

  return {
    game,
    // { status, body } 를 돌려준다. 바뀐 내용은 요청마다 저장한다.
    handle(method, path, bodyText) {
      try {
        const [status, data] = route(method, path, bodyText);
        if (method !== 'GET') save();
        return { status, body: data };
      } catch (e) {
        if (method !== 'GET') save(); // 만료된 도전 삭제 등 오류와 함께 확정된 변경도 저장
        if (e instanceof GameError) return { status: e.status, body: { error: e.code, message: e.message, ...(e.extra || {}) } };
        console.error('[web demo error]', e);
        return { status: 500, body: { error: 'server_error', message: '오류가 났어요. 새로고침해 보세요.' } };
      }
    },
  };
}
