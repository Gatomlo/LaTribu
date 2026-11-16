// Registre de points. Le solde (points dépensables) = somme des mouvements ; l'XP (niveau)
// = somme des gains uniquement, elle ne diminue jamais. 100 XP par niveau.
const { db } = require('./db');

const LEVEL_XP = 100;

function summary(kidId) {
  const r = db.prepare('SELECT COALESCE(SUM(delta), 0) AS points, COALESCE(SUM(xp), 0) AS xp FROM movements WHERE kid_id = ?').get(kidId);
  return { points: r.points, xp: r.xp, level: Math.floor(r.xp / LEVEL_XP) + 1, xpInLevel: r.xp % LEVEL_XP, levelXp: LEVEL_XP };
}

// Ajoute un mouvement. gain = true : les points comptent aussi pour l'XP.
function add(kidId, delta, label, { gain = false, refType = null, refId = null } = {}) {
  db.prepare('INSERT INTO movements (kid_id, delta, xp, label, ref_type, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(kidId, delta, gain && delta > 0 ? delta : 0, label, refType, refId, Date.now());
}

// Ajustement manuel du parent. Une pénalité ne fait pas passer le solde sous 0.
function adjust(kidId, delta, label) {
  let d = delta;
  if (d < 0) d = -Math.min(-d, Math.max(0, summary(kidId).points));
  if (d === 0) return 0;
  add(kidId, d, label, { gain: d > 0, refType: 'adjust' });
  return d;
}

const history = (kidId, limit = 100) =>
  db.prepare('SELECT id, delta, label, created_at AS at FROM movements WHERE kid_id = ? ORDER BY id DESC LIMIT ?').all(kidId, limit);

module.exports = { summary, add, adjust, history, LEVEL_XP };
