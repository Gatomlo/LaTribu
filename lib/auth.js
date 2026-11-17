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
const bridge = require('./gateway-bridge');

const DEVICE_COOKIE = 'latribu_device';

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

function createSession(req, res, role, id, ttl = TTL[role]) {
  const token = newToken();
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  db.prepare('INSERT INTO sessions (token_hash, role, user_id, kid_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(sha256(token), role, role === 'parent' ? id : null, role === 'kid' ? id : null, now, now + ttl);
  setCookie(req, res, token, ttl);
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
    const row = db.prepare('SELECT role, user_id, kid_id, created_at, expires_at FROM sessions WHERE token_hash = ?').get(sha256(token));
    if (row && row.expires_at > Date.now()) {
      req.auth = { role: row.role, userId: row.user_id, kidId: row.kid_id };
      // Prolongation à l'usage seulement pour les sessions longues (les sessions de 2 h venant de la passerelle ne sont jamais prolongées).
      if (row.expires_at - row.created_at > 2 * DAY && row.expires_at - Date.now() < TTL[row.role] - DAY) {
        db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(Date.now() + TTL[row.role], sha256(token));
        setCookie(req, res, token, TTL[row.role]);
      }
    }
  }
  if (!req.auth) gatewayLogin(req, res);
  next();
}

// ---------- Connexion centralisée de la passerelle ----------
// Derrière node-gateway, req.gateway porte l'identité de la plateforme (posée côté serveur, non falsifiable).
// Un utilisateur ayant le droit « admin » sur La Tribu est rattaché à UN compte parent existant (compte local
// indiqué par l'administrateur de la passerelle, sinon e-mail identique) : jamais de compte créé. Il reçoit une
// session locale de 2 h. Après une déconnexion volontaire, la reconnexion automatique est suspendue (cookie
// latribu_nogw) jusqu'au bouton « Continuer avec la plateforme ».
const GATEWAY_TTL = 2 * 3600 * 1000;
const NOGW_COOKIE = 'latribu_nogw';
function gatewayParent(req) {
  const id = bridge.identity(req, 'admin');
  if (!id) return null;
  return bridge.matchLocal(id, db.prepare('SELECT id, email FROM users').all(), { email: 'email', login: 'email' });
}
function gatewayLogin(req, res, force = false) {
  if (!force && readCookieNamed(req, NOGW_COOKIE)) return false;
  const u = gatewayParent(req);
  if (!u) return false;
  createSession(req, res, 'parent', u.id, GATEWAY_TTL);
  req.auth = { role: 'parent', userId: u.id, kidId: null };
  return true;
}
// Appelée à la connexion explicite par la plateforme : lève la suspension.
function gatewayLoginExplicit(req, res) {
  if (!gatewayLogin(req, res, true)) throw httpError(403, 'Aucun compte parent n\'est lié à ton compte de la plateforme.');
  const secure = req.secure || String(req.get('x-forwarded-proto') || '').startsWith('https');
  res.append('Set-Cookie', [`${NOGW_COOKIE}=`, `Path=${rootPath(req)}/`, 'Max-Age=0', 'HttpOnly', 'SameSite=Lax', ...(secure ? ['Secure'] : [])].join('; '));
}
function suspendGatewayLogin(req, res) {
  const secure = req.secure || String(req.get('x-forwarded-proto') || '').startsWith('https');
  res.append('Set-Cookie', [`${NOGW_COOKIE}=1`, `Path=${rootPath(req)}/`, `Max-Age=${12 * 3600}`, 'HttpOnly', 'SameSite=Lax', ...(secure ? ['Secure'] : [])].join('; '));
}
// Création du premier compte : derrière la passerelle, réservée à un administrateur de la plateforme
// (sinon le premier visiteur venu pourrait la faire).
const setupAllowed = (req) => !bridge.behindGateway(req) || !!bridge.identity(req, 'admin');
// État pour l'interface : identité de la plateforme et rattachement éventuel.
function gatewayInfo(req) {
  const id = bridge.identity(req);
  return id ? { name: id.name, admin: id.role === 'admin', linked: !!gatewayParent(req) } : null;
}
// Liste lue par la passerelle (crochet app.gatewayAccounts) : comptes parents, jamais de secret.
const gatewayAccounts = () => db.prepare('SELECT email FROM users ORDER BY id').all()
  .map((u) => ({ key: u.email, name: u.email.split('@')[0], detail: 'compte parent', email: u.email, login: u.email }));

