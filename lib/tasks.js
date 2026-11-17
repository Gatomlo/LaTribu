// Tâches, occurrences et validation. Deux axes indépendants :
//  - quand : « planifiée » (récurrence ou date précise, moment, rappel) ou « ouverte » (sans date ni moment, à faire une fois) ;
//  - pour qui : des enfants choisis (une occurrence par enfant) ou personne (« non attribuée » : une occurrence libre,
//    le premier enfant qui la prend la verrouille).
// Planifiée non attribuée : une occurrence libre par échéance, manquée si personne ne la prend ce jour-là.
// Cycle d'une occurrence : todo -> wait (déclarée) -> done (validée) | refused (à refaire) ; missed si l'échéance passe.
const { db, tx } = require('./db');
const { httpError, text, emoji } = require('./util');
const dates = require('./dates');
const points = require('./points');
const game = require('./game');
const photos = require('./photos');

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const REPEATS = ['daily', 'days', 'weekly', 'monthly', 'date'];
const MOMENTS = ['matin', 'apres', 'soir'];

// ---------- Validation ----------
function clean(body, { template = false } = {}) {
  const b = body || {};
  const title = text(b.title, 'Titre', { max: 80, required: true });
  const description = text(b.description, 'Description', { max: 300, multiline: true });
  const icon = emoji(b.icon, '✨');
  const pts = Number(b.points);
  if (!Number.isInteger(pts) || pts < 1 || pts > 100000) throw httpError(400, 'Points : nombre entier supérieur à 0.');
  const kind = !template && b.kind === 'open' ? 'open' : 'plan';
  const t = { title, description, icon, points: pts, kind, repeat: null, days: null, monthDay: null, date: null, moment: null, remindAt: null, kids: [], photoRequired: !!b.photoRequired };
  if (!template) { // aucun enfant choisi = tâche non attribuée (n'importe quel enfant peut la prendre)
    const kids = [...new Set((Array.isArray(b.kids) ? b.kids : []).map(Number))];
    for (const id of kids) if (!Number.isInteger(id) || !db.prepare('SELECT 1 FROM kids WHERE id = ?').get(id)) throw httpError(400, 'Enfant inconnu.');
    t.kids = kids;
  }
  if (kind === 'open') return t; // ni moment, ni rappel, ni récurrence
  if (b.remindAt) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.remindAt))) throw httpError(400, 'Heure de rappel invalide (HH:MM).');
    t.remindAt = String(b.remindAt);
  }
  if (b.moment) { if (!MOMENTS.includes(b.moment)) throw httpError(400, 'Moment inconnu.'); t.moment = b.moment; }
  if (!REPEATS.includes(b.repeat) || (template && b.repeat === 'date')) throw httpError(400, 'Répétition inconnue.');
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
  if (t.kind === 'open') return 'Sans date';
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
    // Les tâches ouvertes n'ont pas d'échéance : elles ne sont jamais « manquées ».
    db.prepare("UPDATE occurrences SET status = 'missed' WHERE status IN ('todo', 'refused') AND due_date < ? AND task_id IN (SELECT id FROM tasks WHERE kind = 'plan')").run(today);
    const insert = db.prepare('INSERT OR IGNORE INTO occurrences (task_id, kid_id, due_date, points) VALUES (?, ?, ?, ?)');
    const tasks = db.prepare("SELECT * FROM tasks WHERE kind = 'plan'").all();
    for (const raw of tasks) {
      const t = { ...raw, days: raw.days ? JSON.parse(raw.days) : null };
      const kids = db.prepare('SELECT kid_id FROM task_kids WHERE task_id = ?').all(t.id);
      const make = (date) => {
        if (kids.length) { for (const k of kids) insert.run(t.id, k.kid_id, date, t.points); return; }
        // non attribuée : une seule occurrence libre par échéance (UNIQUE ne protège pas les NULL)
        if (!db.prepare('SELECT 1 FROM occurrences WHERE task_id = ? AND due_date = ?').get(t.id, date)) {
          db.prepare('INSERT INTO occurrences (task_id, kid_id, due_date, points) VALUES (?, NULL, ?, ?)').run(t.id, date, t.points);
        }
      };
      if (t.repeat === 'date') { if (t.date >= today) make(t.date); continue; }
      if (occursOn(t, today)) make(today);
    }
  });
  generatedOn = today;
  photos.purge(); // photos de preuve : supprimées quelques jours après la décision
}

