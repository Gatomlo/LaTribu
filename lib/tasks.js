// Tâches, occurrences et validation. Une tâche « planifiée » génère une occurrence par
// enfant et par échéance (tâche x enfant x date) ; une tâche « ouverte » génère une seule
// occurrence que le premier enfant qui la prend verrouille.
// Cycle d'une occurrence : todo -> wait (déclarée) -> done (validée) | refused (à refaire) ; missed si l'échéance passe.
const { db, tx } = require('./db');
const { httpError } = require('./util');
const dates = require('./dates');
const points = require('./points');

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const REPEATS = ['daily', 'days', 'weekly', 'monthly', 'date'];
const MOMENTS = ['matin', 'apres', 'soir'];

// ---------- Validation ----------
function clean(body) {
  const b = body || {};
  const title = String(b.title || '').trim().replace(/\s+/g, ' ');
  if (!title || title.length > 80) throw httpError(400, 'Titre : 1 à 80 caractères.');
  const description = String(b.description || '').trim();
  if (description.length > 300) throw httpError(400, 'Description : 300 caractères maximum.');
  const icon = String(b.icon || '✨').slice(0, 8);
  const pts = Number(b.points);
  if (!Number.isInteger(pts) || pts < 1 || pts > 100000) throw httpError(400, 'Points : nombre entier supérieur à 0.');
  const kind = b.kind === 'open' ? 'open' : 'plan';
  const t = { title, description, icon, points: pts, kind, repeat: null, days: null, monthDay: null, date: null, moment: null, remindAt: null, kids: [] };
  if (b.remindAt) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.remindAt))) throw httpError(400, 'Heure de rappel invalide (HH:MM).');
    t.remindAt = String(b.remindAt);
  }
  if (kind === 'open') return t;

  if (b.moment) { if (!MOMENTS.includes(b.moment)) throw httpError(400, 'Moment inconnu.'); t.moment = b.moment; }
  const kids = [...new Set((Array.isArray(b.kids) ? b.kids : []).map(Number))];
  if (!kids.length) throw httpError(400, 'Choisis au moins un enfant.');
  for (const id of kids) if (!db.prepare('SELECT 1 FROM kids WHERE id = ?').get(id)) throw httpError(400, 'Enfant inconnu.');
  t.kids = kids;
  if (!REPEATS.includes(b.repeat)) throw httpError(400, 'Répétition inconnue.');
  t.repeat = b.repeat;
  if (b.repeat === 'days' || b.repeat === 'weekly') {
    const days = [...new Set((Array.isArray(b.days) ? b.days : []).map(Number))].sort();
    if (!days.length || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) throw httpError(400, 'Choisis au moins un jour.');
    if (b.repeat === 'weekly' && days.length !== 1) throw httpError(400, 'Choisis un seul jour.');
    t.days = days;
  }
  if (b.repeat === 'monthly') {
    const md = Number(b.monthDay);
    if (!Number.isInteger(md) || md < 1 || md > 31) throw httpError(400, 'Jour du mois : 1 à 31.');
    t.monthDay = md;
  }
  if (b.repeat === 'date') {
    if (!dates.isDate(b.date)) throw httpError(400, 'Date invalide.');
    if (b.date < dates.today()) throw httpError(400, 'La date est déjà passée.');
    t.date = b.date;
  }
  return t;
}

// ---------- Récurrence ----------
function occursOn(t, date) {
  switch (t.repeat) {
    case 'daily': return true;
    case 'days': return t.days.includes(dates.weekday(date));
    case 'weekly': return t.days[0] === dates.weekday(date);
    case 'monthly': return dates.dayOfMonth(date) === Math.min(t.month_day, dates.daysInMonth(date));
    case 'date': return t.date === date;
    default: return false;
  }
}

function repeatLabel(t) {
  if (t.kind === 'open') return 'Mission ouverte';
  const days = t.days ? JSON.parse(t.days) : [];
  switch (t.repeat) {
    case 'daily': return 'Tous les jours';
    case 'days': return days.map((d) => DAY_NAMES[d - 1]).join(' · ');
    case 'weekly': return `Chaque semaine · ${DAY_NAMES[days[0] - 1]}`;
    case 'monthly': return `Chaque mois · le ${t.month_day}`;
    case 'date': return `Le ${dates.frDate(t.date)}`;
    default: return '';
  }
}

