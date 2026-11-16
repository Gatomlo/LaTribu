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
  // 2. Tâches, occurrences (tâche x enfant x date) et registre de points.
  `CREATE TABLE tasks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     icon TEXT NOT NULL DEFAULT '✨',
     points INTEGER NOT NULL CHECK (points > 0),
     kind TEXT NOT NULL CHECK (kind IN ('plan', 'open')),
     repeat TEXT CHECK (repeat IN ('daily', 'days', 'weekly', 'monthly', 'date')),
     days TEXT,              -- JSON : jours de la semaine, 1 = lundi ... 7 = dimanche
     month_day INTEGER,
     date TEXT,              -- AAAA-MM-JJ (répétition « date précise »)
     moment TEXT CHECK (moment IN ('matin', 'apres', 'soir')),
     remind_at TEXT,         -- HH:MM
     created_at INTEGER NOT NULL
   );
   CREATE TABLE task_kids (
     task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
     PRIMARY KEY (task_id, kid_id)
   );
   CREATE TABLE occurrences (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     kid_id INTEGER REFERENCES kids(id) ON DELETE CASCADE,  -- NULL : mission ouverte pas encore prise
     due_date TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'wait', 'done', 'refused', 'missed')),
     points INTEGER NOT NULL,
     note TEXT,              -- motif de refus
     done_at INTEGER,
     decided_at INTEGER,
     UNIQUE (task_id, kid_id, due_date)
   );
   CREATE INDEX occurrences_kid_date ON occurrences(kid_id, due_date);
   CREATE INDEX occurrences_status ON occurrences(status);
   -- Registre des points : jamais modifié, seulement complété. Solde = SUM(delta), XP = SUM(xp).
   CREATE TABLE movements (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
     delta INTEGER NOT NULL,
     xp INTEGER NOT NULL DEFAULT 0,     -- XP gagné (gains uniquement, ne diminue jamais)
     label TEXT NOT NULL,
     ref_type TEXT,
     ref_id INTEGER,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX movements_kid ON movements(kid_id, id);`,
  // 3. Magasin : récompenses (par enfant, stock individuel ou partagé), achats avec approbation,
  //    objectif d'épargne, accessoires d'avatar payés avec les mêmes points.
  `ALTER TABLE kids ADD COLUMN goal_reward_id INTEGER;
   ALTER TABLE kids ADD COLUMN accessory_id INTEGER;
   CREATE TABLE rewards (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     icon TEXT NOT NULL DEFAULT '🎁',
     price INTEGER NOT NULL CHECK (price > 0),
     limit_period TEXT NOT NULL DEFAULT 'none' CHECK (limit_period IN ('none', 'day', 'week', 'month')),
     shared INTEGER NOT NULL DEFAULT 0,
     stock INTEGER,           -- stock restant si partagé (NULL = illimité ou stock individuel)
     created_at INTEGER NOT NULL
   );
   CREATE TABLE reward_kids (
     reward_id INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
     kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
     stock INTEGER,           -- stock individuel restant (NULL = illimité ou partagé)
     PRIMARY KEY (reward_id, kid_id)
   );
   CREATE TABLE purchases (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     reward_id INTEGER REFERENCES rewards(id) ON DELETE SET NULL,
     kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
     title TEXT NOT NULL,     -- copie : l'historique survit à la suppression de la récompense
     icon TEXT NOT NULL,
     price INTEGER NOT NULL,
     status TEXT NOT NULL DEFAULT 'req' CHECK (status IN ('req', 'given', 'refused')),
     created_at INTEGER NOT NULL,
     created_date TEXT NOT NULL,
     decided_at INTEGER
   );
   CREATE INDEX purchases_kid ON purchases(kid_id, reward_id, created_date);
   CREATE TABLE accessories (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     emoji TEXT NOT NULL,
     price INTEGER NOT NULL CHECK (price > 0)
   );
   INSERT INTO accessories (title, emoji, price) VALUES
     ('Lunettes', '🕶️', 40), ('Casquette', '🧢', 50), ('Casque audio', '🎧', 60), ('Éclair', '⚡', 80), ('Couronne', '👑', 150);
   CREATE TABLE kid_accessories (
     kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
     accessory_id INTEGER NOT NULL REFERENCES accessories(id) ON DELETE CASCADE,
     PRIMARY KEY (kid_id, accessory_id)
   );`,
];

const version = conn.prepare('PRAGMA user_version').get().user_version;
for (let i = version; i < MIGRATIONS.length; i++) {
  tx(() => {
    conn.exec(MIGRATIONS[i]);
    conn.exec(`PRAGMA user_version = ${i + 1}`);
  });
}

module.exports = { db, tx, DATA_DIR };
