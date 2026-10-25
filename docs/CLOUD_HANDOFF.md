# 클라우드 작업 인수인계 — 2026-10-25
## 현재 상태
포털 이름: 역사랑 놀자. 주제: 역사를 읽다. 사람을 잇다.
공개 포털: https://history-exploration-one-online.james816.chatgpt.site/game-room.html
공동 게임: https://history-exploration-one-online.james816.chatgpt.site/
GitHub: https://github.com/jjs760816-code/history-territory-adventure
소스 기준 커밋: 388b36b226f17cb6aafaf5b09e8d927b382e194a (이 문서를 추가하기 직전).
포털 최신 변경: 상단 59반 프로젝트·유튜브 중복 메뉴 삭제. 아래 59반·부마 그림책·5·18 그림책·잼스 유튜브 네 카드, 마지막 카드에 열매 먹는 잼스 이미지.
기존 docs/LATEST_DIRECTION.md의 온라인 기능 설명은 과거 시점이다. 아래 현재 배포 정보를 우선한다.
## 주요 소스
- public/game-room.html: 안내 포털, 반응형 네 칸 카드, 전략 게임 삽화 애니메이션.
- public/portal-music.js 및 public/assets/history-play-theme.mp3: 사용자 클릭으로 재생하는 직접 작곡한 국악풍 합성 기악 60초. Everygen은 audio:generate 권한 오류로 성공하지 않았다.
- public/assets/guide-jams.webp: 사용자가 제공한 얼굴 참고로 만든 열매를 먹는 안내인 잼스.
- public/assets/history-play-share.webp: 하이클래스·카카오톡용 정사각 홍보 이미지.
- lib/, server.mjs, public/: 학습 게임 본체.
- online-server/: 공용 Sites Worker 서버 소스. 실행 데이터·비밀값은 없음.
- online-server/scripts/bundle.mjs: 저장소 루트의 public/lib/pages를 사용해 공용 배포 빌드. online-server에서 의존성 설치 후 빌드한다. game-source가 있으면 그 폴더를 우선한다.
- docs/: 요구사항·교육내용 검토·배포 관련 기록.
## 실제 접속 링크
역사 마블 https://jjs760816-code.github.io/history-marble/
역사 땅따먹기 https://jams-history-territory.sunlitbrush7.chatgpt.site/
59반 https://history-nation-growth.sunlitbrush7.chatgpt.site/
잼스 유튜브 https://www.youtube.com/channel/UC0GrdlAij5TuMhW3LaAmkKA
부마 https://www.youtube.com/watch?v=Hug6Ma99eCg
5·18 https://www.youtube.com/watch?v=jZoifstrOIs
GitHub Pages 포털 https://jjs760816-code.github.io/history-territory-adventure/game-room.html
Pages의 개인 저장 게임과 Sites 공용 서버를 구분한다. 포털의 역사 탐험 버튼은 공용 서버로 연결한다.
## Sites 배포 정보
기존 프로젝트를 재사용한다. 새 사이트를 만들지 않는다.
project_id: appgprj_6addae00edf08191b0d09c13349eb65e
공개 범위: public (사용자 승인 완료).
최신 배포: version 9
version_id: appgprj_6addae00edf08191b0d09c13349eb65e~appgver_b75f7659b5b881919f13d9fd0c98e838
deployment_id: appgdep_6addfa7d46908191af15cd1f93fc1e7d
Sites 소스 commit: 39a243babd90a0440c6ed40cd3455431409f1777
Sites 저장소와 GitHub 저장소는 서로 다른 저장소이다. GitHub 저장만으로 Sites 배포가 바뀌지 않는다.
Sites 스킬에 따라 기존 소스를 열고 수정·빌드·소스동기화·버전저장·배포한다. 자격증명은 도구로 새로 발급하고 토큰을 채팅/파일에 남기지 않는다.
R2 BUCKET에 공용 SQLite 상태가 저장된다. 기존 학생 데이터와 관리자 계정은 보존한다.
ADMIN_OWNER_EMAIL, AUTH_PEPPER는 Sites 환경의 비밀값이다. 조회·복사·새 설정·변경하지 않는다.
## 기능과 검증 한계
공용 서버: 아이디·비밀번호, 관리자 계정 관리·임시 비밀번호 초기화, 공동 국가/시장, 자원과 영토, 9시대 문제와 미션, 카드/스킬, 아바타와 성장 화면 구현.
평문 비밀번호 조회 기능은 없음. 기존 비밀번호를 알려주지 않고 초기화하는 방식이다.
질문 164개, 미션 73개라는 이전 집계. 실제 파일을 확인해서 최신 수치를 판단한다.
문제 전체가 교사 검수 완료된 것은 아님. 외부 자료 출처 확인과 교사 검토를 구분. 대규모 학생 동시접속 검증 완료라고 주장하지 않는다.
최근 검증: 공개 포털 상단 메뉴 삭제 및 네 칸 이미지 표시 확인. 음악 클릭 재생/정지 및 단위 테스트 통과. GitHub Pages 직전 음악 배포 Actions 성공 확인. 최신 카드 변경은 GitHub main에 저장됨.
## 협업·범위
사용자는 Claude 협업을 원하지만 클라우드에서 로컬 Claude CLI 사용이 가능하다고 가정하지 않는다. 도구 접근 여부를 확인하고 불가능하면 직접 작업하며 설명한다. 사용량 제한을 완전히 방지한다고 약속하지 않는다.
임의 하위 에이전트를 만들지 않는다. 학생 데이터 삭제/테스트 보상으로 실제 계정 변경 금지. API 키·비밀값·학생 정보 커밋 금지.
오늘 사용자는 작업을 마무리하고 다른 패드/학교 컴퓨터에서 이 작업을 이어가고자 클라우드 인수인계를 요청했다. 현재는 연결 확인만 하고 추가 디자인 변경은 하지 않는다.
## 추가 로컬 파일
별도 PNG 프로필과 PNG 홍보 원본 및 ZIP은 기존 Mac outputs 폴더에 있다. 이번 인수인계에서 원본 프로필을 공개 GitHub에 추가하지 않았다. 기존 웹용 guide-jams.webp와 공유 WebP는 public/assets에 이미 포함되어 있다. 원본은 필요할 때 사용자가 별도로 업로드한다.
