// Notifications push (Web Push, clés VAPID gardées en base, générées au premier usage).
//  - Parents : à chaque mission déclarée et demande d'achat (désactivable), rappel quotidien de
//    validation à l'heure choisie s'il reste des éléments en attente.
//  - Enfants : rappel de chaque tâche à son heure (second rappel 1 h plus tard si pas faite,
//    désactivable), décisions des parents (mission validée ou refusée, récompense remise).
// Un seul minuteur (1 min), non bloquant (unref) et sans jamais lever d'erreur : l'app est montée
// dans une passerelle qui partage son process (LATRIBU_PUSH=off le coupe).
const webpush = require('web-push');
const { db } = require('./db');
const { httpError } = require('./util');
const dates = require('./dates');
const settings = require('./settings');
const tasks = require('./tasks');

// ---------- Réglages ----------
const DEFAULTS = { alert: true, digest: '20:00', remindAgain: true };
const notifSettings = () => ({ ...DEFAULTS, ...settings.get('notif', {}) });
function setNotifSettings(input) {
  const cur = notifSettings(), b = input || {};
  if (b.alert !== undefined) cur.alert = !!b.alert;
  if (b.remindAgain !== undefined) cur.remindAgain = !!b.remindAgain;
  if (b.digest !== undefined) {
    if (b.digest !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.digest))) throw httpError(400, 'Heure invalide (HH:MM).');
    cur.digest = b.digest;
  }
  settings.set('notif', cur);
  return cur;
}

// ---------- Clés et envoi ----------
function vapid() {
  let v = settings.get('vapid', null);
  if (!v) { v = webpush.generateVAPIDKeys(); settings.set('vapid', v); }
  return v;
}
const publicKey = () => vapid().publicKey;
// LATRIBU_VAPID_SUBJECT : adresse de contact (mailto: ou https:) transmise au service de push.
const subject = () => process.env.LATRIBU_VAPID_SUBJECT || 'mailto:admin@latribu.invalid';

let sender = null; // injectable (tests) : async (subscription, payload) => void
const setSender = (fn) => { sender = fn; };

async function deliver(sub, payload) {
  if (sender) return sender(sub, payload);
  const v = vapid();
  return webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload),
    { vapidDetails: { subject: subject(), publicKey: v.publicKey, privateKey: v.privateKey }, TTL: 3600 });
}

async function sendTo(subs, payload) {
  let n = 0;
  for (const sub of subs) {
    try { await deliver(sub, payload); n++; } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id); // appareil désinscrit
      else console.warn('Push :', err && err.message);
    }
  }
  return n;
}

const kidSubs = (kidId) => db.prepare("SELECT * FROM push_subscriptions WHERE role = 'kid' AND kid_id = ?").all(kidId);
const parentSubs = () => db.prepare("SELECT * FROM push_subscriptions WHERE role = 'parent'").all();
// Une icône par type d'événement (public/notif-*.png) ; icône de l'app par défaut (test).
const ICONS = { reminder: 'notif-reminder.png', ok: 'notif-ok.png', reward: 'notif-reward.png', review: 'notif-review.png', alert: 'notif-alert.png' };
const payload = (title, body, tag, kind) => ({ title, body, tag: tag || 'latribu', url: './', icon: ICONS[kind] || 'icon-192.png' });

// Envois « au fil de l'eau » : jamais attendus par les requêtes, jamais d'erreur.
const pending = new Set();
function fire(promise) {
  const p = Promise.resolve(promise).catch((e) => console.warn('Push :', e && e.message)).finally(() => pending.delete(p));
  pending.add(p);
}
const idle = () => Promise.allSettled([...pending]);

const toKid = (kidId, title, body, tag, kind) => fire(sendTo(kidSubs(kidId), payload(title, body, tag, kind)));
const toParents = (title, body, tag, kind) => { if (notifSettings().alert) fire(sendTo(parentSubs(), payload(title, body, tag, kind))); };

// ---------- Abonnements ----------
function subscribe(auth, sub) {
  const keys = (sub && sub.keys) || {};
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || !keys.p256dh || !keys.auth) throw httpError(400, 'Abonnement invalide.');
  db.prepare(`INSERT INTO push_subscriptions (endpoint, p256dh, auth, role, kid_id, created_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, role = excluded.role, kid_id = excluded.kid_id`)
    .run(sub.endpoint, keys.p256dh, keys.auth, auth.role, auth.role === 'kid' ? auth.kidId : null, Date.now());
}
const unsubscribe = (endpoint) => db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(String(endpoint || ''));
async function sendTest(auth) {
  const subs = auth.role === 'kid' ? kidSubs(auth.kidId) : parentSubs();
  return sendTo(subs, payload('La Tribu', 'Les notifications fonctionnent sur ce téléphone.', 'test'));
}

