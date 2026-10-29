// Original canvas artwork. No external sprites, fonts or reference-game assets.
export function drawMap(ctx, { era, progress, position, path = [], time = 0, reduced = false }) {
  const neo=era?.id==='neolithic', W=900,H=540;
  ctx.clearRect(0,0,W,H);ctx.fillStyle=neo?'#95b875':'#aec18a';ctx.fillRect(0,0,W,H);
  // Deterministic grass texture: stable when saved progress changes.
  for(let i=0;i<200;i++) {
    const x=(i*137+31)%900,y=(i*79+47)%420;
    ctx.fillStyle=i%3?'#5b864426':'#edf0b94a';ctx.fillRect(x,y,3,6);ctx.fillRect(x+5,y+2,2,4);
  }
  ctx.strokeStyle=neo?'#d7cc9a':'#d9d1a6';ctx.lineWidth=40;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(110,380);ctx.quadraticCurveTo(190,260,252,230);ctx.lineTo(650,230);ctx.quadraticCurveTo(720,250,705,365);ctx.stroke();
  // River is below the walkable bank (y=78%).
  ctx.fillStyle='#dfd6a0';ctx.fillRect(0,426,900,16);ctx.fillStyle='#65a9a2';ctx.fillRect(0,442,900,98);
  ctx.fillStyle='#a3d0bc';
  const flow=reduced?0:(time/100)%40;
  for(let i=0;i<24;i++)ctx.fillRect((i*89+flow)%900,454+(i%4)*23,22,2);
  function tree(x,y,size=1) {
    ctx.fillStyle='#293d2e28';ctx.beginPath();ctx.ellipse(x+7,y+18,27*size,10*size,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#6b5438';ctx.fillRect(x-5*size,y-20*size,10*size,44*size);
    ctx.fillStyle='#305a42';ctx.beginPath();ctx.moveTo(x,y-95*size);ctx.lineTo(x-36*size,y-16*size);ctx.lineTo(x+36*size,y-16*size);ctx.fill();
    ctx.fillStyle='#43724a';ctx.beginPath();ctx.moveTo(x,y-77*size);ctx.lineTo(x-40*size,y+2*size);ctx.lineTo(x+40*size,y+2*size);ctx.fill();
    ctx.fillStyle='#729858';ctx.beginPath();ctx.moveTo(x,y-75*size);ctx.lineTo(x-25*size,y-21*size);ctx.lineTo(x+3*size,y-15*size);ctx.fill();
  }
  for(const [x,y,s] of [[49,117,1],[103,106,1.2],[141,91,.8],[809,99,.9],[862,139,1.15],[888,75,1],[35,329,.65],[856,359,.7]])tree(x,y,s);
  // Shelter footprint matches collision bounds at x41..59, y13..36.
  ctx.fillStyle='#3a47352b';ctx.beginPath();ctx.ellipse(454,177,87,23,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=neo?'#92744d':'#b59e7a';
  if(neo)ctx.fillRect(389,112,122,68);
  else{ctx.beginPath();ctx.moveTo(378,179);ctx.lineTo(450,69);ctx.lineTo(522,179);ctx.fill();}
  ctx.fillStyle=neo?'#c5a66a':'#c4b28d';ctx.beginPath();ctx.moveTo(366,neo?129:179);ctx.lineTo(450,64);ctx.lineTo(534,neo?129:179);ctx.fill();
  ctx.strokeStyle='#7d704d';ctx.lineWidth=2;
  for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(450,72+i*2);ctx.lineTo(377+i*23,130);ctx.stroke();}
  ctx.fillStyle='#443f30';
  if(neo)ctx.fillRect(434,140,32,40);
  else{ctx.beginPath();ctx.moveTo(430,179);ctx.lineTo(450,120);ctx.lineTo(470,179);ctx.fill();}
  ctx.fillStyle='#ba9a60';ctx.fillRect(430,138,4,42);
  function stone(x,y,scale=1) {ctx.fillStyle='#617363';ctx.beginPath();ctx.moveTo(x-16*scale,y+10*scale);ctx.lineTo(x-18*scale,y-5*scale);ctx.lineTo(x+3*scale,y-20*scale);ctx.lineTo(x+18*scale,y-7*scale);ctx.lineTo(x+12*scale,y+12*scale);ctx.fill();ctx.fillStyle='#91a08a';ctx.beginPath();ctx.moveTo(x-18*scale,y-5*scale);ctx.lineTo(x+3*scale,y-20*scale);ctx.lineTo(x+8*scale,y-2*scale);ctx.fill();}
  function person(x,y,color,moving=false) {
    const stride=moving&&!reduced?Math.sin(time/80)*4:0;
    ctx.fillStyle='#243e302c';ctx.beginPath();ctx.ellipse(x,y+15,15,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#384d3f';ctx.fillRect(x-9,y+10,7,10+stride);ctx.fillRect(x+2,y+10,7,10-stride);
    ctx.fillStyle=color;ctx.fillRect(x-12,y-12,24,26);ctx.fillStyle='#e9ba88';ctx.fillRect(x-10,y-30,20,20);ctx.fillRect(x-16,y-8,5,15);ctx.fillRect(x+11,y-8,5,15);
    ctx.fillStyle='#473b30';ctx.fillRect(x-11,y-34,22,8);ctx.fillRect(x-11,y-29,4,7);ctx.fillStyle='#3b3930';ctx.fillRect(x-5,y-22,3,3);ctx.fillRect(x+4,y-22,3,3);
  }
  // Scene details: fire in the camp; crop rows in the farming village.
  if(neo) {
    ctx.fillStyle='#8b7450';ctx.fillRect(613,122,100,58);
    for(let i=0;i<4;i++)for(let j=0;j<6;j++) {
      const x=622+j*16,y=132+i*13,bend=reduced?0:Math.sin(time/600+j)*1.5;
      ctx.strokeStyle='#5b803b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y+7);ctx.lineTo(x+bend,y-4);ctx.stroke();ctx.fillStyle='#dfc777';ctx.fillRect(x+bend-2,y-6,4,7);
    }
  } else {
    ctx.fillStyle='#6a5339';ctx.fillRect(625,155,42,8);ctx.fillRect(641,139,9,35);
    const flame=reduced?0:Math.sin(time/100)*5;
    ctx.fillStyle='#d97d36';ctx.beginPath();ctx.moveTo(622,152);ctx.lineTo(641,117-flame);ctx.lineTo(660,152);ctx.fill();ctx.fillStyle='#f2c46a';ctx.beginPath();ctx.moveTo(631,152);ctx.lineTo(643,130+flame);ctx.lineTo(651,152);ctx.fill();
  }
  for(const [x,y] of [[156,393],[541,370],[841,411]])stone(x,y,.6);
  const next=era?.missions.find(m=>!progress?.completed.includes(m.id));
  for(const m of era?.missions || []) {
    const x=m.x*9,y=m.y*5.4,done=progress?.completed.includes(m.id),active=next?.id===m.id;
    if(active){ctx.strokeStyle='#fff0a5';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(x,y+14,38,16,0,0,Math.PI*2);ctx.stroke();}
    if(m.icon==='stone'){ctx.fillStyle='#7d6347';ctx.fillRect(x-30,y-6,60,15);ctx.fillRect(x-25,y+9,7,13);ctx.fillRect(x+18,y+9,7,13);stone(x,y-9,.7);}
    else if(m.icon==='pottery'){ctx.fillStyle='#a76742';ctx.beginPath();ctx.ellipse(x,y-6,22,28,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d4a070';ctx.fillRect(x-16,y-31,32,6);ctx.strokeStyle='#efd1a0';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(x-16,y-14+i*10);ctx.lineTo(x,y-6+i*10);ctx.lineTo(x+16,y-14+i*10);ctx.stroke();}}
    else if(m.icon==='camp'||m.icon==='farm')person(x,y,neo?'#d19c52':'#ac7953');
    else if(m.icon==='portal'){
      const glow=done?1:(reduced ? .7 : .65+Math.sin(time/500)*.15);
      ctx.fillStyle=done?'#b8ddcf':'#364e5f';ctx.beginPath();ctx.ellipse(x,y-16,28,39,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#b2c2ac';ctx.lineWidth=9;ctx.stroke();ctx.strokeStyle=`rgba(241,212,117,${glow})`;ctx.lineWidth=4;ctx.stroke();
      ctx.fillStyle='#f3dd91';ctx.font='26px serif';ctx.textAlign='center';ctx.fillText('✦',x,y-9);
    } else {stone(x,y-5,1.6);ctx.fillStyle='#e2d4a2';ctx.font='24px serif';ctx.textAlign='center';ctx.fillText('✧',x,y-8);}
    ctx.textAlign='center';ctx.font='bold 15px system-ui';
    const label=m.object,width=ctx.measureText(label).width+20;
    ctx.fillStyle='#f8f4daec';ctx.fillRect(x-width/2,y+31,width,26);ctx.fillStyle='#2f4f3f';ctx.fillText(label,x,y+49);
    if(active||done){const bob=reduced?0:Math.sin(time/300)*3;ctx.fillStyle=done?'#37705b':'#f2d47c';ctx.beginPath();ctx.arc(x,y-58+bob,13,0,Math.PI*2);ctx.fill();ctx.fillStyle=done?'#fff':'#433d2a';ctx.font='bold 16px system-ui';ctx.fillText(done?'✓':'!',x,y-52+bob);}
  }
  if(path.length){const end=path.at(-1);ctx.strokeStyle='#fff5be';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(end.x*9,end.y*5.4+16,17,6,0,0,Math.PI*2);ctx.stroke();}
  if(position){person(position.x*9,position.y*5.4,'#286e72',path.length>0);ctx.fillStyle='#fffbe8';ctx.font='bold 14px system-ui';ctx.textAlign='center';ctx.fillText('나',position.x*9,position.y*5.4-46);}
  ctx.fillStyle='#1b4334ce';ctx.fillRect(22,18,135,30);ctx.fillStyle='#f4f1d7';ctx.font='bold 13px system-ui';ctx.textAlign='left';ctx.fillText(neo?'02  강가의 작은 마을':'01  바람의 야영지',32,38);
}