// ---------- Génération des occurrences ----------
let generatedOn = null;
const invalidate = () => { generatedOn = null; };

// Idempotente : crée les occurrences d'aujourd'hui (et des dates précises à venir), marque
// les échéances passées comme manquées. Appelée à chaque lecture, sans planificateur global.
function generate() {
  const today = dates.today();
  if (generatedOn === today) return;
  tx(() => {
    db.prepare("UPDATE occurrences SET status = 'missed' WHERE status IN ('todo', 'refused') AND kid_id IS NOT NULL AND due_date < ?").run(today);
    const insert = db.prepare('INSERT OR IGNORE INTO occurrences (task_id, kid_id, due_date, points) VALUES (?, ?, ?, ?)');
    const tasks = db.prepare("SELECT * FROM tasks WHERE kind = 'plan'").all();
    for (const raw of tasks) {
      const t = { ...raw, days: raw.days ? JSON.parse(raw.days) : null };
      const kids = db.prepare('SELECT kid_id FROM task_kids WHERE task_id = ?').all(t.id);
      if (t.repeat === 'date') { if (t.date >= today) for (const k of kids) insert.run(t.id, k.kid_id, t.date, t.points); continue; }
      if (occursOn(t, today)) for (const k of kids) insert.run(t.id, k.kid_id, today, t.points);
    }
  });
  generatedOn = today;
}

// ---------- Création, modification, suppression ----------
const insertTaskKids = (taskId, kids) => kids.forEach((k) => db.prepare('INSERT INTO task_kids (task_id, kid_id) VALUES (?, ?)').run(taskId, k));

