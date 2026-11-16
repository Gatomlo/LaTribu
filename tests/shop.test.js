// Étape 3 : magasin (limites, stock individuel ou partagé, approbation, remboursement), objectif, accessoires.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.LATRIBU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'latribu-s-'));
const app = require('../server');

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}/api/`; });
test.after(() => server.close());

const client = () => {
  let cookie = '';
  const jar = {};
  return async (p, method = 'GET', body) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body && JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); jar[kv.split('=')[0]] = kv; cookie = Object.values(jar).join('; '); } // session + appareil
    return { status: res.status, data: await res.json() };
  };
};

// Famille : un parent, deux enfants (Alex, Sam), solde de départ par bonus.
async function setup(pointsEach = 500) {
  const parent = client(), a = client(), b = client();
  // La base est partagée par les tests du fichier : installation une fois, puis connexion ; enfants neufs à chaque fois.
  if ((await parent('setup', 'POST', { email: 'p@x.be', password: 'motdepasse1' })).status === 409) await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const ka = (await parent('kids', 'POST', { name: 'Alex', pin: '1111' })).data.id;
  const kb = (await parent('kids', 'POST', { name: 'Sam', pin: '2222' })).data.id;
  await a(`kids/${ka}/login`, 'POST', { pin: '1111' });
  await b(`kids/${kb}/login`, 'POST', { pin: '2222' });
  await parent(`kids/${ka}/adjust`, 'POST', { delta: pointsEach });
  await parent(`kids/${kb}/adjust`, 'POST', { delta: pointsEach });
  return { parent, a, b, ka, kb };
}

test('catalogue : validation, une récompense pour plusieurs enfants, description', async () => {
  const { parent, a, b, ka, kb } = await setup();
  assert.equal((await parent('rewards', 'POST', { title: '', price: 10, kids: [ka] })).status, 400);
  assert.equal((await parent('rewards', 'POST', { title: 'X', price: 0, kids: [ka] })).status, 400);
  assert.equal((await parent('rewards', 'POST', { title: 'X', price: 10, kids: [] })).status, 400);
  assert.equal((await parent('rewards', 'POST', { title: 'X', price: 10, kids: [ka], limit: 'an' })).status, 400);
  const r = await parent('rewards', 'POST', { title: 'Soirée pizza', description: 'Au resto', price: 80, kids: [ka, kb] });
  assert.equal(r.status, 201);
  assert.equal((await a('me/shop')).data.rewards[0].description, 'Au resto');
  assert.equal((await b('me/shop')).data.rewards.length, 1);
  assert.equal((await parent('rewards')).data.find((x) => x.id === r.data.id).kids.length, 2);
});

test('achat avec approbation : points réservés, remboursés si refus ; pas assez de points', async () => {
  const { parent, a, ka } = await setup(100);
  const id = (await parent('rewards', 'POST', { title: 'Console', price: 60, kids: [ka] })).data.id;
  const big = (await parent('rewards', 'POST', { title: 'Vélo', price: 1000, kids: [ka] })).data.id;
  assert.equal((await a('me/purchases', 'POST', { rewardId: big })).status, 409);

  const buy = await a('me/purchases', 'POST', { rewardId: id });
  assert.equal(buy.status, 201);
  assert.equal(buy.data.points, 40, 'points réservés');
  assert.equal((await a('me/purchases', 'POST', { rewardId: id })).status, 409, 'demande déjà en attente');
  assert.equal((await a('me/shop')).data.rewards.find((r) => r.id === id).pending, true);
  assert.equal((await parent('purchases/pending')).data.length, 1);
  assert.equal((await a(`purchases/${buy.data.id}/give`, 'POST', {})).status, 403);

  const refused = await parent(`purchases/${buy.data.id}/refuse`, 'POST', {});
  assert.equal(refused.data.points, 100, 'points rendus');
  assert.equal((await parent(`purchases/${buy.data.id}/refuse`, 'POST', {})).status, 409);
  const again = await a('me/purchases', 'POST', { rewardId: id });
  assert.equal((await parent(`purchases/${again.data.id}/give`, 'POST', {})).status, 200);
  assert.equal((await a('me')).data.points, 40);
  const hist = (await parent(`kids/${ka}/purchases`)).data;
  assert.deepEqual(hist.map((p) => p.status), ['given', 'refused']);
  assert.equal((await a('me/purchases')).data.length, 2);
});

test('limite par enfant : 1 par semaine bloque après la demande, pas après un refus', async () => {
  const { parent, a, b, ka, kb } = await setup();
  const id = (await parent('rewards', 'POST', { title: 'Film du soir', price: 10, limit: 'week', kids: [ka, kb] })).data.id;
  const p1 = await a('me/purchases', 'POST', { rewardId: id });
  await parent(`purchases/${p1.data.id}/give`, 'POST', {});
  const shopA = (await a('me/shop')).data.rewards[0];
  assert.equal(shopA.blocked, 'Déjà pris cette semaine');
  assert.equal((await a('me/purchases', 'POST', { rewardId: id })).status, 409);
  assert.equal((await b('me/shop')).data.rewards[0].blocked, '', 'le compteur est par enfant');

  const p2 = await b('me/purchases', 'POST', { rewardId: id });
  await parent(`purchases/${p2.data.id}/refuse`, 'POST', {});
  assert.equal((await b('me/shop')).data.rewards[0].blocked, '', 'un refus ne consomme pas la limite');
});

test('stock individuel : chaque enfant a le sien, rendu si refus', async () => {
  const { parent, a, b, ka, kb } = await setup();
  const id = (await parent('rewards', 'POST', { title: 'Glace', price: 10, stock: 1, kids: [ka, kb] })).data.id;
  const p = await a('me/purchases', 'POST', { rewardId: id });
  assert.equal((await a('me/shop')).data.rewards[0].blocked, 'Épuisé');
  assert.equal((await b('me/shop')).data.rewards[0].blocked, '', 'stock de Sam intact');
  await parent(`purchases/${p.data.id}/refuse`, 'POST', {});
  assert.equal((await a('me/shop')).data.rewards[0].blocked, '', 'stock rendu');
});

test('stock partagé : le premier qui achète épuise pour les autres ; rendu si refus', async () => {
  const { parent, a, b, ka, kb } = await setup();
  const id = (await parent('rewards', 'POST', { title: 'Cinéma en famille', price: 50, stock: 1, shared: true, kids: [ka, kb] })).data.id;
  assert.equal((await parent('rewards')).data.find((x) => x.id === id).shared, true);
  const p = await a('me/purchases', 'POST', { rewardId: id });
  assert.equal(p.status, 201);
  assert.equal((await b('me/shop')).data.rewards[0].blocked, 'Épuisé');
  assert.equal((await b('me/purchases', 'POST', { rewardId: id })).status, 409);
  await parent(`purchases/${p.data.id}/refuse`, 'POST', {});
  assert.equal((await b('me/shop')).data.rewards[0].blocked, '');
  assert.equal((await b('me/purchases', 'POST', { rewardId: id })).status, 201);
  // « partagé » sans stock ou pour un seul enfant : ignoré
  const solo = await parent('rewards', 'POST', { title: 'Solo', price: 5, stock: 2, shared: true, kids: [ka] });
  assert.equal((await parent('rewards')).data.find((r) => r.id === solo.data.id).shared, false);
});

test('objectif d\'épargne, récompense supprimée (l\'historique reste)', async () => {
  const { parent, a, ka, kb } = await setup(100);
  const id = (await parent('rewards', 'POST', { title: 'Piscine', icon: '🏊', price: 300, kids: [ka] })).data.id;
  assert.equal((await a('me/goal', 'PUT', { rewardId: id })).status, 200);
  assert.deepEqual((await a('me')).data.goal, { id, title: 'Piscine', icon: '🏊', price: 300 });
  const other = (await parent('rewards', 'POST', { title: 'Autre', price: 5, kids: [kb] })).data.id;
  assert.equal((await a('me/goal', 'PUT', { rewardId: other })).status, 404, 'pas dans son magasin');
  const cheap = (await parent('rewards', 'POST', { title: 'Bonbon', price: 5, kids: [ka] })).data.id;
  const p = await a('me/purchases', 'POST', { rewardId: cheap });
  await parent(`rewards/${cheap}`, 'DELETE');
  assert.equal((await parent(`purchases/${p.data.id}/give`, 'POST', {})).status, 200);
  assert.equal((await a('me/purchases')).data[0].title, 'Bonbon');
  await parent(`rewards/${id}`, 'DELETE');
  assert.equal((await a('me')).data.goal, null);
});

test('accessoires : achat immédiat avec les mêmes points, port, prix modifiable', async () => {
  const { parent, a, ka } = await setup(100);
  const acc = (await parent('accessories')).data;
  assert.equal(acc.length, 5);
  const lunettes = acc.find((x) => x.title === 'Lunettes');
  const couronne = acc.find((x) => x.title === 'Couronne');
  assert.equal((await a(`me/accessories/${couronne.id}/buy`, 'POST', {})).status, 409, 'pas assez de points');
  const bought = await a(`me/accessories/${lunettes.id}/buy`, 'POST', {});
  assert.equal(bought.data.points, 60);
  assert.equal((await a(`me/accessories/${lunettes.id}/buy`, 'POST', {})).status, 409, 'déjà débloqué');
  assert.equal((await a('me')).data.accessory, '🕶️');
  assert.equal((await a(`me/accessories/${couronne.id}/equip`, 'POST', {})).status, 409);
  await a('me/accessories/none/equip', 'POST', {});
  assert.equal((await a('me')).data.accessory, null);
  await a(`me/accessories/${lunettes.id}/equip`, 'POST', {});
  assert.equal((await parent('kids')).data.find((k) => k.id === ka).accessory, '🕶️');
  assert.equal((await parent(`accessories/${couronne.id}`, 'PUT', { price: 20 })).status, 200);
  assert.equal((await a(`me/accessories/${couronne.id}/buy`, 'POST', {})).status, 200, 'prix libre côté parent');
  assert.equal((await a('me/history')).data[0].label, 'Accessoire : Couronne');
});
