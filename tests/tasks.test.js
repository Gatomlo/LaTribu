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

test('deux axes : planifiée/ouverte x enfants choisis/non attribuée', async () => {
  const parent = client(), a = client(), b = client();
  await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const ks = (await parent('kids')).data;
  await a(`kids/${ks[0].id}/login`, 'POST', { pin: '1111' });
  await b(`kids/${ks[1].id}/login`, 'POST', { pin: '2222' });
  const mine = async (c, title) => { const m = (await c('me/missions')).data; return { today: m.today.filter((o) => o.title === title), open: m.open.filter((o) => o.title === title) }; };

  // planifiée + non attribuée : une occurrence libre aujourd'hui, un seul enfant la prend, une seule occurrence par jour
  assert.equal((await parent('tasks', 'POST', { title: 'Sortir les poubelles', points: 10, kids: [], repeat: 'daily', moment: 'soir' })).status, 201);
  tasks.invalidate();
  const free = (await mine(a, 'Sortir les poubelles')).open;
  assert.equal(free.length, 1, 'visible par les deux enfants, une seule occurrence');
  assert.equal((await mine(b, 'Sortir les poubelles')).open.length, 1);
  assert.equal((await b(`occurrences/${free[0].id}/claim`, 'POST', {})).status, 200);
  assert.equal((await mine(a, 'Sortir les poubelles')).open.length, 0, 'prise par l\'autre');
  assert.equal((await mine(b, 'Sortir les poubelles')).today.length, 1);
  tasks.invalidate(); tasks.generate();
  assert.equal((await mine(a, 'Sortir les poubelles')).open.length, 0, 'pas recréée après la prise');

  // ouverte + enfants choisis : sans date, une occurrence par enfant, jamais manquée
  assert.equal((await parent('tasks', 'POST', { title: 'Ranger le garage', points: 30, kind: 'open', kids: [ks[0].id, ks[1].id] })).status, 201);
  assert.equal((await mine(a, 'Ranger le garage')).today.length, 1);
  assert.equal((await mine(b, 'Ranger le garage')).today.length, 1);
  assert.equal((await mine(a, 'Ranger le garage')).open.length, 0, 'attribuée : pas à prendre');
  const t = (await parent('tasks')).data.find((x) => x.title === 'Ranger le garage');
  assert.equal(t.kind, 'open'); assert.equal(t.repeat, null); assert.equal(t.moment, null); assert.equal(t.unassigned, false);

  // ouverte + enfant retiré à la modification : seule l'occurrence encore à faire disparaît
  assert.equal((await parent(`tasks/${t.id}`, 'PUT', { title: 'Ranger le garage', points: 30, kids: [ks[0].id] })).status, 200);
  assert.equal((await mine(b, 'Ranger le garage')).today.length, 0);
  assert.equal((await mine(a, 'Ranger le garage')).today.length, 1);

  // enfant inconnu refusé
  assert.equal((await parent('tasks', 'POST', { title: 'X', points: 5, kids: [9999], repeat: 'daily' })).status, 400);
});

