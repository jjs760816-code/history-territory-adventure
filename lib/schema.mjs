// SQLite 스키마. 로컬 서버(node:sqlite)와 웹 체험판(sql.js)이 함께 쓴다.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  era TEXT NOT NULL,
  xp INTEGER NOT NULL,
  grain INTEGER NOT NULL,
  population INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS player_regions (
  player_id TEXT NOT NULL,
  region_id TEXT NOT NULL,
  owner TEXT NOT NULL,           -- 'neutral' | 'rival' | 'player'
  rival_wins INTEGER NOT NULL DEFAULT 0,
  captured_at INTEGER,
  PRIMARY KEY (player_id, region_id)
);
CREATE TABLE IF NOT EXISTS question_versions (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_version INTEGER NOT NULL,
  region_id TEXT,
  mode TEXT NOT NULL,             -- 'region' | 'review' | 'mission'
  choice_order TEXT NOT NULL,     -- JSON: 화면 위치 → 원래 보기 번호
  created_at INTEGER NOT NULL,
  mission_id TEXT                 -- 미션 문제일 때 미션 id (v2에서 추가)
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  question_version INTEGER NOT NULL,
  region_id TEXT,
  mode TEXT NOT NULL,
  correct INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attempts_player ON attempts(player_id, question_id);
CREATE TABLE IF NOT EXISTS rewards (
  player_id TEXT NOT NULL,
  reward_key TEXT NOT NULL,       -- 'q:<문제>' | 'capture:<지역>' | 'm:<미션>'
  xp INTEGER NOT NULL,
  grain INTEGER NOT NULL,
  population INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, reward_key)
);
CREATE TABLE IF NOT EXISTS player_cards (
  player_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, card_id)
);
CREATE TABLE IF NOT EXISTS era_log (
  player_id TEXT NOT NULL,
  era TEXT NOT NULL,
  entered_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, era)
);
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  data TEXT NOT NULL,
  status TEXT NOT NULL,           -- 'pending_review' (승인 기능 없음)
  ai_review TEXT NOT NULL,        -- 'not_connected'
  format_check TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- 답 영수증: 답을 확정한 같은 거래 안에서 저장한다. 응답이 중간에 사라져 브라우저가 같은 요청 번호(request_id)로
-- 다시 보내면 판정·보상을 다시 하지 않고 이 결과를 돌려준다. 정답은 이미 받은 그 학생에게만 다시 보여 준다.
CREATE TABLE IF NOT EXISTS answer_receipts (
  challenge_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  request_id TEXT,
  answer_key TEXT NOT NULL,
  result TEXT NOT NULL,           -- JSON: 판정 결과(state 제외) 또는 {"expired":true}
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS answer_receipts_player ON answer_receipts(player_id, created_at);
`;

// 이전 저장 파일을 지우지 않고 새 열을 더한다. node:sqlite 와 sql.js 모두 같은 SQL로 동작한다.
// 여러 번 실행해도 안전하다(이미 있으면 건너뜀).
export function migrateSchema(db) {
  const cols = db.prepare('PRAGMA table_info(challenges)').all().map((c) => c.name);
  if (!cols.includes('mission_id')) db.exec('ALTER TABLE challenges ADD COLUMN mission_id TEXT');
}
