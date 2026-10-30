import { findPath, nearestWalkable } from './movement.js';
import { drawMap } from './map.js';
import { apiRoot, sharedAccount } from './runtime.js';
const $ = id => document.getElementById(id);
let world, user, progress, registering = false, busy = false, dirty = null;
let position = { x: 24, y: 70 }, path = [], eraId, lastTime = 0, quizMission, selectedId, audio;
let previewActive=false, accountEpoch=0;
const canvas = $('map'), ctx = canvas.getContext('2d');
$('reduce-motion').checked = matchMedia('(prefers-reduced-motion: reduce)').matches;
const message = text => { $('map-message').textContent = text; };
const status = text => { $('save-status').textContent = text; };
const currentEra = () => world.find(e => e.id === eraId);
const canEnter = id => id === 'paleolithic' || world[0].missions.every(m => progress.completed.includes(m.id));
const nextMission = () => currentEra().missions.find(m => !progress.completed.includes(m.id));
const selectedMission = () => currentEra().missions.find(m => m.id === selectedId) || nextMission() || currentEra().missions.at(-1);
const near = m => Math.hypot(position.x - m.x, position.y - m.y) <= 15;
const locked = m => !progress.completed.includes(m.id) && nextMission()?.id !== m.id;
function tone() {
  if (!$('sound').checked) return;
  audio ||= new AudioContext();
  void audio.resume().then(() => {
    for (const [i, frequency] of [523,659,784].entries()) {
      const oscillator=audio.createOscillator(), gain=audio.createGain(), at=audio.currentTime+i*.11;
      oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.045,at);gain.gain.exponentialRampToValueAtTime(.001,at+.18);
      oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(at);oscillator.stop(at+.2);
    }
  }).catch(() => {});
}
async function api(endpoint, data, root=apiRoot) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(root + endpoint, { signal:controller.signal, ...(data === undefined ? {} : { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data) }) });
    const result = await response.json();
    if (!response.ok) {
      if (result.progress) progress = result.progress;
      if (response.status===401 && !['login','register'].includes(endpoint)) {
        user=null;path=[];$('quiz').close();$('item-dialog').close();$('game').hidden=true;$('auth').hidden=false;
        $('auth-error').textContent='로그인이 만료되었어요. 다시 로그인해 주세요.';
      }
      throw Object.assign(new Error(result.message || result.error || '요청에 실패했어요.'),{status:response.status,code:result.error});
    }
    return result;
  } catch (error) {
    if (error.name==='AbortError' || error instanceof TypeError) throw new Error('서버와 연결되지 않았어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    throw error;
  } finally { clearTimeout(timer); }
}
function render() {
  if (!user) return;
  const admin=sharedAccount&&user.role==='admin';
  $('account-tools').hidden=!admin&&!previewActive;
  $('account-role').textContent=admin?'관리자 계정':'가상 학생 체험 중';
  $('preview-start').hidden=!admin;$('student-management').hidden=!admin;
  $('preview-return').hidden=!previewActive;$('preview-notice').hidden=!previewActive;
  $('preview-start').disabled=$('preview-return').disabled=busy||!!dirty||path.length>0;
  $('player-name').textContent=user.nickname;
  $('level').textContent='Lv. '+(Math.floor(progress.xp/100)+1);
  $('xp').textContent=progress.xp+' XP';$('xp-bar').value=progress.xp%100;
  $('mission-count').textContent=progress.completed.length+' / 6 미션 완료';
  const era=currentEra(), next=nextMission(), selected=selectedMission();
  $('era-label').textContent=era.name+' 시대';
  $('map-title').textContent=eraId==='paleolithic'?'바람이 머무는 야영지':'강가의 작은 마을';
  $('story-title').textContent=next ? '지금 할 일 · '+next.title : (eraId==='paleolithic'?'시간의 문이 열렸어요!':'두 시대의 이야기를 연결해 봐요');
  $('story').textContent=next ? (progress.completed.length===0?era.story+' ':'')+next.object+'에서 단서를 관찰해 보세요.' : (eraId==='paleolithic'?'새로 열린 신석기로 떠나 구석기와 다른 점을 찾아보세요.':'가방 속 카드를 눌러 오늘 발견한 역사를 되짚어 보세요.');
  $('next-action').textContent=next ? (near(next)?'단서 관찰하기 →':'다음 단서 찾아가기 →') : (eraId==='paleolithic'?'신석기로 출발 →':'탐험 카드 살펴보기 →');
  $('next-action').disabled=busy || !!dirty || path.length>0;
  $('victory').hidden=progress.completed.length!==6;
  for(const e of world) {
    const button=$(e.id);button.disabled=!canEnter(e.id)||busy||!!dirty||path.length>0;
    button.textContent=(e.id==='paleolithic'?'01 ':'02 ')+e.name+(canEnter(e.id)?'':' 🔒');
    button.setAttribute('aria-current',String(e.id===eraId));
  }
  $('quests').replaceChildren(...era.missions.map(m => {
    const li=document.createElement('li');li.textContent=m.title;
    if(progress.completed.includes(m.id)){li.className='done';li.textContent+=' · 완료';}
    else if(next?.id===m.id){li.className='current';li.textContent+=' · 지금 도전';}
    return li;
  }));
  $('destinations').replaceChildren(...era.missions.map((m,i) => {
    const button=document.createElement('button');button.textContent=(progress.completed.includes(m.id)?'✓ ':String(i+1)+'. ')+m.object;
    button.disabled=busy||!!dirty||locked(m);button.className=progress.completed.includes(m.id)?'done':(next?.id===m.id?'active':'');
    button.dataset.mission=m.id;button.onclick=()=>visit(m);return button;
  }));
  $('item-count').textContent='('+progress.items.length+')';
  $('items').replaceChildren(...(progress.items.length?progress.items:['아직 가방이 비어 있어요. 첫 단서를 찾아보세요.']).map(item => {
    const li=document.createElement('li');
    if(!progress.items.length) {li.textContent=item;return li;}
    const button=document.createElement('button');button.textContent=item;button.onclick=()=>showItem(item);li.append(button);return li;
  }));
  $('interact').textContent=progress.completed.includes(selected.id)?'발견한 카드 살펴보기':'단서 관찰하기';
  $('interact').disabled=busy||!!dirty||path.length>0||!near(selected)||locked(selected);
  $('visit-guide').disabled=busy||!!dirty; $('visit-guide').textContent=next?'다음 단서로 이동':'마지막 단서로 이동';
  $('logout').disabled=busy||path.length>0||!!dirty;
  $('retry-save').hidden=!dirty||busy;
  $('show-hint').disabled=busy;$('take-quiz').disabled=busy;$('read-clue').disabled=busy;
}
function showItem(item) {
  const mission=world.flatMap(e=>e.missions).find(m=>m.item===item);
  $('item-title').textContent=item;$('item-description').textContent=mission?.clue||'탐험하며 발견한 기록이에요.';
  $('item-dialog').showModal();
}
function enter(data) {
  previewActive=false;const epoch=++accountEpoch;
  user=data.user;progress=data.progress;eraId=progress.era;position={...progress.positions[eraId]};
  path=[];dirty=null;selectedId=nextMission()?.id;
  $('password').value='';$('auth-error').textContent='';$('auth').hidden=true;$('game').hidden=false;
  status('이전 탐험 기록을 불러왔어요');message('빛나는 단서나 ‘다음 단서 찾아가기’를 눌러 탐험을 시작해요.');render();
  if(sharedAccount&&user.role==='student')void api('auth/preview-status',undefined,'/api/').then(result=>{
    if(epoch===accountEpoch&&user){previewActive=!!result.active;render();}
  }).catch(()=>{if(epoch===accountEpoch&&user)message('체험 복귀 상태를 확인하지 못했어요. 새로고침으로 다시 확인해 주세요.');});
}
async function accountAction(endpoint){
  if(!sharedAccount||busy||dirty||path.length)return;
  busy=true;render();
  try{await api(endpoint,{},'/api/');const session=await api('session');if(!session.user)throw new Error('로그인을 다시 확인해 주세요.');enter(session);}
  catch(error){message(error.message);}
  finally{busy=false;render();}
}
$('preview-start').onclick=()=>accountAction('admin/preview-start');
$('preview-return').onclick=()=>accountAction('auth/preview-return');
async function ownerLogin(username){
  try{await api('auth/owner-session',username?{username}:{},'/api/');$('admin-picker').hidden=true;const url=new URL(location.href);url.searchParams.delete('admin-login');history.replaceState(null,'',url.pathname+url.search+url.hash);return true;}
  catch(error){
    if(error.code!=='choose_admin')throw error;
    const result=await api('auth/owner-accounts',undefined,'/api/');
    $('admin-account').replaceChildren(...result.accounts.map(account=>{const option=document.createElement('option');option.value=account.username;option.textContent=account.username;return option;}));
    $('admin-picker').hidden=false;$('auth-error').textContent='이어서 사용할 관리자 계정을 골라 주세요.';return false;
  }
}
$('admin-continue').onclick=async()=>{
  $('admin-continue').disabled=true;
  try{if(await ownerLogin($('admin-account').value))enter(await api('session'));}
  catch(error){$('auth-error').textContent=error.message;}
  finally{$('admin-continue').disabled=false;}
};
$('auth-toggle').onclick=()=>{
  registering=!registering;$('nickname-label').hidden=!registering||sharedAccount;$('nickname').required=registering&&!sharedAccount;
  $('auth-title').textContent=registering?'새로운 탐험가 등록':'이어서 탐험하기';
  $('auth-submit').textContent=registering?'탐험 시작하기 →':'모험 이어하기 →';
  $('auth-toggle').textContent=registering?'계정이 있나요? 로그인하기':'처음 왔나요? 탐험가 등록하기';
  $('password').autocomplete=registering?'new-password':'current-password';$('auth-error').textContent='';
};
$('auth-form').onsubmit=async event=>{
  event.preventDefault();$('auth-submit').disabled=true;$('auth-toggle').disabled=true;$('auth-error').textContent='';
  try {enter(await api(registering?'register':'login',{username:$('username').value,password:$('password').value,nickname:$('nickname').value}));}
  catch(error){$('auth-error').textContent=error.message;}
  finally{$('auth-submit').disabled=false;$('auth-toggle').disabled=false;}
};
async function savePosition(next) {
  busy=true;dirty=next;status('저장 중…');render();
  try {
    const result=await api('progress',{...next,revision:progress.revision});
    progress=result.progress;dirty=null;
    // Apply a successful transition here too, so a retried era change updates the map.
    if(eraId!==progress.era){eraId=progress.era;selectedId=nextMission()?.id;}
    position={...progress.positions[eraId]};status('서버에 저장됨 ✓');
    message(near(selectedMission())?'도착했어요! 단서 관찰하기 버튼을 눌러 보세요.':'도착했어요. 빛나는 단서를 찾아보세요.');
  }catch(error){status('저장되지 않음');message(error.message+' 저장 재시도 버튼을 눌러 주세요.');}
  finally{busy=false;render();}
}
$('retry-save').onclick=()=>{if(dirty&&!busy)void savePosition(dirty);};
$('logout').onclick=async()=>{
  if(busy||path.length||dirty)return;
  busy=true;render();
  try {await api('logout',{});user=null;$('game').hidden=true;$('auth').hidden=false;}
  catch(error){message(error.message);}
  finally{busy=false;render();}
};
async function changeEra(id) {
  if(busy||path.length||dirty||!canEnter(id)||eraId===id)return;
  await savePosition({era:id,...progress.positions[id]});
}
for(const id of ['paleolithic','neolithic'])$(id).onclick=()=>changeEra(id);
function moveTo(x,y) {
  if(!user||busy||dirty||$('quiz').open||$('item-dialog').open)return;
  const points=findPath(position,{x,y});
  if(!points.length){message('그곳으로 가는 길을 찾지 못했어요. 다른 바닥을 눌러 보세요.');return;}
  position=nearestWalkable(position);path=points.slice(1);
  if(!path.length)path=[points[0]];
  message('단서로 가는 중… 물과 집은 돌아서 이동해요.');render();
}
function visit(m) {
  if(locked(m)){message('먼저 빛나는 단서를 완료해 주세요.');return;}
  selectedId=m.id;moveTo(m.x-10,m.y+8);
}
canvas.addEventListener('pointerdown',event=>{
  if(!user)return;
  const bounds=canvas.getBoundingClientRect(),x=(event.clientX-bounds.left)/bounds.width*100,y=(event.clientY-bounds.top)/bounds.height*100;
  const hit=currentEra().missions.find(m=>Math.hypot((x-m.x)*bounds.width/100,(y-m.y)*bounds.height/100)<30);
  if(hit){visit(hit);return;}
  moveTo(x,y);
});
$('visit-guide').onclick=()=>visit(nextMission()||currentEra().missions.at(-1));
$('next-action').onclick=()=>{
  const next=nextMission();
  if(next){selectedId=next.id;if(near(next))void observe();else visit(next);}
  else if(eraId==='paleolithic')void changeEra('neolithic');
  else if(progress.items.length)showItem(progress.items.at(-1));
};
canvas.addEventListener('keydown',event=>{
  const dir={ArrowLeft:[-8,0],a:[-8,0],ArrowRight:[8,0],d:[8,0],ArrowUp:[0,-8],w:[0,-8],ArrowDown:[0,8],s:[0,8]}[event.key];
  if(dir){event.preventDefault();moveTo(position.x+dir[0],position.y+dir[1]);}
  if(['Enter',' '].includes(event.key)){event.preventDefault();if(!$('interact').disabled)void observe();}
});
function dialogMode(mode) {
  $('take-quiz').hidden=mode!=='clue';$('show-hint').hidden=mode!=='question';$('read-clue').hidden=mode!=='question';$('quiz-done').hidden=mode!=='reward';
  $('answers').replaceChildren();$('feedback').textContent='';$('feedback').className='';
}
function clueView() {
  dialogMode('clue');$('guide-name').textContent='관찰 기록 · '+quizMission.object;$('quiz-title').textContent=quizMission.title;$('question').textContent=quizMission.clue;
}
async function observe() {
  const m=selectedMission();
  if(busy||dirty||path.length||!near(m)||locked(m))return;
  if(progress.completed.includes(m.id)){showItem(m.item);return;}
  busy=true;status('발견한 단서 저장 중…');render();
  try {
    const result=await api('observe',{missionId:m.id});progress=result.progress;quizMission=m;
    clueView();$('quiz').showModal();status('서버에 저장됨 ✓');
  }catch(error){message(error.message);status('관찰 기록 저장 실패');}
  finally{busy=false;render();}
}
$('interact').onclick=observe;
function questionView() {
  dialogMode('question');$('guide-name').textContent=currentEra().guide+'의 질문';$('question').textContent=quizMission.question;
  $('answers').replaceChildren(...quizMission.options.map((text,index)=>{
    const button=document.createElement('button');button.textContent=(index+1)+'. '+text;button.onclick=()=>answer(index);return button;
  }));
  if(progress.hinted.includes(quizMission.id))$('feedback').textContent='힌트: '+quizMission.hint+' · 정답 보상 10 XP';
}
$('take-quiz').onclick=questionView;$('read-clue').onclick=clueView;
async function answer(choice) {
  if(busy)return;
  busy=true;status('답과 보상 저장 중…');render();const buttons=[...$('answers').children];buttons.forEach(b=>b.disabled=true);
  try {
    const result=await api('answer',{missionId:quizMission.id,choice});progress=result.progress;status('서버에 저장됨 ✓');
    if(result.correct){
      dialogMode('reward');$('guide-name').textContent='미션 완료 · '+(result.duplicate?'저장된 보상을 확인했어요':'새로운 발견!');
      $('question').textContent=result.explanation;
      $('feedback').className='reward';$('feedback').textContent='✦ '+(result.reward?'XP +'+result.reward+' · ':'')+quizMission.item+' 획득'+(canEnter('neolithic')&&eraId==='paleolithic'?' · 신석기 시대의 문이 열렸어요!':'');
      tone();$('quiz-done').focus();
    }else{
      $('feedback').textContent='괜찮아요, 단서를 다시 살펴봐요! '+result.hint+' · 다시 맞히면 10 XP와 같은 카드를 얻어요.';buttons.forEach(b=>b.disabled=false);
    }
  }catch(error){status('응답 확인 실패');$('feedback').textContent=error.message+' 같은 답을 다시 보내도 보상은 중복되지 않아요.';buttons.forEach(b=>b.disabled=false);}
  finally{busy=false;render();}
}
$('show-hint').onclick=async()=>{
  if(busy)return;busy=true;render();[...$('answers').children].forEach(b=>b.disabled=true);
  try{const result=await api('hint',{missionId:quizMission.id});progress=result.progress;$('feedback').textContent='힌트: '+result.hint+' · 정답 보상 10 XP';status('힌트 사용 기록 저장됨');}
  catch(error){$('feedback').textContent=error.message;}
  finally{busy=false;[...$('answers').children].forEach(b=>b.disabled=false);render();}
};
$('quiz-done').onclick=()=>{
  $('quiz').close();selectedId=nextMission()?.id||quizMission.id;render();
  message(nextMission()?'다음 단서가 빛나기 시작했어요! 다음 단서로 이동해 보세요.':(eraId==='paleolithic'?'신석기로 출발할 준비가 됐어요!':'모든 단서를 찾았어요. 가방 속 카드를 살펴보세요.'));
};
$('quiz').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
$('quiz').querySelector('form').onsubmit=event=>{if(busy)event.preventDefault();};
window.addEventListener('beforeunload',event=>{if(path.length||busy||dirty){event.preventDefault();event.returnValue='';}});
let welcomeDrawn=false;
if(sharedAccount){
  $('username').pattern='[a-zA-Z0-9_가-힣]{3,16}';$('username').maxLength=16;$('username').placeholder='기존 잼스 아이디 (한글·영문·숫자 3~16자)';
  $('password').minLength=8;$('password').maxLength=64;$('password').placeholder='기존 잼스 비밀번호 (8~64자)';
  $('auth-note').textContent='역사 탐험 1과 같은 잼스 계정으로 로그인해요. 처음이면 아이디를 만들 수 있어요. 타임퀘스트의 XP·카드는 별도로 보관해요.';
  $('site-account').hidden=false;$('admin-login').hidden=false;$('logout').textContent='잼스 계정 로그아웃';
}
function frame(time) {
  const delta=Math.min((time-lastTime)/1000,.05);lastTime=time;
  if(document.hidden){requestAnimationFrame(frame);return;}
  if(user){
    if(path.length&&!busy){
      if($('reduce-motion').checked){position={...path.at(-1)};path=[];void savePosition({era:eraId,...position});}
      else{
        const target=path[0],distance=Math.hypot(target.x-position.x,target.y-position.y),step=30*delta;
        if(distance<=step){position={...path.shift()};if(!path.length)void savePosition({era:eraId,...position});}
        else{position.x+=(target.x-position.x)/distance*step;position.y+=(target.y-position.y)/distance*step;}
      }
    }
    drawMap(ctx,{era:currentEra(),progress,position,path,time,reduced:$('reduce-motion').checked});
  }else if(world&&!welcomeDrawn){
    drawMap($('welcome-map').getContext('2d'),{era:world[0],progress:{completed:[]},position:{x:24,y:68},reduced:true});
    welcomeDrawn=true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
try{
  world=(await api('world')).eras;
  let chooseAdmin=false;
  if(sharedAccount&&new URL(location.href).searchParams.has('admin-login')){
    const options=await api('auth/options',undefined,'/api/');
    if(!options.isOwner)throw new Error('관리자 본인 확인이 필요해요. 아래 ChatGPT 관리자 로그인 링크로 들어가 주세요.');
    chooseAdmin=!(await ownerLogin());
  }
  const session=chooseAdmin?{user:null}:await api('session');
  if(session.user)enter(session);else $('auth').hidden=false;
  $('loading').hidden=true;
}catch(error){if(world){$('loading').hidden=true;$('auth').hidden=false;$('auth-error').textContent=error.message;}else $('loading').textContent='서버에 연결할 수 없어요. 연결을 확인하고 페이지를 새로 고쳐 주세요.';}
