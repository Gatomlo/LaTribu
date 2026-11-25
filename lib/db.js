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
  // 4. Ludique : réglages, séries (paliers déjà récompensés), badges, niveau déjà célébré.
  `ALTER TABLE kids ADD COLUMN level_seen INTEGER NOT NULL DEFAULT 1;
   CREATE TABLE settings (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );
   CREATE TABLE streak_awards (
     kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
     run_start TEXT NOT NULL,   -- premier jour de la série en cours quand le palier a été atteint
     milestone INTEGER NOT NULL,
     PRIMARY KEY (kid_id, run_start, milestone)
   );
   CREATE TABLE badges (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
     key TEXT NOT NULL,         -- clé du badge automatique, ou custom:<horodatage> (badge du parent)
     title TEXT NOT NULL,
     emoji TEXT NOT NULL,
     custom INTEGER NOT NULL DEFAULT 0,
     seen INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     UNIQUE (kid_id, key)
   );`,
  // 5. Notifications push : abonnements par appareil, journal anti-doublon des envois planifiés.
  `CREATE TABLE push_subscriptions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     endpoint TEXT NOT NULL UNIQUE,
     p256dh TEXT NOT NULL,
     auth TEXT NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('parent', 'kid')),
     kid_id INTEGER REFERENCES kids(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX push_kid ON push_subscriptions(kid_id);
   CREATE TABLE notif_log (
     key TEXT PRIMARY KEY,
     at INTEGER NOT NULL
   );`,
  // 6. Photo preuve (par tâche + réglage global), bibliothèque de tâches types, validité des
  //    récompenses (dates, activation), appareils de confiance (verrous de connexion par appareil).
  `ALTER TABLE tasks ADD COLUMN photo_required INTEGER NOT NULL DEFAULT 0;
   CREATE TABLE occurrence_photos (
     occurrence_id INTEGER PRIMARY KEY REFERENCES occurrences(id) ON DELETE CASCADE,
     data BLOB NOT NULL,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE task_templates (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     title TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     icon TEXT NOT NULL DEFAULT '✨',
     points INTEGER NOT NULL CHECK (points > 0),
     repeat TEXT NOT NULL CHECK (repeat IN ('daily', 'days', 'weekly', 'monthly')),
     days TEXT,
     month_day INTEGER,
     moment TEXT CHECK (moment IN ('matin', 'apres', 'soir')),
     remind_at TEXT,
     photo_required INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   );
   INSERT INTO task_templates (title, description, icon, points, repeat, days, month_day, moment, created_at) VALUES
     ('Faire son lit', '', '🛏️', 2, 'daily', NULL, NULL, 'matin', 1),
     ('Ranger sa chambre', 'Lit fait, vêtements et jouets rangés.', '🛏️', 5, 'daily', NULL, NULL, 'soir', 2),
     ('Se brosser les dents', 'Matin et soir.', '🪥', 2, 'daily', NULL, NULL, 'soir', 3),
     ('Préparer son cartable', '', '🎒', 3, 'days', '[1,2,3,4,7]', NULL, 'soir', 4),
     ('Faire les devoirs', '', '📚', 8, 'days', '[1,2,4]', NULL, 'apres', 5),
     ('Lire 20 minutes', '', '📖', 5, 'daily', NULL, NULL, 'soir', 6),
     ('Mettre la table', '', '🍽️', 3, 'daily', NULL, NULL, 'soir', 7),
     ('Débarrasser la table', '', '🍽️', 3, 'daily', NULL, NULL, 'soir', 8),
     ('Vider le lave-vaisselle', '', '🫧', 4, 'daily', NULL, NULL, 'soir', 9),
     ('Nourrir l''animal', '', '🐶', 3, 'daily', NULL, NULL, 'matin', 10),
     ('Ranger ses jouets', '', '🧸', 4, 'daily', NULL, NULL, 'soir', 11),
     ('Sortir les poubelles', '', '🗑️', 6, 'weekly', '[2]', NULL, 'soir', 12),
     ('Passer l''aspirateur', '', '🧹', 8, 'weekly', '[6]', NULL, 'apres', 13),
     ('Étendre le linge', '', '🧺', 5, 'weekly', '[7]', NULL, 'apres', 14),
     ('Arroser les plantes', '', '🪴', 3, 'weekly', '[3]', NULL, 'soir', 15),
     ('Aider à faire la cuisine', '', '🍳', 6, 'weekly', '[5]', NULL, 'soir', 16);
   ALTER TABLE rewards ADD COLUMN valid_from TEXT;
   ALTER TABLE rewards ADD COLUMN valid_until TEXT;
   ALTER TABLE rewards ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
   CREATE TABLE trusted_devices (
     device_hash TEXT NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('parent', 'kid')),
     subject_id INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (device_hash, role, subject_id)
   );`,
  // Sous-tâches : étapes d'une tâche, cochées par l'enfant sur chaque occurrence.
  `CREATE TABLE task_steps (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     label TEXT NOT NULL,
     position INTEGER NOT NULL
   );
   CREATE TABLE occurrence_steps (
     occurrence_id INTEGER NOT NULL REFERENCES occurrences(id) ON DELETE CASCADE,
     step_id INTEGER NOT NULL REFERENCES task_steps(id) ON DELETE CASCADE,
     checked_at INTEGER NOT NULL,
     PRIMARY KEY (occurrence_id, step_id)
   );`,
  // Points par sous-tâche (mode « each ») ou tout ou rien (mode « all », défaut) ; étapes validées par le parent.
  `ALTER TABLE tasks ADD COLUMN steps_mode TEXT NOT NULL DEFAULT 'all';
   ALTER TABLE task_steps ADD COLUMN points INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE occurrence_steps ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;`,
];

// Avant toute migration d'une base existante (mise à jour de l'app), copie de sécurité datée dans
// data/backups/ (les 5 plus récentes sont gardées). Les réglages, clés VAPID et abonnements push vivent
// dans cette base : ils survivent aux mises à jour tant que le dossier de données est conservé.
function backupBeforeMigration(version) {
  try {
    const dir = path.join(DATA_DIR, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `latribu-v${version}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
    conn.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const all = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
    for (const old of all.slice(0, Math.max(0, all.length - 5))) fs.unlinkSync(path.join(dir, old));
  } catch (err) {
    console.warn('Sauvegarde avant migration impossible :', err.message);
  }
}

const version = conn.prepare('PRAGMA user_version').get().user_version;
if (version > 0 && version < MIGRATIONS.length) backupBeforeMigration(version);
for (let i = version; i < MIGRATIONS.length; i++) {
  tx(() => {
    conn.exec(MIGRATIONS[i]);
    conn.exec(`PRAGMA user_version = ${i + 1}`);
  });
}

module.exports = { db, tx, DATA_DIR };
