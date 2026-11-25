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
const settings = require('./settings');

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const REPEATS = ['daily', 'days', 'weekly', 'monthly', 'date'];
const MOMENTS = ['matin', 'apres', 'soir'];

// ---------- Validation ----------
const MAX_STEPS = 12;
// Sous-tâches : liste de textes ou d'objets { id, label } (l'id garde les cases déjà cochées lors d'une modification).
function cleanSteps(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw httpError(400, 'Sous-tâches : liste attendue.');
  const out = [];
  for (const s of raw) {
    const label = text(typeof s === 'string' ? s : (s || {}).label, 'Sous-tâche', { max: 80 });
    if (!label) continue;
    const obj = typeof s === 'object' && s ? s : {};
    out.push({ id: Number.isInteger(obj.id) ? obj.id : null, label, points: Number(obj.points) || 0 });
  }
  if (out.length > MAX_STEPS) throw httpError(400, `Sous-tâches : ${MAX_STEPS} maximum.`);
  return out;
}
function clean(body, { template = false } = {}) {
  const b = body || {};
  const title = text(b.title, 'Titre', { max: 80, required: true });
  const description = text(b.description, 'Description', { max: 300, multiline: true });
  const icon = emoji(b.icon, '✨');
  const steps = cleanSteps(b.steps);
  // « all » : tout ou rien (points de la tâche, toutes les sous-tâches à faire) ; « each » : points par sous-tâche (total = somme).
  const stepsMode = b.stepsMode === 'each' && steps.length ? 'each' : 'all';
  if (b.stepsMode === 'each' && !steps.length) throw httpError(400, 'Ajoute au moins une sous-tâche.');
  let pts = Number(b.points), bonus = 0;
  if (stepsMode === 'each') {
    if (steps.some((x) => !Number.isInteger(x.points) || x.points < 1 || x.points > 100000)) throw httpError(400, 'Points de chaque sous-tâche : nombre entier supérieur à 0.');
    bonus = Number(b.stepsBonus) || 0;
    if (!Number.isInteger(bonus) || bonus < 0 || bonus > 100000) throw httpError(400, 'Bonus : nombre entier positif ou nul.');
    pts = steps.reduce((n, x) => n + x.points, 0) + bonus; // total possible
  } else steps.forEach((x) => { x.points = 0; });
  if (!Number.isInteger(pts) || pts < 1 || pts > 100000) throw httpError(400, 'Points : nombre entier supérieur à 0.');
  const kind = !template && b.kind === 'open' ? 'open' : 'plan';
  const photoHint = text(b.photoHint, 'Description de la photo', { max: 200, multiline: true });
  const t = { photoHint: b.photoRequired ? photoHint : '', title, description, icon, points: pts, kind, repeat: null, days: null, monthDay: null, date: null, moment: null, remindAt: null, kids: [], photoRequired: !!b.photoRequired, reopen: null, goalCount: 0, goalBonus: 0 };
  t.steps = steps;
  t.stepsMode = stepsMode; t.stepsBonus = bonus;
  if (!template) { // aucun enfant choisi = tâche non attribuée (n'importe quel enfant peut la prendre)
    const kids = [...new Set((Array.isArray(b.kids) ? b.kids : []).map(Number))];
    for (const id of kids) if (!Number.isInteger(id) || !db.prepare('SELECT 1 FROM kids WHERE id = ?').get(id)) throw httpError(400, 'Enfant inconnu.');
    t.kids = kids;
  }
  if (kind === 'open') { // une tâche ouverte peut se renouveler seule après avoir été faite
    if (b.reopen === 'day' || b.reopen === 'week') t.reopen = b.reopen;
    return t;
  } // ni moment, ni rappel, ni récurrence
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
  // Objectif de la semaine : bonus quand la tâche est validée au moins N fois du lundi au dimanche.
  const gc = Number(b.goalCount) || 0, gb = Number(b.goalBonus) || 0;
  if (!template && b.repeat !== 'date' && (gc || gb)) {
    if (!Number.isInteger(gc) || gc < 1 || gc > 7) throw httpError(400, 'Objectif de la semaine : de 1 à 7 fois.');
    if (!Number.isInteger(gb) || gb < 1 || gb > 100000) throw httpError(400, 'Bonus de l\'objectif : nombre entier supérieur à 0.');
    t.goalCount = gc; t.goalBonus = gb;
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
  if (t.kind === 'open') return t.reopen === 'day' ? 'Sans date · renouvelée chaque jour' : t.reopen === 'week' ? 'Sans date · renouvelée chaque semaine' : 'Sans date';
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
// Envoi tardif : une mission planifiée non envoyée reste « à faire » le lendemain (jusqu'à midi ou toute la journée), puis devient manquée.
const lateMode = () => settings.get('late_send', 'noon'); // 'none' | 'noon' | 'day'
function setLateMode(v) {
  if (!['none', 'noon', 'day'].includes(v)) throw httpError(400, 'Envoi tardif : non, jusqu\'à midi ou toute la journée.');
  settings.set('late_send', v);
}
function closeOverdue() {
  const today = dates.today(), mode = lateMode(), yesterday = dates.addDays(today, -1);
  const closeYesterday = mode === 'none' || (mode === 'noon' && dates.nowMinutes() >= 12 * 60);
  const limit = closeYesterday ? today : yesterday; // missions dont l'échéance est strictement avant cette date : manquées
  db.prepare("UPDATE occurrences SET status = 'missed' WHERE status IN ('todo', 'refused') AND due_date < ? AND task_id IN (SELECT id FROM tasks WHERE kind = 'plan')").run(limit);
}

function generate() {
  const today = dates.today();
  if (generatedOn === today) return;
  tx(() => {
    // Les tâches ouvertes n'ont pas d'échéance : elles ne sont jamais « manquées ».
    closeOverdue();
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
  // Renouvelable : une nouvelle occurrence est créée tant qu'aucune n'est en cours (à faire, en attente, refusée).
  const active = (kid) => db.prepare("SELECT 1 FROM occurrences WHERE task_id = ? AND kid_id IS ? AND status IN ('todo', 'wait', 'refused')").get(taskId, kid);
  const seen = t.reopen ? active : has;
  if (t.kids.length) { for (const k of t.kids) if (!seen(k)) add(k); }
  else if (t.reopen ? !db.prepare("SELECT 1 FROM occurrences WHERE task_id = ? AND status IN ('todo', 'wait', 'refused')").get(taskId) : !db.prepare('SELECT 1 FROM occurrences WHERE task_id = ?').get(taskId)) add(null);
}

// Après validation d'une tâche ouverte renouvelable : une nouvelle occurrence libre (ou pour les mêmes enfants) apparaît
// le lendemain, ou le lundi suivant.
function reopenAfter(taskId, kidId) {
  const t = db.prepare('SELECT kind, reopen, points FROM tasks WHERE id = ?').get(taskId);
  if (!t || t.kind !== 'open' || !t.reopen) return;
  const attributed = db.prepare('SELECT 1 FROM task_kids WHERE task_id = ?').get(taskId);
  const slot = attributed ? kidId : null;
  if (db.prepare("SELECT 1 FROM occurrences WHERE task_id = ? AND kid_id IS ? AND status IN ('todo', 'wait', 'refused')").get(taskId, slot)) return;
  const today = dates.today();
  const due = t.reopen === 'day' ? dates.addDays(today, 1) : dates.addDays(dates.weekStart(today), 7);
  db.prepare('INSERT INTO occurrences (task_id, kid_id, due_date, points) VALUES (?, ?, ?, ?)').run(taskId, slot, due, t.points);
}

// Remplace les sous-tâches d'une tâche en gardant les identifiants connus (et donc les cases cochées).
function saveSteps(taskId, steps) {
  const known = new Set(db.prepare('SELECT id FROM task_steps WHERE task_id = ?').all(taskId).map((r) => r.id));
  const keep = new Set(steps.filter((s) => s.id && known.has(s.id)).map((s) => s.id));
  for (const id of known) if (!keep.has(id)) db.prepare('DELETE FROM task_steps WHERE id = ?').run(id);
  steps.forEach((s, i) => {
    if (s.id && keep.has(s.id)) db.prepare('UPDATE task_steps SET label = ?, position = ?, points = ? WHERE id = ?').run(s.label, i, s.points, s.id);
    else db.prepare('INSERT INTO task_steps (task_id, label, position, points) VALUES (?, ?, ?, ?)').run(taskId, s.label, i, s.points);
  });
}
const stepsOf = (taskId) => db.prepare('SELECT id, label, points FROM task_steps WHERE task_id = ? ORDER BY position, id').all(taskId);

function create(body) {
  const t = clean(body);
  const id = tx(() => {
    const info = db.prepare(`INSERT INTO tasks (title, description, icon, points, kind, repeat, days, month_day, date, moment, remind_at, photo_required, photo_hint, steps_mode, steps_bonus, reopen, goal_count, goal_bonus, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(t.title, t.description, t.icon, t.points, t.kind, t.repeat, t.days && JSON.stringify(t.days), t.monthDay, t.date, t.moment, t.remindAt, t.photoRequired ? 1 : 0, t.photoHint || null, t.stepsMode, t.stepsBonus, t.reopen, t.goalCount, t.goalBonus, Date.now());
    const taskId = Number(info.lastInsertRowid);
    insertTaskKids(taskId, t.kids);
    saveSteps(taskId, t.steps);
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
    db.prepare(`UPDATE tasks SET title = ?, description = ?, icon = ?, points = ?, repeat = ?, days = ?, month_day = ?, date = ?, moment = ?, remind_at = ?, photo_required = ?, photo_hint = ?, steps_mode = ?, steps_bonus = ?, reopen = ?, goal_count = ?, goal_bonus = ? WHERE id = ?`)
      .run(t.title, t.description, t.icon, t.points, t.repeat, t.days && JSON.stringify(t.days), t.monthDay, t.date, t.moment, t.remindAt, t.photoRequired ? 1 : 0, t.photoHint || null, t.stepsMode, t.stepsBonus, t.reopen, t.goalCount, t.goalBonus, id);
    // Les occurrences pas encore déclarées sont régénérées ; celles en attente ou validées restent.
    db.prepare('DELETE FROM task_kids WHERE task_id = ?').run(id);
    insertTaskKids(id, t.kids);
    saveSteps(id, t.steps);
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
    moment: t.moment, remindAt: t.remind_at, photoRequired: !!t.photo_required, photoHint: t.photo_hint || '', label: repeatLabel(t),
    kids: db.prepare('SELECT kid_id FROM task_kids WHERE task_id = ?').all(t.id).map((k) => k.kid_id),
    steps: stepsOf(t.id), stepsMode: t.steps_mode, stepsBonus: t.steps_bonus, reopen: t.reopen, goalCount: t.goal_count, goalBonus: t.goal_bonus,
  })).map((t) => ({ ...t, unassigned: !t.kids.length }));
}

const OCC = `SELECT o.id, o.status, o.due_date AS dueDate, o.points, o.note, t.id AS taskId, t.title, t.description, t.icon,
  t.moment, t.remind_at AS remindAt, t.kind, t.reopen, t.repeat, t.days, t.month_day, t.date, t.photo_required AS photoRequired, t.photo_hint AS photoHint,
  EXISTS (SELECT 1 FROM occurrence_photos p WHERE p.occurrence_id = o.id) AS hasPhoto FROM occurrences o JOIN tasks t ON t.id = o.task_id`;
const shape = (r) => ({ id: r.id, status: r.status, dueDate: r.dueDate, points: r.points, note: r.note, taskId: r.taskId, title: r.title,
  description: r.description, icon: r.icon, moment: r.moment, remindAt: r.remindAt, kind: r.kind, label: repeatLabel(r),
  photoRequired: !!r.photoRequired && photos.config().enabled, photoHint: r.photoHint || '', hasPhoto: !!r.hasPhoto });

// Sous-tâches de chaque occurrence, avec leur état coché.
function withSteps(rows) {
  return rows.map((o) => ({ ...o, ...db.prepare('SELECT steps_mode AS stepsMode, steps_bonus AS stepsBonus FROM tasks WHERE id = ?').get(o.taskId === undefined ? o.task_id : o.taskId), steps: db.prepare(`SELECT s.id, s.label, s.points, os.checked_at IS NOT NULL AS checked, COALESCE(os.approved, 0) AS approved FROM task_steps s
    LEFT JOIN occurrence_steps os ON os.step_id = s.id AND os.occurrence_id = ? WHERE s.task_id = ? ORDER BY s.position, s.id`)
    .all(o.id, o.taskId === undefined ? o.task_id : o.taskId).map((x) => ({ id: x.id, label: x.label, points: x.points, checked: !!x.checked, approved: !!x.approved })) }));
}

// Écran de l'enfant : missions du jour, missions ouvertes à prendre, ponctuelles à venir.
function forKid(kidId) {
  generate();
  closeOverdue(); // l'échéance « midi » peut tomber en cours de journée
  const today = dates.today(), mode = lateMode();
  return {
    lateUntil: mode === 'none' ? null : mode,
    // Hier, encore à envoyer (envoi tardif).
    late: mode === 'none' ? [] : withSteps(db.prepare(`${OCC} WHERE o.kid_id = ? AND o.status IN ('todo', 'refused') AND o.due_date = ? AND t.kind = 'plan' ORDER BY o.id`).all(kidId, dates.addDays(today, -1)).map(shape)),
    // Les tâches ouvertes attribuées restent à faire tant qu'elles ne sont pas validées, quelle que soit leur date de création.
    today: withSteps(db.prepare(`${OCC} WHERE o.kid_id = ? AND o.status <> 'missed' AND (o.due_date = ? OR (t.kind = 'open' AND o.due_date <= ? AND o.status IN ('todo', 'refused', 'wait'))) ORDER BY o.id`).all(kidId, today, today).map(shape)),
    // À prendre : tâches non attribuées (ouvertes, ou planifiées pour aujourd'hui).
    open: withSteps(db.prepare(`${OCC} WHERE o.kid_id IS NULL AND o.status = 'todo' AND o.due_date <= ? ORDER BY o.id`).all(today).map(shape)),
    upcoming: db.prepare(`${OCC} WHERE o.kid_id = ? AND o.due_date > ? AND o.status = 'todo' ORDER BY o.due_date, o.id LIMIT 20`).all(kidId, today)
      .map((r) => ({ ...shape(r), label: `${repeatLabel(r)}` })),
  };
}

const review = () => {
  generate();
  return withSteps(db.prepare(`SELECT o.id, o.task_id, o.points, o.done_at AS doneAt, o.due_date AS dueDate, t.title, t.icon, t.description, k.id AS kidId, k.name AS kidName, k.palette,
    o.photo_skipped AS photoSkipped, o.photo_note AS photoNote, t.photo_required AS photoAsked,
    EXISTS (SELECT 1 FROM occurrence_photos p WHERE p.occurrence_id = o.id) AS hasPhoto
    FROM occurrences o JOIN tasks t ON t.id = o.task_id JOIN kids k ON k.id = o.kid_id WHERE o.status = 'wait' ORDER BY o.done_at, o.id`).all());
};

// ---------- Actions ----------
// L'enfant déclare « fait » : seules ses propres missions du jour (ou en retard refusées) passent en attente.
// Photo preuve : exigée si le réglage global ET l'option de la tâche sont actifs ; facultative sinon
// (acceptée quand le réglage global est actif). Photo impossible (tard, plus de téléphone, scène rangée...) :
// l'enfant peut envoyer sans photo avec un motif (opts.skip, opts.note) ; le parent le voit et décide.
function declare(kidId, occId, photoInput, opts = {}) {
  const o = db.prepare("SELECT o.task_id AS taskId, t.steps_mode AS mode, t.photo_required AS req FROM occurrences o JOIN tasks t ON t.id = o.task_id WHERE o.id = ? AND o.kid_id = ? AND o.status IN ('todo', 'refused')").get(occId, kidId);
  if (!o) throw httpError(409, 'Cette mission ne peut pas être déclarée.');
  if (o.mode === 'each') {
    if (!db.prepare('SELECT 1 FROM occurrence_steps WHERE occurrence_id = ?').get(occId)) throw httpError(409, 'Coche au moins une sous-tâche.');
  } else if (db.prepare(`SELECT 1 FROM task_steps s WHERE s.task_id = ? AND NOT EXISTS
    (SELECT 1 FROM occurrence_steps os WHERE os.step_id = s.id AND os.occurrence_id = ?)`).get(o.taskId, occId)) throw httpError(409, 'Il reste des sous-tâches à cocher.');
  const enabled = photos.config().enabled;
  const buf = enabled && photoInput ? photos.decode(photoInput) : null;
  const skipped = enabled && o.req && !buf && !!opts.skip;
  if (enabled && o.req && !buf && !skipped) throw httpError(400, 'Une photo est demandée pour cette mission.');
  const photoNote = skipped ? (text(opts.note, 'Motif', { max: 140 }) || null) : null;
  tx(() => {
    const r = db.prepare("UPDATE occurrences SET status = 'wait', done_at = ?, note = NULL, photo_skipped = ?, photo_note = ? WHERE id = ? AND kid_id = ? AND status IN ('todo', 'refused')").run(Date.now(), skipped ? 1 : 0, photoNote, occId, kidId);
    if (!r.changes) throw httpError(409, 'Cette mission ne peut pas être déclarée.');
    if (buf) photos.save(occId, buf);
  });
}

// L'enfant coche ou décoche une sous-tâche de sa propre mission (tant qu'elle n'est pas déclarée).
function toggleStep(kidId, occId, stepId, checked) {
  const o = db.prepare("SELECT task_id FROM occurrences WHERE id = ? AND kid_id = ? AND status IN ('todo', 'refused')").get(occId, kidId);
  if (!o) throw httpError(409, 'Cette mission ne peut pas être modifiée.');
  if (!db.prepare('SELECT 1 FROM task_steps WHERE id = ? AND task_id = ?').get(stepId, o.task_id)) throw httpError(404, 'Sous-tâche introuvable.');
  if (checked) db.prepare('INSERT OR IGNORE INTO occurrence_steps (occurrence_id, step_id, checked_at) VALUES (?, ?, ?)').run(occId, stepId, Date.now());
  else db.prepare('DELETE FROM occurrence_steps WHERE occurrence_id = ? AND step_id = ?').run(occId, stepId);
}

// Mission ouverte : le premier qui la prend la verrouille (mise à jour atomique).
function claim(kidId, occId) {
  const today = dates.today();
  const r = db.prepare(`UPDATE occurrences SET kid_id = ?, due_date = CASE WHEN (SELECT kind FROM tasks WHERE id = task_id) = 'open' THEN ? ELSE due_date END
    WHERE id = ? AND kid_id IS NULL AND status = 'todo' AND due_date <= ?`).run(kidId, today, occId, today);
  if (!r.changes) throw httpError(409, 'Cette mission a déjà été prise.');
}

// stepIds : en mode « points par sous-tâche », les sous-tâches que le parent valide (par défaut toutes celles cochées) ;
// les autres sont perdues. Ignoré en mode « tout ou rien ».
function approve(occId, stepIds) {
  return tx(() => {
    const o = db.prepare("SELECT o.id, o.kid_id, o.points, o.task_id, o.due_date AS dueDate, t.title, t.kind, t.steps_mode AS mode, t.steps_bonus AS bonus, t.goal_count AS goalCount, t.goal_bonus AS goalBonus FROM occurrences o JOIN tasks t ON t.id = o.task_id WHERE o.id = ? AND o.status = 'wait'").get(occId);
    if (!o) throw httpError(409, 'Rien à valider.');
    if (o.mode === 'each') {
      const checked = db.prepare('SELECT s.id, s.points FROM occurrence_steps os JOIN task_steps s ON s.id = os.step_id WHERE os.occurrence_id = ?').all(occId);
      if (stepIds !== undefined && !Array.isArray(stepIds)) throw httpError(400, 'Sous-tâches : liste attendue.');
      const wanted = stepIds === undefined ? null : new Set(stepIds.map(Number));
      const ok = checked.filter((s) => !wanted || wanted.has(s.id));
      if (!ok.length) throw httpError(409, 'Aucune sous-tâche validée : refuse la mission.');
      for (const s of ok) db.prepare('UPDATE occurrence_steps SET approved = 1 WHERE occurrence_id = ? AND step_id = ?').run(occId, s.id);
      o.points = ok.reduce((n, s) => n + s.points, 0);
      // Bonus : toutes les sous-tâches de la tâche sont validées.
      if (o.bonus && ok.length === db.prepare('SELECT COUNT(*) AS n FROM task_steps WHERE task_id = ?').get(o.task_id).n) o.points += o.bonus;
      db.prepare('UPDATE occurrences SET points = ? WHERE id = ?').run(o.points, occId);
    }
    db.prepare("UPDATE occurrences SET status = 'done', decided_at = ? WHERE id = ?").run(Date.now(), occId);
    points.add(o.kid_id, o.points, o.title, { gain: true, refType: 'task', refId: occId });
    reopenAfter(o.task_id, o.kid_id);
    // Objectif de la semaine : bonus une seule fois par semaine, dès que le nombre de validations est atteint.
    let goal = 0;
    if (o.goalCount && o.goalBonus) {
      const ws = dates.weekStart(o.dueDate), we = dates.addDays(ws, 6);
      const n = db.prepare("SELECT COUNT(*) AS n FROM occurrences WHERE task_id = ? AND kid_id = ? AND status = 'done' AND due_date BETWEEN ? AND ?").get(o.task_id, o.kid_id, ws, we).n;
      if (n >= o.goalCount && db.prepare('INSERT OR IGNORE INTO goal_awards (kid_id, task_id, week_start) VALUES (?, ?, ?)').run(o.kid_id, o.task_id, ws).changes) {
        points.add(o.kid_id, o.goalBonus, `Objectif de la semaine : ${o.title}`, { gain: true, refType: 'goal', refId: occId });
        goal = o.goalBonus;
      }
    }
    const g = game.afterEarn(o.kid_id); // bonus de série et badges éventuels
    return { kidId: o.kid_id, taskTitle: o.title, ...g, ...points.summary(o.kid_id), earned: o.points, goalBonus: goal }; // points = solde ; earned = gagnés par cette validation
  });
}

function refuse(occId, note) {
  const text = String(note || '').trim().slice(0, 200) || null;
  const r = db.prepare("UPDATE occurrences SET status = 'refused', decided_at = ?, note = ? WHERE id = ? AND status = 'wait'").run(Date.now(), text, occId);
  if (!r.changes) throw httpError(409, 'Rien à refuser.');
  const o = db.prepare('SELECT o.kid_id AS kidId, t.title FROM occurrences o JOIN tasks t ON t.id = o.task_id WHERE o.id = ?').get(occId);
  return { kidId: o.kidId, title: o.title, note: text };
}

module.exports = { lateMode, setLateMode, closeOverdue, clean, repeatLabel, create, update, remove, list, forKid, review, declare, toggleStep, claim, approve, refuse, generate, invalidate, occursOn };
