// 같은 가상 안내인과 함께 시대별 생활을 체험한다. 복식은 학습용 상상 삽화다.
'use strict';
(() => {
 const ids=['paleolithic','neolithic','gojoseon','samguk','nambuk','goryeo','joseon','modern','republic'];
 const roles=['사냥과 채집의 길잡이','강가 마을의 토기 장인','청동기 마을의 탐험가','삼국의 길을 잇는 여행자','남북국의 문화를 잇는 여행자','고려의 공예와 교류 탐험가','조선의 글과 과학 탐험가','독립의 발자국을 찾는 학생','오늘의 역사 탐험가'];
 window.HistoryJourney={update(era){
  const i=Math.max(0,ids.indexOf(era));
  const guide=document.querySelector('.guide-card img, .guide-portrait');
  if(guide){
   let portrait=guide;
   if(guide.tagName==='IMG'){portrait=document.createElement('div');portrait.className='guide-portrait';portrait.setAttribute('role','img');guide.replaceWith(portrait);}
   portrait.style.backgroundPosition=`${(i%3)*50}% ${Math.floor(i/3)*50}%`;
   portrait.setAttribute('aria-label',`하람 · ${roles[i]} · 시대 복식을 상상한 게임 삽화`);
   portrait.title='시대 복식을 상상한 게임 삽화이며 정확한 복원도가 아니에요.';
  }
  let ribbon=document.getElementById('journeyRibbon');
  const strip=document.querySelector('.chapter-strip');
  if(strip){
   if(i>=3){const scene=i-3;strip.dataset.scene=String(scene);strip.style.setProperty('--scene-x',`${(scene%2)*100}%`);strip.style.setProperty('--scene-y',`${Math.floor(scene/2)*50}%`);}
   else delete strip.dataset.scene;
  }
  if(strip&&!ribbon){ribbon=document.createElement('p');ribbon.id='journeyRibbon';ribbon.className='journey-ribbon';strip.after(ribbon);}
  if(ribbon)ribbon.textContent=`시간여행 ${i+1} / ${ids.length} · ${roles[i]} — 캐릭터와 함께 생활의 변화를 체험해요`;
 }};
})();
