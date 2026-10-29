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
const origin='https://xn--9t4b56g.com',env={BUCKET:new Bucket(),AUTH_PEPPER:'browser-fixture-only'};
const registered=await worker.fetch(new Request(origin+'/api/auth/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'공유학생',password:'Shared82!'})}),env);
assert.equal(registered.status,201);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
const errors=[];
async function context(viewport){
  const c=await browser.newContext({viewport,serviceWorkers:'block'});
  await c.route('**/*',async route=>{
    const r=route.request();
    if(!r.url().startsWith(origin+'/'))return route.fulfill({status:404,body:''});
    const response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:await r.allHeaders(),...(['GET','HEAD'].includes(r.method())?{}:{body:r.postData()})}),env);
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
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
  assert.deepEqual(errors,[]);
  console.log('PASS actual built site Worker in isolated browser: homepage card → /timequest/ → existing Korean ID/8-char password login → observation/quiz/reward → old game XP unchanged → logout → mobile login + reload restores progress. No live server/data used.');
}finally{await browser.close();}
