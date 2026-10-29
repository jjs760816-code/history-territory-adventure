import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import worker from '../dist/server/index.js';
globalThis.WorkerGlobalScope=class {};
globalThis.self=globalThis;
class Bucket {
  data=null;etag=null;
  async get(){if(!this.data)return null;const data=this.data.slice(),etag=this.etag;return{etag,httpEtag:'"'+etag+'"',arrayBuffer:async()=>data.buffer};}
  async put(key,data,{onlyIf}){
    assert.equal(key,'classroom-v1.sqlite');
    if(onlyIf.get('If-Match')&&onlyIf.get('If-Match')!=='"'+this.etag+'"')return null;
    if(onlyIf.get('If-None-Match')==='*'&&this.etag)return null;
    this.data=new Uint8Array(data).slice();this.etag=createHash('sha256').update(this.data).digest('hex');return{etag:this.etag};
  }
}
const fixture=()=>({BUCKET:new Bucket(),AUTH_PEPPER:'timequest-test-only',ADMIN_OWNER_EMAIL:'owner@example.test'});
function client(env,extra={}){
  let cookie='';
  return{async call(path,body){
    const response=await worker.fetch(new Request('https://xn--9t4b56g.com'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'https://xn--9t4b56g.com','Content-Type':'application/json',Cookie:cookie,...extra},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
    const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
    return{status:response.status,data:await response.json()};
  }};
}
async function observe(c,id){
  const era=(await c.call('/api/timequest/world')).data.eras.find(e=>e.missions.some(m=>m.id===id)),m=era.missions.find(m=>m.id===id);
  const p=(await c.call('/api/timequest/session')).data.progress;
  assert.equal((await c.call('/api/timequest/progress',{era:era.id,x:m.x-10,y:m.y+8,revision:p.revision})).status,200);
  assert.equal((await c.call('/api/timequest/observe',{missionId:id})).status,200);
}
test('실제 잼스 Worker: 기존 계정 로그인 재사용, 신규 게임 기록 저장·분리·재접속',async()=>{
  const env=fixture(),a=client(env),b=client(env),another=client(env);
  assert.equal((await a.call('/api/auth/register',{username:'기존학생',password:'Learner82!'})).status,201);
  const before=(await a.call('/api/state')).data;
  assert.equal((await a.call('/api/timequest/session')).data.user.username,'기존학생');
  assert.equal((await a.call('/api/timequest/answer',{missionId:'stone',choice:0})).status,403);
  await observe(a,'stone');
  const replies=await Promise.all([a.call('/api/timequest/answer',{missionId:'stone',choice:0}),a.call('/api/timequest/answer',{missionId:'stone',choice:0})]);
  assert.ok(replies.every(r=>r.status===200));
  const p=(await a.call('/api/timequest/session')).data.progress;
  assert.equal(p.xp,20);assert.deepEqual(p.items,['뗀석기 카드']);
  const after=(await a.call('/api/state')).data;
  assert.equal(after.player.xp,before.player.xp);assert.deepEqual(after.cards,before.cards);
  assert.equal((await b.call('/api/timequest/login',{username:'기존학생',password:'Learner82!'})).status,200);
  assert.deepEqual((await b.call('/api/timequest/session')).data.progress,p);
  assert.equal((await a.call('/api/timequest/session')).data.user,null);
  assert.equal((await another.call('/api/timequest/register',{username:'다른학생',password:'Learner83!'})).status,201);
  assert.equal((await another.call('/api/timequest/session')).data.progress.xp,0);
  assert.equal((await b.call('/api/timequest/logout',{})).status,200);
  assert.equal((await b.call('/api/state')).status,401);
});
test('잼스 Worker: 관찰·힌트·해금·충돌·최신 저장·중복 보상 검증',async()=>{
  const env=fixture(),c=client(env);await c.call('/api/timequest/register',{username:'탐험학생',password:'Learner84!'});
  assert.equal((await c.call('/api/timequest/observe',{missionId:'stone'})).status,403);
  assert.equal((await c.call('/api/timequest/answer',{missionId:'camp',choice:1})).status,403);
  assert.equal((await c.call('/api/timequest/progress',{era:'neolithic',x:30,y:40,revision:0})).status,403);
  assert.equal((await c.call('/api/timequest/progress',{era:'paleolithic',x:50,y:20,revision:0})).status,400);
  for(const [id,choice]of[['stone',0],['camp',1],['compare',2],['pottery',1],['farm',0],['village',2]]){
    await observe(c,id);
    if(id==='stone'){assert.equal((await c.call('/api/timequest/hint',{missionId:id})).status,200);}
    assert.equal((await c.call('/api/timequest/answer',{missionId:id,choice})).status,200);
  }
  const p=(await c.call('/api/timequest/session')).data.progress;assert.equal(p.xp,110);assert.equal(p.completed.length,6);
  const duplicate=await c.call('/api/timequest/answer',{missionId:'stone',choice:0});assert.equal(duplicate.data.reward,0);
  const stale=await c.call('/api/timequest/progress',{era:'neolithic',x:20,y:70,revision:0});assert.equal(stale.status,409);assert.deepEqual(stale.data.progress,p);
});
test('잼스 Worker: 임시 비밀번호 변경 전 새 게임도 차단하고 기존 관리자 권한 유지',async()=>{
  const env=fixture(),admin=client(env,{'oai-authenticated-user-email':'owner@example.test'}),student=client(env);
  await admin.call('/api/auth/register',{username:'담임계정',password:'Teacher82!'});
  await student.call('/api/timequest/register',{username:'복구계정',password:'Before82!'});
  const reset=await admin.call('/api/admin/reset',{username:'복구계정'});
  assert.equal(reset.status,200);
  const login=await student.call('/api/timequest/login',{username:'복구계정',password:reset.data.temporaryPassword});assert.equal(login.status,403);
  assert.equal((await student.call('/api/timequest/progress',{era:'paleolithic',x:20,y:70,revision:0})).status,403);
  await student.call('/api/auth/password',{currentPassword:reset.data.temporaryPassword,newPassword:'AfterPass82!'});
  assert.equal((await student.call('/api/timequest/session')).status,200);
});
test('잼스 Worker: 홈페이지 카드·게임·모듈 제공, 타 출처·정답 코드 차단',async()=>{
  const env=fixture();
  const page=await worker.fetch(new Request('https://xn--9t4b56g.com/'),env);assert.match(await page.text(),/href="\/timequest\/"/);
  const game=await worker.fetch(new Request('https://xn--9t4b56g.com/timequest/'),env);assert.match(await game.text(),/src="\/timequest\/app.js"/);
  const runtime=await worker.fetch(new Request('https://xn--9t4b56g.com/timequest/runtime.js'),env);assert.match(await runtime.text(),/sharedAccount = true/);
  const world=(await client(env).call('/api/timequest/world')).data;assert.equal(world.eras[0].missions[0].answer,undefined);assert.equal(world.eras[0].missions[0].explanation,undefined);
  for(const headers of [{Origin:'https://evil.example','Content-Type':'application/json'},{'Content-Type':'application/json'},{Origin:'https://xn--9t4b56g.com','Content-Type':'text/plain'}]){
    const response=await worker.fetch(new Request('https://xn--9t4b56g.com/api/timequest/login',{method:'POST',headers,body:'{}'}),env);assert.ok([403,415].includes(response.status));
  }
  assert.equal((await worker.fetch(new Request('https://xn--9t4b56g.com/timequest/world.mjs'),env)).status,404);
});
