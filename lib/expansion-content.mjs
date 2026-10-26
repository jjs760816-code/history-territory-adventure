import { CURRICULUM_QUESTIONS } from './curriculum.mjs';
import { BANK_QUESTIONS, BANK_COLLECTIONS } from './bank-expansion.mjs';
// 역사적 사실과 게임 수치를 구분한다. 유물은 디지털 학습 수집 기록이다.
const source = (id) => `국사편찬위원회 우리역사넷 · https://contents.history.go.kr/front/hm/print.do?levelId=${id}`;
export const EXPANSION_QUESTIONS = [
 {id:'war-01',era:'samguk',topic:'안시성 전투',difficulty:1,objective:'고구려가 당의 침입에 맞선 안시성 전투를 안다.',question:'645년 당나라의 공격에 맞서 안시성을 지킨 나라는?',choices:['백제','고구려','고려','신라'],answer:1,explanation:'645년 고구려는 안시성에서 당나라 군대의 공격을 막아 냈어요. 성을 지킨 사람들의 협력이 중요했어요. 신라는 뒤에 당과 손잡고 백제와 고구려를 무너뜨렸고, 고려는 918년에 세워진 나라예요.',sources:[source('hm_014_0020')]},
 {id:'war-02',era:'goryeo',topic:'강화 천도',difficulty:2,objective:'몽골 침입에 대응한 강화 천도를 안다.',question:'1232년 고려 조정이 몽골의 침입에 대응해 수도를 옮긴 곳은?',choices:['제주도','한양','강화도','진도'],answer:2,explanation:'고려 조정은 1232년 강화도로 수도를 옮겼어요. 전쟁 동안 육지의 백성들은 큰 어려움을 겪었어요. 수도를 옮겼다고 모든 백성이 안전했던 것은 아니에요. 진도와 제주도는 뒤에 삼별초가 옮겨 가며 몽골에 맞선 곳이고, 한양은 조선의 도읍이에요.',sources:[source('hm_051_0020')]},
 {id:'war-03',era:'joseon',topic:'행주 대첩',difficulty:1,objective:'행주 대첩에서 협력한 사람들을 안다.',question:'1593년 권율과 군사·의병 등이 힘을 모아 일본군을 물리친 곳은?',choices:['행주산성','진주성','동래성','한산도'],answer:0,explanation:'행주 대첩에서는 권율의 지휘 아래 관군·의병·승병 등이 협력했어요. 전쟁을 인물 한 사람만의 활약으로 설명하지 않도록 살펴봐요. 진주성은 1592년 김시민이 지켜 냈지만 1593년에는 함락되었고, 동래성은 1592년 일본군에게 함락되었어요. 한산도에서는 1592년 이순신의 수군이 이겼어요.',sources:['국사편찬위원회 · https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_n301100']},
 {id:'war-04',era:'joseon',topic:'명량 해전',difficulty:2,objective:'정유재란 때 명량 해전을 이끈 인물을 안다.',question:'1597년 정유재란 때 명량 해전에서 조선 수군을 이끈 인물은?',choices:['권율','곽재우','이순신','김시민'],answer:2,explanation:'이순신은 정유재란 때 명량 해전에서 조선 수군을 이끌었어요. 수군의 협력과 해협의 지형을 함께 살펴보면 전투를 더 잘 이해할 수 있어요. 권율은 행주 대첩, 김시민은 1592년 진주성 싸움을 이끌었고, 곽재우는 의병장으로 활약했어요.',sources:['국사편찬위원회 · https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i302300']},
 {id:'war-05',era:'joseon',topic:'병인양요',difficulty:2,objective:'병인양요의 시기와 침입한 나라를 구분한다.',question:'1866년 병인양요 때 강화도에 침입한 군대는 어느 나라 군대일까요?',choices:['미국','프랑스','일본','러시아'],answer:1,explanation:'1866년 프랑스군이 강화도에 침입한 사건을 병인양요라고 해요. 프랑스군은 외규장각의 책 등을 약탈했어요. 당시 천주교 박해와 국제 관계도 함께 살펴봐요.',sources:['국사편찬위원회 · https://contents.history.go.kr/mobile/ta/view.do?levelId=ta_e71_0020_0020_0010_0020','국사편찬위원회 · 병인양요(외규장각 의궤 약탈) https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i302700']},
 {id:'war-06',era:'joseon',topic:'신미양요',difficulty:2,objective:'신미양요와 병인양요를 구분한다.',question:'1871년 신미양요 때 강화도에 침입한 군대는 어느 나라 군대일까요?',choices:['미국','프랑스','일본','러시아'],answer:0,explanation:'1871년 미국 군대가 강화도에 침입했어요. 광성보에서 조선군이 맞서 싸웠지만 큰 피해를 입었어요. 이를 단순히 피해 없는 승리로 표현하면 안 돼요. 5년 앞선 1866년 병인양요 때 강화도에 침입한 것은 프랑스군이에요.',sources:['국사편찬위원회 · https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i303800']},
];
export const EXPANSION_MISSIONS = EXPANSION_QUESTIONS.map((q)=>({id:`m_${q.id.replace('-','_')}`,era:q.era,kind:'event',name:q.topic+' 역사 탐구',required:false,action:'quiz',trigger:'해당 시대에 열리는 역사 탐구 미션이에요.',desc:q.objective+' 관련 문제를 처음으로 맞히세요.',questionIds:[q.id],cond:{questions:{ids:[q.id],n:1}},reward:{xp:10,grain:6,population:2}}));
export const BUILDINGS = [
 {id:'village',name:'마을',minEra:'paleolithic',costs:[12,24,40],description:'구석기에는 작은 야영지, 이후에는 마을을 가꾸어요.',effectText:'단계마다 인구 +3 · 개발 국력 +2'},
 {id:'farm',name:'농경지',minEra:'neolithic',costs:[12,24,40],description:'신석기부터 농경지를 가꿀 수 있어요.',effectText:'단계마다 시대별 수확 식량 +4 · 개발 국력 +1'},
 {id:'lab',name:'연구',minEra:'neolithic',costs:[12,24,40],description:'도구·기술·문화에 관한 배움을 모아요.',effectText:'단계마다 기술력 +3 · 개발 국력 +2'},
 {id:'fort',name:'방어 시설',minEra:'samguk',costs:[12,24,40],description:'성책과 성곽을 정비해 자발적 방어 훈련을 준비해요.',effectText:'단계마다 군사력 +5 · 방어력 +10 · 개발 국력 +3. 훈련 오답 손실 5→2→0'},
];
export const COLLECTIONS = [
 {id:'a_bipa',name:'비파형 동검',kind:'무기',era:'gojoseon',questionId:'gjs-07',history:'청동기 시대의 비파 모양 동검이에요.',effectText:'군사력 +2 · 국력 +2',effect:{military:2,power:2},sources:['https://www.museum.go.kr']},
 {id:'a_turtle',name:'거북선',kind:'무기·선박',era:'joseon',questionId:'js-06',history:'임진왜란 때 조선 수군이 사용한 전투선이에요. 게임에서는 탐구 기록을 수집해요.',effectText:'군사력 +3 · 국력 +3',effect:{military:3,power:3},sources:['https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_r300020']},
 {id:'a_jikji',name:'직지',kind:'기록유산',era:'goryeo',questionId:'gr-06',history:'1377년 금속 활자로 인쇄된 직지의 탐구 기록이에요.',effectText:'기술력 +3 · 국력 +3',effect:{technology:3,power:3},sources:['https://jikjiworld.cheongju.go.kr']},
 {id:'a_celadon',name:'상감 청자',kind:'유물',era:'goryeo',questionId:'gr-07',history:'그릇 표면에 무늬를 새기고 다른 흙을 채운 고려의 공예품이에요.',effectText:'경제력 +3 · 국력 +2',effect:{economy:3,power:2},sources:['https://www.museum.go.kr']},
 {id:'a_hangeul',name:'훈민정음',kind:'기록유산',era:'joseon',questionId:'js-02',history:'세종이 1443년 만들고 1446년 널리 알린 우리 글자의 탐구 기록이에요.',effectText:'기술력 +3 · 국력 +3',effect:{technology:3,power:3},sources:['https://www.hangeul.go.kr']},
];
export const RAIDS = [
 ['ansi','samguk',645,'안시성 지키기','war-01'],['gwiju','goryeo',1019,'귀주 대첩의 단서','gr-04'],['ganghwa','goryeo',1232,'강화 천도와 백성의 삶','war-02'],['imjin','joseon',1592,'임진왜란과 수군','js-05'],['haengju','joseon',1593,'행주산성의 협력','war-03'],['myeongnyang','joseon',1597,'명량 해협의 선택','war-04'],['byeongja','joseon',1636,'병자호란과 남한산성','js-07'],['byeongin','joseon',1866,'강화도와 병인양요','war-05'],['shinmi','joseon',1871,'광성보와 신미양요','war-06'],
].map(([id,era,year,name,questionId])=>({id,era,year,name,questionId,description:'역사 사실을 공부하는 가상 지역 방어 훈련이에요. 실제 역사 결과를 바꾸는 전투가 아니에요.',reward:{xp:10,grain:6,population:2}}));
export const SKILLS = [
 {id:'science',name:'과학기술',minEra:'neolithic',nodes:['도구 연구','기술 전승','체계적 연구'],description:'단계마다 기술력 +3 · 개발 국력 +2. 다른 갈래 2단계 이상은 과학기술 1단계가 필요해요.'},
 {id:'agriculture',name:'농경',minEra:'neolithic',nodes:['씨앗 고르기','물길 관리','농법 공유'],description:'단계마다 농경지의 시대별 수확 +2 · 학습 4회당 식량 소비량 −1(최소 1).'},
 {id:'military',name:'군사',minEra:'samguk',nodes:['방어 훈련','성곽 정비술','협동 방어'],description:'단계마다 군사력 +3 · 방어 훈련 오답 손실 −1(최소 0).'},
 {id:'culture',name:'문화',minEra:'neolithic',nodes:['기록과 전승','공예 탐구','유산 보전'],description:'단계마다 보유 디지털 유물 기록 1종당 국력 +1. 문화 주제 새 정답 경험치 +1.'},
].map(s=>({...s,costs:[20,35,50]}));
COLLECTIONS.push(
 {id:'h_yi',name:'이순신',kind:'고유 인물',era:'joseon',questionId:'war-04',requiredMission:'m_js_imjin',requiredSkills:{military:1},requirementText:'명량 해전 문제 정답 + 임진왜란 미션 완료 + 군사 1단계',history:'임진왜란과 정유재란 때 조선 수군을 이끈 인물이에요.',effectText:'조선 한정: 군사력 2배 · 해군력 +20 · 방어 훈련 손실 −2. 수치는 게임용 능력이에요.',effect:{militaryMultiplier:2,naval:20,defenseReduction:2,power:5,activeEra:'joseon'},sources:['https://contents.history.go.kr/mobile/kc/view.do?levelId=kc_i302300']},
 {id:'h_sejong',name:'세종',kind:'고유 인물',era:'joseon',questionId:'js-02',requiredSkills:{science:1,culture:1},requirementText:'훈민정음 문제 정답 + 과학기술·문화 각 1단계',history:'훈민정음을 만들고 과학·문화 발전을 뒷받침한 조선의 왕이에요.',effectText:'조선 한정: 기술력 +6 · 시대별 수확 +8 · 국력 +5. 수치는 게임 규칙이에요.',effect:{technology:6,farmYield:8,power:5,activeEra:'joseon'},sources:['https://www.hangeul.go.kr']},
 {id:'h_jang',name:'장보고',kind:'고유 인물',era:'nambuk',questionId:'nb-06',requiredSkills:{military:1},requirementText:'장보고 문제 정답 + 군사 1단계',history:'통일 신라 때 청해진을 설치하고 바닷길에서 활동한 인물이에요.',effectText:'남북국 한정: 경제력 +8 · 해군력 +8 · 국력 +4.',effect:{economy:8,naval:8,power:4,activeEra:'nambuk'},sources:['https://contents.history.go.kr']},
 {id:'h_seohui',name:'서희',kind:'고유 인물',era:'goryeo',questionId:'gr-03',requiredSkills:{culture:1},requirementText:'서희의 담판 문제 정답 + 문화 1단계',history:'993년 거란의 침입 때 외교 담판으로 강동 6주 확보에 기여했어요.',effectText:'고려 한정: 방어 훈련 오답 식량 손실 −2 · 국력 +4. 외교 학습을 나타내는 게임 효과예요.',effect:{defenseReduction:2,power:4,activeEra:'goryeo'},sources:['https://contents.history.go.kr']},
 {id:'a_rain',name:'측우기',kind:'과학 유물',era:'joseon',questionId:'js-03',requiredSkills:{agriculture:1},requirementText:'측우기 문제 정답 + 농경 1단계',history:'조선 세종 때 비가 내린 양을 재는 데 사용한 기구예요.',effectText:'조선 한정: 농경지 단계마다 시대별 수확 +2 · 기술력 +2.',effect:{farmYieldPerLevel:2,technology:2,activeEra:'joseon'},sources:['https://contents.history.go.kr']},
);
export const FACTIONS = [
 {id:'goguryeo',name:'고구려',description:'넓은 북방 영역과 산성, 수·당의 침입에 맞선 역사를 탐구해요.',effectText:'삼국 한정 군사력 +4 · 국력 +3',military:4,power:3,questionIds:['sg-01','sg-04','sg-05','war-01']},
 {id:'baekje',name:'백제',description:'한강 유역에서 성장하고 이웃 나라와 문화·기술을 나눈 역사를 탐구해요.',effectText:'삼국 한정 경제력 +4 · 기술력 +2 · 국력 +3',economy:4,technology:2,power:3,questionIds:['sg-02','sg-09']},
 {id:'silla',name:'신라',description:'진흥왕의 한강 진출과 첨성대, 삼국 통일 과정을 탐구해요.',effectText:'삼국 한정 기술력 +3 · 국력 +3',technology:3,power:3,questionIds:['sg-06','sg-07','sg-08','sg-10']},
 {id:'gaya',name:'가야',description:'여러 나라의 연맹과 철 생산, 바닷길 교역을 탐구해요.',effectText:'삼국 한정 경제력 +5 · 군사력 +2 · 국력 +3',economy:5,military:2,power:3,questionIds:['sg-03']},
];
for(const f of FACTIONS)EXPANSION_MISSIONS.push({id:'m_faction_'+f.id,era:'samguk',faction:f.id,kind:'core',name:f.name+'의 길',required:false,action:'quiz',trigger:'삼국·가야에서 이 나라를 선택하면 열려요.',desc:f.description+' 관련 문제 '+Math.min(2,f.questionIds.length)+'개를 처음으로 맞히세요.',questionIds:f.questionIds,cond:{questions:{ids:f.questionIds,n:Math.min(2,f.questionIds.length)}},reward:{xp:15,grain:8,population:3}});

