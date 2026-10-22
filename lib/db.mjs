// node:sqlite 기반 저장소. 파일은 data/ (또는 DATA_DIR) 안에 둔다.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA } from './schema.mjs';

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
