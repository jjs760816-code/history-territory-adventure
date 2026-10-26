import { EXPANSION_MISSIONS } from './expansion-content.mjs';
import { EVENT_SAMPLE, attachEventWeights } from './event-weights.mjs';
import { MAP_REGIONS } from "./map-regions.mjs";
import { QUESTIONS } from './questions.mjs';
import { normalizeMissions, auditMissions } from './mission-progression.mjs';
// 공개 가능한 게임 콘텐츠(정답 없음). /api/meta 로 클라이언트에 전달된다.
// 로컬 서버판과 웹 체험판이 같은 파일을 쓴다(같은 규칙).

// 시대 순서. 처음 3개 시대의 id·순서는 바꾸지 않는다(기존 저장 호환).
// period 는 학습용 대략 연대이며, 개항기(1876~)는 조선 후기와 겹친다.
export const ERAS = [
  { id: 'paleolithic', name: '구석기 시대', short: '구석기', order: 0, period: '약 70만 년 전부터',
    summary: '돌을 깨뜨려 만든 뗀석기를 쓰고, 사냥·채집을 하며 먹을거리를 찾아 옮겨 다녔어요.',
    chapter: '사람들은 무리를 지어 사냥하고 열매를 모았어요. 동굴과 막집에 머물며 불을 다루었어요.' },
  { id: 'neolithic', name: '신석기 시대', short: '신석기', order: 1, period: '약 1만 년 전 무렵부터',
    summary: '돌을 갈아 만든 간석기와 빗살무늬 토기를 쓰고, 농사를 시작해 강가·바닷가 움집에 정착했어요.',
    chapter: '강가와 바닷가에 움집 마을이 생겼어요. 토기에 음식을 담고, 조금씩 농사를 짓기 시작했어요.' },
  { id: 'gojoseon', name: '청동기·고조선', short: '고조선', order: 2, period: '청동기 문화 ~ 기원전 108년',
    summary: '청동기와 함께 계급과 족장이 나타났고, 우리 역사 최초의 국가 고조선이 세워졌어요.',
    chapter: '청동기를 쓰면서 힘센 지배자가 나타났어요. 고조선은 8조법으로 사회 질서를 지켰어요. 건국 이야기 속 기원전 2333년은 신화에 따른 연도예요.' },
  { id: 'samguk', name: '삼국·가야', short: '삼국·가야', order: 3, period: '기원전 1세기 무렵 ~ 7세기 후반',
    summary: '고구려·백제·신라와 가야가 함께 성장하며 한강 유역을 두고 경쟁했어요.',
    chapter: '고구려·백제·신라와 가야 연맹이 나란히 자랐어요. 한강 유역을 차지하려 경쟁했고, 문화도 활발히 나누었어요. 신라는 당과 손잡고 백제(660)와 고구려(668)를 무너뜨렸어요.' },
  { id: 'nambuk', name: '남북국(통일 신라·발해)', short: '남북국', order: 4, period: '7세기 후반 ~ 10세기 초',
    summary: '남쪽의 통일 신라와 북쪽의 발해가 함께 있던 시기예요.',
    chapter: '신라는 676년 당 군대를 몰아내 삼국 통일을 완성했어요. 698년 대조영은 발해를 세웠어요. 두 나라가 남과 북에 함께 있어 남북국 시대라고 해요.' },
  { id: 'goryeo', name: '고려', short: '고려', order: 5, period: '918년 ~ 1392년',
    summary: '왕건이 세운 고려는 거란·몽골의 침입을 이겨 내며 인쇄와 공예 문화를 꽃피웠어요.',
    chapter: '918년 고려가 세워지고, 936년 후삼국이 다시 하나가 되었어요. 거란과 몽골의 침입에 맞섰고, 팔만대장경·직지·고려청자를 남겼어요.' },
  { id: 'joseon', name: '조선', short: '조선', order: 6, period: '1392년 ~ 1897년',
    summary: '이성계가 세운 조선은 훈민정음과 과학 기구를 만들고, 임진왜란과 병자호란의 큰 어려움을 겪었어요.',
    chapter: '이성계는 1392년 조선을 세웠어요. 세종은 훈민정음을 만들었고, 임진왜란(1592)과 병자호란(1636)의 어려움을 겪었어요. 영조·정조는 탕평책을 펼쳤어요.' },
  { id: 'modern', name: '개항기·독립운동', short: '개항·독립', order: 7, period: '1876년 ~ 1945년',
    summary: '나라의 문을 연 뒤 주권을 빼앗겼지만, 많은 사람이 독립을 위해 힘을 모았어요.',
    chapter: '1876년 강화도 조약으로 항구를 열었어요(조선 후기와 겹치는 시기예요). 1910년 국권을 빼앗긴 뒤 3·1 운동(1919), 대한민국 임시 정부, 한국광복군이 독립을 위해 싸웠어요.' },
  { id: 'republic', name: '대한민국', short: '대한민국', order: 8, period: '1945년 광복 ~ 오늘',
    summary: '광복과 정부 수립, 전쟁을 겪은 뒤 시민들이 힘을 모아 민주주의와 경제를 성장시켰어요.',
    chapter: '1945년 광복, 1948년 정부 수립 뒤 6·25 전쟁(1950~1953)을 겪었어요. 4·19 혁명, 5·18 민주화 운동, 6월 민주 항쟁으로 민주주의를 키워 왔어요.' },
];
export const ERA_ORDER = Object.fromEntries(ERAS.map((e) => [e.id, e.order]));
export const FINAL_ERA = ERAS[ERAS.length - 1].id;

