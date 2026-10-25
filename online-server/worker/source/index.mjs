import {initAccounts,accountFor,authRoute} from './auth.mjs';
import initSqlJs from 'sql.js/dist/sql-asm.js';
import { openBrowserDb } from '../../lib/db.mjs';
import { createGame,GameError } from '../../lib/game.mjs';
import { buildMeta } from '../../lib/meta.mjs';
import assets from '../../assets/text.json';
const COOKIE='history_session';
const META=buildMeta({mode:'online-shared',badge:'학생 공동 탐험 · 서버 저장',notice:'공용 서버에서 국가와 시장을 함께 이용해요. 영토는 각 탐험대의 탐험 지도예요.',storageNotice:'기록은 공용 서버에 저장해요. 닉네임만 사용하고 실명·연락처는 적지 마세요.',judgeNotice:'서버가 정답·보상·거래·국가 순위를 확인해요.',judgeShort:'공용 서버가 확인',authRequired:true});
let sqlPromise;
const SQL=()=>sqlPromise||(sqlPromise=initSqlJs());
const json=(x,status=200,headers={})=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
function tokenOf(request){const pair=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='));return pair?.slice(COOKIE.length+1)||null;}
const cookie=token=>`${COOKIE}=${token||''}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${token?2592000:0}`;
function route(game,db,method,path,body,token){const id=game.playerIdForToken(token);const need=()=>{if(!id||!accountFor(db,id))throw new GameError(401,'no_session','아이디와 비밀번호로 로그인하세요.');if(accountFor(db,id)?.resetRequired)throw new GameError(403,'password_change_required','임시 비밀번호를 새 비밀번호로 바꿔 주세요.');return id;};
 if(method==='POST'&&path==='/api/session')throw new GameError(401,'login_required','아이디와 비밀번호로 로그인하세요.');
 if(method==='GET'&&path==='/api/state'){if(!id||!accountFor(db,id))throw new GameError(401,'login_required','아이디와 비밀번호로 로그인하세요.');return{data:{...game.state(id),account:accountFor(db,id)}};}
 if(method==='GET'&&path==='/api/history')return{data:game.history(need())};
 if(path==='/api/submissions'){if(method==='GET')return{data:{submissions:game.listSubmissions(need())}};if(method==='POST')return{data:game.submitQuestion(need(),body),status:201};}
 if(method==='GET'&&path==='/api/market')return{data:game.marketList(need())};
 const direct={'/api/answer':()=>game.answer(need(),body.challengeId,body.choiceIndex),'/api/advance':()=>game.advance(need()),'/api/review/challenge':()=>game.startReviewChallenge(need()),'/api/market':()=>game.marketPost(need(),body),'/api/market/accept':()=>game.marketAccept(need(),body),'/api/market/cancel':()=>game.marketCancel(need(),body)};
 if(method==='POST'&&Object.hasOwn(direct,path))return{data:direct[path]()};
 const dev={avatar:'avatarSave',avatarUpgrade:'avatarUpgrade',upgrade:'upgrade',harvest:'harvest',skill:'skill',nation:'formNation',join:'joinNation',defense:'startDefense',faction:'chooseFaction',collection:'startCollection'};const key=path.slice('/api/development/'.length);if(method==='POST'&&path.startsWith('/api/development/')&&Object.hasOwn(dev,key))return{data:game[dev[key]](need(),body)};
 let m=path.match(/^\/api\/regions\/([a-z0-9]{1,8})\/challenge$/);if(method==='POST'&&m)return{data:game.startRegionChallenge(need(),m[1])};m=path.match(/^\/api\/missions\/([a-z0-9_]{1,48})\/challenge$/);if(method==='POST'&&m)return{data:game.startMissionChallenge(need(),m[1])};
 throw new GameError(404,'not_found','없는 주소예요.');
}
async function api(request,env,path){if(request.method==='GET'&&path==='/api/meta')return json(META);if(request.method==='GET'&&path==='/api/auth/options')return json({isOwner:Boolean(env.ADMIN_OWNER_EMAIL&&request.headers.get('oai-authenticated-user-email')?.toLowerCase()===env.ADMIN_OWNER_EMAIL.toLowerCase())});if(request.method==='POST'&&path==='/api/logout')return json({ok:true},200,{'Set-Cookie':cookie(null)});if(!env.BUCKET)return json({message:'공용 저장소 연결을 준비하고 있어요.'},503);
 let body={};if(request.method==='POST'){const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({message:'다른 사이트에서 보낸 변경 요청이에요.'},403);const text=await request.text();if(text.length>16384)return json({message:'요청이 너무 커요.'},413);try{body=text?JSON.parse(text):{};}catch{return json({message:'요청 형식을 확인하세요.'},400);}if(!body||typeof body!=='object'||Array.isArray(body))return json({message:'요청 형식을 확인하세요.'},400);}
 // SQLite 저장 파일 자체를 영구 보관한다. 조건부 쓰기 실패 시 최신 파일로 다시 계산하여 거래 유실을 막는다.
 const sql=await SQL();for(let retry=0;retry<8;retry++){const file=await env.BUCKET.get('classroom-v1.sqlite');const bytes=file?new Uint8Array(await file.arrayBuffer()):null;const db=openBrowserDb(sql,bytes);try{const game=createGame(db);initAccounts(db);let out;try{out=path.startsWith('/api/auth/')||path.startsWith('/api/admin/')?await authRoute({db,game,path,body,method:request.method,request,env,token:tokenOf(request),cookie}):route(game,db,request.method,path,body,tokenOf(request));}catch(e){if(!(e instanceof GameError))throw e;out={data:{error:e.code,message:e.message,...(e.extra||{})},status:e.status};}
 const currentId=game.playerIdForToken(tokenOf(request));if(out.data?.state&&currentId)out.data.state.account=accountFor(db,currentId);
 if(request.method==='GET')return json(out.data,out.status||200,out.headers);
 const data=db.export();if(data.byteLength>8*1024*1024)return json({message:'시험 운영 저장 용량이 찼어요.'},503);const headers=new Headers(file?{'If-Match':file.httpEtag||'"'+file.etag+'"'}:{'If-None-Match':'*'});const put=await env.BUCKET.put('classroom-v1.sqlite',data,{onlyIf:headers,httpMetadata:{contentType:'application/vnd.sqlite3'}});if(put)return json(out.data,out.status||200,out.headers);
 }finally{db.close();}}
 return json({message:'동시 요청이 많아요. 잠시 후 다시 시도해 주세요.'},409);
}
export default {async fetch(request,env){const url=new URL(request.url),path=url.pathname;try{if(path.startsWith('/api/'))return await api(request,env,path);if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405});const key=path==='/'?'index.html':path.slice(1);if(Object.hasOwn(assets,key)){const a=assets[key];return new Response(request.method==='HEAD'?null:(a.base64?Uint8Array.from(atob(a.base64),c=>c.charCodeAt(0)):a.text),{headers:{'Content-Type':a.type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'}});}const files=['valley-background.webp','guide-haram.webp','artifact-atlas.webp','journey-portraits.webp','chapter-scenes.webp','river-dawn.wav'];if(key.startsWith('assets/')&&files.includes(key.slice(7))){const r=await fetch('https://jjs760816-code.github.io/history-territory-adventure/'+key);return new Response(r.body,{status:r.status,headers:{'Content-Type':key.endsWith('.wav')?'audio/wav':'image/webp','Cache-Control':'public,max-age=86400'}});}return new Response('Not found',{status:404});}catch(e){console.error('history server error',e?.message);return json({message:'요청을 처리하지 못했어요. 다시 시도해 주세요.'},500);}}};
