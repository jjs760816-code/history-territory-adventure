# 역사랑 놀자 — 제작 기록

2026-10-25. 전체 주제: 역사를 읽다. 사람을 잇다.

게임 3종, 59반 프로젝트, 잼스 유튜브와 공개 영상 2종을 연결한다. 게임별 접속 방식은 서로 다르며 통합 계정이나 보상 연동은 구현하지 않았다. 운영 링크는 public/assets/content-catalog.json에 정리했다. 앞으로 콘텐츠를 추가할 수 있는 안내 입구이며 자동 수집·자동 게시 시스템은 아니다.

## 지도

국토지리정보원 국가지도집 page_104.php를 실제 브라우저로 열었으나 서비스 점검 안내가 나타났다. 지형 PDF도 HTML 점검 안내를 반환했다. 공식 지형 원본을 확보했다는 뜻으로 표현하지 않는다.

잘못 생성된 한반도 그림은 공개 자산에서 제외했다. portal-territory.svg는 cartography.json의 Natural Earth 현재 해안선·하천 좌표를 재사용했다. 점령 색상·깃발·진격 경로는 게임 연출이며 특정 시대의 국경·전투 경로가 아니다. 고도·산맥을 측정한 지형도는 아직 아니다. 공식 원본 확보 후 추가 교체가 필요하다.

## 이미지 도구와 프롬프트

내장 imagegen을 사용했다. 생성 원본은 유지하고 웹 표시용 WebP를 public/assets/에 보관했다.

- guide-jams.webp: 사용자 얼굴 그림의 얼굴형·머리·표정을 살리고, 가죽옷과 열매 바구니로 바꾸어 채집하며 먹는 남성 안내인. 따뜻한 애니메이션 스타일, 한반도 강과 산 배경, 현대 물건과 글자 제외.
- portal-marble.webp: Korean history board game premium key art, wooden board, two ivory dice, four colored tokens, carved pavilions, mountain landscape, warm amber and forest green, hand-painted animation style, no text/logos/violence.
- portal-adventure.webp: Korean youthful adventurers discover a luminous path across historical stone tools, pottery, pagoda, palace and modern city; teal and gold, hopeful hand-painted animation, no text/logos, no real child likeness.
- portal-territory.svg: 지도 정확성을 위해 생성 그림 대신 기존 벡터 자료를 편집했다. 점령 영역·깃발·신호 원·진격 경로의 CSS 애니메이션. 동작 줄이기 설정에서는 정지한다.

## 검증

기존 게임 검사 57개, 공유 Worker 검사 5개 통과. 공개 서버 시험 계정에서 아바타 저장·강화·재로그인 복원 확인. 실제 브라우저에서 성장판·옷장·로그아웃 확인창을 확인했다. 사용자 계정의 자원이나 아바타는 바꾸지 않았다. 세 게임의 접속 화면과 마블의 Firebase 연결 완료 표시를 확인했다. 이는 세 게임의 모든 기능을 재검증했다는 뜻은 아니다.

클로드는 도구 없는 단일 호출로 짧은 소개 문구만 검토했다. 시각 자산·링크 확인·구현·배포는 Codex가 담당했다. 사용량을 서비스 간 이전하거나 할당량을 자동 조정하는 기능은 아니다.

## 최종 사용자 수정 반영
큰 59반·유튜브·다음 배움 영역을 3개의 짧은 카드로 통합했다. 역사동아리 영상은 안내에서 제거했다. 부마 가치 그림책 ‘내 안의 용기’와 5·18 가치 그림책 ‘평화란 뭘까?’는 잼스 채널의 실제 공개 영상 주소를 확인해 연결했다.
땅따먹기 소개 이미지는 사용자 재요청에 따라 지도가 아닌 가상 전략 보드 장면으로 교체했다. portal-territory-fun.webp의 프롬프트: Korean history territory capture game, four colorful banners and wooden team tokens approaching fortress towns and a central watchtower, warm sunset, hand-painted animation, imaginary battlefield not a geographical map, no text/logos/violence. 내장 imagegen 생성. 확대·이동·점령 신호 애니메이션과 정지 버튼을 추가했다. 국토지리정보원 지형 기반 이미지라고 표시하지 않는다.
