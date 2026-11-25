// API JSON de l'app. Étape 1 (socle) : installation, connexion parent, profils enfants,
// PIN, gestion des enfants par les parents.
const express = require('express');
const { db } = require('./db');
const auth = require('./auth');
const { httpError, text, emoji } = require('./util');
const points = require('./points');
const tasks = require('./tasks');
const shop = require('./shop');
const game = require('./game');
const push = require('./push');
const photos = require('./photos');
const stats = require('./stats');
const templates = require('./templates');

const PALETTES = 6; // nombre de couleurs d'accent proposées côté interface

const publicKid = (k) => ({ id: k.id, name: k.name, age: k.age, palette: k.palette, look: shop.lookOf(k.id) });
const userCount = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

const cleanName = (value) => text(value, 'Prénom', { max: 30, required: true });

function cleanAge(value) {
  if (value === undefined || value === null || value === '') return null;
  const age = Number(value);
  if (!Number.isInteger(age) || age < 1 || age > 25) throw httpError(400, 'Âge : nombre entre 1 et 25.');
  return age;
}
function cleanPalette(value) {
  const p = value === undefined ? 0 : Number(value);
  if (!Number.isInteger(p) || p < 0 || p >= PALETTES) throw httpError(400, 'Couleur inconnue.');
  return p;
}
function kidOr404(id) {
  const kid = db.prepare('SELECT * FROM kids WHERE id = ?').get(Number(id));
  if (!kid) throw httpError(404, 'Enfant introuvable.');
  return kid;
}

