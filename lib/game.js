// Ludique : séries de jours, bonus de série, badges, niveau à célébrer.
//  - Série : jours consécutifs où TOUTES les missions de l'enfant sont faites (validées ou en attente
//    de validation). Un jour sans mission est neutre ; la journée en cours, encore incomplète, ne
//    casse pas la série.
//  - Bonus : à chaque palier (3, 7, 14, 30 jours) les points du réglage « bonus de série »,
//    une seule fois par série.
//  - Badges : automatiques (catalogue ci-dessous) ou attribués à la main par un parent.
const { db, tx } = require('./db');
const { httpError, text, emoji } = require('./util');
const dates = require('./dates');
const points = require('./points');
const settings = require('./settings');

const MILESTONES = [3, 7, 14, 30];
const DEFAULT_BONUS = { 3: 10, 7: 25, 14: 50, 30: 100 };

const bonuses = () => ({ ...DEFAULT_BONUS, ...settings.get('streak_bonus', {}) });
function setBonuses(input) {
  const out = {};
  for (const m of MILESTONES) {
    const v = Number((input || {})[m]);
    if (!Number.isInteger(v) || v < 0 || v > 100000) throw httpError(400, `Bonus de ${m} jours : nombre entier (0 = aucun bonus).`);
    out[m] = v;
  }
  settings.set('streak_bonus', out);
}

// ---------- Séries ----------
function streak(kidId) {
  const today = dates.today();
  // Un jour compte si au moins streak_min % des missions planifiées sont faites (100 % par défaut).
  const k = db.prepare('SELECT streak_min FROM kids WHERE id = ?').get(kidId);
  const pct = k ? k.streak_min : 100;
  const rows = db.prepare(`SELECT due_date AS d, COUNT(*) AS n, SUM(CASE WHEN status IN ('done', 'wait') THEN 1 ELSE 0 END) AS ok
    FROM occurrences WHERE kid_id = ? AND due_date <= ? AND task_id IN (SELECT id FROM tasks WHERE kind = 'plan') GROUP BY due_date ORDER BY due_date DESC LIMIT 400`).all(kidId, today);
  let days = 0, runStart = null;
  for (const r of rows) {
    if (r.ok * 100 >= pct * r.n) { days++; runStart = r.d; } else if (r.d === today) continue; else break;
  }
  return { days, runStart };
}

// ---------- Badges ----------
const CATALOG = [
  { key: 'first', emoji: '🌟', title: 'Première mission', desc: 'Une première mission validée', test: (s) => s.approved >= 1 },
  { key: 'streak7', emoji: '🔥', title: '7 jours d\'affilée', desc: 'Une série de 7 jours', test: (s) => s.streak >= 7 },
  { key: 'pts100', emoji: '💯', title: '100 points', desc: '100 points gagnés au total', test: (s) => s.xp >= 100 },
  { key: 'level5', emoji: '🏆', title: 'Niveau 5', desc: 'Atteindre le niveau 5', test: (s) => s.level >= 5 },
  { key: 'helper', emoji: '🤝', title: 'Coup de main', desc: 'Une mission ouverte réalisée', test: (s) => s.openDone >= 1 },
  { key: 'regular', emoji: '🚀', title: 'Régulier', desc: '30 missions validées', test: (s) => s.approved >= 30 },
];

function stats(kidId) {
  const sum = points.summary(kidId);
  return {
    approved: db.prepare("SELECT COUNT(*) AS n FROM occurrences WHERE kid_id = ? AND status = 'done'").get(kidId).n,
    openDone: db.prepare("SELECT COUNT(*) AS n FROM occurrences o JOIN tasks t ON t.id = o.task_id WHERE o.kid_id = ? AND o.status = 'done' AND t.kind = 'open'").get(kidId).n,
    xp: sum.xp, level: sum.level, streak: streak(kidId).days,
  };
}