const requireParent = (req, res, next) =>
  (req.auth && req.auth.role === 'parent' ? next() : next(httpError(req.auth ? 403 : 401, 'Accès réservé aux parents.')));
const requireKid = (req, res, next) =>
  (req.auth && req.auth.role === 'kid' ? next() : next(httpError(req.auth ? 403 : 401, 'Connexion requise.')));

// ---------- Appareils ----------
// Chaque navigateur reçoit un identifiant d'appareil (cookie HttpOnly d'un an). Il sert à verrouiller les
// tentatives de connexion PAR APPAREIL : un tiers qui échoue depuis son téléphone ne bloque pas celui de
// l'enfant. Un appareil qui s'est déjà connecté avec succès est « de confiance » : il peut continuer
// à essayer même quand la protection globale d'un profil est activée (attaque en cours).
function readCookieNamed(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) { try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; } }
  }
  return null;
}
function deviceId(req, res) {
  let id = readCookieNamed(req, DEVICE_COOKIE);
  if (!/^[a-f0-9]{32}$/.test(id || '')) {
    id = crypto.randomBytes(16).toString('hex');
    const secure = req.secure || String(req.get('x-forwarded-proto') || '').startsWith('https');
    res.append('Set-Cookie', [`${DEVICE_COOKIE}=${id}`, `Path=${rootPath(req)}/`, `Max-Age=${400 * 24 * 3600}`, 'HttpOnly', 'SameSite=Lax', ...(secure ? ['Secure'] : [])].join('; '));
  }
  return id;
}
const trust = (dev, role, subjectId) => db.prepare('INSERT OR IGNORE INTO trusted_devices (device_hash, role, subject_id, created_at) VALUES (?, ?, ?, ?)').run(sha256(dev), role, subjectId, Date.now());
const isTrusted = (dev, role, subjectId) => !!db.prepare('SELECT 1 FROM trusted_devices WHERE device_hash = ? AND role = ? AND subject_id = ?').get(sha256(dev), role, subjectId);
const untrustAll = (role, subjectId) => db.prepare('DELETE FROM trusted_devices WHERE role = ? AND subject_id = ?').run(role, subjectId);

// Adresse du client. Derrière le proxy de l'hébergeur, la connexion vient du proxy : l'adresse réelle est la
// dernière entrée de X-Forwarded-For (ajoutée par le proxy lui-même, donc non falsifiable par le client).
// On ne s'y fie que si la connexion vient d'une adresse locale ou privée (le proxy), ou si
// LATRIBU_TRUST_PROXY=1 le impose ; en connexion directe depuis internet, l'en-tête est ignoré.
const PRIVATE = /^(::1|::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)|^(fc|fd|fe80)/i;
function clientIp(req) {
  const remote = (req.socket && req.socket.remoteAddress) || 'inconnue';
  if (process.env.LATRIBU_TRUST_PROXY === '1' || remote === '::1' || PRIVATE.test(remote)) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return remote;
}

// Déconnecte tous les appareils d'un enfant (suppression du profil, changement de PIN, « déconnecter »).
// (les abonnements push de l'enfant sont retirés aussi : un téléphone déconnecté ne reçoit plus ses rappels)
const revokeKidSessions = (kidId) => {
  db.prepare('DELETE FROM sessions WHERE kid_id = ?').run(kidId);
  db.prepare('DELETE FROM push_subscriptions WHERE kid_id = ?').run(kidId);
  untrustAll('kid', kidId);
};
// Mot de passe changé : on garde seulement la session courante.
function dropOtherParentSessions(req, userId) {
  untrustAll('parent', userId);
  const token = readCookie(req);
  db.prepare("DELETE FROM sessions WHERE role = 'parent' AND user_id = ? AND token_hash <> ?").run(userId, token ? sha256(token) : '');
}

