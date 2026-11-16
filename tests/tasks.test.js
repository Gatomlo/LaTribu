// Étape 2 : tâches, occurrences, validation et registre de points.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.LATRIBU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'latribu-t-'));
const app = require('../server');
const tasks = require('../lib/tasks');
const dates = require('../lib/dates');

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

test('récurrences : jours, semaine, mois, date', () => {
  const lundi = '2026-11-16', mardi = '2026-11-17';
  assert.equal(dates.weekday(lundi), 1);
  assert.ok(tasks.occursOn({ repeat: 'daily' }, lundi));
  assert.ok(tasks.occursOn({ repeat: 'days', days: [1, 3, 5] }, lundi));
  assert.ok(!tasks.occursOn({ repeat: 'days', days: [1, 3, 5] }, mardi));
  assert.ok(tasks.occursOn({ repeat: 'weekly', days: [2] }, mardi));
  assert.ok(tasks.occursOn({ repeat: 'monthly', month_day: 16 }, lundi));
  assert.ok(tasks.occursOn({ repeat: 'monthly', month_day: 31 }, '2026-02-28'), 'mois court : dernier jour');
  assert.ok(!tasks.occursOn({ repeat: 'date', date: lundi }, mardi));
  assert.ok(tasks.occursOn({ repeat: 'date', date: lundi }, lundi));
});

test('cycle complet : création, déclaration, validation, points, niveau', async () => {
  const parent = client(), a = client(), b = client();
  await parent('setup', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const ka = (await parent('kids', 'POST', { name: 'Alex', pin: '1111' })).data.id;
  const kb = (await parent('kids', 'POST', { name: 'Sam', pin: '2222' })).data.id;
  await a(`kids/${ka}/login`, 'POST', { pin: '1111' });
  await b(`kids/${kb}/login`, 'POST', { pin: '2222' });

  // validations
  assert.equal((await parent('tasks', 'POST', { title: '', points: 5, kids: [ka], repeat: 'daily' })).status, 400);
  assert.equal((await parent('tasks', 'POST', { title: 'X', points: 0, kids: [ka], repeat: 'daily' })).status, 400);
  assert.equal((await parent('tasks', 'POST', { title: 'X', points: 5, kids: [], repeat: 'daily' })).status, 400);
  assert.equal((await parent('tasks', 'POST', { title: 'X', points: 5, kids: [ka], repeat: 'date', date: '2020-01-01' })).status, 400);
  assert.equal((await parent('tasks', 'POST', { title: 'X', points: 5, kids: [ka], repeat: 'weekly', days: [1, 2] })).status, 400);

  // tâche libre à 250 points pour les deux enfants
  const t = await parent('tasks', 'POST', { title: 'Grand ménage', points: 250, kids: [ka, kb], repeat: 'daily', moment: 'soir', remindAt: '18:30', description: 'Tout le salon' });
  assert.equal(t.status, 201);
  const mine = (await a('me/missions')).data;
  assert.equal(mine.today.length, 1);
  assert.equal(mine.today[0].moment, 'soir');
  assert.equal(mine.today[0].label, 'Tous les jours');
  const occA = mine.today[0].id, occB = (await b('me/missions')).data.today[0].id;

  // un enfant ne peut pas déclarer la mission d'un autre, ni valider
  assert.equal((await a(`occurrences/${occB}/done`, 'POST', {})).status, 409);
  assert.equal((await a(`occurrences/${occA}/approve`, 'POST', {})).status, 403);
  assert.equal((await parent('review')).data.length, 0);

  assert.equal((await a(`occurrences/${occA}/done`, 'POST', {})).status, 200);
  assert.equal((await a(`occurrences/${occA}/done`, 'POST', {})).status, 409, 'déjà déclarée');
  const review = (await parent('review')).data;
  assert.equal(review.length, 1);
  assert.equal(review[0].kidName, 'Alex');

  // refus puis nouvelle déclaration
  assert.equal((await parent(`occurrences/${occA}/refuse`, 'POST', { note: 'Pas rangé' })).status, 200);
  const refused = (await a('me/missions')).data.today[0];
  assert.equal(refused.status, 'refused');
  assert.equal(refused.note, 'Pas rangé');
  await a(`occurrences/${occA}/done`, 'POST', {});

  const ok = await parent(`occurrences/${occA}/approve`, 'POST', {});
  assert.equal(ok.status, 200);
  assert.equal(ok.data.points, 250);
  assert.equal(ok.data.level, 3, '250 XP = niveau 3');
  assert.equal((await parent(`occurrences/${occA}/approve`, 'POST', {})).status, 409, 'pas de double validation');

  const me = (await a('me')).data;
  assert.deepEqual([me.points, me.xp, me.level, me.xpInLevel], [250, 250, 3, 50]);

  // pénalité plafonnée au solde, XP intacte ; bonus libre
  const pen = await parent(`kids/${ka}/adjust`, 'POST', { delta: -1000, label: 'Écran en cachette' });
  assert.equal(pen.data.applied, -250);
  assert.equal(pen.data.points, 0);
  assert.equal(pen.data.xp, 250);
  assert.equal((await parent(`kids/${ka}/adjust`, 'POST', { delta: 0 })).status, 400);
  assert.equal((await parent(`kids/${ka}/adjust`, 'POST', { delta: 7 })).data.points, 7);

  const hist = (await a('me/history')).data;
  assert.deepEqual(hist.map((h) => h.delta), [7, -250, 250]);
  assert.equal((await parent(`kids/${ka}/history`)).data.length, 3);
  assert.equal((await b('kids')).status, 403);

  // modification : points changés, occurrence du jour régénérée
  assert.equal((await parent(`tasks/${t.data.id}`, 'PUT', { title: 'Grand ménage', points: 40, kids: [kb], repeat: 'daily' })).status, 200);
  assert.equal((await b('me/missions')).data.today[0].points, 40);
  assert.equal((await a('me/missions')).data.today.length, 1, 'la validée de Alex reste visible');
  assert.equal((await parent(`tasks/${t.data.id}`, 'DELETE')).status, 200);
  assert.equal((await b('me/missions')).data.today.length, 0);
});

test('mission ouverte : le premier arrivé la verrouille ; date précise à venir', async () => {
  const parent = client(), a = client(), b = client();
  await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const ks = (await parent('kids')).data;
  await a(`kids/${ks[0].id}/login`, 'POST', { pin: '1111' });
  await b(`kids/${ks[1].id}/login`, 'POST', { pin: '2222' });
  await parent('tasks', 'POST', { title: 'Laver la voiture', points: 25, kind: 'open' });
  const open = (await a('me/missions')).data.open;
  assert.equal(open.length, 1);
  assert.equal((await a(`occurrences/${open[0].id}/claim`, 'POST', {})).status, 200);
  assert.equal((await b(`occurrences/${open[0].id}/claim`, 'POST', {})).status, 409);
  assert.equal((await b('me/missions')).data.open.length, 0);
  assert.equal((await a('me/missions')).data.today.length, 1);

  const future = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  assert.equal((await parent('tasks', 'POST', { title: 'Garder', points: 15, kids: [ks[1].id], repeat: 'date', date: future })).status, 201);
  const up = (await b('me/missions')).data.upcoming;
  assert.equal(up.length, 1);
  assert.equal(up[0].dueDate, future);
});
