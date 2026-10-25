// 공용 서버판 전용: 거래 등록 시 맡기기(에스크로), 수락/취소를 한 트랜잭션으로 처리한다.
import { randomUUID } from 'node:crypto';
import { CARDS } from './content.mjs';
export function createMarket(db,{fail,now}) {
 const kinds=['grain','knowledge','card'];
 function item(kind,id,amount){if(!kinds.includes(kind)||!Number.isInteger(amount)||amount<1||amount>1000)fail(400,'bad_trade','거래 품목과 수량을 확인하세요.');if(kind==='card'&&(amount!==1||!CARDS.some(c=>c.id===id)))fail(400,'bad_card','카드는 1장씩 교환해요.');return{kind,id:kind==='card'?id:null,amount};}
 const balance=(p,k)=>k==='grain'?db.prepare('SELECT grain n FROM players WHERE id=?').get(p).n:db.prepare('SELECT knowledge n FROM player_skills WHERE player_id=?').get(p)?.n||0;
 function hasCard(p,id){return !!db.prepare('SELECT 1 FROM player_cards WHERE player_id=? AND card_id=?').get(p,id)||!!db.prepare("SELECT 1 FROM market_offers WHERE seller=? AND give_kind='card' AND give_id=? AND status='open'").get(p,id);}
 function checkReceive(p,x){if(x.kind==='card'&&hasCard(p,x.id))fail(409,'duplicate_card','이미 갖고 있거나 거래소에 맡긴 카드예요.');}
 function take(p,x){if(x.kind==='card'){const r=db.prepare('DELETE FROM player_cards WHERE player_id=? AND card_id=?').run(p,x.id);if(!r.changes)fail(400,'not_owned_card','보유한 카드만 교환할 수 있어요.');}else{if(balance(p,x.kind)<x.amount)fail(400,'insufficient_trade','거래할 자원이 부족해요.');if(x.kind==='grain')db.prepare('UPDATE players SET grain=grain-? WHERE id=?').run(x.amount,p);else db.prepare('UPDATE player_skills SET knowledge=knowledge-? WHERE player_id=?').run(x.amount,p);}}
 function give(p,x){if(x.kind==='card'){db.prepare('INSERT INTO player_cards VALUES(?,?,?)').run(p,x.id,now());db.prepare('INSERT OR IGNORE INTO card_grants VALUES(?,?)').run(p,x.id);}else if(x.kind==='grain')db.prepare('UPDATE players SET grain=grain+? WHERE id=?').run(x.amount,p);else{db.prepare('INSERT OR IGNORE INTO player_skills(player_id) VALUES(?)').run(p);db.prepare('UPDATE player_skills SET knowledge=knowledge+? WHERE player_id=?').run(x.amount,p);}}
 const pair=r=>({give:{kind:r.give_kind,id:r.give_id,amount:r.give_amount},want:{kind:r.want_kind,id:r.want_id,amount:r.want_amount}});
 return {
 list(p){return {enabled:true,notice:'같은 공용 서버에 접속한 탐험대끼리 거래해요. 실물·현금 거래가 아니에요. 기술 교류는 연구 시설에서 얻는 지식 점수예요.',offers:db.prepare("SELECT o.*,p.nickname FROM market_offers o JOIN players p ON p.id=o.seller WHERE o.status='open' ORDER BY o.created_at DESC LIMIT 100").all().map(r=>({id:r.id,seller:r.nickname,mine:r.seller===p,...pair(r)}))};},
 post(p,b){const a=item(b.giveKind,b.giveId,b.giveAmount),z=item(b.wantKind,b.wantId,b.wantAmount);if(a.kind===z.kind&&a.id===z.id)fail(400,'same_trade','서로 다른 품목을 골라 주세요.');if(db.prepare("SELECT COUNT(*) n FROM market_offers WHERE seller=? AND status='open'").get(p).n>=5)fail(400,'market_limit','동시에 5개까지 등록해요.');checkReceive(p,z);take(p,a);const id=randomUUID();db.prepare('INSERT INTO market_offers VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,p,a.kind,a.id,a.amount,z.kind,z.id,z.amount,'open',now());return{id};},
 accept(p,{offerId}){const r=db.prepare("SELECT * FROM market_offers WHERE id=? AND status='open'").get(offerId);if(!r)fail(409,'offer_closed','이미 끝났거나 없는 거래예요.');if(r.seller===p)fail(400,'self_trade','자기 거래는 수락할 수 없어요.');const {give:a,want:z}=pair(r);checkReceive(p,a);checkReceive(r.seller,z);take(p,z);db.prepare("UPDATE market_offers SET status='accepted' WHERE id=? AND status='open'").run(r.id);give(p,a);give(r.seller,z);return{ok:true};},
 cancel(p,{offerId}){const r=db.prepare("SELECT * FROM market_offers WHERE id=? AND seller=? AND status='open'").get(offerId,p);if(!r)fail(409,'offer_closed','취소할 거래가 없어요.');db.prepare("UPDATE market_offers SET status='cancelled' WHERE id=?").run(r.id);give(p,pair(r).give);return{ok:true};}
 };
}
