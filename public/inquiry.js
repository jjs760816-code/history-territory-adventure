// 준비된 단서 → 추론 선택 → 근거 기록. 자유 문답 AI나 자동 서술형 채점은 아니다.
'use strict';
(() => {
 const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 let data=null,selected=0; const key='history_explorer_inquiry_v1'; let notes={};
 try{notes=JSON.parse(localStorage.getItem(key)||'{}');if(!notes||typeof notes!=='object')notes={};}catch{}
 const dialog=make('dialog',null,'dlg wide inquiry-dialog');dialog.id='inquiryDialog';dialog.setAttribute('aria-labelledby','inquiryTitle');
 const head=make('div',null,'dlg-head'),title=make('h2','단서를 모아 역사 탐구');title.id='inquiryTitle';const close=make('button','닫기');close.type='button';close.onclick=()=>dialog.close();head.append(title,close);
 const body=make('div');dialog.append(head,body);document.body.append(dialog);
 const button=make('button','추리·탐구 노트');button.type='button';button.id='inquiryOpen';button.onclick=async()=>{dialog.showModal();if(!data){body.replaceChildren(make('p','탐구 단서를 불러오는 중이에요.'));try{const r=await fetch(new URL('assets/inquiries.json',document.baseURI));if(!r.ok)throw new Error();data=await r.json();}catch{body.replaceChildren(make('p','탐구 자료를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'));return;}}render();};
 const mount=()=>{const nav=document.getElementById('topnav');if(nav&&!document.getElementById(button.id))nav.append(button);};mount();
 function render(){
  body.replaceChildren(make('p',data.notice,'hint small'));
  const tabs=make('div',null,'inquiry-tabs');data.cases.forEach((c,i)=>{const b=make('button',c.title);b.type='button';b.setAttribute('aria-pressed',String(i===selected));b.onclick=()=>{selected=i;render();};tabs.append(b);});body.append(tabs);
  const c=data.cases[selected];body.append(make('p',c.era,'eyebrow'),make('h3',c.question));
  const clues=make('div',null,'inquiry-clues');c.clues.forEach(x=>{const card=make('article',null,'inquiry-clue');card.append(make('h4',x.title),make('p',x.text));clues.append(card);});body.append(clues);
  const choices=make('div',null,'quiz-choices'),feedback=make('p',null,'inquiry-feedback');feedback.setAttribute('role','status');
  c.choices.forEach((text,i)=>{const b=make('button',text);b.type='button';b.onclick=()=>{feedback.textContent=(i===c.answer?'단서를 잘 연결했어요. ':'다른 단서도 함께 살펴볼까요? ')+c.feedback;feedback.className='inquiry-feedback '+(i===c.answer?'ok':'bad');};choices.append(b);});body.append(choices,feedback);
  const label=make('label',c.reflection,'inquiry-label'),input=make('textarea');input.rows=4;input.maxLength=600;input.value=typeof notes[c.id]==='string'?notes[c.id]:'';input.placeholder='나는 단서 …을/를 보고 …라고 생각해요. 이유는 …';input.setAttribute('aria-label',c.reflection);label.append(input);
  const save=make('button','내 근거 저장하기');save.type='button';const saved=make('span',null,'small');saved.setAttribute('role','status');save.onclick=()=>{notes[c.id]=input.value;try{localStorage.setItem(key,JSON.stringify(notes));saved.textContent='이 브라우저에 저장했어요. 정답으로 자동 채점하지 않아요.';}catch{saved.textContent='저장 공간이 부족해 기록을 저장하지 못했어요.';}};
  const source=make('a','참고 자료 열기');source.href=c.source;source.target='_blank';source.rel='noopener noreferrer';body.append(label,save,saved,make('p','단서에 근거한 설명을 친구·선생님과 나눠 보세요. 이 활동은 경험치 보상을 주지 않아요.','small'),source);
 }
})();