function router() {
  const r = express.Router();

  // État de la session : sert à choisir l'écran de départ.
  r.get('/session', (req, res) => {
    const empty = userCount() === 0;
    const out = { setup: empty && auth.setupAllowed(req), setupClosed: empty && !auth.setupAllowed(req), role: null, gateway: auth.gatewayInfo(req) };
    if (req.auth && req.auth.role === 'parent') {
      const u = db.prepare('SELECT email FROM users WHERE id = ?').get(req.auth.userId);
      out.role = 'parent'; out.email = u && u.email;
    } else if (req.auth && req.auth.role === 'kid') {
      const k = db.prepare('SELECT * FROM kids WHERE id = ?').get(req.auth.kidId);
      if (k) { out.role = 'kid'; out.kid = publicKid(k); }
    }
    res.json(out);
  });

  // Première installation : crée le compte parent (une seule fois).
  r.post('/setup', async (req, res) => {
    auth.throttleIp(req);
    if (!auth.setupAllowed(req)) throw httpError(403, 'Création du compte parent fermée : utilise npm run set-password (SSH) ou connecte-toi à la plateforme en administrateur.');
    if (userCount() > 0) throw httpError(409, 'L\'application est déjà installée.');
    const email = text((req.body || {}).email, 'E-mail', { max: 120 }).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Adresse e-mail invalide.');
    const hash = await auth.hashPassword((req.body || {}).password);
    if (userCount() > 0) throw httpError(409, 'L\'application est déjà installée.');
    const info = db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)').run(email, hash, Date.now());
    auth.createSession(req, res, 'parent', Number(info.lastInsertRowid));
    res.json({ ok: true });
  });

  // Connexion parent.
  r.post('/login', async (req, res) => {
    const email = text((req.body || {}).email, 'E-mail', { max: 120 }).toLowerCase();
    const password = typeof (req.body || {}).password === 'string' ? req.body.password : '';
    const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
    const g = auth.beginParentAttempt(req, res, email, user && user.id);
    if (!(await auth.verify(password, user && user.password_hash))) {
      auth.parentFailed(g);
      await auth.sleep(Number(process.env.LATRIBU_FAIL_DELAY_MS ?? 600)); // ralentit les essais en série
      throw httpError(401, 'E-mail ou mot de passe incorrect.');
    }
    auth.parentSucceeded(g);
    auth.createSession(req, res, 'parent', user.id);
    res.json({ ok: true });
  });

  r.post('/logout', (req, res) => {
    if (req.auth && req.auth.role === 'parent') auth.suspendGatewayLogin(req, res); // pas de reconnexion automatique par la plateforme
    auth.destroySession(req, res);
    res.json({ ok: true });
  });

  // « Continuer avec la plateforme » : session parent pour l'utilisateur de la passerelle lié à un compte parent.
  r.post('/gateway/login', (req, res) => { auth.gatewayLoginExplicit(req, res); res.json({ ok: true }); });

  // Écran « Qui es-tu ? » : prénoms et couleurs uniquement (aucune donnée sensible).
  r.get('/profiles', (req, res) => {
    res.json(db.prepare('SELECT id, name, age, palette, accessory_id FROM kids ORDER BY created_at, id').all().map(publicKid));
  });

  // Connexion d'un enfant : PIN saisi une seule fois, la session reste ensuite ouverte.
  r.post('/kids/:id/login', async (req, res) => {
    const kid = kidOr404(req.params.id);
    const g = auth.beginKidAttempt(req, res, kid.id);
    const pin = typeof (req.body || {}).pin === 'string' ? req.body.pin : '';
    if (!(await auth.verify(pin, kid.pin_hash))) {
      auth.kidFailed(g);
      throw httpError(401, 'Code incorrect.');
    }
    auth.kidSucceeded(g);
    auth.createSession(req, res, 'kid', kid.id);
    res.json({ ok: true, kid: publicKid(kid) });
  });

  // ---------- Parents ----------
  r.get('/kids', auth.requireParent, (req, res) => {
    res.json(db.prepare('SELECT id, name, age, palette, accessory_id, streak_min FROM kids ORDER BY created_at, id').all()
      .map((k) => ({ ...publicKid(k), streakMin: k.streak_min, ...points.summary(k.id), streak: game.streak(k.id).days, badges: game.badgesOf(k.id).filter((b) => b.earned).length })));
  });

  r.post('/kids', auth.requireParent, async (req, res) => {
    const b = req.body || {};
    const name = cleanName(b.name), age = cleanAge(b.age), palette = cleanPalette(b.palette);
    const pinHash = await auth.hashPin(b.pin);
    const info = db.prepare('INSERT INTO kids (name, age, palette, pin_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, age, palette, pinHash, Date.now());
    res.status(201).json(publicKid(kidOr404(info.lastInsertRowid)));
  });

  r.patch('/kids/:id', auth.requireParent, async (req, res) => {
    const kid = kidOr404(req.params.id), b = req.body || {};
    const name = b.name === undefined ? kid.name : cleanName(b.name);
    const age = b.age === undefined ? kid.age : cleanAge(b.age);
    const palette = b.palette === undefined ? kid.palette : cleanPalette(b.palette);
    let pinHash = kid.pin_hash;
    if (b.pin !== undefined) { pinHash = await auth.hashPin(b.pin); auth.revokeKidSessions(kid.id); }
    let streakMin = kid.streak_min;
    if (b.streakMin !== undefined) {
      streakMin = Number(b.streakMin);
      if (!Number.isInteger(streakMin) || streakMin < 10 || streakMin > 100) throw httpError(400, 'Série : pourcentage entier de 10 à 100.');
    }
    db.prepare('UPDATE kids SET name = ?, age = ?, palette = ?, pin_hash = ?, streak_min = ? WHERE id = ?').run(name, age, palette, pinHash, streakMin, kid.id);
    res.json(publicKid(kidOr404(kid.id)));
  });

  // Déconnecte tous les téléphones de l'enfant (le PIN sera redemandé).
  r.post('/kids/:id/revoke', auth.requireParent, (req, res) => {
    const kid = kidOr404(req.params.id);
    auth.revokeKidSessions(kid.id);
    res.json({ ok: true });
  });

  // Suppression : profil, sessions et (aux étapes suivantes) points, tâches, magasin, historique (cascade).
  r.delete('/kids/:id', auth.requireParent, (req, res) => {
    const kid = kidOr404(req.params.id);
    db.prepare('DELETE FROM kids WHERE id = ?').run(kid.id);
    res.json({ ok: true });
  });

  r.post('/password', auth.requireParent, async (req, res) => {
    const b = req.body || {};
    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.auth.userId);
    if (!(await auth.verify(b.current, user.password_hash))) throw httpError(401, 'Mot de passe actuel incorrect.');
    const hash = await auth.hashPassword(b.next);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    auth.dropOtherParentSessions(req, user.id);
    res.json({ ok: true });
  });

  // ---------- Tâches (parents) ----------
  r.get('/tasks', auth.requireParent, (req, res) => res.json(tasks.list()));
  r.post('/tasks', auth.requireParent, (req, res) => res.status(201).json({ id: tasks.create(req.body) }));
  r.put('/tasks/:id', auth.requireParent, (req, res) => { tasks.update(Number(req.params.id), req.body); res.json({ ok: true }); });
  r.delete('/tasks/:id', auth.requireParent, (req, res) => { tasks.remove(Number(req.params.id)); res.json({ ok: true }); });

  // Missions déclarées par les enfants, à valider ou refuser.
  r.get('/review', auth.requireParent, (req, res) => res.json(tasks.review()));
  r.post('/occurrences/:id/approve', auth.requireParent, (req, res) => { const out = tasks.approve(Number(req.params.id), (req.body || {}).steps); push.onApproved(out); res.json(out); });
  r.post('/occurrences/:id/refuse', auth.requireParent, (req, res) => { push.onRefused(tasks.refuse(Number(req.params.id), text((req.body || {}).note, 'Motif', { max: 200 }))); res.json({ ok: true }); });

  // Ajustement libre des points (bonus ou pénalité, avec motif visible par l'enfant).
  r.post('/kids/:id/adjust', auth.requireParent, (req, res) => {
    const kid = kidOr404(req.params.id), b = req.body || {};
    const delta = Number(b.delta);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) throw httpError(400, 'Points : nombre entier non nul.');
    const label = text(b.label, 'Motif', { max: 80 }) || (delta > 0 ? 'Bonus du parent' : 'Pénalité');
    const applied = points.adjust(kid.id, delta, label);
    if (applied > 0) game.afterEarn(kid.id);
    res.json({ applied, ...points.summary(kid.id) });
  });
  r.get('/kids/:id/history', auth.requireParent, (req, res) => res.json(points.history(kidOr404(req.params.id).id)));

  // ---------- Enfant ----------
  r.get('/me', auth.requireKid, (req, res) => {
    const k = db.prepare('SELECT * FROM kids WHERE id = ?').get(req.auth.kidId);
    res.json({ ...publicKid(k), ...points.summary(k.id), goal: shop.goalOf(k.id), streak: game.streak(k.id).days, badges: game.badgesOf(k.id), celebrate: game.pendingCelebration(k.id), kudos: game.recentKudos(k.id) });
  });
  r.get('/me/missions', auth.requireKid, (req, res) => res.json(tasks.forKid(req.auth.kidId)));
  r.get('/me/history', auth.requireKid, (req, res) => res.json(points.history(req.auth.kidId)));
  r.post('/occurrences/:id/done', auth.requireKid, (req, res) => { tasks.declare(req.auth.kidId, Number(req.params.id), (req.body || {}).photo, { skip: !!(req.body || {}).skipPhoto, note: (req.body || {}).photoNote }); push.onDeclared(req.auth.kidId, Number(req.params.id)); res.json({ ok: true }); });
  r.put('/occurrences/:id/steps/:step', auth.requireKid, (req, res) => { tasks.toggleStep(req.auth.kidId, Number(req.params.id), Number(req.params.step), !!(req.body || {}).checked); res.json({ ok: true }); });
  r.post('/occurrences/:id/claim', auth.requireKid, (req, res) => { tasks.claim(req.auth.kidId, Number(req.params.id)); res.json({ ok: true }); });

  // ---------- Photo preuve ----------
  // Lisible par les parents et par l'enfant concerné ; jamais mise en cache.
  r.get('/occurrences/:id/photo', (req, res) => {
    if (!req.auth) throw httpError(401, 'Connexion requise.');
    const id = Number(req.params.id);
    if (req.auth.role === 'kid' && !db.prepare('SELECT 1 FROM occurrences WHERE id = ? AND kid_id = ?').get(id, req.auth.kidId)) throw httpError(404, 'Photo introuvable.');
    const p = photos.get(id);
    if (!p) throw httpError(404, 'Photo introuvable.');
    res.set('Cache-Control', 'private, no-store').type('image/jpeg').send(Buffer.from(p.data));
  });

  // ---------- Statistiques de la semaine (?week=AAAA-MM-JJ, n'importe quel jour de la semaine voulue) ----------
  r.get('/kids/:id/stats', auth.requireParent, (req, res) => res.json(stats.report(kidOr404(req.params.id).id, req.query.week)));
  r.get('/me/stats', auth.requireKid, (req, res) => res.json(stats.report(req.auth.kidId, req.query.week)));

  // ---------- Bibliothèque de tâches types ----------
  r.get('/templates', auth.requireParent, (req, res) => res.json(templates.list()));
  r.post('/templates', auth.requireParent, (req, res) => res.status(201).json({ id: templates.create(req.body) }));
  r.delete('/templates/:id', auth.requireParent, (req, res) => { templates.remove(Number(req.params.id)); res.json({ ok: true }); });

  // ---------- Ludique ----------
  r.post('/me/seen', auth.requireKid, (req, res) => { game.markSeen(req.auth.kidId); res.json({ ok: true }); });
  r.post('/kids/:id/badges', auth.requireParent, (req, res) => {
    const kid = kidOr404(req.params.id), b = req.body || {};
    game.giveBadge(kid.id, b.title, b.emoji);
    res.status(201).json({ ok: true });
  });
  r.get('/stickers', auth.requireParent, (req, res) => res.json(game.stickerList()));
  r.post('/kids/:id/kudos', auth.requireParent, (req, res) => {
    const kid = kidOr404(req.params.id), b = req.body || {};
    push.onKudos(kid.id, game.giveKudos(kid.id, b.sticker, b.note, b.points));
    res.status(201).json({ ok: true });
  });
  const allSettings = () => ({ lateSend: tasks.lateMode(), levelXp: points.levelXp(), streakBonus: game.bonuses(), notif: push.notifSettings(), photo: photos.config() });
  r.get('/settings', auth.requireParent, (req, res) => res.json(allSettings()));
  r.put('/settings', auth.requireParent, (req, res) => {
    const b = req.body || {};
    if (b.levelXp !== undefined) points.setLevelXp(b.levelXp);
    if (b.lateSend !== undefined) tasks.setLateMode(b.lateSend);
    if (b.streakBonus !== undefined) game.setBonuses(b.streakBonus);
    if (b.notif !== undefined) push.setNotifSettings(b.notif);
    if (b.photo !== undefined) photos.setConfig(b.photo);
    res.json(allSettings());
  });

  // ---------- Notifications push (parent ou enfant : un abonnement par appareil) ----------
  const requireAny = (req, res, next) => (req.auth ? next() : next(httpError(401, 'Connexion requise.')));
  r.get('/push/key', requireAny, (req, res) => res.json({ publicKey: push.publicKey() }));
  r.post('/push/subscribe', requireAny, (req, res) => { push.subscribe(req.auth, req.body); res.json({ ok: true }); });
  r.post('/push/unsubscribe', requireAny, (req, res) => { push.unsubscribe((req.body || {}).endpoint); res.json({ ok: true }); });
  r.post('/push/test', requireAny, async (req, res) => res.json({ sent: await push.sendTest(req.auth) }));

  // ---------- Magasin (parents) ----------
  r.get('/rewards', auth.requireParent, (req, res) => res.json(shop.list()));
  r.post('/rewards', auth.requireParent, (req, res) => res.status(201).json({ id: shop.create(req.body) }));
  r.put('/rewards/:id', auth.requireParent, (req, res) => { shop.update(Number(req.params.id), req.body); res.json({ ok: true }); });
  r.delete('/rewards/:id', auth.requireParent, (req, res) => { shop.remove(Number(req.params.id)); res.json({ ok: true }); });
  r.get('/accessories', auth.requireParent, (req, res) => res.json(shop.accessories()));
  r.put('/accessories/:id', auth.requireParent, (req, res) => {
    const b = req.body || {}, id = Number(req.params.id);
    if (b.price !== undefined) shop.setAccessoryPrice(id, b.price);
    if (b.minLevel !== undefined) shop.setAccessoryLevel(id, b.minLevel);
    res.json({ ok: true });
  });
  r.get('/purchases/pending', auth.requireParent, (req, res) => res.json(shop.pending()));
  r.post('/purchases/:id/give', auth.requireParent, (req, res) => { push.onGiven(shop.give(Number(req.params.id))); res.json({ ok: true }); });
  r.post('/purchases/:id/refuse', auth.requireParent, (req, res) => { const out = shop.refuse(Number(req.params.id)); push.onPurchaseRefused(out); res.json(out); });
  r.get('/kids/:id/purchases', auth.requireParent, (req, res) => res.json(shop.kidPurchases(kidOr404(req.params.id).id)));

  // ---------- Magasin (enfant) ----------
  r.get('/me/shop', auth.requireKid, (req, res) => res.json(shop.forKid(req.auth.kidId)));
  r.get('/me/purchases', auth.requireKid, (req, res) => res.json(shop.kidPurchases(req.auth.kidId)));
  r.post('/me/purchases', auth.requireKid, (req, res) => { const out = shop.purchase(req.auth.kidId, Number((req.body || {}).rewardId)); push.onPurchase(req.auth.kidId, out.title, out.price); res.status(201).json(out); });
  r.put('/me/goal', auth.requireKid, (req, res) => { const id = (req.body || {}).rewardId; shop.setGoal(req.auth.kidId, id === null || id === undefined ? null : Number(id)); res.json({ ok: true }); });
  r.post('/me/accessories/:id/buy', auth.requireKid, (req, res) => res.json(shop.buyAccessory(req.auth.kidId, Number(req.params.id))));
  r.post('/me/accessories/:id/equip', auth.requireKid, (req, res) => { shop.equipAccessory(req.auth.kidId, Number(req.params.id)); res.json({ ok: true }); });

  return r;
}

module.exports = { router, PALETTES };
