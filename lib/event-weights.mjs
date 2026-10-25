// 71회 기본 50문항을 검토자가 독자 분류한 단일 회차 표본. 공식 출제율이 아니다.
export const EVENT_SAMPLE = {
 exam: '제71회 한국사능력검정시험 기본', date: '2024-08-10', sampleExams: 1, totalQuestions: 50,
 laterQuestions: 47, event: 30, opportunity: 17,
 status: 'single-exam-reviewed-sample',
 note: '71회 기본 표본을 게임용으로 자체 분류했어요. 삼국 이후 사건 30·기회 17(약 64:36)을 추천 가중치로 참고해요. 전체 기출의 공식 출제율은 아니에요.',
 source: 'https://www.historyexam.go.kr/pst/list.do?bbs=dat',
 byEra: {
  samguk: {event:2,opportunity:2}, nambuk: {event:1,opportunity:2},
  goryeo: {event:5,opportunity:4}, joseon: {event:5,opportunity:4},
  modern: {event:12,opportunity:4}, republic: {event:5,opportunity:1},
 },
};
// 미션 개수와 기출 문항 수가 달라도, 같은 시대·유형 안의 총 추천 가중치를 표본 수에 맞춘다.
export function attachEventWeights(missions) {
 const counts={};
 for(const m of missions)if(EVENT_SAMPLE.byEra[m.era]?.[m.kind])counts[`${m.era}:${m.kind}`]=(counts[`${m.era}:${m.kind}`]||0)+1;
 return missions.map(m=>({...m,recommendWeight:EVENT_SAMPLE.byEra[m.era]?.[m.kind] ? EVENT_SAMPLE.byEra[m.era][m.kind]/counts[`${m.era}:${m.kind}`]:0}));
}
