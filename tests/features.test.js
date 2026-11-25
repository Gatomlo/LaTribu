// Photo preuve, statistiques hebdomadaires, bibliothèque de tâches, validité des récompenses, changement de PIN.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.LATRIBU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'latribu-f-'));
process.env.LATRIBU_PUSH = 'off';
process.env.LATRIBU_FAIL_DELAY_MS = '0';
const app = require('../server');
const { db } = require('../lib/db');
const dates = require('../lib/dates');
const photos = require('../lib/photos');

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}/api/`; });
test.after(() => server.close());

const client = () => {
  let cookie = '';
  const jar = {};
  return async (p, method = 'GET', body) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body && JSON.stringify(body) });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); jar[kv.split('=')[0]] = kv; cookie = Object.values(jar).join('; '); }
    const type = res.headers.get('content-type') || '';
    return { status: res.status, type, data: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
};

async function family(names = ['Alex', 'Sam']) {
  const parent = client();
  if ((await parent('setup', 'POST', { email: 'p@x.be', password: 'motdepasse1' })).status === 409) await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const kids = [];
  for (const [i, name] of names.entries()) {
    const k = client(), id = (await parent('kids', 'POST', { name, pin: `${i + 1}${i + 1}${i + 1}${i + 1}` })).data.id;
    await k(`kids/${id}/login`, 'POST', { pin: `${i + 1}${i + 1}${i + 1}${i + 1}` });
    kids.push({ id, c: k });
  }
  return { parent, kids };
}
const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]).toString('base64');

test('photo preuve : désactivée par défaut, exigée si réglage global ET tâche, purgée après décision', async () => {
  const { parent, kids: [a, b] } = await family();
  const t = (await parent('tasks', 'POST', { title: 'Chambre', points: 5, kids: [a.id, b.id], repeat: 'daily', photoRequired: true })).data.id;
  const free = (await parent('tasks', 'POST', { title: 'Poubelles', points: 5, kids: [a.id], repeat: 'daily' })).data.id;
  assert.equal((await parent('settings')).data.photo.enabled, false);
  assert.equal((await a.c('me/missions')).data.today.find((o) => o.taskId === t).photoRequired, false, 'réglage global coupé : pas de photo demandée');

  // globalement coupé : la déclaration passe sans photo
  const occB = (await b.c('me/missions')).data.today.find((o) => o.taskId === t).id;
  assert.equal((await b.c(`occurrences/${occB}/done`, 'POST', {})).status, 200);

  assert.equal((await parent('settings', 'PUT', { photo: { enabled: true, keepDays: 3 } })).data.photo.keepDays, 3);
  assert.equal((await parent('settings', 'PUT', { photo: { keepDays: 0 } })).status, 400);
  const today = (await a.c('me/missions')).data.today;
  const occ = today.find((o) => o.taskId === t), occFree = today.find((o) => o.taskId === free);
  assert.equal(occ.photoRequired, true);
  assert.equal(occFree.photoRequired, false);

  assert.equal((await a.c(`occurrences/${occ.id}/done`, 'POST', {})).status, 400, 'photo exigée');
  assert.equal((await a.c(`occurrences/${occ.id}/done`, 'POST', { photo: 'data:text/html;base64,PGI+' })).status, 400, 'pas un JPEG');
  assert.equal((await a.c(`occurrences/${occ.id}/done`, 'POST', { photo: 'data:image/jpeg;base64,' + Buffer.from('pas une image').toString('base64') })).status, 400, 'signature JPEG absente');
  const huge = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(700 * 1024)]).toString('base64');
  assert.ok([400, 413].includes((await a.c(`occurrences/${occ.id}/done`, 'POST', { photo: huge })).status), 'photo trop lourde');
  assert.equal((await a.c(`occurrences/${occ.id}/done`, 'POST', { photo: JPEG })).status, 200);
  assert.equal((await a.c(`occurrences/${occFree.id}/done`, 'POST', { photo: JPEG })).status, 200, 'photo facultative acceptée');

  const review = (await parent('review')).data.find((o) => o.id === occ.id);
  assert.equal(review.hasPhoto, true);
  const img = await parent(`occurrences/${occ.id}/photo`);
  assert.equal(img.status, 200);
  assert.equal(img.type, 'image/jpeg');
  assert.equal((await a.c(`occurrences/${occ.id}/photo`)).status, 200, 'l\'enfant voit sa photo');
  assert.equal((await b.c(`occurrences/${occ.id}/photo`)).status, 404, 'pas celle d\'un autre enfant');
  assert.equal((await client()(`occurrences/${occ.id}/photo`)).status, 401);

  // validation puis purge : la photo disparaît après la durée de conservation
  await parent(`occurrences/${occ.id}/approve`, 'POST', {});
  assert.equal(photos.purge(), 0, 'trop récent');
  db.prepare('UPDATE occurrences SET decided_at = ? WHERE id = ?').run(Date.now() - 4 * 864e5, occ.id);
  assert.equal(photos.purge(), 1);
  assert.equal((await parent(`occurrences/${occ.id}/photo`)).status, 404);
  // une photo en attente de décision n'est jamais purgée
  assert.equal(photos.get(occFree.id) !== undefined, true);
});

test('statistiques hebdomadaires : points, dépenses, missions, comparaison, bornes', async () => {
  const { parent, kids: [a] } = await family(['Zoé']);
  await parent('tasks', 'POST', { title: 'Devoirs', points: 30, kids: [a.id], repeat: 'daily' });
  const occ = (await a.c('me/missions')).data.today[0].id;
  await a.c(`occurrences/${occ}/done`, 'POST', {});
  await parent(`occurrences/${occ}/approve`, 'POST', {});
  const rw = (await parent('rewards', 'POST', { title: 'Glace', price: 10, kids: [a.id] })).data.id;
  await a.c('me/purchases', 'POST', { rewardId: rw });

  const s = (await parent(`kids/${a.id}/stats`)).data;
  assert.equal(s.isCurrent, true);
  assert.equal(s.days.length, 7);
  assert.equal(s.weekStart, dates.weekStart(dates.today()));
  assert.equal(s.totals.earned, 30);
  assert.equal(s.totals.spent, 10);
  assert.equal(s.totals.done, 1);
  assert.equal(s.totals.rate, 100);
  const day = s.days.find((d) => d.date === dates.today());
  assert.deepEqual([day.earned, day.spent, day.done, day.total], [30, 10, 1, 1]);
  assert.equal(s.prev.earned, 0);
  assert.equal(s.streak >= 1, true);

  const last = (await parent(`kids/${a.id}/stats?week=${dates.addDays(dates.today(), -7)}`)).data;
  assert.equal(last.isCurrent, false);
  assert.equal(last.totals.earned, 0);
  assert.equal((await parent(`kids/${a.id}/stats?week=2999-01-01`)).data.isCurrent, true, 'jamais dans le futur');
  assert.equal((await parent(`kids/${a.id}/stats?week=abc`)).data.isCurrent, true);
  assert.equal((await a.c('me/stats')).data.totals.earned, 30);
  assert.equal((await a.c(`kids/${a.id}/stats`)).status, 403);

  // un refus de l'achat rend les points : la dépense est annulée dans les stats
  const pend = (await parent('purchases/pending')).data[0].id;
  await parent(`purchases/${pend}/refuse`, 'POST', {});
  assert.equal((await parent(`kids/${a.id}/stats`)).data.totals.spent, 0);
});

test('bibliothèque de tâches types : modèles livrés, ajout, suppression', async () => {
  const { parent, kids: [a] } = await family(['Léa']);
  const list = (await parent('templates')).data;
  assert.ok(list.length >= 16);
  const lit = list.find((t) => t.title === 'Faire son lit');
  assert.equal(lit.repeat, 'daily');
  assert.equal(lit.moment, 'matin');
  assert.equal(list.find((t) => t.title === 'Sortir les poubelles').label, 'Chaque semaine · Mar');
  assert.equal((await a.c('templates')).status, 403);

  const mine = await parent('templates', 'POST', { title: 'Arroser le jardin', points: 7, icon: '🌱', repeat: 'days', days: [2, 5], moment: 'soir', photoRequired: true });
  assert.equal(mine.status, 201);
  const saved = (await parent('templates')).data.find((t) => t.id === mine.data.id);
  assert.deepEqual([saved.label, saved.photoRequired, saved.points], ['Mar · Ven', true, 7]);
  assert.equal((await parent('templates', 'POST', { title: 'Une fois', points: 5, repeat: 'date', date: '2099-01-01' })).status, 400, 'pas de date précise dans un modèle');
  assert.equal((await parent('templates', 'POST', { title: '', points: 5, repeat: 'daily' })).status, 400);
  assert.equal((await parent(`templates/${mine.data.id}`, 'DELETE')).status, 200);
  assert.equal((await parent(`templates/${mine.data.id}`, 'DELETE')).status, 404);
  assert.equal((await parent(`templates/${lit.id}`, 'DELETE')).status, 200, 'les modèles livrés se suppriment aussi');
});

test('validité des récompenses : dates, activation, cachées ou annoncées à l\'enfant', async () => {
  const { parent, kids: [a] } = await family(['Max']);
  await parent(`kids/${a.id}/adjust`, 'POST', { delta: 500 });
  const today = dates.today(), yesterday = dates.addDays(today, -1), tomorrow = dates.addDays(today, 1), nextWeek = dates.addDays(today, 7);
  const mk = async (extra) => (await parent('rewards', 'POST', { title: `R${Math.random()}`, price: 10, kids: [a.id], ...extra })).data.id;
  const expired = await mk({ validUntil: yesterday });
  const upcoming = await mk({ validFrom: tomorrow });
  const off = await mk({ active: false });
  const live = await mk({ validFrom: yesterday, validUntil: nextWeek });
  assert.equal((await parent('rewards', 'POST', { title: 'X', price: 5, kids: [a.id], validFrom: nextWeek, validUntil: today })).status, 400);
  assert.equal((await parent('rewards', 'POST', { title: 'X', price: 5, kids: [a.id], validUntil: 'demain' })).status, 400);

  const shop = (await a.c('me/shop')).data.rewards;
  const ids = shop.map((r) => r.id);
  assert.ok(!ids.includes(expired) && !ids.includes(off), 'expirée et désactivée : cachées');
  assert.ok(ids.includes(live));
  const soon = shop.find((r) => r.id === upcoming);
  assert.match(soon.blocked, /^Dès le /);
  assert.match(shop.find((r) => r.id === live).info, /Jusqu'au /);

  assert.equal((await a.c('me/purchases', 'POST', { rewardId: upcoming })).status, 409);
  assert.equal((await a.c('me/purchases', 'POST', { rewardId: expired })).status, 409, 'achat direct d\'une expirée refusé aussi');
  assert.equal((await a.c('me/purchases', 'POST', { rewardId: off })).status, 409);
  assert.equal((await a.c('me/purchases', 'POST', { rewardId: live })).status, 201);

  const parentView = (await parent('rewards')).data;
  const state = (id) => parentView.find((r) => r.id === id).availability;
  assert.deepEqual([state(expired), state(upcoming), state(off), state(live)], ['expired', 'upcoming', 'off', 'ok']);
  // réactiver : elle réapparaît
  const r = parentView.find((x) => x.id === off);
  await parent(`rewards/${off}`, 'PUT', { title: r.title, price: r.price, kids: r.kids, active: true });
  assert.ok((await a.c('me/shop')).data.rewards.some((x) => x.id === off));
});

test('changement de PIN par un parent : ancien PIN refusé, sessions de l\'enfant fermées', async () => {
  const { parent, kids: [a] } = await family(['Eva']);
  assert.equal((await a.c('session')).data.role, 'kid');
  assert.equal((await parent(`kids/${a.id}`, 'PATCH', { pin: '12' })).status, 400);
  assert.equal((await parent(`kids/${a.id}`, 'PATCH', { pin: '9876' })).status, 200);
  assert.equal((await a.c('session')).data.role, null, 'l\'ancien téléphone doit ressaisir le code');
  const phone = client();
  assert.equal((await phone(`kids/${a.id}/login`, 'POST', { pin: '1111' })).status, 401);
  assert.equal((await phone(`kids/${a.id}/login`, 'POST', { pin: '9876' })).status, 200);
});

test('modèles avec sous-tâches : exemples livrés, enregistrement et relecture', async () => {
  const templates = require('../lib/templates');
  const list = templates.list();
  const rituel = list.find((t) => t.title === 'Rituel du soir');
  assert.deepEqual(rituel.steps.map((s) => s.label), ['Mettre son pyjama', 'Se brosser les dents', 'Faire pipi']);
  assert.equal(rituel.stepsMode, 'each');
  assert.equal(rituel.points, 5, '3 sous-tâches à 1 point + bonus 2');
  assert.equal(list.find((t) => t.title === 'Ranger la cuisine').stepsMode, 'all');
  const id = templates.create({ title: 'Perso', points: 4, repeat: 'daily', steps: ['x', 'y'] });
  assert.deepEqual(templates.list().find((t) => t.id === id).steps.map((s) => s.label), ['x', 'y']);
});

test('photo preuve : description de la photo souhaitée et envoi sans photo avec motif', async () => {
  const { parent, kids: [a] } = await family(['Lou', 'Max']);
  await parent('settings', 'PUT', { photo: { enabled: true, keepDays: 7 } });
  const t = (await parent('tasks', 'POST', { title: 'Cuisine propre', points: 5, kids: [a.id], repeat: 'daily', photoRequired: true, photoHint: 'Le plan de travail dégagé, vu de face' })).data.id;
  const listed = (await parent('tasks')).data.find((x) => x.id === t);
  assert.equal(listed.photoHint, 'Le plan de travail dégagé, vu de face');
  const occ = (await a.c('me/missions')).data.today.find((o) => o.taskId === t);
  assert.equal(occ.photoHint, 'Le plan de travail dégagé, vu de face', 'montrée à l\'enfant');
  assert.equal((await parent('tasks', 'POST', { title: 'Sans photo', points: 5, kids: [a.id], repeat: 'daily', photoHint: 'ignorée' })).status, 201);
  assert.equal((await parent('tasks')).data.find((x) => x.title === 'Sans photo').photoHint, '', 'description gardée seulement si la photo est demandée');

  assert.equal((await a.c(`occurrences/${occ.id}/done`, 'POST', {})).status, 400, 'toujours exigée sans motif');
  assert.equal((await a.c(`occurrences/${occ.id}/done`, 'POST', { skipPhoto: true, photoNote: 'Le téléphone n\'avait plus de batterie' })).status, 200);
  const r = (await parent('review')).data.find((o) => o.id === occ.id);
  assert.equal(r.photoSkipped, 1);
  assert.equal(r.photoNote, 'Le téléphone n\'avait plus de batterie');
  assert.equal(r.hasPhoto, false);
  assert.equal((await parent(`occurrences/${occ.id}/approve`, 'POST', {})).status, 200, 'le parent décide : il peut valider');
  await parent('settings', 'PUT', { photo: { enabled: false } });
});
