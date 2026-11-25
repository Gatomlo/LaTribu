// Sécurité : verrous par appareil et par adresse, plafond scrypt, liste blanche push, emoji et types, en-têtes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.LATRIBU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'latribu-sec-'));
process.env.LATRIBU_PUSH = 'off';
process.env.LATRIBU_FAIL_DELAY_MS = '0';
process.env.LATRIBU_TRUST_PROXY = '1'; // l'adresse du client vient de X-Forwarded-For (dernière entrée) : permet de simuler des IP
const app = require('../server');
const auth = require('../lib/auth');
const push = require('../lib/push');

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}/api/`; });
test.after(() => server.close());

// Client avec cookies (session + appareil) et une adresse IP simulée.
const client = (ip) => {
  let cookie = '';
  const jar = {};
  const call = async (p, method = 'GET', body, raw) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', cookie, 'X-Forwarded-For': call.ip }, body: raw ?? (body && JSON.stringify(body)) });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); jar[kv.split('=')[0]] = kv; cookie = Object.values(jar).join('; '); }
    return { status: res.status, data: await res.json().catch(() => ({})), headers: res.headers };
  };
  call.ip = ip;
  call.cookie = () => cookie;
  return call;
};
let n = 0;
const attacker = () => client(`203.0.113.${(n++ % 250) + 1}`);   // une adresse et un appareil neufs à chaque fois

async function family() {
  const parent = client('198.51.100.1'), kidPhone = client('198.51.100.2');
  if ((await parent('setup', 'POST', { email: 'p@x.be', password: 'motdepasse1' })).status === 409) await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const kid = (await parent('kids', 'POST', { name: 'Alex', pin: '1111' })).data.id;
  assert.equal((await kidPhone(`kids/${kid}/login`, 'POST', { pin: '1111' })).status, 200); // le téléphone de l'enfant devient « de confiance »
  return { parent, kidPhone, kid };
}

test('un tiers ne peut pas bloquer l\'enfant : verrou par appareil', async () => {
  const { kidPhone, kid } = await family();
  const evil = attacker();
  for (let i = 0; i < 5; i++) assert.equal((await evil(`kids/${kid}/login`, 'POST', { pin: '0000' })).status, 401);
  assert.equal((await evil(`kids/${kid}/login`, 'POST', { pin: '1111' })).status, 429, 'l\'appareil de l\'attaquant est en pause');
  assert.equal((await kidPhone(`kids/${kid}/login`, 'POST', { pin: '1111' })).status, 200, 'le téléphone de l\'enfant continue de marcher');
});

test('protection globale : appareil inconnu bloqué, appareil de confiance épargné', async () => {
  const { kidPhone, kid } = await family();
  for (let i = 0; i < 5; i++) { const evil = attacker(); for (let j = 0; j < 4; j++) await evil(`kids/${kid}/login`, 'POST', { pin: '0000' }); }
  const newcomer = attacker();
  const r = await newcomer(`kids/${kid}/login`, 'POST', { pin: '1111' });
  assert.equal(r.status, 429);
  assert.match(r.data.error, /Protection/);
  assert.equal((await kidPhone(`kids/${kid}/login`, 'POST', { pin: '1111' })).status, 200);
});

test('limite par adresse IP : 15 échecs, puis plus rien depuis cette adresse', async () => {
  const { kid } = await family();
  const evil = client('192.0.2.77');
  let last = 0;
  for (let i = 0; i < 16; i++) last = (await evil('login', 'POST', { email: `inconnu${i}@x.be`, password: 'faux' })).status;
  assert.equal(last, 429);
  assert.equal((await evil(`kids/${kid}/login`, 'POST', { pin: '1111' })).status, 429, 'toute tentative depuis cette adresse');
  assert.equal((await client('192.0.2.78')('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' })).status, 200, 'les autres adresses ne sont pas touchées');
});

test('parent : un tiers connaissant l\'e-mail ne verrouille pas le vrai parent', async () => {
  const { parent } = await family();
  const evil = attacker();
  for (let i = 0; i < 8; i++) assert.equal((await evil('login', 'POST', { email: 'p@x.be', password: 'faux' })).status, 401);
  assert.equal((await evil('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' })).status, 429);
  assert.equal((await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' })).status, 200);
});

test('plafond de calculs scrypt : file d\'attente bornée, réponse « occupé » au-delà', async () => {
  const stored = await auth.hashPassword('motdepasse1');
  const results = await Promise.allSettled(Array.from({ length: 40 }, () => auth.verify('x', stored)));
  const busy = results.filter((r) => r.status === 'rejected' && r.reason.status === 503).length;
  assert.ok(busy >= 10, `trop peu de refus (${busy})`);
  assert.ok(results.filter((r) => r.status === 'fulfilled').length >= 18);
  assert.equal(await auth.verify('motdepasse1', stored), true, 'le service redevient disponible');
});

test('push : seules les adresses des services de push des navigateurs sont acceptées', async () => {
  const { parent } = await family();
  const sub = (endpoint) => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });
  for (const bad of ['https://169.254.169.254/latest', 'https://127.0.0.1:9/x', 'http://fcm.googleapis.com/fcm/send/a', 'https://fcm.googleapis.com.evil.example/x',
    'https://user@fcm.googleapis.com/fcm/send/a', 'https://fcm.googleapis.com:8443/fcm/send/a', 'https://evil.example/web.push.apple.com']) {
    assert.equal((await parent('push/subscribe', 'POST', sub(bad))).status, 400, bad);
  }
  for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/abc', 'https://db5p.notify.windows.com/?token=abc']) {
    assert.equal((await parent('push/subscribe', 'POST', sub(ok))).status, 200, ok);
  }
  assert.equal(push.allowedEndpoint('not a url'), false);
});

test('emoji : uniquement des pictogrammes ; textes : uniquement des chaînes', async () => {
  const { parent, kid } = await family();
  await parent(`kids/${kid}/badges`, 'POST', { title: 'Piège', emoji: '<img src=x onerror=alert(1)>' });
  await parent(`kids/${kid}/badges`, 'POST', { title: 'Famille', emoji: '👨‍👩‍👧' });
  const kidClient = client('198.51.100.9');
  await kidClient(`kids/${kid}/login`, 'POST', { pin: '1111' });
  const badges = (await kidClient('me')).data.badges.filter((b) => b.desc === 'Décerné par un parent');
  assert.deepEqual(badges.map((b) => b.emoji), ['🏅', '👨‍👩‍👧'], 'le HTML est remplacé par l\'emoji par défaut');

  const t = await parent('tasks', 'POST', { title: 'Test', points: 5, kids: [kid], repeat: 'daily', icon: '<b>x</b>' });
  assert.equal((await parent('tasks')).data.find((x) => x.id === t.data.id).icon, '✨');
  const rw = await parent('rewards', 'POST', { title: 'Cadeau', price: 5, kids: [kid], icon: '"><script>' });
  assert.equal((await parent('rewards')).data.find((x) => x.id === rw.data.id).icon, '🎁');

  assert.equal((await parent('tasks', 'POST', { title: { a: 1 }, points: 5, kids: [kid], repeat: 'daily' })).status, 400);
  assert.equal((await parent('tasks', 'POST', { title: 'x', description: ['a'], points: 5, kids: [kid], repeat: 'daily' })).status, 400);
  assert.equal((await parent('kids', 'POST', { name: 42, pin: '1234' })).status, 400);
  assert.equal((await parent(`kids/${kid}/adjust`, 'POST', { delta: 5, label: { x: 1 } })).status, 400);
  assert.equal((await parent('login', 'POST', { email: ['p@x.be'], password: 'x' })).status, 400);
});

test('en-têtes et erreurs : API jamais en cache, messages internes masqués', async () => {
  const anon = client('198.51.100.50');
  assert.equal((await anon('session')).headers.get('cache-control'), 'no-store');
  const bad = await anon('login', 'POST', null, '{bad json');
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error, 'JSON invalide.');
  const big = await anon('login', 'POST', null, JSON.stringify({ email: 'a'.repeat(2_000_000) }));
  assert.equal(big.status, 413);
  assert.equal(big.data.error, 'Requête trop volumineuse.');
  assert.equal((await anon('kids')).headers.get('cache-control'), 'no-store');
});

test('voir comme : un parent lit l\'écran d\'un enfant, sans rien pouvoir modifier', async () => {
  const { parent, kid: k } = await family();
  const asKid = async (path, method = 'GET', as = k, withCookie = true) =>
    (await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-View-As': String(as), ...(withCookie ? { cookie: parent.cookie() } : {}), 'X-Forwarded-For': parent.ip } })).status;
  assert.equal(await asKid('me'), 200);
  assert.equal(await asKid('me/missions'), 200);
  assert.equal(await asKid('me/seen', 'POST'), 403, 'aucune écriture en aperçu');
  assert.equal(await asKid('me/purchases', 'POST'), 403);
  assert.equal(await asKid('me', 'GET', 99999), 404);
  assert.equal(await asKid('me', 'GET', k, false), 401, 'sans connexion parent, l\'en-tête ne donne rien');
});
