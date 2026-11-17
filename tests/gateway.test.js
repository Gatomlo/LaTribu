// Connexion centralisée de node-gateway : crochet gatewayAccounts, rattachement à un compte parent existant,
// session locale de 2 h, déconnexion volontaire, création du premier compte fermée aux visiteurs anonymes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

process.env.LATRIBU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'latribu-gw-'));
process.env.LATRIBU_PUSH = 'off';
process.env.LATRIBU_FAIL_DELAY_MS = '0';
const latribu = require('../server');
const { db } = require('../lib/db');

// Passerelle simulée : monte l'outil sur /latribu et pose req.gateway d'après l'en-tête de test (comme le ferait la vraie).
const gw = express();
gw.use((req, res, next) => {
  const h = req.headers['x-test-gateway'];
  req.gateway = h ? JSON.parse(h) : { app: 'latribu', user: null, role: null }; // « derrière la passerelle », éventuellement anonyme
  next();
});
gw.use('/latribu', latribu);
let base;
const server = gw.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}/latribu/api/`; });
test.after(() => server.close());

const who = (over = {}) => JSON.stringify({ app: 'latribu', role: 'admin', user: { login: 'thomas', name: 'Thomas', email: 'parents@famille.be', isSuper: false }, ...over });
const client = (gateway) => {
  const jar = {};
  const call = async (p, method = 'GET', body) => {
    const headers = { 'Content-Type': 'application/json', cookie: Object.values(jar).join('; ') };
    if (call.gateway) headers['x-test-gateway'] = call.gateway;
    const res = await fetch(base + p, { method, headers, body: body && JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); jar[kv.split('=')[0]] = kv; }
    return { status: res.status, data: await res.json().catch(() => ({})), cookies: res.headers.getSetCookie() };
  };
  call.gateway = gateway;
  return call;
};

test('crochet gatewayAccounts : comptes parents en lecture seule, sans secret', () => {
  assert.equal(typeof latribu.gatewayAccounts, 'function');
  db.prepare("INSERT INTO users (email, password_hash, created_at) VALUES ('parents@famille.be', 'scrypt$secret$hash', 1)").run();
  const list = latribu.gatewayAccounts();
  assert.deepEqual(list, [{ key: 'parents@famille.be', name: 'parents', detail: 'compte parent', email: 'parents@famille.be', login: 'parents@famille.be' }]);
  assert.ok(!JSON.stringify(list).includes('scrypt'), 'jamais d\'empreinte de mot de passe');
});

test('rattachement : droit admin + e-mail identique = session parent de 2 h, jamais de compte créé', async () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const parent = client(who());
  const s = (await parent('session')).data;
  assert.equal(s.role, 'parent');
  assert.equal(s.email, 'parents@famille.be');
  assert.deepEqual(s.gateway, { name: 'Thomas', admin: true, linked: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, before, 'aucun compte créé');
  const life = db.prepare("SELECT expires_at - created_at AS life FROM sessions WHERE role = 'parent' ORDER BY created_at DESC LIMIT 1").get().life;
  assert.equal(life, 2 * 3600 * 1000, 'session locale de 2 h');
  // la session de 2 h n'est jamais prolongée à l'usage
  await parent('session');
  assert.equal(db.prepare("SELECT expires_at - created_at AS life FROM sessions ORDER BY created_at DESC LIMIT 1").get().life, 2 * 3600 * 1000);
  assert.equal((await parent('kids')).status, 200, 'accès parent complet');
});

test('sans droit admin, sans identité ou sans compte lié : pas de session parent', async () => {
  assert.equal((await client(who({ role: 'member' }))('session')).data.role, null, 'membre : pas parent');
  assert.equal((await client()('session')).data.role, null, 'anonyme');
  const stranger = client(who({ user: { login: 'inconnu', name: 'Inconnu', email: 'autre@x.be' } }));
  const s = (await stranger('session')).data;
  assert.equal(s.role, null);
  assert.deepEqual(s.gateway, { name: 'Inconnu', admin: true, linked: false }, 'l\'interface peut expliquer le rattachement manquant');
});

test('compte local choisi par l\'administrateur : prioritaire, sans repli sur l\'e-mail', async () => {
  const other = client(who({ local: 'parents@famille.be', user: { login: 'marie', name: 'Marie', email: 'marie@autre.be' } }));
  assert.equal((await other('session')).data.role, 'parent', 'identifiants différents mais compte local indiqué');
  const wrong = client(who({ local: 'faute@famille.be' })); // l'e-mail Thomas existe, mais le compte local indiqué n'existe pas
  assert.equal((await wrong('session')).data.role, null, 'jamais de repli : une faute de frappe n\'ouvre pas un autre compte');
});

test('déconnexion volontaire : plus de reconnexion automatique jusqu\'au bouton « plateforme »', async () => {
  const p = client(who());
  assert.equal((await p('session')).data.role, 'parent');
  const out = await p('logout', 'POST', {});
  assert.ok(out.cookies.some((c) => c.startsWith('latribu_nogw=1') && c.includes('Path=/latribu/')), 'suspension limitée au montage');
  assert.equal((await p('session')).data.role, null, 'pas de reconnexion automatique après déconnexion');
  assert.equal((await p('session')).data.gateway.linked, true, 'mais l\'interface propose le bouton');
  assert.equal((await p('gateway/login', 'POST', {})).status, 200);
  assert.equal((await p('session')).data.role, 'parent');

  const none = client(who({ user: { login: 'x', name: 'X', email: 'x@x.be' } }));
  assert.equal((await none('gateway/login', 'POST', {})).status, 403, 'rien à lier');
  assert.equal((await client()('gateway/login', 'POST', {})).status, 403, 'anonyme');
});

test('premier compte : fermé aux anonymes derrière la passerelle, ouvert à un administrateur de la plateforme', async () => {
  db.prepare('DELETE FROM users').run();
  const anon = client();
  const s = (await anon('session')).data;
  assert.equal(s.setup, false);
  assert.equal(s.setupClosed, true);
  assert.equal((await anon('setup', 'POST', { email: 'pirate@x.be', password: 'motdepasse1' })).status, 403);
  const admin = client(who());
  assert.equal((await admin('session')).data.setup, true);
  assert.equal((await admin('setup', 'POST', { email: 'parents@famille.be', password: 'motdepasse1' })).status, 200);
});
