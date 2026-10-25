import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../public/audio.js',import.meta.url),'utf8');
function harness(){
 const events={},tracks=[],contexts=[],timers=new Set();
 class Param{value=0;setValueAtTime(v){this.value=v;}exponentialRampToValueAtTime(v){this.value=v;}setTargetAtTime(v){this.value=v;}}
 const node=()=>({gain:new Param(),frequency:new Param(),threshold:new Param(),connect(other){return other;},start(){},stop(){}});
 class Context{state='running';currentTime=0;destination={};constructor(){contexts.push(this);}createGain(){return node();}createDynamicsCompressor(){return node();}createBiquadFilter(){return node();}createOscillator(){return node();}resume(){this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}}
 class Track{plays=0;pauses=0;constructor(url){this.url=url;tracks.push(this);}play(){this.plays++;return Promise.resolve();}pause(){this.pauses++;}}
 const window={AudioContext:Context,addEventListener(n,cb){events[n]=cb;},removeEventListener(){}},document={baseURI:'https://example.edu/history-territory-adventure/',hidden:false,addEventListener(n,cb){events[n]=cb;}};
 vm.runInNewContext(code,{window,document,Audio:Track,URL,localStorage:{getItem(){return null;},setItem(){}},setTimeout(fn){timers.add(fn);return fn;},clearTimeout(fn){timers.delete(fn);},Math});
 return{audio:window.GameAudio,tracks,contexts,document,events,timers};
}
test('소리는 첫 화면에서 자동 재생되지 않고 사용자가 켠 뒤에만 파일 재생을 요청한다',()=>{
 const h=harness();assert.equal(h.audio.music,false);assert.equal(h.audio.sfx,false);assert.equal(h.contexts.length,0);assert.equal(h.tracks.length,0);
 h.audio.setMusic(true);assert.equal(h.tracks.length,1);assert.equal(h.tracks[0].plays,1);assert.equal(h.tracks[0].url,'https://example.edu/history-territory-adventure/assets/river-dawn.wav');
});
test('배경음을 끄면 즉시 정지하고 효과음 설정은 따로 유지된다',()=>{
 const h=harness();h.audio.setSfx(true);h.audio.setMusic(true);const count=h.tracks[0].pauses;h.audio.setMusic(false);assert.ok(h.tracks[0].pauses>count);assert.equal(h.audio.sfx,true);assert.equal(h.audio.music,false);assert.equal(h.timers.size,0);
});
test('다른 탭으로 가면 소리를 멈추고 사용자가 끈 음악은 복귀해도 재생하지 않는다',async()=>{
 const h=harness();h.audio.setMusic(true);h.document.hidden=true;h.events.visibilitychange();assert.equal(h.contexts[0].state,'suspended');assert.ok(h.tracks[0].pauses>=1);
 h.audio.setMusic(false);const plays=h.tracks[0].plays;h.document.hidden=false;h.events.visibilitychange();await Promise.resolve();assert.equal(h.tracks[0].plays,plays);
});