// Accorde les badges automatiques mérités (idempotent). Renvoie les nouveaux.
function checkBadges(kidId) {
  const s = stats(kidId), earned = [];
  for (const b of CATALOG) {
    if (!b.test(s)) continue;
    const r = db.prepare('INSERT OR IGNORE INTO badges (kid_id, key, title, emoji, custom, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(kidId, b.key, b.title, b.emoji, Date.now());
    if (r.changes) earned.push({ key: b.key, title: b.title, emoji: b.emoji });
  }
  return earned;
}

function giveBadge(kidId, title, symbol) {
  const t = text(title, 'Titre du badge', { max: 40, required: true });
  db.prepare('INSERT INTO badges (kid_id, key, title, emoji, custom, created_at) VALUES (?, ?, ?, ?, 1, ?)')
    .run(kidId, `custom:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`, t, emoji(symbol, '🏅'), Date.now());
}

// Catalogue complet pour l'enfant : badges obtenus et à débloquer.
function badgesOf(kidId) {
  const have = new Map(db.prepare('SELECT * FROM badges WHERE kid_id = ?').all(kidId).map((b) => [b.key, b]));
  const auto = CATALOG.map((b) => ({ key: b.key, emoji: b.emoji, title: b.title, desc: b.desc, earned: have.has(b.key) }));
  const custom = [...have.values()].filter((b) => b.custom).map((b) => ({ key: b.key, emoji: b.emoji, title: b.title, desc: 'Décerné par un parent', earned: true }));
  return [...auto, ...custom];
}

// ---------- Après un gain de points ----------
// Accorde les bonus de série atteints, puis les badges. Appelée après chaque validation ou bonus.
function afterEarn(kidId) {
  const { days, runStart } = streak(kidId);
  const bonus = bonuses(), awarded = [];
  if (runStart) {
    for (const m of MILESTONES) {
      if (days < m) continue;
      const r = db.prepare('INSERT OR IGNORE INTO streak_awards (kid_id, run_start, milestone) VALUES (?, ?, ?)').run(kidId, runStart, m);
      if (r.changes && bonus[m] > 0) { points.add(kidId, bonus[m], `Série de ${m} jours`, { gain: true, refType: 'streak' }); awarded.push({ milestone: m, points: bonus[m] }); }
    }
  }
  return { streak: days, awarded, badges: checkBadges(kidId) };
}

// ---------- Célébrations ----------
// Niveau gagné ou badges obtenus depuis la dernière ouverture (sur n'importe quel appareil).
// Journée parfaite : toutes les missions planifiées d'aujourd'hui sont validées (au moins une).
function perfectDay(kidId) {
  const r = db.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN o.status = 'done' THEN 1 ELSE 0 END) AS ok FROM occurrences o
    JOIN tasks t ON t.id = o.task_id WHERE o.kid_id = ? AND o.due_date = ? AND t.kind = 'plan'`).get(kidId, dates.today());
  return r.n > 0 && r.ok === r.n;
}

// ---------- Bravos (autocollants envoyés par un parent) ----------
const STICKERS = {
  bravo: ['⭐', 'Bravo !'], trop_fort: ['⚡', 'Trop fort !'], youpi: ['🎉', 'Youpi !'], genial: ['💡', 'Génial !'],
  super_boulot: ['🏆', 'Super boulot !'], continue: ['📈', 'Continue comme ça !'], merci: ['❤️', 'Merci !'], gros_calin: ['🤗', 'Gros câlin'],
};
const stickerList = () => Object.entries(STICKERS).map(([key, [emo, label]]) => ({ key, emoji: emo, label }));
// Bravo : autocollant, mot facultatif et points bonus facultatifs (gagnés : comptent pour le niveau).
function giveKudos(kidId, sticker, note, bonus) {
  if (typeof sticker !== 'string' || !Object.hasOwn(STICKERS, sticker)) throw httpError(400, 'Autocollant inconnu.');
  const n = text(note, 'Mot', { max: 140 });
  const pts = bonus === undefined || bonus === null || bonus === '' ? 0 : Number(bonus);
  if (!Number.isInteger(pts) || pts < 0 || pts > 10000) throw httpError(400, 'Points bonus : nombre entier de 0 à 10 000.');
  const label = STICKERS[sticker][1];
  tx(() => {
    db.prepare('INSERT INTO kudos (kid_id, sticker, note, points, created_at) VALUES (?, ?, ?, ?, ?)').run(kidId, sticker, n || null, pts, Date.now());
    if (pts) points.add(kidId, pts, `Bravo : ${label}`, { gain: true, refType: 'kudos' });
  });
  if (pts) checkBadges(kidId);
  return { emoji: STICKERS[sticker][0], label, note: n, points: pts };
}
const kudosShape = (r) => ({ id: r.id, sticker: r.sticker, emoji: STICKERS[r.sticker] ? STICKERS[r.sticker][0] : '⭐', label: STICKERS[r.sticker] ? STICKERS[r.sticker][1] : 'Bravo !', note: r.note, points: r.points, at: r.created_at, seen: !!r.seen });
const recentKudos = (kidId) => db.prepare('SELECT * FROM kudos WHERE kid_id = ? AND created_at > ? ORDER BY id DESC LIMIT 6').all(kidId, Date.now() - 14 * 86400000).map(kudosShape);

function pendingCelebration(kidId) {
  const level = points.summary(kidId).level;
  const seen = db.prepare('SELECT level_seen AS l FROM kids WHERE id = ?').get(kidId).l;
  const badges = db.prepare('SELECT title, emoji FROM badges WHERE kid_id = ? AND seen = 0 ORDER BY id').all(kidId);
  const perfect = perfectDay(kidId) && db.prepare('SELECT perfect_seen AS p FROM kids WHERE id = ?').get(kidId).p !== dates.today();
  const kudos = db.prepare('SELECT * FROM kudos WHERE kid_id = ? AND seen = 0 ORDER BY id').all(kidId).map(kudosShape);
  return { levelUp: level > seen ? level : null, badges, perfectDay: perfect, kudos };
}
function markSeen(kidId) {
  db.prepare('UPDATE kids SET level_seen = ? WHERE id = ?').run(points.summary(kidId).level, kidId);
  db.prepare('UPDATE badges SET seen = 1 WHERE kid_id = ?').run(kidId);
  db.prepare('UPDATE kudos SET seen = 1 WHERE kid_id = ?').run(kidId);
  if (perfectDay(kidId)) db.prepare('UPDATE kids SET perfect_seen = ? WHERE id = ?').run(dates.today(), kidId);
}

module.exports = { streak, bonuses, setBonuses, checkBadges, giveBadge, badgesOf, afterEarn, perfectDay, stickerList, giveKudos, recentKudos, pendingCelebration, markSeen, MILESTONES };