test('sous-tâches : cochées par l\'enfant, exigées avant « fait », visibles à la validation', async () => {
  const stepsApp = tasks.clean({ title: 'Cuisine', points: 5, kids: [], repeat: 'daily', steps: ['A', ' ', 'B'] });
  assert.deepEqual(stepsApp.steps.map((s) => s.label), ['A', 'B']);
  assert.throws(() => tasks.clean({ title: 'X', points: 1, repeat: 'daily', steps: 'a' }));
  assert.throws(() => tasks.clean({ title: 'X', points: 1, repeat: 'daily', steps: Array(13).fill('a') }));

  const kidA = require('../lib/db').db.prepare("INSERT INTO kids (name, age, pin_hash, palette, created_at) VALUES ('Zoé', 8, 'x', 0, 1)").run().lastInsertRowid;
  const id = tasks.create({ title: 'Ranger la cuisine', points: 5, kind: 'open', kids: [Number(kidA)], steps: ['Lave-vaisselle', 'Plan de travail'] });
  const mission = tasks.forKid(Number(kidA)).today.find((o) => o.taskId === id);
  assert.equal(mission.steps.length, 2);
  assert.throws(() => tasks.declare(Number(kidA), mission.id), /sous-tâches/);
  tasks.toggleStep(Number(kidA), mission.id, mission.steps[0].id, true);
  assert.throws(() => tasks.declare(Number(kidA), mission.id), /sous-tâches/);
  tasks.toggleStep(Number(kidA), mission.id, mission.steps[1].id, true);
  tasks.toggleStep(Number(kidA), mission.id, mission.steps[1].id, false);
  tasks.toggleStep(Number(kidA), mission.id, mission.steps[1].id, true);
  // une étape d'une autre tâche est refusée
  assert.throws(() => tasks.toggleStep(Number(kidA), mission.id, 999999, true), /introuvable/);
  tasks.declare(Number(kidA), mission.id);
  assert.deepEqual(tasks.review().find((o) => o.id === mission.id).steps.map((s) => s.checked), [true, true]);
  // modification : l'id d'une étape conservée garde sa case cochée
  const t = tasks.list().find((x) => x.id === id);
  tasks.update(id, { ...t, steps: [{ id: t.steps[0].id, label: 'Lave-vaisselle vidé' }] });
  const after = tasks.review().find((o) => o.id === mission.id);
  assert.deepEqual(after.steps.map((s) => [s.label, s.checked]), [['Lave-vaisselle vidé', true]]);
});

test('sous-tâches avec points par sous-tâche : seules les validées rapportent', () => {
  const { db } = require('../lib/db');
  const points = require('../lib/points');
  const kid = Number(db.prepare("INSERT INTO kids (name, age, pin_hash, palette, created_at) VALUES ('Léo', 9, 'x', 0, 1)").run().lastInsertRowid);
  assert.throws(() => tasks.clean({ title: 'X', repeat: 'daily', stepsMode: 'each', steps: [{ label: 'a' }] }), /Points de chaque/);
  assert.throws(() => tasks.clean({ title: 'X', repeat: 'daily', stepsMode: 'each', steps: [] }), /au moins une/);
  const id = tasks.create({ title: 'Cuisine', kind: 'open', kids: [kid], stepsMode: 'each', points: 999,
    steps: [{ label: 'A', points: 2 }, { label: 'B', points: 3 }, { label: 'C', points: 5 }] });
  assert.equal(tasks.list().find((t) => t.id === id).points, 10, 'total = somme des sous-tâches');
  const m = tasks.forKid(kid).today.find((o) => o.taskId === id);
  assert.equal(m.stepsMode, 'each');
  assert.throws(() => tasks.declare(kid, m.id), /au moins une/);
  tasks.toggleStep(kid, m.id, m.steps[0].id, true);
  tasks.toggleStep(kid, m.id, m.steps[1].id, true);
  tasks.declare(kid, m.id); // pas besoin de tout cocher
  assert.throws(() => tasks.approve(m.id, [m.steps[2].id]), /Aucune/, 'une étape non cochée ne compte pas');
  const before = points.summary(kid).points;
  const out = tasks.approve(m.id, [m.steps[1].id]); // le parent ne valide que B
  assert.equal(out.earned, 3);
  assert.equal(points.summary(kid).points - before, 3);
  const done = tasks.forKid(kid).today.find((o) => o.id === m.id);
  assert.deepEqual(done.steps.map((s) => s.approved), [false, true, false]);
  assert.equal(done.points, 3);

  // Bonus si toutes les sous-tâches sont validées.
  const id2 = tasks.create({ title: 'Cuisine+', kind: 'open', kids: [kid], stepsMode: 'each', stepsBonus: 4, steps: [{ label: 'A', points: 2 }, { label: 'B', points: 3 }] });
  assert.equal(tasks.list().find((t) => t.id === id2).points, 9, 'total possible = sous-tâches + bonus');
  const m2 = tasks.forKid(kid).today.find((o) => o.taskId === id2);
  m2.steps.forEach((s) => tasks.toggleStep(kid, m2.id, s.id, true));
  tasks.declare(kid, m2.id);
  assert.equal(tasks.approve(m2.id).earned, 9);
  const id3 = tasks.create({ title: 'Cuisine++', kind: 'open', kids: [kid], stepsMode: 'each', stepsBonus: 4, steps: [{ label: 'A', points: 2 }, { label: 'B', points: 3 }] });
  const m3 = tasks.forKid(kid).today.find((o) => o.taskId === id3);
  m3.steps.forEach((s) => tasks.toggleStep(kid, m3.id, s.id, true));
  tasks.declare(kid, m3.id);
  assert.equal(tasks.approve(m3.id, [m3.steps[0].id]).earned, 2, 'une sous-tâche écartée : pas de bonus');
});

