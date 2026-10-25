import { CURRICULUM } from './curriculum.mjs';
import { BUILDINGS, SKILLS, FACTIONS } from './expansion-content.mjs';
// 화면에 내려보내는 공개 메타데이터(정답 없음). 로컬 서버와 웹 체험판이 함께 쓴다.
import {
  ERAS, ADVANCE_RULES, RULES, REGIONS, CARDS, MISSIONS, MISSION_WEIGHTING, LATER_ERA_MAP_NOTICE, FINAL_ERA,
} from './content.mjs';

const DEMO = {
  mode: 'local-single-player',
  badge: '로컬 1인 시연판 · 온라인 경쟁 미구현',
  notice: '로컬 1인 시연판입니다. 방 기반 온라인 경쟁·실시간 동기화는 아직 구현되지 않았어요.',
  storageNotice: '저장은 이 컴퓨터의 서버(data 폴더)에만 돼요. 학생 실명·연락처는 받지 않아요.',
  judgeNotice: '정답 판정·보상·영토는 이 컴퓨터의 로컬 서버가 확인해요.',
  judgeShort: '서버가 확인',
  mapNotice: '한반도·만주 역사 탐험 지도 · 실제 지리 기반, 점령 구역은 게임 규칙입니다.',
  rivalNotice: '경쟁 부족은 시연용 컴퓨터 설정이며 실제 온라인 사용자가 아니에요.',
  aiReview: 'not_connected',
  questionReview: '모든 문제는 자체 제작이며 출처 원문 대조 전이라 "검수 대기" 상태예요.',
};

export function buildMeta(demoOverrides = {}) {
  return {
    demo: { ...DEMO, ...demoOverrides },
    development: { buildings: BUILDINGS, skills: SKILLS, factions: FACTIONS, notice: '시설·수확·스킬 수치는 게임 규칙이며 역사적 생산량이 아니에요. 유물은 디지털 학습 기록이에요.' },
    curriculum:CURRICULUM, eras: ERAS, finalEra: FINAL_ERA, advanceRules: ADVANCE_RULES, rules: RULES,
    laterEraMapNotice: LATER_ERA_MAP_NOTICE, missionWeighting: MISSION_WEIGHTING,
    regions: REGIONS, cards: CARDS.map(({ cond, ...c }) => c), missions: MISSIONS.map(({ cond, ...m }) => m),
  };
}
