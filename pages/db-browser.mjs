// 웹 체험판용 저장소. sql.js(SQLite WASM)에 node:sqlite DatabaseSync 와 같은 모양의 얇은 껍데기를 씌운다.
// 웹 빌드에서는 이 파일이 lib/db.mjs 자리에 들어가므로 lib/game.mjs 를 그대로 쓴다.
import { SCHEMA } from './schema.mjs';

// sql.js 의 export() 는 준비된 문장을 모두 해제하므로, 문장은 호출할 때마다 준비하고 바로 해제한다.
class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; }
  #withStmt(args, fn) {
    const stmt = this.db.raw.prepare(this.sql);
    try {
      if (args.length) stmt.bind(args.map((v) => (v === undefined ? null : v)));
      return fn(stmt);
    } finally { stmt.free(); }
  }
  run(...args) {
    this.#withStmt(args, (s) => { while (s.step()); });
    return { changes: this.db.raw.getRowsModified() };
  }
  get(...args) { return this.#withStmt(args, (s) => (s.step() ? s.getAsObject() : undefined)); }
  all(...args) {
    return this.#withStmt(args, (s) => {
      const rows = [];
      while (s.step()) rows.push(s.getAsObject());
      return rows;
    });
  }
}

export class BrowserDb {
  constructor(SQL, bytes) { this.raw = bytes ? new SQL.Database(bytes) : new SQL.Database(); }
  exec(sql) { this.raw.exec(sql); }
  prepare(sql) { return new Statement(this, sql); }
  export() { return this.raw.export(); }
  close() { this.raw.close(); }
}

export function openBrowserDb(SQL, bytes) {
  const db = new BrowserDb(SQL, bytes);
  db.exec(SCHEMA);
  return db;
}

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
