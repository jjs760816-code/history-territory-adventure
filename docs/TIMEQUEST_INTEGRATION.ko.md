# 잼스 타임퀘스트 연결판

2026-10-30 · 사용자 요청으로 별도 브랜치 `feat/timequest-integration`에서 준비했다. 라이브 학생 자료·비밀값은 읽거나 복사하지 않았다. 이 문서의 준비 완료는 공개 게시 완료를 뜻하지 않는다.

## 실제 사이트 소스 확인

`online-server/worker/source/index.mjs`는 호스트가 `xn--9t4b56g.com`이면 `/`에 `public/game-room.html`을 제공한다. 이 조건과 낱말풀이 저장소의 공식 README를 대조해 사이트 소스를 확인했다. GitHub 저장소는 `jjs760816-code/history-territory-adventure`다.

홈페이지에 새 타임퀘스트 진입 카드를 추가했다. `/timequest/`에서 게임 화면, `/api/timequest/*`에서 새 게임 API를 제공한다. 기존 역사 마블·땅따먹기·낱말풀이·역사 탐험 1 링크는 유지했다.

## 계정과 저장 방식

- 기존 `history_session` 쿠키와 `accounts`/`players` 인증을 재사용한다. 새 게임 화면에서도 기존 한글 아이디(3~16자)와 비밀번호(8~64자)로 로그인할 수 있다. 처음인 사용자의 가입도 기존 인증 규칙을 사용한다.
- 잼스 로그인 세션은 기존 서버 방식대로 새 로그인 시 갱신된다. 타임퀘스트에서 잼스 계정을 로그아웃하면 기존 탐험 화면도 로그아웃된다.
- 임시 비밀번호 변경이 필요한 계정은 새 게임도 차단하며 `/play.html`의 기존 계정 관리에서 바꾸도록 안내한다. 기존 교사 계정·초기화 권한을 변경하지 않는다.
- 새 `timequest_progress(player_id,data)` 테이블만 추가한다. 시대·위치·관찰·힌트·완료 미션·XP·카드를 저장한다. 기존 탐험 XP·카드·시장·국가에는 합산하지 않는다. 독립 실행판의 사용자/세션 DB도 가져오지 않는다.
- 기존 `BUCKET`의 `classroom-v1.sqlite` 저장과 ETag 조건부 쓰기를 재사용한다. 동시 충돌 시 최신 DB로 다시 처리하므로 다른 사용자의 기존 기록을 덮어쓰지 않는다. 정답·보상·관찰·시대 해금은 서버에서 검증한다.
- `/api/timequest/*`의 변경 요청에는 동일한 Origin과 JSON을 요구한다. 새 게임 정적 화면은 자체 CSP를 제공하고 서버 정답 모듈은 정적 파일로 제공하지 않는다.

## 빌드와 검사

Node.js 24 이상, 저장소에서 지정한 pnpm 11.25.0을 사용한다.

```sh
# 저장소 루트
npm test
cd online-server
pnpm install --frozen-lockfile
npm run build
npm run validate
node --test test/worker.test.mjs test/timequest.test.mjs
```

브라우저 도구가 있으면 `node scripts/timequest-browser.mjs`로 **빌드된 실제 Worker**를 브라우저 요청에 연결해 검사한다. `BROWSER_DRIVER`에 Playwright 모듈 경로, `CHROMIUM_PATH`에 Chromium 실행 파일을 지정할 수 있다. `ARTIFACT_DIR`가 있으면 화면을 저장한다. 모든 요청은 테스트용 메모리 Bucket으로 처리하며 라이브 사이트에 보내지 않는다.

확인한 결과:

- 기존 게임 검사 95개 통과.
- 기존 공유 Worker와 새 게임 검사 11개 통과(기존 계정 재사용·권한·기록 분리·동시 보상·해금·초기화·출처 차단).
- 홈페이지 새 카드 → 게임 진입 → 기존 한글 아이디 로그인 → 관찰/문제/카드 → 로그아웃 → 모바일 새 브라우저 로그인/새로고침 복원 통과. 기존 게임 XP가 바뀌지 않았다.
- 새 게임 독립 실행판은 별도 저장소에서 검사 11개와 6개 미션 완주·네트워크 실패/재시도·응답 유실·터치 역할 플레이를 검증했다.

## 원본 동기화

새 게임 원본은 `jjs760816-code/jams-history-rpg`다. `online-server/timequest/`는 해당 원본의 검토용 스냅샷이며 `source.json`에 원본 커밋과 SHA-256을 기록한다. 사이트용 HTML 경로와 `runtime.js`의 API/공유 계정 설정만 다르다. 원본 변경을 사이트에 반영하려면 먼저 원본을 커밋한 뒤 아래를 명시적으로 실행하고 diff·테스트를 검토한다.

```sh
cd online-server
node scripts/sync-timequest.mjs /workspace/jams-history-rpg
npm run build
npm run validate
node --test test/worker.test.mjs test/timequest.test.mjs
```

일반 빌드는 원본 체크아웃 없이 저장된 스냅샷만으로 가능하다. `timequest/public/`의 수정은 동기화 시 교체되므로 화면 수정은 원본 저장소에서 진행한다. Worker 인증·저장 어댑터는 `worker/source/timequest.mjs`에서 관리한다.

## 게시와 복구

현재 호스팅은 Node/Docker 서버가 아니라 Sites Worker ESM이다. 준비한 산출물은 `online-server/dist/server/index.js`와 `online-server/dist/.openai/hosting.json`이다. 기존 `.openai/hosting.json`, `BUCKET`, `AUTH_PEPPER`, 관리자 설정을 유지한 기존 사이트의 게시 경로를 사용해야 한다. 새 사이트/새 DB를 임의로 만들거나 운영 비밀값을 소스에 넣지 않는다.

사용자는 잼스.com 연결을 요청했다. 다만 이 작업의 도구 목록에는 기존 사이트를 게시하는 도구/연결이 제공되지 않아, 빌드 산출물 검증과 실제 게시를 구분해야 한다. 게시 수단이 준비되면 현재 라이브 버전과 바인딩을 확인하고 해당 사이트에 산출물을 게시한다. 복구는 이전 Worker 버전으로 되돌린다. 새 테이블은 기존 기능에서 참조하지 않으므로 사용자 데이터나 새 테이블을 삭제할 필요가 없다.

게시 후 실제 도메인에서 홈페이지 카드·로그인·미션 1개·로그아웃/다른 기기 이어하기와 기존 게임 접속을 확인해야 한다. 현재의 가상 HTTPS 브라우저 검사는 실제 배포 검증을 대신하지 않는다. 콘텐츠 원문 대조, 실제 교사·학생 검수는 후속으로 남아 있다.