test('tâche ouverte renouvelable : de retour le lendemain ou le lundi suivant', () => {
  const { db } = require('../lib/db');
  const kid = Number(db.prepare("INSERT INTO kids (name, age, pin_hash, palette, created_at) VALUES ('Nao', 9, 'x', 0, 1)").run().lastInsertRowid);
  const day = tasks.create({ title: 'Cuisiner', kind: 'open', kids: [], reopen: 'week', points: 50 });
  const open = () => tasks.forKid(kid).open.find((o) => o.taskId === day);
  const occ = open();
  assert.match(occ.label, /renouvelée chaque semaine/);
  tasks.claim(kid, occ.id); tasks.declare(kid, occ.id); tasks.approve(occ.id);
  assert.equal(open(), undefined, 'pas redisponible le jour même');
  const next = db.prepare("SELECT * FROM occurrences WHERE task_id = ? AND status = 'todo'").get(day);
  assert.equal(next.kid_id, null);
  assert.equal(dates.weekday(next.due_date), 1, 'le lundi suivant');
  assert.ok(next.due_date > dates.today());

  const daily = tasks.create({ title: 'Plat du jour', kind: 'open', kids: [], reopen: 'day', points: 20 });
  const o2 = tasks.forKid(kid).open.find((o) => o.taskId === daily);
  tasks.claim(kid, o2.id); tasks.declare(kid, o2.id); tasks.approve(o2.id);
  assert.equal(db.prepare("SELECT due_date FROM occurrences WHERE task_id = ? AND status = 'todo'").get(daily).due_date, dates.addDays(dates.today(), 1));
  // sans renouvellement : rien de nouveau
  const once = tasks.create({ title: 'Une fois', kind: 'open', kids: [], points: 5 });
  const o3 = tasks.forKid(kid).open.find((o) => o.taskId === once);
  tasks.claim(kid, o3.id); tasks.declare(kid, o3.id); tasks.approve(o3.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM occurrences WHERE task_id = ? AND status = 'todo'").get(once).n, 0);
  assert.throws(() => tasks.clean({ title: 'X', points: 1, repeat: 'daily', goalCount: 9, goalBonus: 5 }), /de 1 à 7/);
});

test('objectif de la semaine : bonus une seule fois quand N validations sont atteintes', () => {
  const { db } = require('../lib/db');
  const points = require('../lib/points');
  const kid = Number(db.prepare("INSERT INTO kids (name, age, pin_hash, palette, created_at) VALUES ('Ari', 14, 'x', 0, 1)").run().lastInsertRowid);
  const id = tasks.create({ title: 'Douche', kids: [kid], repeat: 'daily', points: 10, goalCount: 4, goalBonus: 25 });
  const today = dates.today(), ws = dates.weekStart(today);
  const others = [0, 1, 2, 3, 4, 5, 6].map((i) => dates.addDays(ws, i)).filter((d) => d !== today);
  for (const d of others.slice(0, 3)) db.prepare("INSERT OR REPLACE INTO occurrences (task_id, kid_id, due_date, status, points) VALUES (?, ?, ?, 'done', 10)").run(id, kid, d);
  const occ = tasks.forKid(kid).today.find((o) => o.taskId === id);
  tasks.declare(kid, occ.id);
  const before = points.summary(kid).points;
  const r = tasks.approve(occ.id);
  assert.equal(r.goalBonus, 25);
  assert.equal(points.summary(kid).points - before, 10 + 25 + r.awarded.reduce((n, a) => n + a.points, 0), 'tâche + objectif (+ bonus de série éventuel)');
  // pas de second bonus la même semaine
  db.prepare("INSERT OR REPLACE INTO occurrences (task_id, kid_id, due_date, status, points) VALUES (?, ?, ?, 'done', 10)").run(id, kid, others[3]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM goal_awards WHERE kid_id = ?').get(kid).n, 1);
});