// ---------- Événements ----------
function onDeclared(kidId, occId) {
  const r = db.prepare('SELECT t.title, k.name FROM occurrences o JOIN tasks t ON t.id = o.task_id JOIN kids k ON k.id = o.kid_id WHERE o.id = ?').get(occId);
  if (r) toParents('Mission à valider', `${r.name} a terminé « ${r.title} ».`, `review-${occId}`, 'review');
}
function onApproved(res) {
  const bonus = res.awarded && res.awarded.length ? ` Bonus de série : +${res.awarded[0].points}.` : '';
  toKid(res.kidId, 'Mission validée', `« ${res.taskTitle} » : +${res.points} points.${bonus}`, 'decision', 'ok');
}
const onRefused = (res) => toKid(res.kidId, 'Mission à refaire', `« ${res.title} »${res.note ? ` : ${res.note}` : ''}.`, 'decision', 'alert');
const onPurchase = (kidId, title, price) => {
  const k = db.prepare('SELECT name FROM kids WHERE id = ?').get(kidId);
  toParents('Demande d\'achat', `${k.name} voudrait « ${title} » (${price} points).`, `buy-${kidId}`, 'reward');
};
const onGiven = (p) => toKid(p.kid_id, 'Récompense remise', `« ${p.title} » : profite bien !`, 'decision', 'reward');
const onPurchaseRefused = (res) => toKid(res.kidId, 'Demande refusée', `« ${res.title} » : tes points te sont rendus.`, 'decision', 'alert');

// ---------- Planificateur ----------
const claim = (key) => db.prepare('INSERT OR IGNORE INTO notif_log (key, at) VALUES (?, ?)').run(key, Date.now()).changes > 0;

// Appelé chaque minute. Une fenêtre de 10 min rattrape un retard (redémarrage) sans doublon.
async function tick(now = {}) {
  const date = now.date || dates.today(), min = now.minutes ?? dates.nowMinutes(), conf = notifSettings(), sent = [];
  tasks.generate();
  const rows = db.prepare(`SELECT o.id, o.kid_id AS kidId, t.title, t.remind_at AS remindAt, k.name FROM occurrences o
    JOIN tasks t ON t.id = o.task_id JOIN kids k ON k.id = o.kid_id
    WHERE o.due_date = ? AND o.status IN ('todo', 'refused') AND t.remind_at IS NOT NULL`).all(date);
  for (const r of rows) {
    const diff = min - dates.toMinutes(r.remindAt);
    if (diff >= 0 && diff <= 10 && claim(`r1:${r.id}`)) {
      sent.push({ to: `kid:${r.kidId}`, title: `Rappel · ${r.title}` });
      toKid(r.kidId, `Rappel · ${r.title}`, `${r.name}, c'est l'heure !`, `task-${r.id}`, 'reminder');
    } else if (conf.remindAgain && diff >= 60 && diff <= 70 && claim(`r2:${r.id}`)) {
      sent.push({ to: `kid:${r.kidId}`, title: `Toujours à faire · ${r.title}` });
      toKid(r.kidId, `Toujours à faire · ${r.title}`, `${r.name}, « ${r.title} » t'attend encore.`, `task-${r.id}`, 'reminder');
    }
  }
  if (conf.digest) {
    const diff = min - dates.toMinutes(conf.digest);
    if (diff >= 0 && diff <= 10 && claim(`d:${date}`)) {
      const n = db.prepare("SELECT (SELECT COUNT(*) FROM occurrences WHERE status = 'wait') + (SELECT COUNT(*) FROM purchases WHERE status = 'req') AS n").get().n;
      if (n > 0) {
        sent.push({ to: 'parents', title: 'À valider' });
        fire(sendTo(parentSubs(), payload('À valider', `${n} élément${n > 1 ? 's' : ''} en attente de ta décision.`, 'digest', 'review')));
      }
    }
  }
  db.prepare('DELETE FROM notif_log WHERE at < ?').run(Date.now() - 7 * 864e5);
  await idle();
  return sent;
}

let timer = null;
function start() {
  if (process.env.LATRIBU_PUSH === 'off' || timer) return;
  timer = setInterval(() => { tick().catch((e) => console.warn('Rappels :', e && e.message)); }, 60 * 1000);
  timer.unref();
}

module.exports = { ICONS, notifSettings, setNotifSettings, publicKey, setSender, subscribe, unsubscribe, sendTest, onDeclared, onApproved, onRefused, onPurchase, onGiven, onPurchaseRefused, tick, start, idle };
