import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import worker from '../dist/server/index.js';
const origin='https://xn--9t4b56g.com';
const request=path=>worker.fetch(new Request(origin+path),{});
test('installed app manifest and icons are served with correct MIME types',async()=>{
 const r=await request('/manifest.webmanifest');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/application\/manifest\+json/);
 const m=await r.json();assert.equal(m.display,'standalone');assert.equal(m.start_url,'/');assert.equal(m.scope,'/');assert.equal(m.id,'/');
 for(const icon of m.icons){let r=await request(icon.src);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');let b=new Uint8Array(await r.arrayBuffer());assert.deepEqual([...b.slice(0,8)],[137,80,78,71,13,10,26,10]);}
});
test('portal and game expose Apple metadata and a root-scoped service worker',async()=>{
 for(const path of ['/','/play.html']){const s=await (await request(path)).text();assert.match(s,/rel="manifest"/);assert.match(s,/apple-touch-icon/);assert.match(s,/src="\/pwa.js"/);}
 assert.match((await request('/sw.js')).headers.get('content-type'),/javascript/);
 assert.match(await (await request('/offline.html')).text(),/인터넷이 필요해요/);
});
function serviceWorker(fetch){const handlers={},reads=[];vm.runInNewContext(sw,{self:{location:{origin},addEventListener:(type,fn)=>handlers[type]=fn},URL,Response,fetch,caches:{match:async key=>{reads.push(key);return new Response('offline page');}}});return {handlers,reads};}
const sw=await readFile(new URL('../game-source/public/sw.js',import.meta.url),'utf8');
test('offline worker leaves private APIs, writes and third-party games untouched',()=>{
 const {handlers,reads}=serviceWorker(()=>{throw Error('should not fetch')});
 for(const req of [{method:'GET',url:origin+'/api/state'},{method:'POST',url:origin+'/api/auth/login'},{method:'GET',url:'https://other.example/game'}])handlers.fetch({request:req,respondWith:()=>assert.fail('private or cross-origin request intercepted')});
 assert.equal(reads.length,0);
});
test('offline navigation has a clear fallback while successful pages always use the network',async()=>{
 let output;let state=serviceWorker(async()=>{throw Error('offline')});state.handlers.fetch({request:{method:'GET',url:origin+'/',mode:'navigate'},respondWith:p=>output=p});assert.equal(await (await output).text(),'offline page');assert.deepEqual(state.reads,['/offline.html']);
 state=serviceWorker(async()=>new Response('fresh page'));state.handlers.fetch({request:{method:'GET',url:origin+'/',mode:'navigate'},respondWith:p=>output=p});assert.equal(await (await output).text(),'fresh page');assert.equal(state.reads.length,0);
});

const installSource=await readFile(new URL('../game-source/public/pwa.js',import.meta.url),'utf8');
function installUI(userAgent='Android Chrome'){
 const element=()=>({handlers:{},hidden:false,textContent:'',innerHTML:'',open:false,setAttribute(){},addEventListener(type,fn){this.handlers[type]=fn;},showModal(){this.open=true;},close(){this.open=false;}});
 const main=element(),dialog=element(),children={},events={};
 dialog.querySelector=selector=>children[selector]||(children[selector]=element());
 vm.runInNewContext(installSource,{document:{createElement:()=>dialog,body:{append(){}},querySelectorAll:()=>[main]},location:{hostname:'xn--9t4b56g.com',search:''},navigator:{userAgent,platform:'',maxTouchPoints:0},matchMedia:()=>({matches:false}),window:{addEventListener:(name,fn)=>events[name]=fn},URLSearchParams});
 return {main,dialog,children,events};
}
test('main install button opens native install directly when the browser offers it',async()=>{
 const ui=installUI();let calls=0;
 ui.events.beforeinstallprompt({preventDefault(){},prompt:async()=>{calls++;},userChoice:Promise.resolve({outcome:'accepted'})});
 assert.equal(ui.main.textContent,'앱 설치');await ui.main.handlers.click();assert.equal(calls,1);assert.match(ui.children['.pwa-status'].textContent,/설치를 요청/);
});
test('iPhone and in-app browsers show honest manual instructions instead of a fake download',async()=>{
 const ios=installUI('iPhone Safari');assert.equal(ios.main.textContent,'설치 안내');await ios.main.handlers.click();assert.equal(ios.dialog.open,true);assert.match(ios.children['#pwa-device-guide'].innerHTML,/공유 버튼/);
 const app=installUI('Android KAKAOTALK');await app.main.handlers.click();assert.match(app.children['#pwa-device-guide'].innerHTML,/다른 브라우저/);
});