// ---------- Empreintes (mots de passe et PIN) ----------
// Format : scrypt$<sel hex>$<empreinte hex>.
const scryptRaw = promisify(crypto.scrypt);
// Au plus 2 calculs scrypt en parallèle (le process est partagé avec les autres outils de la passerelle) ;
// les autres attendent, et au-delà de 16 en attente le serveur répond « occupé ».
let activeHashes = 0;
const hashQueue = [];
async function scrypt(secret, salt, len) {
  if (activeHashes >= 2) {
    if (hashQueue.length >= 16) throw httpError(503, 'Serveur occupé, réessaie dans un instant.');
    await new Promise((resolve) => hashQueue.push(resolve)); // la place est transmise par release
  } else activeHashes++;
  try { return await scryptRaw(secret, salt, len); } finally {
    const next = hashQueue.shift();
    if (next) next(); else activeHashes--;
  }
}
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
// Trois niveaux, sans qu'un tiers puisse bloquer la famille :
//  1. par adresse IP : au plus 40 tentatives et 15 échecs par 5 min (freine aussi le calcul scrypt) ;
//  2. par appareil + profil : 5 PIN faux (enfant) ou 8 mots de passe faux (parent) = pause de 5 / 15 min ;
//  3. par profil, tous appareils confondus : au-delà de 20 (enfant) / 40 (parent) échecs par heure, seuls
//     les appareils déjà connectés avec succès peuvent encore essayer.
const ipAttempts = limiter(5 * 60 * 1000), ipFails = limiter(5 * 60 * 1000);
const kidDevice = limiter(5 * 60 * 1000), kidGlobal = limiter(3600 * 1000);
const parentDevice = limiter(15 * 60 * 1000), parentGlobal = limiter(3600 * 1000);

function throttleIp(req) {
  const ip = clientIp(req);
  if (ipAttempts.count(ip) >= 40 || ipFails.count(ip) >= 15) throw httpError(429, 'Trop de tentatives depuis cette connexion. Réessaie dans quelques minutes.');
  ipAttempts.hit(ip);
  return ip;
}

function beginKidAttempt(req, res, kidId) {
  const ip = throttleIp(req), dev = deviceId(req, res);
  if (kidDevice.count(`${kidId}:${dev}`) >= 5) throw httpError(429, 'Trop d\'essais. Réessaie dans 5 minutes.');
  if (kidGlobal.count(String(kidId)) >= 20 && !isTrusted(dev, 'kid', kidId)) throw httpError(429, 'Protection activée : réessaie plus tard, ou demande à un parent.');
  return { ip, dev, kidId };
}
const kidFailed = (g) => { kidDevice.hit(`${g.kidId}:${g.dev}`); kidGlobal.hit(String(g.kidId)); ipFails.hit(g.ip); };
const kidSucceeded = (g) => { kidDevice.reset(`${g.kidId}:${g.dev}`); trust(g.dev, 'kid', g.kidId); };

function beginParentAttempt(req, res, email, userId) {
  const ip = throttleIp(req), dev = deviceId(req, res);
  if (parentDevice.count(`${email}:${dev}`) >= 8) throw httpError(429, 'Trop d\'échecs. Réessayez dans quelques minutes.');
  if (parentGlobal.count(email) >= 40 && !(userId && isTrusted(dev, 'parent', userId))) throw httpError(429, 'Protection activée : réessayez plus tard depuis un appareil déjà connecté.');
  return { ip, dev, email, userId };
}
const parentFailed = (g) => { parentDevice.hit(`${g.email}:${g.dev}`); parentGlobal.hit(g.email); ipFails.hit(g.ip); };
const parentSucceeded = (g) => { parentDevice.reset(`${g.email}:${g.dev}`); trust(g.dev, 'parent', g.userId); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  setupAllowed, gatewayInfo, gatewayAccounts, gatewayLoginExplicit, suspendGatewayLogin, rootPath, loadSession, createSession, destroySession, requireParent, requireKid,
  revokeKidSessions, dropOtherParentSessions,
  hashPassword, hashPin, verify, checkPassword, deviceId, clientIp, throttleIp,
  beginKidAttempt, kidFailed, kidSucceeded, beginParentAttempt, parentFailed, parentSucceeded, sleep,
};
