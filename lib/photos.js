// Photo preuve des missions. Réglage global (désactivé par défaut) + option par tâche : la photo n'est
// exigée que si les deux sont actifs. Photos en JPEG (réduites par l'appareil), gardées en base,
// lisibles par les parents et par l'enfant concerné, et purgées quelques jours après la décision.
const { db } = require('./db');
const { httpError } = require('./util');
const settings = require('./settings');

const MAX_BYTES = 600 * 1024;
const DEFAULTS = { enabled: false, keepDays: 7 };

const config = () => ({ ...DEFAULTS, ...settings.get('photo', {}) });
function setConfig(input) {
  const cur = config(), b = input || {};
  if (b.enabled !== undefined) cur.enabled = !!b.enabled;
  if (b.keepDays !== undefined) {
    const n = Number(b.keepDays);
    if (!Number.isInteger(n) || n < 1 || n > 90) throw httpError(400, 'Durée de conservation : 1 à 90 jours.');
    cur.keepDays = n;
  }
  settings.set('photo', cur);
  return cur;
}

// data:image/jpeg;base64,... -> Buffer (signature JPEG vérifiée, taille bornée).
function decode(input) {
  const m = typeof input === 'string' && input.length < MAX_BYTES * 1.4 + 100 ? input.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!m) throw httpError(400, 'Photo invalide (JPEG attendu, 600 Ko maximum).');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_BYTES) throw httpError(413, 'Photo trop lourde.');
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw httpError(400, 'Photo invalide (JPEG attendu).');
  return buf;
}

const save = (occId, buf) => db.prepare('INSERT OR REPLACE INTO occurrence_photos (occurrence_id, data, created_at) VALUES (?, ?, ?)').run(occId, buf, Date.now());
const get = (occId) => db.prepare('SELECT data FROM occurrence_photos WHERE occurrence_id = ?').get(occId);

// Supprime les photos des missions décidées depuis plus de keepDays jours (celles en attente sont gardées).
function purge() {
  const cutoff = Date.now() - config().keepDays * 864e5;
  return db.prepare("DELETE FROM occurrence_photos WHERE occurrence_id IN (SELECT id FROM occurrences WHERE status IN ('done', 'refused') AND decided_at IS NOT NULL AND decided_at < ?)").run(cutoff).changes;
}

module.exports = { config, setConfig, decode, save, get, purge };
