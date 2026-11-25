// Bibliothèque de tâches types : modèles prêts à l'emploi (livrés par défaut, modifiables) à choisir
// dans le formulaire de création, et modèles enregistrés par les parents. Un modèle préremplit la
// tâche (titre, points, répétition, moment...) ; l'enfant et les ajustements restent au choix.
const { db } = require('./db');
const { httpError } = require('./util');
const tasks = require('./tasks');

const shape = (t) => ({
  id: t.id, title: t.title, description: t.description, icon: t.icon, points: t.points, repeat: t.repeat,
  days: t.days ? JSON.parse(t.days) : null, monthDay: t.month_day, moment: t.moment, remindAt: t.remind_at,
  photoRequired: !!t.photo_required, stepsMode: t.steps_mode, stepsBonus: t.steps_bonus, steps: t.steps ? JSON.parse(t.steps) : [], label: tasks.repeatLabel({ ...t, kind: 'plan' }),
});

const list = () => db.prepare('SELECT * FROM task_templates ORDER BY created_at, id').all().map(shape);

function create(body) {
  const t = tasks.clean({ ...body, kids: [], kind: 'plan' }, { template: true });
  const info = db.prepare(`INSERT INTO task_templates (title, description, icon, points, repeat, days, month_day, moment, remind_at, photo_required, steps, steps_mode, steps_bonus, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(t.title, t.description, t.icon, t.points, t.repeat, t.days && JSON.stringify(t.days), t.monthDay, t.moment, t.remindAt, t.photoRequired ? 1 : 0, t.steps.length ? JSON.stringify(t.steps.map((x) => ({ label: x.label, points: x.points }))) : null, t.stepsMode, t.stepsBonus, Date.now());
  return Number(info.lastInsertRowid);
}

function remove(id) {
  if (!db.prepare('DELETE FROM task_templates WHERE id = ?').run(id).changes) throw httpError(404, 'Modèle introuvable.');
}

module.exports = { list, create, remove };
