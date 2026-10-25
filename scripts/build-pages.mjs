// GitHub Pages 용 웹 1인 체험판을 dist/ 에 만든다. 사용: node scripts/build-pages.mjs [출력 폴더]
// 게임 규칙(lib/*.mjs)·콘텐츠·화면(public/)은 로컬 서버판과 같은 파일을 복사해 쓴다.
// 저장소 하위 경로(https://아이디.github.io/저장소/)에서도 열리도록 모든 경로를 상대 경로로 만든다.
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 웹 체험판 스크립트는 audio.js·app.js 보다 먼저 실행되어야 한다(가짜 /api 준비).
const PAGES_SCRIPTS = [
  '<script type="importmap">{"imports":{"node:crypto":"./lib/crypto-shim.mjs"}}</script>',
  '<script src="vendor/sql-wasm.js"></script>',
  '<script type="module" src="web-entry.mjs"></script>',
];

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

// 루트 기준 절대 경로(/assets/…, /app.js …)가 남아 있으면 하위 경로 배포에서 깨진다.
const ABSOLUTE_REF = /(?:src|href)="\/(?!\/)|url\(\s*['"]?\/(?!\/)|['"`]\/assets\//;

export function rewriteIndexHtml(html) {
  let out = html
    .replace('<title>역사 탐험 1 — 로컬 시연판</title>', '<title>역사 탐험 1 — 웹 체험판</title>')
    .replace(/<html lang="ko">/, '<html lang="ko" data-web="pages">')
    .replace(/(src|href)="\/(?!\/)/g, '$1="');
  const anchor = out.match(/<script src="audio\.js"[^>]*><\/script>/) || out.match(/<script src="app\.js"[^>]*><\/script>/);
  if (!anchor) throw new Error('index.html 에서 audio.js/app.js 스크립트 태그를 찾지 못했어요.');
  out = out.replace(anchor[0], `${PAGES_SCRIPTS.join('\n  ')}\n  ${anchor[0]}`);
  return out;
}

export async function buildPages(outDir = join(ROOT, 'dist')) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'lib'), { recursive: true });

  // 화면 파일과 그림·소리·이야기 자료 전체(하위 폴더 포함)
  const srcIndex = join(ROOT, 'public', 'index.html');
  await cp(join(ROOT, 'public'), outDir, { recursive: true, filter: (src) => src !== srcIndex });
  // 게임 규칙 모듈 전체(지도 구역·문제·메타·스키마 등). db.mjs 는 브라우저용으로 바꾼다.
  for (const f of await readdir(join(ROOT, 'lib'))) {
    if (f.endsWith('.mjs')) await cp(join(ROOT, 'lib', f), join(outDir, 'lib', f));
  }
  await cp(join(ROOT, 'pages', 'db-browser.mjs'), join(outDir, 'lib', 'db.mjs')); // node:sqlite 대신 sql.js
  await cp(join(ROOT, 'pages', 'crypto-shim.mjs'), join(outDir, 'lib', 'crypto-shim.mjs'));
  await cp(join(ROOT, 'pages', 'local-api.mjs'), join(outDir, 'lib', 'local-api.mjs'));
  await cp(join(ROOT, 'pages', 'web-entry.mjs'), join(outDir, 'web-entry.mjs'));
  await cp(join(ROOT, 'pages', 'vendor'), join(outDir, 'vendor'), { recursive: true });

  const html = rewriteIndexHtml(await readFile(join(ROOT, 'public', 'index.html'), 'utf8'));
  await writeFile(join(outDir, 'index.html'), html);
  await writeFile(join(outDir, '.nojekyll'), '');

  // 검사: 화면 파일에 절대 경로가 남아 있지 않아야 한다(API 경로 /api/ 는 web-entry 가 가로챈다).
  for (const file of await walk(outDir)) {
    if (!['.html', '.css', '.js', '.mjs'].includes(extname(file)) || file.startsWith(join(outDir, 'vendor'))) continue;
    const text = await readFile(file, 'utf8');
    const m = text.match(ABSOLUTE_REF);
    if (m) throw new Error(`하위 경로에서 깨지는 절대 경로가 있어요: ${relative(outDir, file)} → ${m[0]}`);
  }
  return outDir;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await buildPages(process.argv[2] ? resolve(process.argv[2]) : undefined);
  console.log(`웹 체험판 빌드 완료 → ${out}`);
}