// 시대 발전 조건: from 시대에서 경험치·서로 다른 문제 정답 수(그 시대)·국력·필수 미션을 모두 채워야 한다.
// 처음 두 조건(60/150)은 기존 그대로다. 미션 보상이 생겨 조금 빨리 닿을 수 있다(문서 참조).
// 삼국 이후 수치는 "필수 미션 + 그 시대 서로 다른 정답 6개" 최소 경로의 누적값을 재어 그 90% 안팎으로 맞췄다
// (미션을 건너뛰면 몇 문제 더 풀어야 하고, 미션을 많이 하면 바로 넘는다).
const BASE_ADVANCE_RULES = {
  neolithic: { from: 'paleolithic', xp: 60, uniqueCorrect: 6, uniqueEra: 'paleolithic', power: 50, mission: 'm_camp' },
  gojoseon: { from: 'neolithic', xp: 150, uniqueCorrect: 6, uniqueEra: 'neolithic', power: 100, mission: 'm_farm' },
  samguk: { from: 'gojoseon', xp: 300, uniqueCorrect: 6, uniqueEra: 'gojoseon', power: 210, mission: 'm_gjs_core' },
  nambuk: { from: 'samguk', xp: 430, uniqueCorrect: 6, uniqueEra: 'samguk', power: 260, mission: 'm_sg_found' },
  goryeo: { from: 'nambuk', xp: 560, uniqueCorrect: 6, uniqueEra: 'nambuk', power: 300, mission: 'm_nb_core' },
  joseon: { from: 'goryeo', xp: 700, uniqueCorrect: 6, uniqueEra: 'goryeo', power: 340, mission: 'm_gr_core' },
  modern: { from: 'joseon', xp: 830, uniqueCorrect: 6, uniqueEra: 'joseon', power: 390, mission: 'm_js_core' },
  republic: { from: 'modern', xp: 960, uniqueCorrect: 6, uniqueEra: 'modern', power: 440, mission: 'm_md_core' },
};

// v3 진행 기준 상향: "그 시대 서로 다른 문제 처음 맞힘"을 6 → 아래 목표로 올린다(경험치·국력·필수 미션은 그대로).
// 문제 은행이 바뀌어도 막히지 않도록 그 시대 문제 수의 60%(내림)를 넘지 않게, 그리고 기존 6 아래로는 내리지 않게 묶는다.
// 이미 다음 시대로 넘어간 저장은 era 값이 그대로라 영향이 없다.
export const ADVANCE_UNIQUE_TARGET = { neolithic: 8, gojoseon: 8, samguk: 9, nambuk: 10, goryeo: 10, joseon: 10, modern: 10, republic: 10 };
export const ADVANCE_UNIQUE_POOL_SHARE = 0.6;
const ERA_QUESTION_COUNT = QUESTIONS.reduce((a, q) => ({ ...a, [q.era]: (a[q.era] || 0) + 1 }), {});
export const ADVANCE_RULES = Object.fromEntries(Object.entries(BASE_ADVANCE_RULES).map(([era, r]) => {
  const cap = Math.floor((ERA_QUESTION_COUNT[r.uniqueEra] || 0) * ADVANCE_UNIQUE_POOL_SHARE);
  const uniqueCorrect = Math.max(r.uniqueCorrect, Math.min(ADVANCE_UNIQUE_TARGET[era] ?? r.uniqueCorrect, cap));
  return [era, { ...r, uniqueCorrect, previousUniqueCorrect: r.uniqueCorrect }];
}));

// 초기값과 보상 수치(공개 규칙)
export const RULES = {
  start: { xp: 0, grain: 20, population: 10 },
  firstCorrect: { xpBase: 10, xpPerDifficulty: 5, grain: 4, population: 2 }, // XP = 10 + 5×(난이도-1)
  repeatCorrect: { xp: 0, grain: 0, population: 0 },
  wrong: { xp: 0, grain: 0, population: 0 },
  capture: { grain: 6, population: 3 },
  rivalWinsNeeded: 2,
  challengeTtlMs: 30 * 60 * 1000,
  powerFormula: '국력 = 인구 + 식량÷2(내림) + 영토 수×8 + 카드 국력 + 개발·투자·수집 보너스',
  missionRule: '미션 보상은 미션마다 한 번만 받아요. 지금 시대보다 뒤 시대의 미션은 잠겨 있고 보상도 받을 수 없어요.',
};

// 실제 지리 좌표에 연결한 게임 지역. 점령 구획은 역사적 국경이 아니다.
// 삼국 이후 시대도 같은 지형을 쓰며, 시대별 정확한 국경은 그리지 않는다.
export const REGIONS = MAP_REGIONS;
export const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r]));
export const LATER_ERA_MAP_NOTICE = '삼국 이후 시대도 같은 지형 위에서 미션으로 배워요. 시대별 정확한 국경은 그리지 않았어요.';

