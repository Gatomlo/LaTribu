// Mises à jour : réglages de notification, clés VAPID et abonnements doivent survivre au redémarrage
// et à une migration de la base (avec sauvegarde automatique) ; toutes les icônes référencées existent.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const run = (dir, code) => JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: { ...process.env, LATRIBU_DATA_DIR: dir, LATRIBU_PUSH: 'off' }, encoding: 'utf8' }).trim().split('\n').pop());

test('réglages, clé VAPID et abonnements conservés après redémarrage puis migration', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'latribu-u-'));

  // Installation d'origine : réglages personnalisés, clé VAPID générée, un appareil abonné.
  const first = run(dir, `
    const push = require('./lib/push'); const { db } = require('./lib/db');
    push.setNotifSettings({ alert: false, digest: '19:00', remindAgain: false });
    const key = push.publicKey();
    db.prepare("INSERT INTO kids (name, palette, pin_hash, created_at) VALUES ('Alex', 0, 'x', 1)").run();
    db.prepare("INSERT INTO push_subscriptions (endpoint, p256dh, auth, role, kid_id, created_at) VALUES ('https://push.example/a', 'p', 'a', 'kid', 1, 1)").run();
    console.log(JSON.stringify({ n: push.notifSettings(), key }));`);
  assert.deepEqual(first.n, { alert: false, digest: '19:00', remindAgain: false });

  // Simple redémarrage : rien ne change.
  const again = run(dir, `const push = require('./lib/push'); console.log(JSON.stringify({ n: push.notifSettings(), key: push.publicKey() }));`);
  assert.deepEqual(again, first);

  // Mise à jour simulée : la base est en version 5 (les objets de la version 6 n'existent pas encore).
  run(dir, `
    const { DatabaseSync } = require('node:sqlite'); const c = new DatabaseSync(require('path').join(process.env.LATRIBU_DATA_DIR, 'latribu.db'));
    c.exec('ALTER TABLE task_templates DROP COLUMN steps; ALTER TABLE task_templates DROP COLUMN steps_mode; ALTER TABLE task_templates DROP COLUMN steps_bonus; DELETE FROM task_templates WHERE id > 16; DROP TABLE occurrence_steps; DROP TABLE task_steps; DROP TABLE occurrence_photos; DROP TABLE task_templates; DROP TABLE trusted_devices; ALTER TABLE tasks DROP COLUMN steps_bonus; ALTER TABLE tasks DROP COLUMN steps_mode; ALTER TABLE tasks DROP COLUMN photo_required; ALTER TABLE rewards DROP COLUMN valid_from; ALTER TABLE rewards DROP COLUMN valid_until; ALTER TABLE rewards DROP COLUMN active; PRAGMA user_version = 5;'); c.close(); console.log('{}');`);
  const upgraded = run(dir, `
    const push = require('./lib/push'); const { db } = require('./lib/db');
    console.log(JSON.stringify({ n: push.notifSettings(), key: push.publicKey(), v: db.prepare('PRAGMA user_version').get().user_version,
      tables: db.prepare("SELECT name FROM sqlite_master WHERE name IN ('occurrence_photos', 'task_templates', 'trusted_devices')").all().length,
      templates: db.prepare('SELECT COUNT(*) AS n FROM task_templates').get().n, subs: db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n }));`);
  assert.deepEqual(upgraded.n, first.n, 'réglages intacts après migration');
  assert.equal(upgraded.key, first.key, 'même clé VAPID : les abonnements existants restent valides');
  assert.equal(upgraded.v, 10);
  assert.equal(upgraded.tables, 3);
  assert.equal(upgraded.templates, 18, 'bibliothèque de modèles livrée');
  assert.equal(upgraded.subs, 1, 'abonnements push conservés');
  const backups = fs.readdirSync(path.join(dir, 'backups'));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^latribu-v5-.*\.db$/);
});

test('toutes les icônes référencées existent (manifeste, service worker, notifications)', () => {
  const pub = path.join(ROOT, 'public');
  const manifest = JSON.parse(fs.readFileSync(path.join(pub, 'manifest.json'), 'utf8'));
  const sw = fs.readFileSync(path.join(pub, 'sw.js'), 'utf8');
  const cached = [...sw.match(/const FILES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((f) => f !== './');
  const push = require('../lib/push');
  const files = new Set([...manifest.icons.map((i) => i.src), ...cached, ...Object.values(push.ICONS), 'badge-96.png', 'icon-192.png']);
  for (const f of files) assert.ok(fs.existsSync(path.join(pub, f)), `fichier manquant : public/${f}`);
  for (const f of Object.values(push.ICONS)) assert.ok(cached.includes(f), `${f} doit être dans le cache du service worker`);
});
