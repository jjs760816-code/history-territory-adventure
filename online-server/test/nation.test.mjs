import test from 'node:test';import assert from 'node:assert/strict';
import initSqlJs from 'sql.js/dist/sql-asm.js';import {openBrowserDb} from '../lib/db.mjs';import {createGame} from '../lib/game.mjs';
const SQL=await initSqlJs();
function fixture({xp=600,grain=60,territories=5,levels=12,era='samguk'}={}){
 const db=openBrowserDb(SQL),game=createGame(db),id=game.createPlayer('건국검증').playerId;
 db.prepare('UPDATE players SET era=?,xp=?,grain=? WHERE id=?').run(era,xp,grain,id);
 db.prepare("UPDATE player_regions SET owner='neutral' WHERE player_id=?").run(id);
 const regions=db.prepare('SELECT region_id FROM player_regions WHERE player_id=? ORDER BY region_id LIMIT ?').all(id,territories);
 for(const r of regions)db.prepare("UPDATE player_regions SET owner='player' WHERE player_id=? AND region_id=?").run(id,r.region_id);
 let left=levels;for(const r of regions){let village=Math.min(3,left);left-=village;db.prepare('INSERT INTO region_development(player_id,region_id,village) VALUES(?,?,?)').run(id,r.region_id,village);}
 return {db,game,id};
}
test('old founding thresholds and each unmet new threshold are rejected without spending or founding',()=>{
 for(const setup of [{xp:300,grain:20,territories:3,levels:6},{xp:599},{grain:59},{territories:4},{levels:11},{era:'gojoseon'}]){
  const {db,game,id}=fixture(setup);try{const before=game.state(id).player.grain;assert.equal(game.state(id).development.nation.canForm,false);assert.throws(()=>game.formNation(id,{name:'검증나라'}),e=>e.code==='nation_locked');assert.equal(game.state(id).player.grain,before);assert.equal(db.prepare('SELECT COUNT(*) n FROM guilds').get().n,0);}finally{db.close();}
 }
});
test('exact new founding boundary charges 60 once and survives storage reload',()=>{
 const {db,game,id}=fixture();assert.equal(game.state(id).development.nation.canForm,true);let result=game.formNation(id,{name:'검증나라'});assert.equal(result.state.player.grain,0);assert.equal(result.state.development.nation.foodCost,60);assert.equal(result.state.development.nation.formed,true);assert.throws(()=>game.formNation(id,{name:'다른나라'}));assert.equal(game.state(id).player.grain,0);const bytes=db.export();db.close();const restored=openBrowserDb(SQL,bytes);try{const state=createGame(restored).state(id);assert.equal(state.development.nation.name,'검증나라');assert.equal(state.development.nation.formed,true);}finally{restored.close();}
});
test('existing nations below the new criteria remain formed',()=>{const {db,game,id}=fixture({xp:300,grain:0,territories:3,levels:6});try{db.prepare('INSERT INTO nations VALUES(?,?,?)').run(id,'기존나라',1);const state=game.state(id).development.nation;assert.equal(state.formed,true);assert.equal(state.name,'기존나라');assert.equal(state.canForm,false);}finally{db.close();}});
