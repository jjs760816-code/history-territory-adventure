// Built Worker + in-memory fixture only. No requests reach the live site or student DB.
const { chromium }=await import(process.env.BROWSER_DRIVER||'playwright');
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import worker from '../dist/server/index.js';
globalThis.WorkerGlobalScope=class {};
globalThis.self=globalThis;
class Bucket {
  data=null;etag=null;
  async get(){if(!this.data)return null;const data=this.data.slice(),etag=this.etag;return{etag,httpEtag:'"'+etag+'"',arrayBuffer:async()=>data.buffer};}
  async put(key,data,{onlyIf}){if(onlyIf.get('If-Match')&&onlyIf.get('If-Match')!=='"'+this.etag+'"')return null;if(onlyIf.get('If-None-Match')==='*'&&this.etag)return null;this.data=new Uint8Array(data).slice();this.etag=createHash('sha256').update(this.data).digest('hex');return{etag:this.etag};}
}
const origin='https://xn--9t4b56g.com',env={BUCKET:new Bucket(),AUTH_PEPPER:'browser-fixture-only',ADMIN_OWNER_EMAIL:'owner@example.test'};
const registered=await worker.fetch(new Request(origin+'/api/auth/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'공유학생',password:'Shared82!'})}),env);
assert.equal(registered.status,201);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
const errors=[];
async function context(viewport,owner=false){
  const c=await browser.newContext({viewport,serviceWorkers:'block',...(owner?{extraHTTPHeaders:{'oai-authenticated-user-email':'owner@example.test'}}:{})});
  await c.route('**/*',async route=>{
    const r=route.request();
    if(!r.url().startsWith(origin+'/'))return route.fulfill({status:404,body:''});
    const response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:await r.allHeaders(),...(['GET','HEAD'].includes(r.method())?{}:{body:r.postData()})}),env);
    const headers=Object.fromEntries(response.headers),cookies=response.headers.getSetCookie();if(cookies.length)headers['set-cookie']=cookies.join('\n');await route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
  });
  return c;
}
async function screenshot(page,name){if(process.env.ARTIFACT_DIR){mkdirSync(process.env.ARTIFACT_DIR,{recursive:true});await page.screenshot({path:join(process.env.ARTIFACT_DIR,name+'.png'),fullPage:true});}}
async function login(page){
  await page.locator('#auth').waitFor({state:'visible'});await page.locator('#username').fill('공유학생');await page.locator('#password').fill('Shared82!');await page.locator('#auth-submit').click();await page.locator('#game').waitFor({state:'visible'});
}
try{
  const desktop=await context({width:1440,height:1000}),page=await desktop.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/');await page.getByRole('link',{name:'시간의 문 열기'}).waitFor();await screenshot(page,'jams-home');
  await page.getByRole('link',{name:'시간의 문 열기'}).click();await page.locator('#auth').waitFor({state:'visible'});
  assert.ok((await page.locator('#auth-note').textContent()).includes('같은 잼스 계정'));await login(page);
  assert.equal(await page.locator('#player-name').textContent(),'공유학생');
  await page.locator('#reduce-motion').check();await page.locator('#visit-guide').click();await page.locator('#interact:not([disabled])').waitFor();
  await page.locator('#interact').click();await page.locator('#take-quiz').click();await page.locator('#answers button').first().click();await page.locator('#quiz-done').click();
  assert.equal(await page.locator('#xp').textContent(),'20 XP');
  const old=await page.evaluate(async()=>await(await fetch('/api/state')).json());assert.equal(old.account.username,'공유학생');assert.equal(old.player.xp,0);
  await screenshot(page,'jams-timequest');await page.locator('#logout').click();await page.locator('#auth').waitFor({state:'visible'});
  const mobile=await context({width:390,height:844}),phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto(origin+'/timequest/');await login(phone);assert.equal(await phone.locator('#xp').textContent(),'20 XP');
  assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await screenshot(phone,'jams-timequest-mobile');
  await phone.reload();await phone.locator('#game').waitFor({state:'visible'});assert.equal(await phone.locator('#xp').textContent(),'20 XP');
  assert.equal(await phone.locator('#preview-start').isVisible(),false);
  assert.equal(await phone.locator('#preview-return').isVisible(),false);
  const ownerContext=await context({width:1280,height:900},true),admin=await ownerContext.newPage();admin.on('pageerror',e=>errors.push(e.message));
  await admin.goto(origin+'/timequest/?admin-login=1');await admin.locator('#preview-start').waitFor({state:'visible'});
  assert.equal(new URL(admin.url()).searchParams.has('admin-login'),false);
  const original=await admin.evaluate(async()=>await(await fetch('/api/timequest/session')).json());assert.equal(original.user.role,'admin');
  await admin.locator('#preview-start').click();await admin.locator('#preview-return').waitFor({state:'visible'});
  assert.equal(await admin.locator('#preview-start').isVisible(),false);assert.equal(await admin.locator('#xp').textContent(),'0 XP');
  const virtual=await admin.evaluate(async()=>await(await fetch('/api/timequest/session')).json());assert.equal(virtual.user.role,'student');assert.notEqual(virtual.user.id,original.user.id);
  await admin.locator('#reduce-motion').check();await admin.locator('#visit-guide').click();await admin.locator('#interact:not([disabled])').waitFor();
  await admin.locator('#interact').click();await admin.locator('#take-quiz').click();await admin.locator('#answers button').first().click();await admin.locator('#quiz-done').click();
  assert.equal(await admin.locator('#xp').textContent(),'20 XP');await screenshot(admin,'admin-virtual-student');
  await admin.reload();await admin.locator('#preview-return').waitFor({state:'visible'});assert.equal(await admin.locator('#xp').textContent(),'20 XP');
  await admin.locator('#preview-return').click();await admin.locator('#preview-start').waitFor({state:'visible'});
  const returned=await admin.evaluate(async()=>await(await fetch('/api/timequest/session')).json());assert.equal(returned.user.id,original.user.id);assert.equal(returned.progress.xp,0);
  await admin.locator('#preview-start').click();await admin.locator('#preview-return').waitFor({state:'visible'});assert.equal(await admin.locator('#xp').textContent(),'20 XP');
  const student=await phone.evaluate(async()=>await(await fetch('/api/timequest/session')).json());assert.equal(student.user.username,'공유학생');assert.equal(student.progress.xp,20);
  await admin.locator('#logout').click();await admin.locator('#auth').waitFor({state:'visible'});
  const back=await admin.evaluate(async()=>{const r=await fetch('/api/auth/preview-return',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return r.status;});assert.equal(back,403);
  await admin.goto(origin+'/timequest/?admin-login=1');await admin.locator('#preview-start').waitFor({state:'visible'});await screenshot(admin,'admin-account');
  const extra=await worker.fetch(new Request(origin+'/api/auth/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','oai-authenticated-user-email':'owner@example.test'},body:JSON.stringify({username:'두번째관리자',password:'Second82!'})}),env);assert.equal(extra.status,201);
  const chooser=await(await context({width:1280,height:900},true)).newPage();chooser.on('pageerror',e=>errors.push(e.message));
  await chooser.goto(origin+'/timequest/?admin-login=1');await chooser.locator('#admin-picker').waitFor({state:'visible'});assert.equal(await chooser.locator('#game').isVisible(),false);
  await chooser.locator('#admin-account').selectOption('두번째관리자');await chooser.locator('#admin-continue').click();await chooser.locator('#preview-start').waitFor({state:'visible'});
  assert.equal((await chooser.evaluate(async()=>await(await fetch('/api/timequest/session')).json())).user.username,'두번째관리자');
  assert.deepEqual(errors,[]);
  console.log('PASS actual built site Worker in isolated browser: homepage card → /timequest/ → existing Korean ID/8-char password login → observation/quiz/reward → old game XP unchanged → logout → mobile login + reload restores progress. Admin owner login, virtual student play/reload/return/re-entry, record isolation, logout revocation and multi-admin selection also passed. No live server/data used.');
}finally{await browser.close();}
