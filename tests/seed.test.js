// Pack de départ famille : création, idempotence, réglages préservés, totaux de la journée.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.LATRIBU_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'latribu-s-'));
process.env.LATRIBU_PUSH = 'off';
const { db } = require('../lib/db');
const seed = require('../lib/seed');
const tasks = require('../lib/tasks');
const game = require('../lib/game');

const total = (list, day) => list.filter((t) => t.repeat === 'daily' || (t.days || []).includes(day)).reduce((n, t) => n + (t.stepsMode === 'each' ? t.steps.reduce((m, s) => m + s.points, 0) + (t.stepsBonus || 0) : t.points), 0);

test('barème : minimum 5 points, écart raisonnable entre les deux enfants, jours sans lunch ni cartable', () => {
  for (const t of [...seed.TASKS.petit, ...seed.TASKS.grande, ...seed.TASKS.commun]) {
    const pts = t.stepsMode === 'each' ? t.steps.map((s) => s.points) : [t.points];
    assert.ok(pts.every((p) => p >= 5), `${t.title} : au moins 5 points`);
  }
  const mardi = 2, mercredi = 3, vendredi = 5, samedi = 6;
  const has = (list, title, day) => list.some((t) => t.title === title && (t.repeat === 'daily' || t.days.includes(day)));
  assert.ok(has(seed.TASKS.petit, 'Préparer et emballer son lunch', mardi));
  assert.ok(!has(seed.TASKS.petit, 'Préparer et emballer son lunch', mercredi), 'pas de lunch le mercredi');
  assert.ok(has(seed.TASKS.grande, 'Préparer le cartable du lendemain', 4));
  assert.ok(!has(seed.TASKS.grande, 'Préparer le cartable du lendemain', vendredi));
  assert.ok(!has(seed.TASKS.grande, 'Préparer le cartable du lendemain', samedi));
  const a = total(seed.TASKS.petit, mardi), b = total(seed.TASKS.grande, mardi);
  assert.ok(b > a && b / a < 1.35, `écart contenu (${a} contre ${b})`);
});

test('chargement du pack : création, idempotence, réglages d\'un parent préservés', () => {
  assert.throws(() => seed.apply({ petit: 'Mylo', grande: 'Elynn' }), /introuvable/);
  const mylo = Number(db.prepare("INSERT INTO kids (name, age, pin_hash, palette, created_at) VALUES ('Mylo', 9, 'x', 0, 1)").run().lastInsertRowid);
  const elynn = Number(db.prepare("INSERT INTO kids (name, age, pin_hash, palette, created_at) VALUES ('Elynn', 14, 'x', 1, 1)").run().lastInsertRowid);
  const dry = seed.apply({ dryRun: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 0, 'essai à blanc : rien d\'écrit');
  assert.ok(dry.created.length > 20);

  const r = seed.apply();
  assert.equal(r.created.length, dry.created.length);
  const list = tasks.list();
  assert.equal(list.filter((t) => t.title === 'Ranger la cuisine')[0].kids[0], elynn);
  assert.equal(list.find((t) => t.title === 'Ranger la cuisine').steps.length, 6);
  const cuisiner = list.find((t) => t.title === 'Cuisiner un repas pour la famille');
  assert.equal(cuisiner.reopen, 'week');
  assert.equal(cuisiner.unassigned, true);
  assert.deepEqual(list.find((t) => t.title === 'Préparer le cartable du lendemain' && t.kids[0] === mylo).days, [1, 2, 3, 4, 7]);
  assert.equal(list.find((t) => t.title === 'Prendre une douche' && t.kids[0] === mylo).goalCount, 4);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rewards').get().n, 12);
  assert.deepEqual(game.bonuses(), seed.NEW_STREAK);
  assert.equal(require('../lib/points').levelXp(), seed.LEVEL_XP, 'niveaux espacés à l\'échelle des points');
  assert.equal(db.prepare('SELECT streak_min FROM kids WHERE id = ?').get(mylo).streak_min, 70);
  assert.equal(db.prepare("SELECT price FROM accessories WHERE title = 'Couronne'").get().price, 750);
  assert.equal(db.prepare("SELECT price FROM accessories WHERE title = 'Dragon'").get().price, 1750, 'avatars et décors aussi remis à l\'échelle');

  const again = seed.apply();
  assert.equal(again.created.length, 0, 'rien n\'est dupliqué');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, r.created.filter((c) => c.startsWith('Tâche')).length);
  db.prepare("UPDATE kids SET streak_min = 90 WHERE id = ?").run(mylo);
  game.setBonuses({ 3: 1, 7: 2, 14: 3, 30: 4 });
  seed.apply();
  assert.equal(db.prepare('SELECT streak_min FROM kids WHERE id = ?').get(mylo).streak_min, 90, 'réglage du parent préservé');
  assert.equal(game.bonuses()[3], 1);
});
