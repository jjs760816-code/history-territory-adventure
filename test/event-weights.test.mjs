import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EVENT_SAMPLE,attachEventWeights } from '../lib/event-weights.mjs';
import { MISSIONS } from '../lib/content.mjs';

test('기출 표본 추천 가중치는 사건30·기회17을 보존하고 공식 전수조사를 주장하지 않는다',()=>{
 const ms=attachEventWeights(MISSIONS),sums={event:0,opportunity:0};
 for(const m of ms)if(m.kind in sums && EVENT_SAMPLE.byEra[m.era])sums[m.kind]+=m.recommendWeight;
 assert.ok(Math.abs(sums.event-30)<1e-8);assert.ok(Math.abs(sums.opportunity-17)<1e-8);
 assert.equal(EVENT_SAMPLE.sampleExams,1);
});

test('추천은 퀴즈 진행 중간에 늘고 이미 알린 미션과 미래 시대를 반복하지 않는다',()=>{
 const win={};vm.runInNewContext(readFileSync(new URL('../public/recommendations.js',import.meta.url),'utf8'),{window:win});
 const select=win.MissionRecommendations.select,ms=attachEventWeights(MISSIONS),state={player:{era:'samguk',ref:'sample'},stats:{uniqueCorrect:{samguk:0},reviewPending:0},missions:ms.map(m=>({id:m.id,status:m.era==='samguk'?'active':'locked'}))};
 const first=Array.from(select(ms,state,new Set(),new Set()));assert.deepEqual(first,['m_sg_found']);
 const seen=new Set(first);state.stats.uniqueCorrect.samguk=2;
 const middle=Array.from(select(ms,state,seen,new Set()));assert.equal(middle.length,1);assert.notEqual(middle[0],'m_sg_found');
 seen.add(middle[0]);assert.equal(select(ms,state,seen,new Set()).length,0);
 state.stats.uniqueCorrect.samguk=4;assert.equal(select(ms,state,seen,new Set()).length,1);
});