// 카드. effect 는 서버가 보상 계산 때 적용한다. icon 은 그림 아틀라스가 없는 카드의 코드 도형 이름이다.
export const CARDS = [
  { id: 'c_handaxe', name: '주먹도끼', type: '유물', era: 'paleolithic',
    history: '돌을 깨뜨려 만든 구석기 시대의 만능 도구.',
    effectText: '구석기 문제를 처음 맞힐 때 식량 +1', effect: { grainOnFirstCorrectEra: 'paleolithic', amount: 1 },
    howTo: '구석기 문제를 처음으로 맞히기', cond: { uniqueCorrect: { era: 'paleolithic', n: 1 } } },
  { id: 'c_fire', name: '불 다루기', type: '기회', era: 'paleolithic',
    history: '불로 음식을 익히고 추위와 짐승을 막았어요.',
    effectText: '국력 +3', effect: { power: 3 },
    howTo: '구석기 문제 4개를 처음으로 맞히기', cond: { uniqueCorrect: { era: 'paleolithic', n: 4 } } },
  { id: 'c_jeongok', name: '전곡리 유적', type: '유적', era: 'paleolithic',
    history: '주먹도끼가 발견된 경기도 연천의 구석기 유적.',
    effectText: '국력 +3', effect: { power: 3 },
    howTo: '구석기 지역 2곳 점령', cond: { capturedEra: { era: 'paleolithic', n: 2 } } },
  { id: 'c_comb', name: '빗살무늬 토기', type: '유물', era: 'neolithic',
    history: '곡식을 저장하고 음식을 끓이던 신석기 시대 토기.',
    effectText: '신석기 문제를 처음 맞힐 때 식량 +1', effect: { grainOnFirstCorrectEra: 'neolithic', amount: 1 },
    howTo: '신석기 시대에 진입하기', cond: { era: 'neolithic' } },
  { id: 'c_spindle', name: '가락바퀴', type: '유물', era: 'neolithic',
    history: '실을 뽑아 옷감을 짜기 시작했음을 알려 주는 도구.',
    effectText: '국력 +3', effect: { power: 3 },
    howTo: '신석기 문제 4개를 처음으로 맞히기', cond: { uniqueCorrect: { era: 'neolithic', n: 4 } } },
  { id: 'c_amsa', name: '암사동 움집 마을', type: '유적', era: 'neolithic',
    history: '한강 가에 움집을 짓고 모여 살던 신석기 마을 유적.',
    effectText: '지역 점령 때 인구 +1', effect: { populationOnCapture: 1 },
    howTo: '신석기 지역 2곳 점령', cond: { capturedEra: { era: 'neolithic', n: 2 } } },
  { id: 'c_bipa', name: '비파형 동검', type: '유물', era: 'gojoseon',
    history: '고조선 문화 범위를 짐작하게 하는 청동 검.',
    effectText: '국력 +5', effect: { power: 5 },
    howTo: '청동기·고조선 시대에 진입하기', cond: { era: 'gojoseon' } },
  { id: 'c_dolmen', name: '고인돌', type: '유적', era: 'gojoseon',
    history: '청동기 시대 지배자의 무덤. 고창·화순·강화 고인돌 유적은 세계유산이에요.',
    effectText: '국력 +5', effect: { power: 5 },
    howTo: '청동기·고조선 지역 2곳 점령', cond: { capturedEra: { era: 'gojoseon', n: 2 } } },
  { id: 'c_dangun', name: '단군 건국 이야기', type: '사건', era: 'gojoseon', myth: true,
    history: '『삼국유사』에 실린 건국 신화. 신화이므로 역사 사실과 구별해 해석해요.',
    effectText: '지역 점령 때 인구 +1', effect: { populationOnCapture: 1 },
    howTo: '청동기·고조선 문제 4개를 처음으로 맞히기', cond: { uniqueCorrect: { era: 'gojoseon', n: 4 } } },
  // ── 삼국·가야 이후(미션 보상 카드) ──
  { id: 'c_gaya_iron', name: '가야의 덩이쇠', type: '유물', era: 'samguk', icon: 'iron',
    history: '가야가 만들어 이웃 나라와 왜에 수출한 철 덩어리. 돈처럼 쓰이기도 했어요.',
    effectText: '국력 +5', effect: { power: 5 },
    howTo: '기회 미션 「가야의 철」 완료', cond: { mission: 'm_sg_gaya' } },
  { id: 'c_bulguksa', name: '불국사와 석굴암', type: '유적', era: 'nambuk', icon: 'temple',
    history: '통일 신라 때 경주에 세운 절과 석굴. 1995년 함께 세계유산이 되었어요.',
    effectText: '국력 +5', effect: { power: 5 },
    howTo: '기회 미션 「불국사와 석굴암」 완료', cond: { mission: 'm_nb_bulguk' } },
  { id: 'c_tripitaka', name: '팔만대장경', type: '유물', era: 'goryeo', icon: 'woodblock',
    history: '몽골 침입 때 만든 불교 경전 목판. 합천 해인사에 보관되어 있어요.',
    effectText: '고려 문제를 처음 맞힐 때 식량 +1', effect: { grainOnFirstCorrectEra: 'goryeo', amount: 1 },
    howTo: '기회 미션 「팔만대장경과 직지」 완료', cond: { mission: 'm_gr_print' } },
  { id: 'c_hunmin', name: '훈민정음', type: '유물', era: 'joseon', icon: 'hangul',
    history: '세종이 1443년에 만들고 1446년에 널리 알린 우리 글자.',
    effectText: '국력 +6', effect: { power: 6 },
    howTo: '핵심 미션 「조선 건국과 훈민정음」 완료', cond: { mission: 'm_js_core' } },
  { id: 'c_provisional', name: '대한민국 임시 정부', type: '사건', era: 'modern', icon: 'seal',
    history: '3·1 운동 뒤 1919년 상하이에 세워져 독립운동을 이끈 정부.',
    effectText: '국력 +6', effect: { power: 6 },
    howTo: '사건 미션 「대한민국 임시 정부」 완료', cond: { mission: 'm_md_gov' } },
  { id: 'c_constitution', name: '제헌 헌법', type: '사건', era: 'republic', icon: 'scroll',
    history: '1948년 제헌 국회가 만든 대한민국의 첫 헌법.',
    effectText: '국력 +6', effect: { power: 6 },
    howTo: '핵심 미션 「광복과 정부 수립」 완료', cond: { mission: 'm_rp_core' } },
];

