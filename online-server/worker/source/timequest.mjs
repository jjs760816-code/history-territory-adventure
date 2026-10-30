import { eras, publicWorld, initialProgress, unlocked } from '../../timequest/world.mjs';
import { walkable, nearestWalkable } from '../../timequest/public/movement.js';
import { GameError } from '../../lib/game.mjs';
import { accountFor, authRoute } from './auth.mjs';

export { publicWorld };
const reject=(status,code,message)=>{throw new GameError(status,code,message);};
export async function timequestRoute({db,game,path,body,method,request,env,token,cookie}) {
  const action=path.slice('/api/timequest/'.length);
  db.exec('CREATE TABLE IF NOT EXISTS timequest_progress(player_id TEXT PRIMARY KEY REFERENCES players(id),data TEXT NOT NULL)');
  const read=id=>{
    const row=db.prepare('SELECT data FROM timequest_progress WHERE player_id=?').get(id);
    const p=row?JSON.parse(row.data):initialProgress();
    p.observed??=[...p.completed];p.hinted??=[];
    for(const [era,pos] of Object.entries(p.positions))if(!walkable(pos.x,pos.y))p.positions[era]=nearestWalkable(pos);
    return p;
  };
  const save=(id,p)=>{
    p.revision++;
    db.prepare('INSERT INTO timequest_progress(player_id,data) VALUES(?,?) ON CONFLICT(player_id) DO UPDATE SET data=excluded.data').run(id,JSON.stringify(p));
    return p;
  };
  const user=id=>({id,username:accountFor(db,id).username,role:accountFor(db,id).role,nickname:db.prepare('SELECT nickname FROM players WHERE id=?').get(id).nickname});
  if(method==='POST'&&['login','register'].includes(action)){
    const out=await authRoute({db,game,path:'/api/auth/'+action,body,method,request,env,token,cookie});
    const newToken=out.headers['Set-Cookie'].split(';')[0].slice('history_session='.length);
    const id=game.playerIdForToken(newToken);
    if(accountFor(db,id).resetRequired)return{status:403,headers:out.headers,data:{message:'역사 탐험 1의 계정 관리에서 임시 비밀번호를 먼저 바꿔 주세요.'}};
    return{...out,data:{user:user(id),progress:read(id)}};
  }
  const id=game.playerIdForToken(token),account=id&&accountFor(db,id);
  if(method==='GET'&&action==='session'){
    if(!account)return{data:{user:null}};
    if(account.resetRequired)reject(403,'password_change_required','역사 탐험 1의 계정 관리에서 임시 비밀번호를 먼저 바꿔 주세요.');
    return{data:{user:user(id),progress:read(id)}};
  }
  if(!account)reject(401,'no_session','잼스 아이디와 비밀번호로 로그인해 주세요.');
  if(method!=='POST')reject(404,'not_found','없는 주소예요.');
  if(action==='logout'){
    game.revokeSession(id);
    return{data:{ok:true},headers:{'Set-Cookie':[cookie(null),'history_admin_preview=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0']}};
  }
  if(account.resetRequired)reject(403,'password_change_required','역사 탐험 1의 계정 관리에서 임시 비밀번호를 먼저 바꿔 주세요.');
  const p=read(id);
  if(action==='progress'){
    if(body.revision!==p.revision)return{status:409,data:{message:'다른 탭의 최신 기록을 불러왔어요. 다시 이동해 주세요.',progress:p}};
    if(!unlocked(p,body.era))reject(403,'era_locked','앞선 시대의 미션을 먼저 완료해 주세요.');
    if(!walkable(body.x,body.y))reject(400,'bad_position','물이나 집 안으로 이동할 수 없어요.');
    p.era=body.era;p.positions[body.era]={x:body.x,y:body.y};return{data:{progress:save(id,p)}};
  }
  if(!['observe','hint','answer'].includes(action))reject(404,'not_found','없는 주소예요.');
  const era=eras.find(e=>e.missions.some(m=>m.id===body.missionId)),m=era?.missions.find(m=>m.id===body.missionId);
  if(!m)reject(400,'bad_mission','미션을 확인해 주세요.');
  if(action==='answer'&&(!Number.isInteger(body.choice)||body.choice<0||body.choice>=m.options.length))reject(400,'bad_answer','답을 확인해 주세요.');
  if(p.completed.includes(m.id))return{data:{correct:true,duplicate:true,reward:0,explanation:m.explanation,progress:p}};
  if(!unlocked(p,era.id)||era.missions.find(m=>!p.completed.includes(m.id)).id!==m.id)reject(403,'mission_locked','앞선 미션을 먼저 완료해 주세요.');
  if(action==='observe'){
    const at=p.positions[era.id];
    if(p.era!==era.id||Math.hypot(at.x-m.x,at.y-m.y)>15)reject(403,'too_far','단서 가까이 이동한 뒤 관찰해 주세요.');
    if(!p.observed.includes(m.id)){p.observed.push(m.id);save(id,p);}return{data:{progress:p}};
  }
  if(!p.observed.includes(m.id))reject(403,'observe_first','지도에서 단서를 먼저 관찰해 주세요.');
  if(action==='hint'||body.choice!==m.answer){
    if(!p.hinted.includes(m.id)){p.hinted.push(m.id);save(id,p);}return{data:{correct:false,hint:m.hint,progress:p}};
  }
  const reward=p.hinted.includes(m.id)?10:20;p.completed.push(m.id);p.xp+=reward;p.items.push(m.item);
  return{data:{correct:true,reward,explanation:m.explanation,progress:save(id,p)}};
}
