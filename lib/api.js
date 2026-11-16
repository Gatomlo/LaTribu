// API JSON de l'app. Étape 1 (socle) : installation, connexion parent, profils enfants,
// PIN, gestion des enfants par les parents.
const express = require('express');
const { db } = require('./db');
const auth = require('./auth');
const { httpError } = require('./util');

const PALETTES = 6; // nombre de couleurs d'accent proposées côté interface

const publicKid = (k) => ({ id: k.id, name: k.name, age: k.age, palette: k.palette });
const userCount = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

function cleanName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 30) throw httpError(400, 'Prénom : 1 à 30 caractères.');
  return name;
}
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
    const out = { setup: userCount() === 0, role: null };
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
    if (userCount() > 0) throw httpError(409, 'L\'application est déjà installée.');
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw httpError(400, 'Adresse e-mail invalide.');
    const hash = await auth.hashPassword((req.body || {}).password);
    if (userCount() > 0) throw httpError(409, 'L\'application est déjà installée.');
    const info = db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)').run(email, hash, Date.now());
    auth.createSession(req, res, 'parent', Number(info.lastInsertRowid));
    res.json({ ok: true });
  });

  // Connexion parent.
  r.post('/login', async (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const password = (req.body || {}).password;
    if (auth.parentLocked(email)) throw httpError(429, 'Trop d\'échecs. Réessayez dans quelques minutes.');
    const user = db.prepare('SELECT id, password_hash FROM users WHERE email = ?').get(email);
    if (!(await auth.verify(password, user && user.password_hash))) {
      auth.parentFailure(email);
      await auth.sleep(auth.parentDelay());
      throw httpError(401, 'E-mail ou mot de passe incorrect.');
    }
    auth.createSession(req, res, 'parent', user.id);
    res.json({ ok: true });
  });

  r.post('/logout', (req, res) => { auth.destroySession(req, res); res.json({ ok: true }); });

  // Écran « Qui es-tu ? » : prénoms et couleurs uniquement (aucune donnée sensible).
  r.get('/profiles', (req, res) => {
    res.json(db.prepare('SELECT id, name, age, palette FROM kids ORDER BY created_at, id').all());
  });

  // Connexion d'un enfant : PIN saisi une seule fois, la session reste ensuite ouverte.
  r.post('/kids/:id/login', async (req, res) => {
    const kid = kidOr404(req.params.id);
    if (auth.kidLocked(kid.id)) throw httpError(429, 'Trop d\'essais. Réessaie dans 5 minutes.');
    if (!(await auth.verify(String((req.body || {}).pin || ''), kid.pin_hash))) {
      auth.kidFailure(kid.id);
      throw httpError(401, 'Code incorrect.');
    }
    auth.kidSuccess(kid.id);
    auth.createSession(req, res, 'kid', kid.id);
    res.json({ ok: true, kid: publicKid(kid) });
  });

  // ---------- Parents ----------
  r.get('/kids', auth.requireParent, (req, res) => {
    res.json(db.prepare('SELECT id, name, age, palette FROM kids ORDER BY created_at, id').all());
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
    db.prepare('UPDATE kids SET name = ?, age = ?, palette = ?, pin_hash = ? WHERE id = ?').run(name, age, palette, pinHash, kid.id);
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

  return r;
}

module.exports = { router, PALETTES };
