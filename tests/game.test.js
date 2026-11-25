// Étape 4 : séries, bonus de série, badges, célébrations de niveau.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.LATRIBU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'latribu-g-'));
process.env.LATRIBU_PUSH = 'off';
const app = require('../server');
const { db } = require('../lib/db');
const dates = require('../lib/dates');
const game = require('../lib/game');

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

// Insère des occurrences passées pour un enfant : statuts par ancienneté (1 = hier).
function pastDays(taskId, kidId, statuses) {
  const today = dates.today();
  statuses.forEach((status, i) => {
    if (status) db.prepare('INSERT INTO occurrences (task_id, kid_id, due_date, status, points) VALUES (?, ?, ?, ?, 5)').run(taskId, kidId, dates.addDays(today, -(i + 1)), status);
  });
}

test('série : jours consécutifs, jour sans mission neutre, jour manqué qui casse', async () => {
  const parent = client(), kid = client();
  await parent('setup', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const k = (await parent('kids', 'POST', { name: 'Alex', pin: '1111' })).data.id;
  await kid(`kids/${k}/login`, 'POST', { pin: '1111' });
  const t = (await parent('tasks', 'POST', { title: 'Chambre', points: 5, kids: [k], repeat: 'daily' })).data.id;

  assert.equal(game.streak(k).days, 0, "aujourd'hui incomplet : ne casse pas, ne compte pas");
  pastDays(t, k, ['done', 'done', null, 'wait']);   // hier, avant-hier, (jour sans mission), puis un jour en attente
  assert.equal(game.streak(k).days, 3, 'hier + avant-hier + J-4, le jour vide est neutre');
  pastDays(t, k, [null, null, null, null, 'missed', 'done']);
  assert.equal(game.streak(k).days, 3, 'le jour manqué coupe la série');
});

test('bonus de série au palier, une seule fois ; badges ; célébration de niveau', async () => {
  const parent = client(), kid = client();
  await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const k = (await parent('kids', 'POST', { name: 'Sam', pin: '2222' })).data.id;
  await kid(`kids/${k}/login`, 'POST', { pin: '2222' });
  assert.equal((await parent('settings', 'PUT', { streakBonus: { 3: 12, 7: 0, 14: 0, 30: 0 } })).data.streakBonus[3], 12);
  assert.equal((await parent('settings', 'PUT', { streakBonus: { 3: -1, 7: 0, 14: 0, 30: 0 } })).status, 400);

  const t = (await parent('tasks', 'POST', { title: 'Devoirs', points: 60, kids: [k], repeat: 'daily' })).data.id;
  pastDays(t, k, ['done', 'done']);
  const occ = (await kid('me/missions')).data.today[0].id;
  await kid(`occurrences/${occ}/done`, 'POST', {});
  const ok = (await parent(`occurrences/${occ}/approve`, 'POST', {})).data;
  assert.equal(ok.streak, 3);
  assert.deepEqual(ok.awarded, [{ milestone: 3, points: 12 }]);
  assert.equal(ok.points, 72, '60 + bonus 12');
  assert.deepEqual(ok.badges.map((b) => b.key), ['first']);

  // une 2e validation le même jour ne redonne pas le palier
  const t2 = (await parent('tasks', 'POST', { title: 'Poubelles', points: 50, kids: [k], repeat: 'daily' })).data.id;
  const occ2 = (await kid('me/missions')).data.today.find((o) => o.taskId === t2).id;
  await kid(`occurrences/${occ2}/done`, 'POST', {});
  const ok2 = (await parent(`occurrences/${occ2}/approve`, 'POST', {})).data;
  assert.deepEqual(ok2.awarded, []);
  assert.equal(ok2.points, 122);
  assert.deepEqual(ok2.badges.map((b) => b.key), ['pts100'], '122 XP : badge 100 points');

  const me = (await kid('me')).data;
  assert.equal(me.streak, 3);
  assert.equal(me.badges.filter((b) => b.earned).length, 2);
  assert.equal(me.celebrate.levelUp, 2, 'niveau 2 pas encore célébré');
  assert.equal(me.celebrate.badges.length, 2);
  await kid('me/seen', 'POST', {});
  const after = (await kid('me')).data.celebrate;
  assert.equal(after.levelUp, null);
  assert.equal(after.badges.length, 0);

  // badge décerné par un parent
  assert.equal((await parent(`kids/${k}/badges`, 'POST', { title: '', emoji: '🏅' })).status, 400);
  assert.equal((await parent(`kids/${k}/badges`, 'POST', { title: 'Super frère', emoji: '💪' })).status, 201);
  const b = (await kid('me')).data.badges.find((x) => x.title === 'Super frère');
  assert.ok(b && b.earned);
  assert.equal((await kid(`kids/${k}/badges`, 'POST', { title: 'Triche' })).status, 403);
  assert.equal((await parent('kids')).data.find((x) => x.id === k).streak, 3);
});

test('niveau 5 et coup de main (mission ouverte)', async () => {
  const parent = client(), kid = client();
  await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const k = (await parent('kids', 'POST', { name: 'Zoé', pin: '3333' })).data.id;
  await kid(`kids/${k}/login`, 'POST', { pin: '3333' });
  await parent('tasks', 'POST', { title: 'Laver la voiture', points: 450, kind: 'open' });
  const open = (await kid('me/missions')).data.open.at(-1);
  await kid(`occurrences/${open.id}/claim`, 'POST', {});
  await kid(`occurrences/${open.id}/done`, 'POST', {});
  const r = (await parent(`occurrences/${open.id}/approve`, 'POST', {})).data;
  assert.equal(r.level, 5);
  assert.deepEqual(r.badges.map((b) => b.key).sort(), ['first', 'helper', 'level5', 'pts100']);
  assert.equal((await parent(`kids/${k}/adjust`, 'POST', { delta: 10 })).status, 200);
});

test('journée parfaite fêtée une fois ; bravos avec autocollant', async () => {
  const parent = client(), kid = client();
  await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const k = (await parent('kids', 'POST', { name: 'Lou', pin: '4444' })).data.id;
  await kid(`kids/${k}/login`, 'POST', { pin: '4444' });
  assert.equal((await kid('me')).data.celebrate.perfectDay, false, 'rien de prévu : pas de fête');
  await parent('tasks', 'POST', { title: 'A', points: 2, kids: [k], repeat: 'daily' });
  await parent('tasks', 'POST', { title: 'B', points: 2, kids: [k], repeat: 'daily' });
  const [a, b] = (await kid('me/missions')).data.today;
  await kid(`occurrences/${a.id}/done`, 'POST', {}); await parent(`occurrences/${a.id}/approve`, 'POST', {});
  assert.equal((await kid('me')).data.celebrate.perfectDay, false, 'une mission restante');
  await kid(`occurrences/${b.id}/done`, 'POST', {}); await parent(`occurrences/${b.id}/approve`, 'POST', {});
  assert.equal((await kid('me')).data.celebrate.perfectDay, true);
  await kid('me/seen', 'POST', {});
  assert.equal((await kid('me')).data.celebrate.perfectDay, false, 'fêtée une seule fois par jour');

  assert.equal((await parent(`kids/${k}/kudos`, 'POST', { sticker: 'nimporte', note: 'x' })).status, 400);
  assert.equal((await kid(`kids/${k}/kudos`, 'POST', { sticker: 'bravo' })).status, 403, 'réservé aux parents');
  assert.equal((await parent(`kids/${k}/kudos`, 'POST', { sticker: 'merci', note: 'Merci pour ton aide' })).status, 201);
  const me = (await kid('me')).data;
  assert.equal(me.celebrate.kudos.length, 1);
  assert.equal(me.celebrate.kudos[0].label, 'Merci !');
  assert.equal(me.kudos[0].note, 'Merci pour ton aide');
  await kid('me/seen', 'POST', {});
  const after = (await kid('me')).data;
  assert.equal(after.celebrate.kudos.length, 0, 'bravo vu : plus de célébration');
  assert.equal(after.kudos.length, 1, 'mais toujours dans la liste des bravos reçus');
});

test('série tolérante : pourcentage de missions par enfant ; bravo avec points bonus', async () => {
  const { db } = require('../lib/db');
  const parent = client(), kid = client();
  await parent('login', 'POST', { email: 'p@x.be', password: 'motdepasse1' });
  const k = (await parent('kids', 'POST', { name: 'Eli', pin: '5555' })).data.id;
  await kid(`kids/${k}/login`, 'POST', { pin: '5555' });
  const t1 = (await parent('tasks', 'POST', { title: 'T1', points: 5, kids: [k], repeat: 'daily' })).data.id;
  const t2 = (await parent('tasks', 'POST', { title: 'T2', points: 5, kids: [k], repeat: 'daily' })).data.id;
  const yesterday = dates.addDays(dates.today(), -1);
  const ins = (t, st) => db.prepare('INSERT INTO occurrences (task_id, kid_id, due_date, status, points) VALUES (?, ?, ?, ?, 5)').run(t, k, yesterday, st);
  ins(t1, 'done'); ins(t2, 'missed');
  assert.equal(game.streak(k).days, 0, '50 % < 100 % : la série ne compte pas');
  assert.equal((await parent(`kids/${k}`, 'PATCH', { streakMin: 5 })).status, 400);
  assert.equal((await parent(`kids/${k}`, 'PATCH', { streakMin: 50 })).status, 200);
  assert.equal(game.streak(k).days, 1, 'à 50 %, la veille compte');
  assert.equal((await parent('kids')).data.find((x) => x.id === k).streakMin, 50);

  assert.equal((await parent(`kids/${k}/kudos`, 'POST', { sticker: 'bravo', points: -5 })).status, 400);
  const before = (await kid('me')).data.points;
  assert.equal((await parent(`kids/${k}/kudos`, 'POST', { sticker: 'bravo', note: 'Top', points: 50 })).status, 201);
  const me = (await kid('me')).data;
  assert.equal(me.points - before, 50);
  assert.equal(me.kudos[0].points, 50);
  assert.equal(me.celebrate.kudos[0].points, 50);
});