// ---------- Création, modification, suppression ----------
const insertTaskKids = (taskId, kids) => kids.forEach((k) => db.prepare('INSERT INTO task_kids (task_id, kid_id) VALUES (?, ?)').run(taskId, k));

// Tâche ouverte : une occurrence par enfant choisi, ou une occurrence libre ; jamais recréée si elle existe déjà.
function seedOpen(taskId, t) {
  const has = (kid) => db.prepare('SELECT 1 FROM occurrences WHERE task_id = ? AND kid_id IS ?').get(taskId, kid);
  const add = (kid) => db.prepare('INSERT INTO occurrences (task_id, kid_id, due_date, points) VALUES (?, ?, ?, ?)').run(taskId, kid, dates.today(), t.points);
  if (t.kids.length) { for (const k of t.kids) if (!has(k)) add(k); }
  else if (!db.prepare('SELECT 1 FROM occurrences WHERE task_id = ?').get(taskId)) add(null);
}

function create(body) {
  const t = clean(body);
  const id = tx(() => {
    const info = db.prepare(`INSERT INTO tasks (title, description, icon, points, kind, repeat, days, month_day, date, moment, remind_at, photo_required, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(t.title, t.description, t.icon, t.points, t.kind, t.repeat, t.days && JSON.stringify(t.days), t.monthDay, t.date, t.moment, t.remindAt, t.photoRequired ? 1 : 0, Date.now());
    const taskId = Number(info.lastInsertRowid);
    insertTaskKids(taskId, t.kids);
    if (t.kind === 'open') seedOpen(taskId, t);
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
    db.prepare(`UPDATE tasks SET title = ?, description = ?, icon = ?, points = ?, repeat = ?, days = ?, month_day = ?, date = ?, moment = ?, remind_at = ?, photo_required = ? WHERE id = ?`)
      .run(t.title, t.description, t.icon, t.points, t.repeat, t.days && JSON.stringify(t.days), t.monthDay, t.date, t.moment, t.remindAt, t.photoRequired ? 1 : 0, id);
    // Les occurrences pas encore déclarées sont régénérées ; celles en attente ou validées restent.
    db.prepare('DELETE FROM task_kids WHERE task_id = ?').run(id);
    insertTaskKids(id, t.kids);
    if (old.kind === 'plan') db.prepare("DELETE FROM occurrences WHERE task_id = ? AND status = 'todo' AND due_date >= ?").run(id, dates.today());
    else {
      db.prepare("DELETE FROM occurrences WHERE task_id = ? AND status = 'todo'").run(id);
      db.prepare("UPDATE occurrences SET points = ? WHERE task_id = ? AND status = 'refused'").run(t.points, id);
      seedOpen(id, t);
    }
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
    moment: t.moment, remindAt: t.remind_at, photoRequired: !!t.photo_required, label: repeatLabel(t),
    kids: db.prepare('SELECT kid_id FROM task_kids WHERE task_id = ?').all(t.id).map((k) => k.kid_id),
  })).map((t) => ({ ...t, unassigned: !t.kids.length }));
}

const OCC = `SELECT o.id, o.status, o.due_date AS dueDate, o.points, o.note, t.id AS taskId, t.title, t.description, t.icon,
  t.moment, t.remind_at AS remindAt, t.kind, t.repeat, t.days, t.month_day, t.date, t.photo_required AS photoRequired,
  EXISTS (SELECT 1 FROM occurrence_photos p WHERE p.occurrence_id = o.id) AS hasPhoto FROM occurrences o JOIN tasks t ON t.id = o.task_id`;
const shape = (r) => ({ id: r.id, status: r.status, dueDate: r.dueDate, points: r.points, note: r.note, taskId: r.taskId, title: r.title,
  description: r.description, icon: r.icon, moment: r.moment, remindAt: r.remindAt, kind: r.kind, label: repeatLabel(r),
  photoRequired: !!r.photoRequired && photos.config().enabled, hasPhoto: !!r.hasPhoto });

// Écran de l'enfant : missions du jour, missions ouvertes à prendre, ponctuelles à venir.
function forKid(kidId) {
  generate();
  const today = dates.today();
  return {
    // Les tâches ouvertes attribuées restent à faire tant qu'elles ne sont pas validées, quelle que soit leur date de création.
    today: db.prepare(`${OCC} WHERE o.kid_id = ? AND o.status <> 'missed' AND (o.due_date = ? OR (t.kind = 'open' AND o.status IN ('todo', 'refused', 'wait'))) ORDER BY o.id`).all(kidId, today).map(shape),
    // À prendre : tâches non attribuées (ouvertes, ou planifiées pour aujourd'hui).
    open: db.prepare(`${OCC} WHERE o.kid_id IS NULL AND o.status = 'todo' AND o.due_date <= ? ORDER BY o.id`).all(today).map(shape),
    upcoming: db.prepare(`${OCC} WHERE o.kid_id = ? AND o.due_date > ? AND o.status = 'todo' ORDER BY o.due_date, o.id LIMIT 20`).all(kidId, today)
      .map((r) => ({ ...shape(r), label: `${repeatLabel(r)}` })),
  };
}

const review = () => {
  generate();
  return db.prepare(`SELECT o.id, o.points, o.done_at AS doneAt, o.due_date AS dueDate, t.title, t.icon, t.description, k.id AS kidId, k.name AS kidName, k.palette,
    EXISTS (SELECT 1 FROM occurrence_photos p WHERE p.occurrence_id = o.id) AS hasPhoto
    FROM occurrences o JOIN tasks t ON t.id = o.task_id JOIN kids k ON k.id = o.kid_id WHERE o.status = 'wait' ORDER BY o.done_at, o.id`).all();
};

// ---------- Actions ----------
// L'enfant déclare « fait » : seules ses propres missions du jour (ou en retard refusées) passent en attente.
// Photo preuve : exigée si le réglage global ET l'option de la tâche sont actifs ; facultative sinon
// (acceptée quand le réglage global est actif).
function declare(kidId, occId, photoInput) {
  const o = db.prepare("SELECT t.photo_required AS req FROM occurrences o JOIN tasks t ON t.id = o.task_id WHERE o.id = ? AND o.kid_id = ? AND o.status IN ('todo', 'refused')").get(occId, kidId);
  if (!o) throw httpError(409, 'Cette mission ne peut pas être déclarée.');
  const enabled = photos.config().enabled;
  const buf = enabled && photoInput ? photos.decode(photoInput) : null;
  if (enabled && o.req && !buf) throw httpError(400, 'Une photo est demandée pour cette mission.');
  tx(() => {
    const r = db.prepare("UPDATE occurrences SET status = 'wait', done_at = ?, note = NULL WHERE id = ? AND kid_id = ? AND status IN ('todo', 'refused')").run(Date.now(), occId, kidId);
    if (!r.changes) throw httpError(409, 'Cette mission ne peut pas être déclarée.');
    if (buf) photos.save(occId, buf);
  });
}

// Mission ouverte : le premier qui la prend la verrouille (mise à jour atomique).
function claim(kidId, occId) {
  const today = dates.today();
  const r = db.prepare(`UPDATE occurrences SET kid_id = ?, due_date = CASE WHEN (SELECT kind FROM tasks WHERE id = task_id) = 'open' THEN ? ELSE due_date END
    WHERE id = ? AND kid_id IS NULL AND status = 'todo' AND due_date <= ?`).run(kidId, today, occId, today);
  if (!r.changes) throw httpError(409, 'Cette mission a déjà été prise.');
}

function approve(occId) {
  return tx(() => {
    const o = db.prepare("SELECT o.id, o.kid_id, o.points, t.title FROM occurrences o JOIN tasks t ON t.id = o.task_id WHERE o.id = ? AND o.status = 'wait'").get(occId);
    if (!o) throw httpError(409, 'Rien à valider.');
    db.prepare("UPDATE occurrences SET status = 'done', decided_at = ? WHERE id = ?").run(Date.now(), occId);
    points.add(o.kid_id, o.points, o.title, { gain: true, refType: 'task', refId: occId });
    const g = game.afterEarn(o.kid_id); // bonus de série et badges éventuels
    return { kidId: o.kid_id, points: o.points, taskTitle: o.title, ...g, ...points.summary(o.kid_id) };
  });
}

function refuse(occId, note) {
  const text = String(note || '').trim().slice(0, 200) || null;
  const r = db.prepare("UPDATE occurrences SET status = 'refused', decided_at = ?, note = ? WHERE id = ? AND status = 'wait'").run(Date.now(), text, occId);
  if (!r.changes) throw httpError(409, 'Rien à refuser.');
  const o = db.prepare('SELECT o.kid_id AS kidId, t.title FROM occurrences o JOIN tasks t ON t.id = o.task_id WHERE o.id = ?').get(occId);
  return { kidId: o.kidId, title: o.title, note: text };
}

module.exports = { clean, repeatLabel, create, update, remove, list, forKid, review, declare, claim, approve, refuse, generate, invalidate, occursOn };
