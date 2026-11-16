// Authentification. Deux rôles :
//  - parent : e-mail + mot de passe (compte partagé par les deux parents), session de 90 jours ;
//  - enfant : profil + code PIN à 4 chiffres, saisi UNE fois : la session reste ouverte sur
//    le téléphone (cookie d'un an, prolongé à l'usage) jusqu'à déconnexion ou révocation par un parent.
// Sessions gardées en base (survivent au redémarrage de la passerelle). Mots de passe et PIN :
// scrypt (module crypto de Node), calcul asynchrone.
const crypto = require('crypto');
const { promisify } = require('util');
const { db } = require('./db');
const { httpError, limiter } = require('./util');

const COOKIE = 'latribu_session';
const DAY = 24 * 3600 * 1000;
const TTL = { parent: 90 * DAY, kid: 365 * DAY };

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

// Chemin de montage de l'app (/latribu dans la passerelle, '' seule).
function rootPath(req) {
  const m = req.app && req.app.mountpath;
  return typeof m === 'string' && m !== '/' ? m : '';
}

function readCookie(req) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === COOKIE) { try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; } }
  }
  return null;
}

// Cookie limité à l'app (pas aux autres outils de la passerelle, même domaine).
function setCookie(req, res, value, maxAge) {
  const secure = req.secure || String(req.get('x-forwarded-proto') || '').startsWith('https');
  const parts = [`${COOKIE}=${value}`, `Path=${rootPath(req)}/`, `Max-Age=${Math.floor(maxAge / 1000)}`, 'HttpOnly', 'SameSite=Lax'];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function createSession(req, res, role, id) {
  const token = newToken();
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('INSERT INTO sessions (token_hash, role, user_id, kid_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sha256(token), role, role === 'parent' ? id : null, role === 'kid' ? id : null, now, now + TTL[role]);
  setCookie(req, res, token, TTL[role]);
}

function destroySession(req, res) {
  const token = readCookie(req);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  setCookie(req, res, '', 0);
}

// Renseigne req.auth = { role, userId | kidId } si la session est valide (prolongée au plus une fois par jour).
function loadSession(req, res, next) {
  const token = readCookie(req);
  if (token) {
    const row = db.prepare('SELECT role, user_id, kid_id, expires_at FROM sessions WHERE token_hash = ?').get(sha256(token));
    if (row && row.expires_at > Date.now()) {
      req.auth = { role: row.role, userId: row.user_id, kidId: row.kid_id };
      if (row.expires_at - Date.now() < TTL[row.role] - DAY) {
        db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(Date.now() + TTL[row.role], sha256(token));
        setCookie(req, res, token, TTL[row.role]);
      }
    }
  }
  next();
}

const requireParent = (req, res, next) =>
  (req.auth && req.auth.role === 'parent' ? next() : next(httpError(req.auth ? 403 : 401, 'Accès réservé aux parents.')));
const requireKid = (req, res, next) =>
  (req.auth && req.auth.role === 'kid' ? next() : next(httpError(req.auth ? 403 : 401, 'Connexion requise.')));

// Déconnecte tous les appareils d'un enfant (suppression du profil, changement de PIN, « déconnecter »).
const revokeKidSessions = (kidId) => db.prepare('DELETE FROM sessions WHERE kid_id = ?').run(kidId);
// Mot de passe changé : on garde seulement la session courante.
function dropOtherParentSessions(req, userId) {
  const token = readCookie(req);
  db.prepare("DELETE FROM sessions WHERE role = 'parent' AND user_id = ? AND token_hash <> ?").run(userId, token ? sha256(token) : '');
}

// ---------- Empreintes (mots de passe et PIN) ----------
// Format : scrypt$<sel hex>$<empreinte hex>.
const scrypt = promisify(crypto.scrypt);
const MIN_PASSWORD = 8;

function checkPassword(p) {
  if (typeof p !== 'string' || p.length < MIN_PASSWORD) throw httpError(400, `Mot de passe trop court (${MIN_PASSWORD} caractères minimum).`);
  if (p.length > 200) throw httpError(400, 'Mot de passe trop long.');
}
function checkPin(p) {
  if (typeof p !== 'string' || !/^\d{4}$/.test(p)) throw httpError(400, 'Le code PIN doit comporter 4 chiffres.');
}
async function hash(secret) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await scrypt(secret, salt, 64)).toString('hex')}`;
}
const hashPassword = async (p) => { checkPassword(p); return hash(p); };
const hashPin = async (p) => { checkPin(p); return hash(p); };

// Compte inconnu : même calcul sur une empreinte factice (le temps de réponse ne révèle rien).
const DUMMY = `scrypt$${'00'.repeat(16)}$${'00'.repeat(64)}`;
async function verify(secret, stored) {
  const [, salt, h] = String(stored || DUMMY).split('$');
  const expected = Buffer.from(h, 'hex');
  const actual = await scrypt(String(secret || ''), Buffer.from(salt, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual) && !!stored;
}

// ---------- Limitation des essais ----------
// Parent : blocage 15 min après 8 échecs pour une adresse ; au-delà de 40 échecs au total,
// réponses ralenties (l'IP n'est pas fiable derrière le proxy).
const parentFailures = limiter(15 * 60 * 1000);
const parentLocked = (email) => parentFailures.count('u:' + email) >= 8;
const parentFailure = (email) => { parentFailures.hit('u:' + email); parentFailures.hit('*'); };
const parentDelay = () => (parentFailures.count('*') >= 40 ? 3000 : 600);
// Enfant : 5 PIN faux -> verrouillage 5 min de ce profil.
const kidFailures = limiter(5 * 60 * 1000);
const kidLocked = (kidId) => kidFailures.count('k:' + kidId) >= 5;
const kidFailure = (kidId) => kidFailures.hit('k:' + kidId);
const kidSuccess = (kidId) => kidFailures.reset('k:' + kidId);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  rootPath, loadSession, createSession, destroySession, requireParent, requireKid,
  revokeKidSessions, dropOtherParentSessions,
  hashPassword, hashPin, verify, checkPassword,
  parentLocked, parentFailure, parentDelay, kidLocked, kidFailure, kidSuccess, sleep,
};
