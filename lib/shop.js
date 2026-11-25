// Magasin. Récompenses propres à chaque enfant (une récompense peut être créée pour plusieurs
// enfants à la fois), avec :
//  - une limite par enfant (aucune, 1 par jour / semaine / mois) ;
//  - un stock facultatif : individuel par défaut, ou partagé (compteur commun) ;
//  - un achat soumis à approbation : points ET stock réservés à la demande, rendus si le parent refuse.
// Les accessoires d'avatar se paient avec les mêmes points, sans validation.
const { db, tx } = require('./db');
const { httpError, text, emoji } = require('./util');
const dates = require('./dates');
const points = require('./points');

const LIMITS = { none: 'Aucune', day: '1 par jour', week: '1 par semaine', month: '1 par mois' };
const BLOCKED = { day: "Déjà pris aujourd'hui", week: 'Déjà pris cette semaine', month: 'Déjà pris ce mois-ci' };

// ---------- Validation ----------
function clean(body) {
  const b = body || {};
  const title = text(b.title, 'Titre', { max: 80, required: true });
  const description = text(b.description, 'Description', { max: 300, multiline: true });
  const price = Number(b.price);
  if (!Number.isInteger(price) || price < 1 || price > 1000000) throw httpError(400, 'Prix : nombre entier supérieur à 0.');
  const limit = b.limit || 'none';
  if (!LIMITS[limit]) throw httpError(400, 'Limite inconnue.');
  let stock = null;
  if (b.stock !== undefined && b.stock !== null && b.stock !== '') {
    stock = Number(b.stock);
    if (!Number.isInteger(stock) || stock < 1 || stock > 100000) throw httpError(400, 'Stock : nombre entier supérieur à 0.');
  }
  const kids = [...new Set((Array.isArray(b.kids) ? b.kids : []).map(Number))];
  if (!kids.length) throw httpError(400, 'Choisis au moins un enfant.');
  for (const id of kids) if (!db.prepare('SELECT 1 FROM kids WHERE id = ?').get(id)) throw httpError(400, 'Enfant inconnu.');
  const shared = !!b.shared && stock !== null && kids.length > 1;
  // Validité : disponible du… au… (dates facultatives), activation manuelle.
  const validFrom = b.validFrom ? String(b.validFrom) : null, validUntil = b.validUntil ? String(b.validUntil) : null;
  for (const d of [validFrom, validUntil]) if (d && !dates.isDate(d)) throw httpError(400, 'Date de validité invalide.');
  if (validFrom && validUntil && validUntil < validFrom) throw httpError(400, 'La fin de validité précède le début.');
  const active = b.active === undefined ? true : !!b.active;
  return { title, description, icon: emoji(b.icon, '🎁'), price, limit, stock, shared, kids, validFrom, validUntil, active };
}

// ---------- Catalogue (parents) ----------
function writeKids(rewardId, r) {
  db.prepare('DELETE FROM reward_kids WHERE reward_id = ?').run(rewardId);
  for (const k of r.kids) db.prepare('INSERT INTO reward_kids (reward_id, kid_id, stock) VALUES (?, ?, ?)').run(rewardId, k, r.shared ? null : r.stock);
  db.prepare(`UPDATE kids SET goal_reward_id = NULL WHERE goal_reward_id = ? AND id NOT IN (${r.kids.map(() => '?').join(',')})`).run(rewardId, ...r.kids);
}