function create(body) {
  const t = clean(body);
  const id = tx(() => {
    const info = db.prepare(`INSERT INTO tasks (title, description, icon, points, kind, repeat, days, month_day, date, moment, remind_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(t.title, t.description, t.icon, t.points, t.kind, t.repeat, t.days && JSON.stringify(t.days), t.monthDay, t.date, t.moment, t.remindAt, Date.now());
    const taskId = Number(info.lastInsertRowid);
    insertTaskKids(taskId, t.kids);
    if (t.kind === 'open') db.prepare('INSERT INTO occurrences (task_id, kid_id, due_date, points) VALUES (?, NULL, ?, ?)').run(taskId, dates.today(), t.points);
    return taskId;
  });
  invalidate(); generate();
  return id;
}

function update(id, body) {
  const old = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!old) throw httpError(404, 'Tâche introuvable.');
  const t = clean({ ...body, kind: old.kind }); // le type ne change pas
  tx(() => {
    db.prepare(`UPDATE tasks SET title = ?, description = ?, icon = ?, points = ?, repeat = ?, days = ?, month_day = ?, date = ?, moment = ?, remind_at = ? WHERE id = ?`)
      .run(t.title, t.description, t.icon, t.points, t.repeat, t.days && JSON.stringify(t.days), t.monthDay, t.date, t.moment, t.remindAt, id);
    // Les occurrences pas encore déclarées sont régénérées ; celles en attente ou validées restent.
    if (old.kind === 'plan') {
      db.prepare("DELETE FROM occurrences WHERE task_id = ? AND status = 'todo' AND due_date >= ?").run(id, dates.today());
      db.prepare('DELETE FROM task_kids WHERE task_id = ?').run(id);
      insertTaskKids(id, t.kids);
    } else db.prepare("UPDATE occurrences SET points = ? WHERE task_id = ? AND status IN ('todo', 'refused')").run(t.points, id);
  });
  invalidate(); generate();
}

function remove(id) {
  const r = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  if (!r.changes) throw httpError(404, 'Tâche introuvable.');
}

// ---------- Lectures ----------
function list() {
  return db.prepare('SELECT * FROM tasks ORDER BY kind, created_at DESC, id DESC').all().map((t) => ({
    id: t.id, title: t.title, description: t.description, icon: t.icon, points: t.points, kind: t.kind,
    repeat: t.repeat, days: t.days ? JSON.parse(t.days) : null, monthDay: t.month_day, date: t.date,
    moment: t.moment, remindAt: t.remind_at, label: repeatLabel(t),
    kids: db.prepare('SELECT kid_id FROM task_kids WHERE task_id = ?').all(t.id).map((k) => k.kid_id),
  }));
}

const OCC = `SELECT o.id, o.status, o.due_date AS dueDate, o.points, o.note, t.id AS taskId, t.title, t.description, t.icon,
  t.moment, t.remind_at AS remindAt, t.kind, t.repeat, t.days, t.month_day, t.date FROM occurrences o JOIN tasks t ON t.id = o.task_id`;
const shape = (r) => ({ id: r.id, status: r.status, dueDate: r.dueDate, points: r.points, note: r.note, taskId: r.taskId, title: r.title,
  description: r.description, icon: r.icon, moment: r.moment, remindAt: r.remindAt, kind: r.kind, label: repeatLabel(r) });

// Écran de l'enfant : missions du jour, missions ouvertes à prendre, ponctuelles à venir.
function forKid(kidId) {
  generate();
  const today = dates.today();
  return {
    today: db.prepare(`${OCC} WHERE o.kid_id = ? AND o.due_date = ? AND o.status <> 'missed' ORDER BY o.id`).all(kidId, today).map(shape),
    open: db.prepare(`${OCC} WHERE o.kid_id IS NULL AND t.kind = 'open' ORDER BY o.id`).all().map(shape),
    upcoming: db.prepare(`${OCC} WHERE o.kid_id = ? AND o.due_date > ? AND o.status = 'todo' ORDER BY o.due_date, o.id LIMIT 20`).all(kidId, today)
      .map((r) => ({ ...shape(r), label: `${repeatLabel(r)}` })),
  };
}

const review = () => {
  generate();
  return db.prepare(`SELECT o.id, o.points, o.done_at AS doneAt, o.due_date AS dueDate, t.title, t.icon, t.description, k.id AS kidId, k.name AS kidName, k.palette
    FROM occurrences o JOIN tasks t ON t.id = o.task_id JOIN kids k ON k.id = o.kid_id WHERE o.status = 'wait' ORDER BY o.done_at, o.id`).all();
};

// ---------- Actions ----------
// L'enfant déclare « fait » : seules ses propres missions du jour (ou en retard refusées) passent en attente.
function declare(kidId, occId) {
  const r = db.prepare("UPDATE occurrences SET status = 'wait', done_at = ?, note = NULL WHERE id = ? AND kid_id = ? AND status IN ('todo', 'refused')")
    .run(Date.now(), occId, kidId);
  if (!r.changes) throw httpError(409, 'Cette mission ne peut pas être déclarée.');
}

// Mission ouverte : le premier qui la prend la verrouille (mise à jour atomique).
function claim(kidId, occId) {
  const r = db.prepare("UPDATE occurrences SET kid_id = ?, due_date = ? WHERE id = ? AND kid_id IS NULL AND status = 'todo'")
    .run(kidId, dates.today(), occId);
  if (!r.changes) throw httpError(409, 'Cette mission a déjà été prise.');
}

function approve(occId) {
  return tx(() => {
    const o = db.prepare("SELECT o.id, o.kid_id, o.points, t.title FROM occurrences o JOIN tasks t ON t.id = o.task_id WHERE o.id = ? AND o.status = 'wait'").get(occId);
    if (!o) throw httpError(409, 'Rien à valider.');
    db.prepare("UPDATE occurrences SET status = 'done', decided_at = ? WHERE id = ?").run(Date.now(), occId);
    points.add(o.kid_id, o.points, o.title, { gain: true, refType: 'task', refId: occId });
    return { kidId: o.kid_id, points: o.points, ...points.summary(o.kid_id) };
  });
}

function refuse(occId, note) {
  const text = String(note || '').trim().slice(0, 200) || null;
  const r = db.prepare("UPDATE occurrences SET status = 'refused', decided_at = ?, note = ? WHERE id = ? AND status = 'wait'").run(Date.now(), text, occId);
  if (!r.changes) throw httpError(409, 'Rien à refuser.');
}

module.exports = { create, update, remove, list, forKid, review, declare, claim, approve, refuse, generate, invalidate, occursOn };
