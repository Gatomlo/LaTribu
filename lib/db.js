// Base SQLite unique data/latribu.db (module node:sqlite intégré à Node >= 22.5 : aucun
// module natif à compiler), créée et migrée au démarrage. LATRIBU_DATA_DIR change le
// dossier (tests, essais).
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.LATRIBU_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const conn = new DatabaseSync(path.join(DATA_DIR, 'latribu.db'));
conn.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

// Requêtes préparées gardées : le même SQL n'est compilé qu'une fois.
const statements = new Map();
const db = {
  prepare(sql) {
    let st = statements.get(sql);
    if (!st) { st = conn.prepare(sql); statements.set(sql, st); }
    return st;
  },
  exec: (sql) => conn.exec(sql),
};

function tx(fn) {
  conn.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    conn.exec('COMMIT');
    return result;
  } catch (err) {
    conn.exec('ROLLBACK');
    throw err;
  }
}

// Chaque entrée n'est jouée qu'une fois (PRAGMA user_version). Ne jamais modifier une
// entrée déjà déployée : en ajouter une nouvelle.
const MIGRATIONS = [
  // 1. Socle : comptes parents (compte partagé), enfants, sessions.
  `CREATE TABLE users (
     id INTEGER PRIMARY KEY,
     email TEXT NOT NULL UNIQUE COLLATE NOCASE,
     password_hash TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE kids (
     id INTEGER PRIMARY KEY AUTOINCREMENT, -- jamais réutilisé après suppression
     name TEXT NOT NULL,
     age INTEGER,
     palette INTEGER NOT NULL DEFAULT 0,
     pin_hash TEXT NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     role TEXT NOT NULL CHECK (role IN ('parent', 'kid')),
     user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
     kid_id INTEGER REFERENCES kids(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX sessions_kid ON sessions(kid_id);`,
];

const version = conn.prepare('PRAGMA user_version').get().user_version;
for (let i = version; i < MIGRATIONS.length; i++) {
  tx(() => {
    conn.exec(MIGRATIONS[i]);
    conn.exec(`PRAGMA user_version = ${i + 1}`);
  });
}

module.exports = { db, tx, DATA_DIR };
