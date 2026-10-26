// Independent reviewer regressions and a complete progression/persistence journey.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../lib/db.mjs';
import { createGame, validateNickname, validateSubmission } from '../lib/game.mjs';
import { QUESTIONS } from '../lib/questions.mjs';
import { createApp } from '../server.mjs';

const draft = { era:'paleolithic', question:'구석기 사람들이 사용한 대표적인 도구는 무엇일까요?', choices:['주먹도끼','기와','동검','백자'], answerIndex:0, explanation:'돌을 깨뜨려 만든 주먹도끼를 사용했어요.', source:'검토를 위한 자체 제작 문제' };

test('review: inherited object names are not valid historical eras', () => {
  for (const era of ['toString','constructor','__proto__','hasOwnProperty']) {
    assert.equal(validateSubmission({...draft,era}).ok,false,era);
  }
});

test('review: phone numbers must not be accepted as student nicknames', () => {
  assert.throws(() => validateNickname('01012345678'), e => e.status === 400);
});

test('review: malformed JSON values and cookies never become server errors', async () => {
  const dir=mkdtempSync(join(tmpdir(),'hta-input-review-'));
  const app=createApp({dataDir:dir});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  try {
    const session=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:'입력검토자'})});
    const cookie=session.headers.get('set-cookie').split(';')[0];
    for (const path of ['/api/session','/api/answer']) {
      for (const body of ['null','[]','42','"text"']) {
        const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body});
        assert.equal(r.status,400,`${path} with ${body}`);
      }
    }
    const badCookie=await fetch(base+'/api/state',{headers:{Cookie:'hta_sid=%ZZ'}});
    assert.ok([400,401].includes(badCookie.status));
  } finally {await app.close();rmSync(dir,{recursive:true,force:true});}
});

test('review: actual questions unlock both eras and survive database reopen', () => {
  const dir=mkdtempSync(join(tmpdir(),'hta-journey-review-'));
  let db=openDb(dir);
  try {
    let game=createGame(db);
    const {playerId,token}=game.createPlayer('시대탐험가');
    assert.throws(()=>game.advance(playerId),e=>e.code==='advance_locked');
    const correctAnswer=ch=>{
      const q=QUESTIONS.find(q=>q.question===ch.question.text);
      assert.ok(q);
      return q.type==='short'?q.acceptedAnswers[0]:ch.question.choices.indexOf(q.choices[q.answer]);
    };
    const wrong=game.startRegionChallenge(playerId,'r05');
    const wrongResult=game.answer(playerId,wrong.challengeId,wrong.question.type==='short'?'다른답':(correctAnswer(wrong)+1)%wrong.question.choices.length);
    assert.equal(wrongResult.correct,false);
    assert.equal(wrongResult.state.player.xp,0);
    const review=game.startReviewChallenge(playerId);
    assert.equal(game.answer(playerId,review.challengeId,correctAnswer(review)).correct,true);
    const solve=region=>{const ch=game.startRegionChallenge(playerId,region);const result=game.answer(playerId,ch.challengeId,correctAnswer(ch));assert.equal(result.correct,true);return result;};
    for(let i=0;i<30 && !game.state(playerId).advance.ok;i++)solve(['r05','r08','r09'][i%3]);
    assert.equal(game.state(playerId).advance.ok,true);
    assert.equal(game.advance(playerId).era,'neolithic');
    for(let i=0;i<30 && !game.state(playerId).advance.ok;i++)solve(['r03','r06'][i%2]);
    assert.equal(game.state(playerId).advance.ok,true);
    assert.equal(game.advance(playerId).era,'gojoseon');
    const before=game.state(playerId);
    const submitted=game.submitQuestion(playerId,draft);
    assert.equal(submitted.status,'pending_review');
    assert.equal(game.state(playerId).player.xp,before.player.xp);
    db.close();db=null;
    db=openDb(dir);game=createGame(db);
    assert.equal(game.playerIdForToken(token),playerId);
    assert.deepEqual(game.state(playerId).player,before.player);
    assert.equal(game.listSubmissions(playerId).length,1);
    assert.equal(game.state(playerId).eraLog.length,3);
  } finally {db?.close();rmSync(dir,{recursive:true,force:true});}
});
