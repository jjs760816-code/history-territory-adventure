# 잼스.com 기존 게시 작업에서 이어서 배포

사용자는 타임퀘스트의 GitHub 저장, 잼스.com 게시, 관리자·가상 학생 로그인과 검사 후 즉시 배포를 승인했다. 같은 게시 승인을 반복 요청할 필요가 없다.

## 확인한 실제 게시 경로

Codex 작업 **‘게임 진행 저장 및 재접속 개선’**의 이력에서 기존 Sites 프로젝트 `appgprj_6addae00edf08191b0d09c13349eb65e`에 `sites.get_site`, `sites.save_site_version`, `sites.deploy_site_version`으로 게시했던 기록을 확인했다. 현재 클라우드 작업에는 이 게시 도구들이 없다. 다른 작업의 자격 증명이나 토큰을 추출해 옮기지 않는다.

해당 게시 작업의 이력에는 학생 요청 게시판 메뉴 및 한 행 하단 수정이 있다. 현재 GitHub 사본의 `public/game-room.html`에는 그 변경이 없으므로 **이 클라우드에서 만든 사이트 전체 빌드로 현재 사이트를 바로 덮어쓰지 않는다.** 기존 Sites의 최신 소스와 바인딩을 가져온 뒤 새 게임 변경만 병합해야 한다. 이 문서가 실제 공개 반영을 완료했다는 뜻은 아니다.

## 가져올 변경

- `jjs760816-code/history-territory-adventure`의 `feat/timequest-integration`
- 게임 원본: `jjs760816-code/jams-history-rpg`의 `feat/login-save-prototype`
- 사이트 연결 파일: `online-server/timequest/` 전체, `worker/source/timequest.mjs`, `scripts/sync-timequest.mjs`, `scripts/timequest-browser.mjs`, `test/timequest.test.mjs`와 `test/preview.test.mjs`의 새 게임 격리 검사.
- 병합할 기존 파일: `online-server/worker/source/index.mjs`의 `/api/timequest/*` 분기 및 `/timequest/` 정적 경로/CSP, `scripts/bundle.mjs`의 새 게임 에셋 수집, 현재 홈페이지에 새 진입 카드 추가.

기존 게시 원본이 `game-source/public/`을 사용한다면 해당 원본의 홈페이지에 카드만 추가한다. GitHub 사본의 홈페이지 전체를 교체하지 않는다. 기존 인증·게시판·낱말풀이·하단·기존 게임과 배포 메타데이터를 보존한다. 서버 소스 경로가 다르면 현재 원본 구조에 맞춰 import와 복사 경로를 조정한다.

## 계정과 검증

타임퀘스트는 기존 `history_session`과 `accounts`/`players`, 전용 가상 학생 및 복귀 쿠키를 재사용한다. 새 진행은 `timequest_progress`에 보관하며 기존 XP·카드에 합산하지 않는다. 기존 `BUCKET`, `AUTH_PEPPER`, `ADMIN_OWNER_EMAIL`은 유지하고 운영 비밀값/학생 자료를 GitHub나 채팅으로 복사하지 않는다.

가상 DB에서 일반 학생 로그인·미션·다른 기기 이어하기와 관리자 로그인·가상 학생 전환·새로고침·복귀·재체험·로그아웃·복수 관리자 선택을 검사했다. 독립 실행판 서버 11개, 공유 Worker 전체 24개와 두 브라우저 검사 흐름이 통과했다. 현재 라이브 운영 계정 검증은 별도다.

## 실행 순서

1. 기존 사이트 메타데이터와 최신 Sites 원본 커밋/버전 확인.
2. 위 GitHub 브랜치의 새 게임 변경만 최신 원본에 병합하고 전체 diff 검토.
3. 기존 빌드·ESM 검사 및 공유 Worker 전체 테스트(`node --test test/*.test.mjs`), `scripts/timequest-browser.mjs` 실행. 브라우저는 가상 Bucket을 사용하므로 운영 데이터가 필요 없다.
4. 기존 Sites 원본 저장·버전 생성·동일 프로젝트에 배포. 새 프로젝트나 새 DB를 임의로 만들지 않는다.
5. 실제 `https://xn--9t4b56g.com/`의 새 카드와 `/timequest/`, 관리자 ChatGPT 로그인·가상 학생 복귀, 일반 사용자 저장·이어하기 및 기존 홈페이지 기능을 확인.
6. 실제 열리는 실행 주소와 배포 버전/검사 결과를 사용자에게 전달. 저장·빌드만 성공한 경우 게시 성공이라고 보고하지 않는다.

## 사용자에게 필요한 한 번의 전달

기존 **‘게임 진행 저장 및 재접속 개선’** 작업에 아래 문장을 전달하면 관련 코드와 범위를 찾을 수 있다.

> `jjs760816-code/history-territory-adventure`의 `feat/timequest-integration` 브랜치에 준비된 타임퀘스트를 현재 잼스.com Sites 최신 소스에 병합해 게시해줘. `docs/DEPLOY_HANDOFF.ko.md`를 먼저 읽고 기존 게시판·낱말풀이·하단·인증·학생 데이터를 보존해. 관리자·가상 학생 로그인과 일반 사용자 저장/이어하기를 검증하고 같은 사이트에 배포한 뒤 실제 실행 주소를 확인해줘. 게시 승인은 이미 했어.
