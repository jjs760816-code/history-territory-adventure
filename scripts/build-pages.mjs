// GitHub Pages 용 웹 1인 체험판을 dist/ 에 만든다. 사용: node scripts/build-pages.mjs [출력 폴더]
// 게임 규칙(lib/game.mjs)·콘텐츠·화면(public/)은 로컬 서버판과 같은 파일을 복사해 쓴다.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function buildPages(outDir = join(ROOT, 'dist')) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'lib'), { recursive: true });

  for (const f of ['app.js', 'style.css']) await cp(join(ROOT, 'public', f), join(outDir, f));
  for (const f of ['game.mjs', 'content.mjs', 'questions.mjs', 'meta.mjs', 'schema.mjs']) {
    await cp(join(ROOT, 'lib', f), join(outDir, 'lib', f));
  }
  await cp(join(ROOT, 'pages', 'db-browser.mjs'), join(outDir, 'lib', 'db.mjs')); // node:sqlite 대신 sql.js
  await cp(join(ROOT, 'pages', 'crypto-shim.mjs'), join(outDir, 'lib', 'crypto-shim.mjs'));
  await cp(join(ROOT, 'pages', 'local-api.mjs'), join(outDir, 'lib', 'local-api.mjs'));
  await cp(join(ROOT, 'pages', 'web-entry.mjs'), join(outDir, 'web-entry.mjs'));
  await cp(join(ROOT, 'pages', 'vendor'), join(outDir, 'vendor'), { recursive: true });

  // 저장소 하위 경로(/저장소이름/)에서도 열리도록 절대 경로를 상대 경로로 바꾸고, 체험판 스크립트를 app.js 앞에 넣는다.
  let html = await readFile(join(ROOT, 'public', 'index.html'), 'utf8');
  html = html
    .replace('<title>역사 영토 원정대 — 로컬 시연판</title>', '<title>역사 영토 원정대 — 웹 체험판</title>')
    .replace('href="/style.css"', 'href="style.css"')
    .replace('<script src="/app.js" defer></script>', [
      '<script type="importmap">{"imports":{"node:crypto":"./lib/crypto-shim.mjs"}}</script>',
      '  <script src="vendor/sql-wasm.js"></script>',
      '  <script type="module" src="web-entry.mjs"></script>',
      '  <script src="app.js" defer></script>',
    ].join('\n'));
  if (!html.includes('web-entry.mjs')) throw new Error('index.html 의 app.js 스크립트 태그를 찾지 못했어요.');
  await writeFile(join(outDir, 'index.html'), html);
  await writeFile(join(outDir, '.nojekyll'), '');
  return outDir;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await buildPages(process.argv[2] ? resolve(process.argv[2]) : undefined);
  console.log(`웹 체험판 빌드 완료 → ${out}`);
}
