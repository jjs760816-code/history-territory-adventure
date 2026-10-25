import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('웹 체험판 fetch는 URL 객체의 그림·탐구 자료 요청을 원래 브라우저로 전달한다',async()=>{
 const calls=[],window={localStorage:{getItem(){return null;}},fetch:async(input)=>{calls.push(input);return {ok:true,kind:'asset'};}};
 const source=readFileSync(new URL('../pages/web-entry.mjs',import.meta.url),'utf8').replace(/^import .*;$/mg,'');
 const context={window,document:{baseURI:'https://example.edu/game/'},URL,Response,initSqlJs:async()=>({}),createLocalApi:()=>({handle:()=>({status:200,body:{ok:true}})}),Map};
 vm.runInNewContext(source,context);
 const url=new URL('https://example.edu/game/assets/inquiries.json');
 assert.equal((await window.fetch(url)).kind,'asset');assert.equal(calls[0],url);
 const response=await window.fetch('/api/meta');assert.deepEqual(await response.json(),{ok:true});assert.equal(calls.length,1);
});