function create(body) {
  const r = clean(body);
  return tx(() => {
    const info = db.prepare('INSERT INTO rewards (title, description, icon, price, limit_period, shared, stock, valid_from, valid_until, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(r.title, r.description, r.icon, r.price, r.limit, r.shared ? 1 : 0, r.shared ? r.stock : null, r.validFrom, r.validUntil, r.active ? 1 : 0, Date.now());
    const id = Number(info.lastInsertRowid);
    writeKids(id, r);
    return id;
  });
}

// Modifier le stock le réinitialise (pour tous les enfants concernés).
function update(id, body) {
  if (!db.prepare('SELECT 1 FROM rewards WHERE id = ?').get(id)) throw httpError(404, 'Récompense introuvable.');
  const r = clean(body);
  tx(() => {
    db.prepare('UPDATE rewards SET title = ?, description = ?, icon = ?, price = ?, limit_period = ?, shared = ?, stock = ?, valid_from = ?, valid_until = ?, active = ? WHERE id = ?')
      .run(r.title, r.description, r.icon, r.price, r.limit, r.shared ? 1 : 0, r.shared ? r.stock : null, r.validFrom, r.validUntil, r.active ? 1 : 0, id);
    writeKids(id, r);
  });
}

function remove(id) {
  tx(() => {
    db.prepare('UPDATE kids SET goal_reward_id = NULL WHERE goal_reward_id = ?').run(id);
    if (!db.prepare('DELETE FROM rewards WHERE id = ?').run(id).changes) throw httpError(404, 'Récompense introuvable.');
  });
}

const leftOf = (r, kidStock) => (r.shared ? r.stock : kidStock);
function stockLabel(left, shared) {
  if (left === null || left === undefined) return '';
  return left > 0 ? `${left} restant${left > 1 ? 's' : ''}${shared ? ' (partagé)' : ''}` : 'Épuisé';
}

function list() {
  return db.prepare('SELECT * FROM rewards ORDER BY created_at, id').all().map((r) => {
    const ks = db.prepare('SELECT kid_id, stock FROM reward_kids WHERE reward_id = ? ORDER BY kid_id').all(r.id);
    const lefts = ks.map((k) => leftOf(r, k.stock));
    return {
      id: r.id, title: r.title, description: r.description, icon: r.icon, price: r.price, limit: r.limit_period, shared: !!r.shared,
      validFrom: r.valid_from, validUntil: r.valid_until, active: !!r.active, availability: availability(r, dates.today()),
      kids: ks.map((k) => k.kid_id), stock: r.shared ? r.stock : (lefts[0] ?? null),
      left: Object.fromEntries(ks.map((k, i) => [k.kid_id, lefts[i]])),
      label: [r.limit_period !== 'none' ? LIMITS[r.limit_period] : '', r.shared ? stockLabel(r.stock, true) : ''].filter(Boolean).join(' · '),
    };
  });
}

// ---------- Boutique de l'enfant ----------
function limitStart(limit, today) {
  return limit === 'day' ? today : limit === 'week' ? dates.weekStart(today) : dates.monthStart(today);
}

// 'off' (désactivée), 'expired', 'upcoming' (pas encore ouverte) ou 'ok'.
function availability(r, today) {
  if (!r.active) return 'off';
  if (r.valid_until && r.valid_until < today) return 'expired';
  if (r.valid_from && r.valid_from > today) return 'upcoming';
  return 'ok';
}

function blockedReason(r, kidId, kidStock, today) {
  if (availability(r, today) === 'upcoming') return `Dès le ${dates.frDate(r.valid_from)}`;
  const left = leftOf(r, kidStock);
  if (left !== null && left !== undefined && left <= 0) return 'Épuisé';
  if (r.limit_period !== 'none') {
    const n = db.prepare("SELECT COUNT(*) AS n FROM purchases WHERE kid_id = ? AND reward_id = ? AND status <> 'refused' AND created_date >= ?")
      .get(kidId, r.id, limitStart(r.limit_period, today)).n;
    if (n >= 1) return BLOCKED[r.limit_period];
  }
  return '';
}

function forKid(kidId) {
  const today = dates.today();
  const kid = db.prepare('SELECT goal_reward_id AS goal FROM kids WHERE id = ?').get(kidId);
  const rewards = db.prepare('SELECT r.*, rk.stock AS kid_stock FROM rewards r JOIN reward_kids rk ON rk.reward_id = r.id WHERE rk.kid_id = ? ORDER BY r.created_at, r.id').all(kidId)
    .filter((r) => ['ok', 'upcoming'].includes(availability(r, today))) // désactivées et expirées : cachées à l'enfant
    .map((r) => {
    const left = leftOf(r, r.kid_stock);
    return {
      id: r.id, title: r.title, description: r.description, icon: r.icon, price: r.price, shared: !!r.shared,
      info: [r.limit_period !== 'none' ? LIMITS[r.limit_period] : '', stockLabel(left, r.shared), r.valid_until ? `Jusqu'au ${dates.frDate(r.valid_until)}` : ''].filter(Boolean).join(' · ') || 'Sans limite',
      blocked: blockedReason(r, kidId, r.kid_stock, today),
      pending: !!db.prepare("SELECT 1 FROM purchases WHERE kid_id = ? AND reward_id = ? AND status = 'req'").get(kidId, r.id),
      goal: kid.goal === r.id,
    };
  });
  const owned = new Set(db.prepare('SELECT accessory_id FROM kid_accessories WHERE kid_id = ?').all(kidId).map((x) => x.accessory_id));
  const worn = new Set(db.prepare('SELECT accessory_id FROM kid_equipped WHERE kid_id = ?').all(kidId).map((x) => x.accessory_id));
  const accessories = db.prepare('SELECT * FROM accessories ORDER BY price, id').all()
    .map((a) => ({ id: a.id, title: a.title, emoji: a.emoji, price: a.price, kind: a.kind, slot: a.slot, art: a.art, owned: owned.has(a.id), equipped: worn.has(a.id) }));
  return { rewards, accessories };
}

// ---------- Achats ----------
function purchase(kidId, rewardId) {
  return tx(() => {
    const today = dates.today();
    const r = db.prepare('SELECT r.*, rk.stock AS kid_stock FROM rewards r JOIN reward_kids rk ON rk.reward_id = r.id AND rk.kid_id = ? WHERE r.id = ?').get(kidId, rewardId);
    if (!r) throw httpError(404, 'Récompense introuvable.');
    if (['off', 'expired'].includes(availability(r, today))) throw httpError(409, 'Cette récompense n\'est plus disponible.');
    if (db.prepare("SELECT 1 FROM purchases WHERE kid_id = ? AND reward_id = ? AND status = 'req'").get(kidId, rewardId)) throw httpError(409, 'Une demande est déjà en attente.');
    const why = blockedReason(r, kidId, r.kid_stock, today);
    if (why) throw httpError(409, why);
    if (points.summary(kidId).points < r.price) throw httpError(409, 'Pas assez de points.');
    if (leftOf(r, r.kid_stock) !== null && leftOf(r, r.kid_stock) !== undefined) {
      const ok = r.shared
        ? db.prepare('UPDATE rewards SET stock = stock - 1 WHERE id = ? AND stock > 0').run(r.id).changes
        : db.prepare('UPDATE reward_kids SET stock = stock - 1 WHERE reward_id = ? AND kid_id = ? AND stock > 0').run(r.id, kidId).changes;
      if (!ok) throw httpError(409, 'Épuisé');
    }
    const info = db.prepare('INSERT INTO purchases (reward_id, kid_id, title, icon, price, created_at, created_date) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(r.id, kidId, r.title, r.icon, r.price, Date.now(), today);
    const id = Number(info.lastInsertRowid);
    points.add(kidId, -r.price, `Réservé : ${r.title}`, { refType: 'purchase', refId: id });
    return { id, title: r.title, price: r.price, ...points.summary(kidId) };
  });
}

const pending = () => db.prepare(`SELECT p.id, p.title, p.icon, p.price, p.created_at AS at, k.id AS kidId, k.name AS kidName
  FROM purchases p JOIN kids k ON k.id = p.kid_id WHERE p.status = 'req' ORDER BY p.id`).all();

// Le parent a remis la récompense.
function give(id) {
  const p = db.prepare("SELECT * FROM purchases WHERE id = ? AND status = 'req'").get(id);
  if (!p || !db.prepare("UPDATE purchases SET status = 'given', decided_at = ? WHERE id = ? AND status = 'req'").run(Date.now(), id).changes) throw httpError(409, 'Rien à valider.');
  return p;
}

// Refus : points et stock rendus.
function refuse(id) {
  return tx(() => {
    const p = db.prepare("SELECT * FROM purchases WHERE id = ? AND status = 'req'").get(id);
    if (!p) throw httpError(409, 'Rien à refuser.');
    db.prepare("UPDATE purchases SET status = 'refused', decided_at = ? WHERE id = ?").run(Date.now(), id);
    points.add(p.kid_id, p.price, `Remboursé : ${p.title}`, { refType: 'refund', refId: id });
    if (p.reward_id) {
      const r = db.prepare('SELECT shared FROM rewards WHERE id = ?').get(p.reward_id);
      if (r && r.shared) db.prepare('UPDATE rewards SET stock = stock + 1 WHERE id = ? AND stock IS NOT NULL').run(p.reward_id);
      else if (r) db.prepare('UPDATE reward_kids SET stock = stock + 1 WHERE reward_id = ? AND kid_id = ? AND stock IS NOT NULL').run(p.reward_id, p.kid_id);
    }
    return { kidId: p.kid_id, title: p.title, ...points.summary(p.kid_id) };
  });
}

const kidPurchases = (kidId, limit = 100) => db.prepare('SELECT id, title, icon, price, status, created_at AS at FROM purchases WHERE kid_id = ? ORDER BY id DESC LIMIT ?').all(kidId, limit);

// ---------- Objectif d'épargne ----------
function setGoal(kidId, rewardId) {
  if (rewardId !== null && !db.prepare('SELECT 1 FROM reward_kids WHERE kid_id = ? AND reward_id = ?').get(kidId, rewardId)) throw httpError(404, 'Récompense introuvable.');
  db.prepare('UPDATE kids SET goal_reward_id = ? WHERE id = ?').run(rewardId, kidId);
}
function goalOf(kidId) {
  return db.prepare('SELECT r.id, r.title, r.icon, r.price FROM kids k JOIN rewards r ON r.id = k.goal_reward_id WHERE k.id = ?').get(kidId) || null;
}

// ---------- Accessoires ----------
const accessories = () => db.prepare('SELECT id, title, emoji, price, kind, slot, art FROM accessories ORDER BY price, id').all();
// Apparence de l'enfant : une clé d'illustration par emplacement (avatar, décor, tête, visage, cou).
const lookOf = (kidId) => Object.fromEntries(db.prepare('SELECT a.slot, a.art FROM kid_equipped e JOIN accessories a ON a.id = e.accessory_id WHERE e.kid_id = ?').all(kidId).map((r) => [r.slot, r.art]));
function setAccessoryPrice(id, price) {
  const p = Number(price);
  if (!Number.isInteger(p) || p < 1 || p > 1000000) throw httpError(400, 'Prix : nombre entier supérieur à 0.');
  if (!db.prepare('UPDATE accessories SET price = ? WHERE id = ?').run(p, id).changes) throw httpError(404, 'Accessoire introuvable.');
}
function buyAccessory(kidId, id) {
  return tx(() => {
    const a = db.prepare('SELECT * FROM accessories WHERE id = ?').get(id);
    if (!a) throw httpError(404, 'Accessoire introuvable.');
    if (db.prepare('SELECT 1 FROM kid_accessories WHERE kid_id = ? AND accessory_id = ?').get(kidId, id)) throw httpError(409, 'Déjà débloqué.');
    if (points.summary(kidId).points < a.price) throw httpError(409, 'Pas assez de points.');
    points.add(kidId, -a.price, `Accessoire : ${a.title}`, { refType: 'accessory', refId: id });
    db.prepare('INSERT INTO kid_accessories (kid_id, accessory_id) VALUES (?, ?)').run(kidId, id);
    db.prepare('INSERT OR REPLACE INTO kid_equipped (kid_id, slot, accessory_id) VALUES (?, ?, ?)').run(kidId, a.slot, id); // équipé aussitôt
    return points.summary(kidId);
  });
}
// Équipe l'objet (il remplace celui du même emplacement) ou le retire s'il est déjà porté.
function equipAccessory(kidId, id) {
  const a = db.prepare('SELECT slot FROM accessories WHERE id = ?').get(id);
  if (!a || !db.prepare('SELECT 1 FROM kid_accessories WHERE kid_id = ? AND accessory_id = ?').get(kidId, id)) throw httpError(409, 'Accessoire non débloqué.');
  if (db.prepare('SELECT 1 FROM kid_equipped WHERE kid_id = ? AND slot = ? AND accessory_id = ?').get(kidId, a.slot, id)) db.prepare('DELETE FROM kid_equipped WHERE kid_id = ? AND slot = ?').run(kidId, a.slot);
  else db.prepare('INSERT OR REPLACE INTO kid_equipped (kid_id, slot, accessory_id) VALUES (?, ?, ?)').run(kidId, a.slot, id);
}

module.exports = { lookOf, create, update, remove, list, forKid, purchase, pending, give, refuse, kidPurchases, setGoal, goalOf, accessories, setAccessoryPrice, buyAccessory, equipAccessory };
