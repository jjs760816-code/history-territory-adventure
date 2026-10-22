// 공개 가능한 게임 콘텐츠(정답 없음). /api/meta 로 클라이언트에 전달된다.

export const ERAS = [
  { id: 'paleolithic', name: '구석기 시대', order: 0,
    summary: '돌을 깨뜨려 만든 뗀석기를 쓰고, 사냥·채집을 하며 먹을거리를 찾아 옮겨 다녔어요.' },
  { id: 'neolithic', name: '신석기 시대', order: 1,
    summary: '돌을 갈아 만든 간석기와 빗살무늬 토기를 쓰고, 농사를 시작해 강가·바닷가 움집에 정착했어요.' },
  { id: 'gojoseon', name: '청동기·고조선', order: 2,
    summary: '청동기와 함께 계급과 족장이 나타났고, 우리 역사 최초의 국가 고조선이 세워졌어요.' },
];
export const ERA_ORDER = Object.fromEntries(ERAS.map((e) => [e.id, e.order]));

// 시대 발전 조건. requires 의 era 는 "그 이전 시대에서 충족해야 할 조건"이다.
export const ADVANCE_RULES = {
  neolithic: { from: 'paleolithic', xp: 60, uniqueCorrect: 6, uniqueEra: 'paleolithic', power: 50, mission: 'm_camp' },
  gojoseon: { from: 'neolithic', xp: 150, uniqueCorrect: 6, uniqueEra: 'neolithic', power: 100, mission: 'm_farm' },
};

// 초기값과 보상 수치(공개 규칙)
export const RULES = {
  start: { xp: 0, grain: 20, population: 10 },
  firstCorrect: { xpBase: 10, xpPerDifficulty: 5, grain: 4, population: 2 }, // XP = 10 + 5×(난이도-1)
  repeatCorrect: { xp: 0, grain: 0, population: 0 },
  wrong: { xp: 0, grain: 0, population: 0 },
  capture: { grain: 6, population: 3 },
  rivalWinsNeeded: 2,
  challengeTtlMs: 30 * 60 * 1000,
  powerFormula: '국력 = 인구 + 식량÷2(내림) + 영토 수×8 + 카드 국력 보너스',
};

// 시연용 지도. 실제 역사 국경이 아니며 지형 이름도 게임용 설명이다.
// owner: neutral(중립) | rival(시연용 컴퓨터 부족 — 실제 사용자 아님)
export const REGIONS = [
  { id: 'r01', name: '북서 고원', terrain: '고원', era: 'gojoseon', owner: 'rival',
    points: '112,58 150,34 186,44 182,128 120,132', label: [150, 88] },
  { id: 'r02', name: '북부 산지', terrain: '산지', era: 'neolithic', owner: 'neutral',
    points: '186,44 228,26 262,40 258,126 182,128', label: [222, 84] },
  { id: 'r03', name: '북동 해안', terrain: '해안', era: 'neolithic', owner: 'neutral',
    points: '262,40 300,30 330,56 300,126 258,126', label: [292, 82] },
  { id: 'r04', name: '큰강 평야', terrain: '강가 평야', era: 'gojoseon', owner: 'neutral',
    points: '104,138 168,134 166,228 110,232 96,186', label: [134, 184] },
  { id: 'r05', name: '중북 산맥', terrain: '산지', era: 'paleolithic', owner: 'neutral',
    points: '168,134 236,132 234,226 166,228', label: [200, 180] },
  { id: 'r06', name: '동쪽 바닷가', terrain: '해안', era: 'neolithic', owner: 'neutral',
    points: '236,132 296,132 284,190 266,226 234,226', label: [262, 178] },
  { id: 'r07', name: '한강 유역', terrain: '강가 평야', era: 'neolithic', owner: 'neutral',
    points: '114,238 178,236 180,328 120,330 104,286', label: [146, 284] },
  { id: 'r08', name: '큰줄기 산맥', terrain: '산지', era: 'paleolithic', owner: 'neutral',
    points: '178,236 238,234 240,326 180,328', label: [210, 280] },
  { id: 'r09', name: '동해 모래톱', terrain: '해안', era: 'paleolithic', owner: 'neutral',
    points: '238,234 268,234 290,280 286,326 240,326', label: [264, 282] },
  { id: 'r10', name: '금빛 강가', terrain: '강가 평야', era: 'paleolithic', owner: 'neutral',
    points: '112,336 172,334 172,428 112,430 100,382', label: [140, 382] },
  { id: 'r11', name: '소백 고개', terrain: '산지', era: 'gojoseon', owner: 'rival',
    points: '172,334 232,332 232,426 172,428', label: [202, 380] },
  { id: 'r12', name: '낙동 물길', terrain: '강가 평야', era: 'paleolithic', owner: 'neutral',
    points: '232,332 290,330 298,380 290,424 232,426', label: [262, 378] },
  { id: 'r13', name: '서남 들판', terrain: '평야', era: 'gojoseon', owner: 'neutral',
    points: '100,436 162,434 160,508 120,516 92,482', label: [128, 474] },
  { id: 'r14', name: '남쪽 계곡', terrain: '계곡', era: 'neolithic', owner: 'neutral',
    points: '162,434 222,432 226,504 160,508', label: [192, 470] },
  { id: 'r15', name: '남동 포구', terrain: '해안', era: 'gojoseon', owner: 'neutral',
    points: '222,432 290,430 298,470 266,500 226,504', label: [258, 466] },
  { id: 'r16', name: '남쪽 큰섬', terrain: '섬', era: 'neolithic', owner: 'neutral',
    points: '112,548 134,536 170,538 186,552 160,566 124,564', label: [148, 552] },
];
export const REGION_BY_ID = new Map(REGIONS.map((r) => [r.id, r]));

// 카드 6~10장. effect 는 서버가 보상 계산 때 적용한다.
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
];

export const MISSIONS = [
  { id: 'm_camp', era: 'paleolithic', name: '첫 터전 마련', required: true,
    desc: '지역 3곳을 점령해 무리가 머물 터전을 마련하세요.', cond: { territories: 3 } },
  { id: 'm_farm', era: 'neolithic', name: '정착과 농경', required: true,
    desc: '강가·평야·해안 지형의 신석기 지역 2곳을 점령해 농사와 고기잡이 마을을 세우세요.',
    cond: { capturedTerrain: { era: 'neolithic', terrains: ['강가 평야', '해안', '평야'], n: 2 } } },
  { id: 'm_review', era: 'neolithic', name: '틀린 문제 다시 보기', required: false,
    desc: '틀렸던 문제를 복습해서 맞혀 보세요.', cond: { reviewCorrect: 1 } },
  { id: 'm_bronze', era: 'gojoseon', name: '청동기 문화 탐구', required: false,
    desc: '청동기·고조선 문제 6개를 처음으로 맞히고, 시연용 경쟁 부족 지역 1곳을 점령하세요.',
    cond: { uniqueCorrect: { era: 'gojoseon', n: 6 }, rivalCaptured: 1 } },
];
