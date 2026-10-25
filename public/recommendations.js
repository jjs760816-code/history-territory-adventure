// 새 이벤트를 한꺼번에 쏟지 않고 풀이 진행에 따라 추천한다.
// 미션의 사용 가능 여부와 보상은 서버 판정이며 이 모듈은 알림 순서만 정한다.
'use strict';
(() => {
 function uniform(seed){let h=2166136261;for(const ch of seed){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return((h>>>0)+1)/4294967297;}
 function select(missions,state,seen,queued){
  const current=state.player.era, states=new Map(state.missions.map(s=>[s.id,s]));
  const fresh=m=>!seen.has(m.id)&&!queued.has(m.id)&&['active','completed'].includes(states.get(m.id)?.status);
  const stage=missions.filter(m=>m.era===current), n=state.stats.uniqueCorrect[current]||0;
  const core=stage.filter(m=>m.kind==='core'&&fresh(m)&&m.required);
  const review=missions.filter(m=>m.id==='m_review'&&fresh(m)&&state.stats.reviewPending>0);
  const announced=stage.filter(m=>!m.required&&m.id!=='m_review'&&(seen.has(m.id)||queued.has(m.id))).length;
  const allowance=Math.max(0,Math.floor(n/2)-announced);
  const pool=stage.filter(m=>!m.required&&m.id!=='m_review'&&fresh(m)&&(m.kind!=='core'||n>=2)).map(m=>({m,rank:-Math.log(uniform(`${state.player.ref}:${m.id}`))/Math.max(.01,m.recommendWeight||1)})).sort((a,b)=>a.rank-b.rank);
  return [...core,...review,...pool.slice(0,Math.min(2,allowance)).map(x=>x.m)].map(m=>m.id);
 }
 window.MissionRecommendations={select};
})();