EXPANSION_QUESTIONS.push(...BANK_QUESTIONS);
COLLECTIONS.push(...BANK_COLLECTIONS);
for(const era of [...new Set(BANK_QUESTIONS.map(q=>q.era))]){const ids=BANK_QUESTIONS.filter(q=>q.era===era).map(q=>q.id);EXPANSION_MISSIONS.push({id:'m_bank_'+era,era,kind:'opportunity',name:'인물과 유산 탐험',action:'quiz',trigger:'이 시대의 탐구 확장 문제가 열렸어요.',desc:'인물·도구·유산 문제 2개를 처음으로 맞히세요. 일부 문제는 디지털 수집 카드와 연결돼요.',questionIds:ids,cond:{questions:{ids,n:2}},reward:{xp:10,grain:8,population:2}});}

EXPANSION_QUESTIONS.push(...CURRICULUM_QUESTIONS);
for(const era of [...new Set(CURRICULUM_QUESTIONS.map(q=>q.era))]){const ids=CURRICULUM_QUESTIONS.filter(q=>q.era===era).map(q=>q.id);EXPANSION_MISSIONS.push({id:'m_theme_'+era,era,kind:'core',required:false,name:'생활·제도·이웃 나라 탐구',action:'quiz',trigger:'이 시대의 핵심 주제를 깊이 살펴봐요.',desc:'생활·제도·주변 나라와의 관계 문제 '+Math.min(2,ids.length)+'개를 처음 맞히세요.',questionIds:ids,cond:{questions:{ids,n:Math.min(2,ids.length)}},reward:{xp:10,grain:8,population:2}});}