// ── 미션 ──
// kind: core(시대 핵심) | event(사건) | opportunity(기회). required 는 시대 발전 필수 미션.
// action: quiz(미션 문제 풀기) | region(지도에서 지역 점령) | review(틀린 문제 복습).
// questionIds: 미션 문제로 내는 문제. cond.questions 는 "이 문제들 가운데 n개를 처음 맞히기".
// weighting: 검토자가 분류한 한국사능력검정시험(기본) 단일 회차 표본(lib/event-weights.mjs)을 추천 가중치로만 쓴다.
// 전체 기출의 공식 출제율이 아니며, 선사 시대 핵심 미션 2~3개는 잠정 배치다.
export const MISSION_WEIGHTING = EVENT_SAMPLE;

const qs = (ids, n) => ({ questions: { ids, n } });
const R = (xp, grain, population, card) => ({ xp, grain, population, ...(card ? { card } : {}) });

const RAW_MISSIONS = [
  // 구석기(핵심 3)
  { id: 'm_camp', era: 'paleolithic', kind: 'core', name: '첫 터전 마련', required: true, action: 'region',
    trigger: '원정을 시작하면 열려요.', desc: '지역 3곳을 점령해 무리가 머물 터전을 마련하세요.',
    cond: { territories: 3 }, reward: R(10, 6, 4) },
  { id: 'm_tools', era: 'paleolithic', kind: 'core', name: '뗀석기 탐구', action: 'quiz',
    trigger: '원정을 시작하면 열려요.', desc: '뗀석기와 구석기 유적 문제 3개 가운데 2개를 처음으로 맞히세요.',
    questionIds: ['pal-01', 'pal-02', 'pal-06'], cond: qs(['pal-01', 'pal-02', 'pal-06'], 2), reward: R(10, 4, 2) },
  { id: 'm_life', era: 'paleolithic', kind: 'core', name: '옮겨 다니는 삶', action: 'quiz',
    trigger: '원정을 시작하면 열려요.', desc: '구석기 사람들의 집과 먹을거리 문제 가운데 2개를 처음으로 맞히세요.',
    questionIds: ['pal-03', 'pal-04', 'pal-05', 'pal-08'], cond: qs(['pal-03', 'pal-04', 'pal-05', 'pal-08'], 2), reward: R(10, 4, 2) },
  // 복습 미션은 처음 틀린 순간부터 쓸 수 있도록 구석기부터 연다(v1의 신석기에서 옮김).
  { id: 'm_review', era: 'paleolithic', kind: 'opportunity', name: '틀린 문제 다시 보기', required: false, action: 'review',
    trigger: '틀린 문제가 생기면 언제든 할 수 있어요.', desc: '틀렸던 문제를 복습해서 맞혀 보세요.',
    cond: { reviewCorrect: 1 }, reward: R(10, 3, 2) },
  // 신석기(핵심 2)
  { id: 'm_farm', era: 'neolithic', kind: 'core', name: '정착과 농경', required: true, action: 'region',
    trigger: '신석기 시대에 들어서면 열려요.', desc: '강가·평야·해안 지형의 신석기 지역 2곳을 점령해 농사와 고기잡이 마을을 세우세요.',
    cond: { capturedTerrain: { era: 'neolithic', terrains: ['강가 평야', '해안', '평야'], n: 2 } }, reward: R(15, 8, 4) },
  { id: 'm_pottery', era: 'neolithic', kind: 'core', name: '토기와 간석기', action: 'quiz',
    trigger: '신석기 시대에 들어서면 열려요.', desc: '빗살무늬 토기·간석기·가락바퀴 문제 가운데 2개를 처음으로 맞히세요.',
    questionIds: ['neo-01', 'neo-02', 'neo-06', 'neo-10'], cond: qs(['neo-01', 'neo-02', 'neo-06', 'neo-10'], 2), reward: R(15, 6, 3) },
  // 청동기·고조선(핵심 2 + 기회 1)
  { id: 'm_gjs_core', era: 'gojoseon', kind: 'core', name: '나라의 시작, 고조선', required: true, action: 'quiz',
    trigger: '청동기·고조선 시대에 들어서면 열려요.', desc: '고조선의 건국과 홍익인간·8조법 문제 가운데 2개를 처음으로 맞히세요.',
    questionIds: ['gjs-01', 'gjs-02', 'gjs-04', 'gjs-05'], cond: qs(['gjs-01', 'gjs-02', 'gjs-04', 'gjs-05'], 2), reward: R(20, 6, 4) },
  { id: 'm_law', era: 'gojoseon', kind: 'core', name: '8조법 읽기', action: 'quiz',
    trigger: '청동기·고조선 시대에 들어서면 열려요.', desc: '8조법과 청동기 사회 변화 문제 가운데 2개를 처음으로 맞히세요.',
    questionIds: ['gjs-05', 'gjs-06', 'gjs-11'], cond: qs(['gjs-05', 'gjs-06', 'gjs-11'], 2), reward: R(15, 4, 3) },
  { id: 'm_bronze', era: 'gojoseon', kind: 'opportunity', name: '청동기 문화 탐구', required: false, action: 'quiz',
    trigger: '청동기·고조선 시대에 들어서면 열려요.', desc: '청동기·고조선 문제 6개를 처음으로 맞히고, 시연용 경쟁 부족 지역 1곳을 점령하세요.',
    questionIds: ['gjs-01', 'gjs-02', 'gjs-03', 'gjs-04', 'gjs-05', 'gjs-06', 'gjs-07', 'gjs-08', 'gjs-09', 'gjs-10', 'gjs-11', 'gjs-12', 'gjs-13'],
    cond: { uniqueCorrect: { era: 'gojoseon', n: 6 }, rivalCaptured: 1 }, reward: R(20, 8, 4) },

  // 삼국·가야(핵심 1 + 사건·기회 5)
  { id: 'm_sg_found', era: 'samguk', kind: 'core', name: '삼국과 가야의 시작', required: true, action: 'quiz',
    trigger: '삼국·가야 시대에 들어서면 열려요.', desc: '고구려·백제·가야의 시작 문제 가운데 2개를 처음으로 맞히세요.',
    questionIds: ['sg-01', 'sg-02', 'sg-03'], cond: qs(['sg-01', 'sg-02', 'sg-03'], 2), reward: R(25, 8, 5) },
  { id: 'm_sg_han', era: 'samguk', kind: 'event', name: '한강 유역을 둘러싼 경쟁', action: 'quiz',
    trigger: '삼국이 한강 유역을 두고 다투던 때의 사건이에요.', desc: '광개토 대왕·진흥왕·한강 유역 문제 가운데 2개를 처음으로 맞히세요.',
    questionIds: ['sg-04', 'sg-06', 'sg-07'], cond: qs(['sg-04', 'sg-06', 'sg-07'], 2), reward: R(15, 5, 3) },
  { id: 'm_sg_salsu', era: 'samguk', kind: 'event', name: '살수 대첩', action: 'quiz',
    trigger: '612년, 수나라 대군이 고구려에 쳐들어왔어요.', desc: '을지문덕과 살수 대첩 문제를 처음으로 맞히세요.',
    questionIds: ['sg-05'], cond: qs(['sg-05'], 1), reward: R(15, 5, 3) },
  { id: 'm_sg_culture', era: 'samguk', kind: 'opportunity', name: '문화 교류의 바닷길', action: 'quiz',
    trigger: '삼국은 이웃 나라와 학문·기술을 나누었어요.', desc: '왕인과 첨성대 문제 가운데 1개를 처음으로 맞히세요.',
    questionIds: ['sg-09', 'sg-10'], cond: qs(['sg-09', 'sg-10'], 1), reward: R(15, 6, 3) },
  { id: 'm_sg_gaya', era: 'samguk', kind: 'opportunity', name: '가야의 철', action: 'quiz',
    trigger: '가야 연맹의 철이 바닷길로 퍼져 나가요.', desc: '가야의 철 문제를 처음으로 맞히세요.',
    questionIds: ['sg-03'], cond: qs(['sg-03'], 1), reward: R(15, 6, 3, 'c_gaya_iron') },
  { id: 'm_sg_unify', era: 'samguk', kind: 'event', name: '삼국 통일로 가는 길', action: 'quiz',
    trigger: '7세기, 신라가 당과 손을 잡았어요.', desc: '신라와 당의 연합 문제를 처음으로 맞히세요.',
    questionIds: ['sg-08'], cond: qs(['sg-08'], 1), reward: R(15, 5, 3) },

  // 남북국(핵심 1 + 사건·기회 4)
  { id: 'm_nb_core', era: 'nambuk', kind: 'core', name: '남과 북의 두 나라', required: true, action: 'quiz',
    trigger: '남북국 시대에 들어서면 열려요.', desc: '삼국 통일 완성·발해 건국·남북국 시대 문제 가운데 2개를 처음으로 맞히세요.',
    questionIds: ['nb-01', 'nb-03', 'nb-11'], cond: qs(['nb-01', 'nb-03', 'nb-11'], 2), reward: R(25, 8, 5) },
  { id: 'm_nb_king', era: 'nambuk', kind: 'event', name: '문무왕과 신문왕', action: 'quiz',
    trigger: '676년, 신라가 삼국 통일을 완성했어요.', desc: '문무왕과 신문왕 문제 2개를 처음으로 맞히세요.',
    questionIds: ['nb-01', 'nb-02'], cond: qs(['nb-01', 'nb-02'], 2), reward: R(15, 5, 3) },
  { id: 'm_nb_balhae', era: 'nambuk', kind: 'event', name: '대조영과 발해', action: 'quiz',
    trigger: '698년, 대조영이 발해를 세웠어요.', desc: '발해 건국·온돌·해동성국 문제 가운데 2개를 처음으로 맞히세요.',
    questionIds: ['nb-03', 'nb-04', 'nb-05'], cond: qs(['nb-03', 'nb-04', 'nb-05'], 2), reward: R(15, 5, 3) },
  { id: 'm_nb_sea', era: 'nambuk', kind: 'opportunity', name: '바닷길과 먼 여행', action: 'quiz',
    trigger: '장보고의 배와 혜초의 발걸음이 먼 곳까지 이어져요.', desc: '장보고·혜초 문제 가운데 1개를 처음으로 맞히세요.',
    questionIds: ['nb-06', 'nb-09'], cond: qs(['nb-06', 'nb-09'], 1), reward: R(15, 6, 3) },
  { id: 'm_nb_bulguk', era: 'nambuk', kind: 'opportunity', name: '불국사와 석굴암', action: 'quiz',
    trigger: '통일 신라의 불교 문화가 꽃피었어요.', desc: '불국사·원효·성덕 대왕 신종 문제 가운데 2개를 처음으로 맞히세요.',
    questionIds: ['nb-07', 'nb-08', 'nb-10'], cond: qs(['nb-07', 'nb-08', 'nb-10'], 2), reward: R(15, 6, 3, 'c_bulguksa') },

  // 고려(핵심 1 + 사건·기회 5)
  { id: 'm_gr_core', era: 'goryeo', kind: 'core', name: '고려 건국과 후삼국 통일', required: true, action: 'quiz',
    trigger: '고려 시대에 들어서면 열려요.', desc: '왕건과 후삼국 문제 2개를 처음으로 맞히세요.',
    questionIds: ['gr-01', 'gr-02'], cond: qs(['gr-01', 'gr-02'], 2), reward: R(25, 8, 5) },
  { id: 'm_gr_seohui', era: 'goryeo', kind: 'event', name: '서희의 담판과 강동 6주', action: 'quiz',
    trigger: '993년, 거란이 쳐들어왔어요.', desc: '서희의 외교 담판 문제를 처음으로 맞히세요.',
    questionIds: ['gr-03'], cond: qs(['gr-03'], 1), reward: R(15, 5, 3) },
  { id: 'm_gr_gwiju', era: 'goryeo', kind: 'event', name: '귀주 대첩', action: 'quiz',
    trigger: '1019년, 거란이 다시 쳐들어왔어요.', desc: '강감찬과 귀주 대첩 문제를 처음으로 맞히세요.',
    questionIds: ['gr-04'], cond: qs(['gr-04'], 1), reward: R(15, 5, 3) },
  { id: 'm_gr_print', era: 'goryeo', kind: 'opportunity', name: '팔만대장경과 직지', action: 'quiz',
    trigger: '고려의 인쇄 기술이 빛나요.', desc: '팔만대장경과 직지 문제 2개를 처음으로 맞히세요.',
    questionIds: ['gr-05', 'gr-06'], cond: qs(['gr-05', 'gr-06'], 2), reward: R(15, 6, 3, 'c_tripitaka') },
  { id: 'm_gr_mongol', era: 'goryeo', kind: 'event', name: '몽골과의 긴 항쟁', action: 'quiz',
    trigger: '13세기, 몽골이 여러 차례 쳐들어왔어요.', desc: '삼별초 문제를 처음으로 맞히세요.',
    questionIds: ['gr-09'], cond: qs(['gr-09'], 1), reward: R(15, 5, 3) },
  { id: 'm_gr_trade', era: 'goryeo', kind: 'opportunity', name: '벽란도와 고려청자', action: 'quiz',
    trigger: '여러 나라 상인이 벽란도로 모여들어요.', desc: '벽란도·상감 청자·삼국사기 문제 가운데 1개를 처음으로 맞히세요.',
    questionIds: ['gr-10', 'gr-07', 'gr-08'], cond: qs(['gr-10', 'gr-07', 'gr-08'], 1), reward: R(15, 6, 3) },

  // 조선(핵심 1 + 사건·기회 5)
  { id: 'm_js_core', era: 'joseon', kind: 'core', name: '조선 건국과 훈민정음', required: true, action: 'quiz',
    trigger: '조선 시대에 들어서면 열려요.', desc: '이성계와 세종의 훈민정음 문제 2개를 처음으로 맞히세요.',
    questionIds: ['js-01', 'js-02'], cond: qs(['js-01', 'js-02'], 2), reward: R(25, 8, 5, 'c_hunmin') },
  { id: 'm_js_science', era: 'joseon', kind: 'opportunity', name: '과학과 농업', action: 'quiz',
    trigger: '세종 때 백성을 위한 기구와 책이 만들어져요.', desc: '측우기와 농사직설 문제 2개를 처음으로 맞히세요.',
    questionIds: ['js-03', 'js-04'], cond: qs(['js-03', 'js-04'], 2), reward: R(15, 6, 3) },
  { id: 'm_js_imjin', era: 'joseon', kind: 'event', name: '임진왜란', action: 'quiz',
    trigger: '1592년, 일본이 쳐들어왔어요.', desc: '한산도 대첩과 거북선 문제 가운데 1개를 처음으로 맞히세요.',
    questionIds: ['js-05', 'js-06'], cond: qs(['js-05', 'js-06'], 1), reward: R(15, 5, 3) },
  { id: 'm_js_byeongja', era: 'joseon', kind: 'event', name: '병자호란', action: 'quiz',
    trigger: '1636년, 청나라가 쳐들어왔어요.', desc: '남한산성 문제를 처음으로 맞히세요.',
    questionIds: ['js-07'], cond: qs(['js-07'], 1), reward: R(15, 5, 3) },
  { id: 'm_js_tangpyeong', era: 'joseon', kind: 'event', name: '탕평과 수원 화성', action: 'quiz',
    trigger: '영조와 정조가 나라를 새롭게 하려고 해요.', desc: '탕평책과 거중기 문제 가운데 1개를 처음으로 맞히세요.',
    questionIds: ['js-08', 'js-09'], cond: qs(['js-08', 'js-09'], 1), reward: R(15, 5, 3) },
  { id: 'm_js_map', era: 'joseon', kind: 'opportunity', name: '김정호의 지도', action: 'quiz',
    trigger: '1861년, 접어서 들고 다니는 큰 지도가 나왔어요.', desc: '대동여지도 문제를 처음으로 맞히세요.',
    questionIds: ['js-10'], cond: qs(['js-10'], 1), reward: R(15, 6, 3) },

  // 개항기·독립운동(핵심 1 + 사건·기회 6)
  { id: 'm_md_core', era: 'modern', kind: 'core', name: '개항과 독립의 외침', required: true, action: 'quiz',
    trigger: '개항기·독립운동 시대에 들어서면 열려요.', desc: '강화도 조약·3·1 운동·임시 정부 문제 가운데 2개를 처음으로 맞히세요.',
    questionIds: ['md-01', 'md-07', 'md-08'], cond: qs(['md-01', 'md-07', 'md-08'], 2), reward: R(25, 8, 5) },
  { id: 'm_md_open', era: 'modern', kind: 'event', name: '강화도 조약', action: 'quiz',
    trigger: '1876년, 조선이 항구를 열었어요.', desc: '척화비와 강화도 조약 문제 2개를 처음으로 맞히세요.',
    questionIds: ['md-01', 'md-02'], cond: qs(['md-01', 'md-02'], 2), reward: R(15, 5, 3) },
  { id: 'm_md_donghak', era: 'modern', kind: 'event', name: '동학 농민 운동', action: 'quiz',
    trigger: '1894년, 농민들이 들고일어났어요.', desc: '전봉준 문제를 처음으로 맞히세요.',
    questionIds: ['md-03'], cond: qs(['md-03'], 1), reward: R(15, 5, 3) },
  { id: 'm_md_march', era: 'modern', kind: 'event', name: '3·1 운동', action: 'quiz',
    trigger: '1919년 3월 1일, 독립 만세 소리가 울려요.', desc: '3·1 운동과 유관순 문제 2개를 처음으로 맞히세요.',
    questionIds: ['md-07', 'md-10'], cond: qs(['md-07', 'md-10'], 2), reward: R(15, 5, 3) },
  { id: 'm_md_gov', era: 'modern', kind: 'event', name: '대한민국 임시 정부', action: 'quiz',
    trigger: '1919년, 상하이에 임시 정부가 세워졌어요.', desc: '대한민국 임시 정부 문제를 처음으로 맞히세요.',
    questionIds: ['md-08'], cond: qs(['md-08'], 1), reward: R(15, 5, 3, 'c_provisional') },
  { id: 'm_md_army', era: 'modern', kind: 'event', name: '한국광복군', action: 'quiz',
    trigger: '1940년, 임시 정부가 군대를 만들었어요.', desc: '한국광복군 문제를 처음으로 맞히세요.',
    questionIds: ['md-09'], cond: qs(['md-09'], 1), reward: R(15, 5, 3) },
  { id: 'm_md_patriot', era: 'modern', kind: 'opportunity', name: '나라를 지키려는 노력', action: 'quiz',
    trigger: '빼앗긴 권리를 되찾으려는 사람들이 있었어요.', desc: '독립신문·을사늑약·안중근 문제 가운데 2개를 처음으로 맞히세요.',
    questionIds: ['md-04', 'md-05', 'md-06'], cond: qs(['md-04', 'md-05', 'md-06'], 2), reward: R(15, 6, 3) },

  // 대한민국(핵심 1 + 사건·기회 5)
  { id: 'm_rp_core', era: 'republic', kind: 'core', name: '광복과 정부 수립', required: true, action: 'quiz',
    trigger: '대한민국 시대에 들어서면 열려요.', desc: '광복·5·10 총선거·정부 수립 문제 가운데 2개를 처음으로 맞히세요.',
    questionIds: ['rp-01', 'rp-02', 'rp-03'], cond: qs(['rp-01', 'rp-02', 'rp-03'], 2), reward: R(25, 8, 5, 'c_constitution') },
  { id: 'm_rp_war', era: 'republic', kind: 'event', name: '6·25 전쟁', action: 'quiz',
    trigger: '1950년 6월 25일, 전쟁이 일어났어요.', desc: '6·25 전쟁과 정전 협정 문제 2개를 처음으로 맞히세요.',
    questionIds: ['rp-04', 'rp-05'], cond: qs(['rp-04', 'rp-05'], 2), reward: R(15, 5, 3) },
  { id: 'm_rp_419', era: 'republic', kind: 'event', name: '4·19 혁명', action: 'quiz',
    trigger: '1960년, 학생과 시민이 부정 선거에 맞섰어요.', desc: '4·19 혁명 문제를 처음으로 맞히세요.',
    questionIds: ['rp-06'], cond: qs(['rp-06'], 1), reward: R(15, 5, 3) },
  { id: 'm_rp_518', era: 'republic', kind: 'event', name: '5·18 민주화 운동', action: 'quiz',
    trigger: '1980년 5월, 광주 시민들이 민주주의를 외쳤어요.', desc: '5·18 민주화 운동 문제를 처음으로 맞히세요.',
    questionIds: ['rp-07'], cond: qs(['rp-07'], 1), reward: R(15, 5, 3) },
  { id: 'm_rp_june', era: 'republic', kind: 'event', name: '6월 민주 항쟁', action: 'quiz',
    trigger: '1987년 6월, 시민들이 직선제를 요구했어요.', desc: '6월 민주 항쟁 문제를 처음으로 맞히세요.',
    questionIds: ['rp-08'], cond: qs(['rp-08'], 1), reward: R(15, 5, 3) },
  { id: 'm_rp_together', era: 'republic', kind: 'opportunity', name: '함께 이룬 성장', action: 'quiz',
    trigger: '세계와 만나고 어려움을 함께 이겨 냈어요.', desc: '서울 올림픽과 금 모으기 운동 문제 가운데 1개를 처음으로 맞히세요.',
    questionIds: ['rp-09', 'rp-10'], cond: qs(['rp-09', 'rp-10'], 1), reward: R(15, 6, 3) },
];

