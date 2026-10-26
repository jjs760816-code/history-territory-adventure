(() => {
 document.getElementById('headerLoginBtn')?.addEventListener('click',()=>{document.getElementById('startForm')?.scrollIntoView({block:'center',behavior:'smooth'});document.getElementById('nickname')?.focus({preventScroll:true});});
 const button=document.getElementById('sceneMotionToggle');
 if(!button)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let paused;try{paused=localStorage.getItem('jams-scene-paused')==='1';}catch{paused=false;}
 function sync(){
   const enabled=!paused&&!reduced.matches;
   document.documentElement.classList.toggle('scene-motion-enabled',enabled);
   button.setAttribute('aria-pressed',String(paused||reduced.matches));
   button.textContent=reduced.matches?'장면 움직임 꺼짐':paused?'장면 움직임 켜기':'장면 움직임 멈추기';
   button.disabled=reduced.matches;
   button.title=reduced.matches?'기기의 동작 줄이기 설정을 따르고 있어요.':'';
 }
 button.addEventListener('click',()=>{paused=!paused;try{localStorage.setItem('jams-scene-paused',paused?'1':'0');}catch{}sync();});
 reduced.addEventListener?.('change',sync);sync();
})();
