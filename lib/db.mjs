// node:sqlite 기반 저장소. 파일은 data/ (또는 DATA_DIR) 안에 둔다.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMA = `
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
  mode TEXT NOT NULL,             -- 'region' | 'review'
  choice_order TEXT NOT NULL,     -- JSON: 화면 위치 → 원래 보기 번호
  created_at INTEGER NOT NULL
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
  reward_key TEXT NOT NULL,       -- 'q:<id>' | 'capture:<region>' ...
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
`;

export function openDb(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'game.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

// 동기 트랜잭션. node:sqlite 는 동기라 한 요청의 처리 중 다른 요청이 끼어들지 않지만,
// 중간 오류 시 일부만 반영되지 않도록 묶는다.
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
