// Étape 5 : abonnements push, rappels planifiés, résumé parent, événements, appareils désinscrits.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.LATRIBU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'latribu-p-'));
process.env.LATRIBU_PUSH = 'off';
const app = require('../server');
const push = require('../lib/push');
const dates = require('../lib/dates');
const { db } = require('../lib/db');

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}/api/`; });
test.after(() => server.close());

const client = () => {
  let cookie = '';
  return async (p, method = 'GET', body) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body && JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json() };
  };
};
const sub = (name) => ({ endpoint: `https://push.example/${name}`, keys: { p256dh: `p-${name}`, auth: `a-${name}` } });

const sent = [];
let failWith = null;
push.setSender(async (s, payload) => { if (failWith) throw failWith; sent.push({ endpoint: s.endpoint.split('/').pop(), title: payload.title, body: payload.body }); });
const take = () => sent.splice(0);
const HM = (h, m) => h * 60 + m;

test('abonnements : accès, validation, clé VAPID, réglages', async () => {
  const parent = client(), kid = client(), anon = client();
  await parent('setup', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const k = (await parent('kids', 'POST', { name: 'Alex', pin: '1111' })).data.id;
  await kid(`kids/${k}/login`, 'POST', { pin: '1111' });
  assert.equal((await anon('push/key')).status, 401);
  const key = (await parent('push/key')).data.publicKey;
  assert.ok(key && key.length > 40);
  assert.equal((await kid('push/key')).data.publicKey, key, 'clé stable');
  assert.equal((await kid('push/subscribe', 'POST', { endpoint: 'http://non-https', keys: {} })).status, 400);
  assert.equal((await kid('push/subscribe', 'POST', sub('kid1'))).status, 200);
  assert.equal((await parent('push/subscribe', 'POST', sub('par1'))).status, 200);

  assert.deepEqual((await parent('settings')).data.notif, { alert: true, digest: '20:00', remindAgain: true });
  assert.equal((await parent('settings', 'PUT', { notif: { digest: '25:00' } })).status, 400);
  assert.equal((await kid('settings')).status, 403);

  assert.equal((await kid('push/test', 'POST', {})).data.sent, 1);
  assert.deepEqual(take().map((m) => m.endpoint), ['kid1'], 'le test ne va qu\'aux appareils de l\'enfant');
  assert.equal((await parent('push/test', 'POST', {})).data.sent, 1);
  assert.deepEqual(take().map((m) => m.endpoint), ['par1']);
});

test('rappels : à l\'heure, une seule fois, second rappel, pas si déjà fait', async () => {
  const parent = client(), kid = client();
  await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const k = (await parent('kids')).data[0].id;
  await kid(`kids/${k}/login`, 'POST', { pin: '1111' });
  await kid('push/subscribe', 'POST', sub('kid1'));
  const t1 = (await parent('tasks', 'POST', { title: 'Chambre', points: 5, kids: [k], repeat: 'daily', remindAt: '18:30' })).data.id;
  await parent('tasks', 'POST', { title: 'Sans rappel', points: 5, kids: [k], repeat: 'daily' });
  const date = dates.today();
  take();

  assert.deepEqual(await push.tick({ date, minutes: HM(18, 29) }), [], 'trop tôt');
  const s1 = await push.tick({ date, minutes: HM(18, 30) });
  assert.deepEqual(s1.map((x) => x.title), ['Rappel · Chambre']);
  assert.deepEqual(take().map((m) => m.endpoint), ['kid1']);
  assert.deepEqual(await push.tick({ date, minutes: HM(18, 31) }), [], 'pas de doublon');
  assert.equal((await push.tick({ date, minutes: HM(19, 30) })).length, 1, 'second rappel 1 h plus tard');
  take();

  // tâche déclarée : plus de rappel
  const occ = (await kid('me/missions')).data.today.find((o) => o.taskId === t1).id;
  await kid(`occurrences/${occ}/done`, 'POST', {});
  await push.idle();
  take();
  db.prepare('DELETE FROM notif_log').run();
  assert.deepEqual(await push.tick({ date, minutes: HM(18, 30) }), []);

  // second rappel désactivé
  await parent('settings', 'PUT', { notif: { remindAgain: false } });
  await parent(`occurrences/${occ}/refuse`, 'POST', { note: 'Pas fait' });   // refusée : à refaire, donc de nouveau rappelable
  await push.idle();
  assert.deepEqual(take().map((m) => m.title), ['Mission à refaire']);
  db.prepare('DELETE FROM notif_log').run();
  assert.deepEqual(await push.tick({ date, minutes: HM(19, 30) }), []);
  await parent('settings', 'PUT', { notif: { remindAgain: true } });
});

test('événements : mission déclarée, validée, demande d\'achat, remise ; alerte désactivable', async () => {
  const parent = client(), kid = client();
  await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const k = (await parent('kids')).data[0].id;
  await kid(`kids/${k}/login`, 'POST', { pin: '1111' });
  await kid('push/subscribe', 'POST', sub('kid1'));
  await parent('push/subscribe', 'POST', sub('par1'));
  await parent('tasks', 'POST', { title: 'Poubelles', points: 40, kids: [k], repeat: 'daily' });
  take();

  const occ = (await kid('me/missions')).data.today.find((o) => o.title === 'Poubelles').id;
  await kid(`occurrences/${occ}/done`, 'POST', {});
  await push.idle();
  assert.deepEqual(take().map((m) => [m.endpoint, m.title]), [['par1', 'Mission à valider']]);

  await parent(`occurrences/${occ}/approve`, 'POST', {});
  await push.idle();
  const dec = take();
  assert.equal(dec.length, 1);
  assert.equal(dec[0].endpoint, 'kid1');
  assert.match(dec[0].body, /Poubelles.*\+40/);

  const rid = (await parent('rewards', 'POST', { title: 'Glace', price: 10, kids: [k] })).data.id;
  const buy = (await kid('me/purchases', 'POST', { rewardId: rid })).data;
  await push.idle();
  assert.deepEqual(take().map((m) => [m.endpoint, m.title]), [['par1', 'Demande d\'achat']]);
  await parent(`purchases/${buy.id}/give`, 'POST', {});
  await push.idle();
  assert.deepEqual(take().map((m) => m.title), ['Récompense remise']);

  // alerte parent coupée : plus de push à la déclaration
  await parent('settings', 'PUT', { notif: { alert: false } });
  await parent('tasks', 'POST', { title: 'Vaisselle', points: 5, kids: [k], repeat: 'daily' });
  const occ2 = (await kid('me/missions')).data.today.find((o) => o.title === 'Vaisselle').id;
  await kid(`occurrences/${occ2}/done`, 'POST', {});
  await push.idle();
  assert.deepEqual(take(), []);
  await parent('settings', 'PUT', { notif: { alert: true } });
});

test('résumé quotidien parent, appareil désinscrit (410), révocation enfant', async () => {
  const parent = client(), kid = client();
  await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const k = (await parent('kids')).data[0].id;
  await kid(`kids/${k}/login`, 'POST', { pin: '1111' });
  await parent('push/subscribe', 'POST', sub('par1'));
  const date = dates.today();
  take();

  // une mission est en attente (Vaisselle, déclarée au test précédent) : résumé à 20:00
  assert.deepEqual(await push.tick({ date, minutes: HM(19, 59) }), []);
  const d = await push.tick({ date, minutes: HM(20, 2) });
  assert.deepEqual(d, [{ to: 'parents', title: 'À valider' }]);
  assert.match(take()[0].body, /élément/);
  assert.deepEqual(await push.tick({ date, minutes: HM(20, 5) }), [], 'un seul résumé par jour');
  await parent('settings', 'PUT', { notif: { digest: null } });
  db.prepare('DELETE FROM notif_log').run();
  assert.deepEqual(await push.tick({ date, minutes: HM(20, 2) }), [], 'résumé désactivé');

  // l'appareil n'existe plus : suppression de l'abonnement
  failWith = Object.assign(new Error('gone'), { statusCode: 410 });
  await parent('push/test', 'POST', {});
  failWith = null;
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint LIKE '%par1'").get().n, 0);

  // déconnexion d'un enfant par un parent : ses abonnements disparaissent
  await kid('push/subscribe', 'POST', sub('kid9'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE kid_id = ?').get(k).n >= 1, true);
  await parent(`kids/${k}/revoke`, 'POST', {});
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE kid_id = ?').get(k).n, 0);
  await kid('push/unsubscribe', 'POST', { endpoint: sub('kid9').endpoint });
});