const CARD_NAME = new Map(CARDS.map((c) => [c.id, c.name]));
export function rewardText(reward) {
  const parts = [`경험치 +${reward.xp}`, `식량 +${reward.grain}`, `인구 +${reward.population}`];
  if (reward.card) parts.push(`카드 「${CARD_NAME.get(reward.card)}」`);
  return parts.join(' · ');
}

// 미션 정규화(lib/mission-progression.mjs): 원본·확장 미션을 합친 뒤, 같은 정답이 여러 미션 보상을 동시에 채우던
// 중복을 문제 소유권 + 선행 미션 순서로 바꾼다.
const QUESTION_ERA = new Map(QUESTIONS.map((q) => [q.id, q.era]));
const MISSION_TOPICS = {
  m_gjs_core: '고조선의 건국과 홍익인간', m_nb_core: '남북국 시대', m_md_core: '개항과 독립의 외침',
};
const MISSION_DESC_OVERRIDES = {
  m_sg_found: '고구려·백제의 시작 문제 2개를 처음으로 맞히세요. 가야의 철 문제는 「가야의 철」 미션에서 따로 다뤄요.',
};
const NORMALIZED = normalizeMissions([...RAW_MISSIONS, ...EXPANSION_MISSIONS], {
  questionEra: QUESTION_ERA, eraOrder: ERA_ORDER, topics: MISSION_TOPICS, descOverrides: MISSION_DESC_OVERRIDES,
  prerequisites: {
    m_sg_salsu: ['m_sg_found'], m_sg_gaya: ['m_sg_found'], m_sg_unify: ['m_sg_han'],
    m_gr_seohui: ['m_gr_core'], m_gr_gwiju: ['m_gr_seohui'], m_gr_mongol: ['m_war_02'],
    m_js_byeongja: ['m_js_imjin'], m_js_map: ['m_js_tangpyeong'],
    m_md_donghak: ['m_md_open'],
    m_war_01: ['m_sg_salsu'], m_war_02: ['m_gr_core'],
    m_war_03: ['m_js_imjin'], m_war_04: ['m_war_03'],
    m_war_05: ['m_js_byeongja'], m_war_06: ['m_war_05'],
  },
});
export const MISSION_NORMALIZATION = NORMALIZED.changes;
export const QUESTION_MISSION_OWNER = NORMALIZED.owner; // 문제 id → 그 문제의 첫 정답을 진행으로 세는 미션 id

// recommendWeight: 같은 시대·유형 미션끼리 표본 문항 수를 나눠 가진 추천 가중치(화면 정렬용, 보상과 무관).
export const MISSIONS = attachEventWeights(NORMALIZED.missions.map((m) => ({
  required: false, questionIds: [], requires: [], ...m, rewardText: rewardText(m.reward), weighting: MISSION_WEIGHTING.status,
})));
export const MISSION_BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));
export const MISSION_AUDIT = auditMissions(MISSIONS, { questionEra: QUESTION_ERA, eraOrder: ERA_ORDER, advanceRules: ADVANCE_RULES });
