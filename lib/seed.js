// Pack de départ « famille » : tâches, récompenses, accessoires et réglages calibrés pour deux enfants
// (un de 9 ans, une de 14 ans). Barème : 1 point ≈ 3 minutes d'effort, minimum 5 points par geste.
// Sûr à relancer : ce qui existe déjà (même titre, mêmes enfants) est ignoré, et un réglage déjà modifié
// par un parent (bonus de série, prix des accessoires, pourcentage de série) n'est jamais écrasé.
const { db } = require('./db');
const tasks = require('./tasks');
const shop = require('./shop');
const game = require('./game');
const points = require('./points');
const { httpError } = require('./util');

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const SCHOOL = [1, 2, 3, 4, 5], LUNCH_DAYS = [1, 2, 4, 5], CARTABLE_DAYS = [7, 1, 2, 3, 4]; // pas de lunch le mercredi ; pas de cartable le vendredi ni le samedi

// Tâche à sous-tâches : points par sous-tâche (+ bonus si tout est fait).
// Rappels par moment (sauf indication contraire) : matin 7 h, après-midi 16 h 30, soir 18 h.
const REMIND = { matin: '07:00', apres: '16:30', soir: '18:00' };
const withRemind = (o) => { const moment = o.moment === undefined ? 'soir' : o.moment; return { moment, remindAt: moment ? REMIND[moment] : null, ...o }; };
const routine = (title, icon, steps, o = {}) => ({
  title, icon, repeat: 'daily', ...withRemind(o), stepsMode: 'each', points: 1, stepsBonus: o.bonus || 0,
  steps: steps.map(([label, points]) => ({ label, points })),
});
const simple = (title, icon, points, o = {}) => ({ title, icon, points, repeat: 'daily', ...withRemind(o) });

const RETOUR = ['Retour de l\'école', '🎒', [['Ranger ses chaussures', 5], ['Accrocher sa veste', 5], ['Ranger son sac de sport et ses affaires', 5], ['Vider son sac à lunch', 5]],
  { repeat: 'days', days: SCHOOL, moment: 'apres', bonus: 5 }];
const COUCHER = [['Mettre son pyjama', 5], ['Se brosser les dents', 5], ['Faire pipi', 5]];
const DOUCHE = { title: 'Prendre une douche', icon: '🚿', points: 10, repeat: 'daily', moment: null, goalCount: 4, goalBonus: 25,
  description: 'Au moins 4 douches dans la semaine : bonus. Tous les jours, c\'est l\'idéal.' };

const TASKS = {
  petit: [
    routine('Routine du matin', '🌅', [['S\'habiller', 5], ['Prendre son petit-déjeuner', 5], ['Se brosser les dents', 5], ['Débarrasser sa table', 5]], { moment: 'matin', bonus: 5 }),
    simple('Préparer et emballer son lunch', '🥪', 10, { repeat: 'days', days: LUNCH_DAYS, moment: 'matin' }),
    routine(...RETOUR.slice(0, 3), RETOUR[3]),
    routine('Devoirs', '📚', [['S\'installer et sortir le matériel', 5], ['Faire ses devoirs', 30], ['Ranger son matériel', 5]], { repeat: 'days', days: SCHOOL, moment: 'apres', }),
    simple('Prendre son Risperdal', '💊', 5, { remindAt: '18:00', description: 'Le but : ne pas oublier.' }),
    routine('Corvées du soir', '🍽️', [['Vider le lave-vaisselle', 20], ['Vider le tapis de l\'évier', 5], ['Mettre la table', 15]], { bonus: 15 }),
    simple('Préparer le cartable du lendemain', '🎒', 10, { repeat: 'days', days: CARTABLE_DAYS, }),
    routine('Rituel du coucher', '🌙', COUCHER, { bonus: 5 }),
    DOUCHE,
  ],
  grande: [
    routine('Routine du matin', '🌅', [['Se préparer (habillée, coiffée)', 10], ['Prendre son petit-déjeuner', 5], ['Débarrasser sa table', 5]], { moment: 'matin', bonus: 10 }),
    routine('Médicaments du matin', '💊', [['Fer', 5], ['Equazym', 5], ['Antihistaminique', 5]], { moment: 'matin', description: 'Le but : ne pas oublier.' }),
    simple('Préparer et emballer son lunch', '🥪', 10, { repeat: 'days', days: LUNCH_DAYS, moment: 'matin' }),
    routine(...RETOUR.slice(0, 3), RETOUR[3]),
    routine('Devoirs', '📚', [['S\'installer et sortir le matériel', 5], ['Faire ses devoirs', 35], ['Ranger son matériel', 5]], { repeat: 'days', days: SCHOOL, moment: 'apres', }),
    routine('Ranger la cuisine', '🧽', [['Remplir le lave-vaisselle', 10], ['Nettoyer les plans de travail + taque', 15], ['Vider et rincer l\'évier', 5], ['Passer un coup de balai', 5], ['Ranger et nettoyer le bar', 10], ['Débarrasser et nettoyer la table', 10]], { bonus: 10 }),
    simple('Préparer le cartable du lendemain', '🎒', 10, { repeat: 'days', days: CARTABLE_DAYS, }),
    simple('Prendre sa mélatonine', '💊', 5, { remindAt: '20:00', description: 'Le but : ne pas oublier.' }),
    routine('Rituel du coucher', '🌙', COUCHER, { bonus: 5 }),
    routine('Dents et appareil après les repas', '🦷', [['Après le petit-déjeuner', 5], ['Après le repas de midi', 5], ['Après le souper', 5]], { bonus: 5 }),
    DOUCHE,
  ],
  // Pour tout le monde : premier arrivé, premier servi.
  commun: [
    simple('Sortir les poubelles', '🗑️', 15, { repeat: 'weekly', days: [1], remindAt: null }),
    simple('Nourrir les animaux', '🐾', 10, { repeat: 'days', days: [2, 3, 4, 5], remindAt: null }),
    { title: 'Cuisiner un repas pour la famille', icon: '🍳', points: 50, kind: 'open', reopen: 'week', description: 'Une fois faite et validée, elle revient la semaine suivante.' },
  ],
};

const reward = (title, icon, price, limit, description = '') => ({ title, icon, price, limit, description });
const REWARDS = [
  // chaque jour
  reward('Écran : +10 minutes', '📺', 75, 'day', 'Dix minutes de plus que l\'heure prévue.'),
  reward('Petite douceur du soir', '🍬', 60, 'day'),
  reward('Choisir la musique du repas', '🎵', 30, 'day'),
  reward('10 minutes de jeu avec un parent', '🎲', 50, 'day'),
  // chaque semaine
  reward('Carte joker : une petite tâche en moins', '🃏', 200, 'week'),
  reward('Regarder un film en famille + pop-corn', '🍿', 500, 'week'),
  reward('Ajouter un plat au menu', '🍝', 400, 'week'),
  reward('Veiller 15 minutes plus tard', '🌙', 300, 'week'),
  reward('Activité en tête-à-tête avec un parent', '🤝', 600, 'week'),
  // chaque mois : épargne sur plusieurs semaines
  reward('Nuit cabane au salon', '🏕️', 4000, 'month', 'Un objectif de plus d\'un mois de points.'),
  reward('Argent de poche : 5 €', '💶', 2200, 'month'),
  reward('Argent de poche : 10 €', '💰', 4500, 'month'),
];
const ACCESSORY_PRICES = {
  Lunettes: [40, 200, 'accessoire'],
  Casquette: [50, 250, 'accessoire'],
  'Casque audio': [60, 300, 'accessoire'],
  Éclair: [80, 400, 'accessoire'],
  Couronne: [150, 750, 'accessoire'],
  'Lunettes de soleil': [60, 300, 'accessoire'],
  'Masque de héros': [90, 450, 'accessoire'],
  Moustache: [50, 250, 'accessoire'],
  Bonnet: [55, 275, 'accessoire'],
  'Chapeau de magicien': [120, 600, 'accessoire'],
  'Chapeau de pirate': [110, 550, 'accessoire'],
  'Couronne de fleurs': [100, 500, 'accessoire'],
  'Nœud papillon': [45, 225, 'accessoire'],
  Écharpe: [70, 350, 'accessoire'],
  'Médaille d\'or': [130, 650, 'accessoire'],
  Chat: [150, 750, 'avatar'],
  Chien: [150, 750, 'avatar'],
  Lapin: [180, 900, 'avatar'],
  Panda: [200, 1000, 'avatar'],
  Renard: [220, 1100, 'avatar'],
  Robot: [250, 1250, 'avatar'],
  Licorne: [300, 1500, 'avatar'],
  Dragon: [350, 1750, 'avatar'],
  'Ciel nuageux': [60, 300, 'décor'],
  Plage: [80, 400, 'décor'],
  Forêt: [80, 400, 'décor'],
  Montagne: [100, 500, 'décor'],
  'Ville de nuit': [110, 550, 'décor'],
  'Arc-en-ciel': [120, 600, 'décor'],
  Fête: [130, 650, 'décor'],
  Espace: [160, 800, 'décor'],
}; // [ancien défaut, nouveau prix, type] : un prix déjà modifié par un parent n'est jamais touché
const OLD_STREAK = { 3: 10, 7: 25, 14: 50, 30: 100 }, NEW_STREAK = { 3: 75, 7: 200, 14: 375, 30: 750 };
const LEVEL_XP = 500; // XP par niveau (100 par défaut) : les points sont 5 fois plus nombreux, les niveaux restent espacés
const STREAK_MIN = 70; // % de missions du jour pour qu'une journée compte dans la série

function findKid(name) {
  const kid = db.prepare('SELECT id, name FROM kids').all().find((k) => norm(k.name) === norm(name));
  if (!kid) {
    const have = db.prepare('SELECT name FROM kids ORDER BY id').all().map((k) => k.name).join(', ') || 'aucun';
    throw httpError(400, `Enfant « ${name} » introuvable (profils existants : ${have}). Crée-le d'abord dans Réglages.`);
  }
  return kid;
}
const taskExists = (title, kidIds) => db.prepare('SELECT id FROM tasks WHERE title = ?').all(title)
  .some((t) => JSON.stringify(db.prepare('SELECT kid_id FROM task_kids WHERE task_id = ? ORDER BY kid_id').all(t.id).map((r) => r.kid_id)) === JSON.stringify([...kidIds].sort((a, b) => a - b)));

function apply({ petit = 'Mylo', grande = 'Elynn', dryRun = false } = {}) {
  const kp = findKid(petit), kg = findKid(grande);
  const report = { created: [], skipped: [], settings: [] };
  const run = () => {
    const groups = [[TASKS.petit, [kp.id], kp.name], [TASKS.grande, [kg.id], kg.name], [TASKS.commun, [], 'tous']];
    for (const [list, kids, who] of groups) {
      for (const def of list) {
        const label = `Tâche · ${who} · ${def.title}`;
        if (taskExists(def.title, kids)) { report.skipped.push(label); continue; }
        if (!dryRun) tasks.create({ kind: 'plan', photoRequired: false, ...def, kids });
        report.created.push(label);
      }
    }
    for (const def of REWARDS) {
      const label = `Récompense · ${def.title} (${def.price} pts)`;
      if (db.prepare('SELECT 1 FROM rewards WHERE title = ?').get(def.title)) { report.skipped.push(label); continue; }
      if (!dryRun) shop.create({ ...def, kids: [kp.id, kg.id] });
      report.created.push(label);
    }
    for (const a of shop.accessories()) {
      const [old, now] = ACCESSORY_PRICES[a.title] || [];
      if (now && a.price === old) { if (!dryRun) shop.setAccessoryPrice(a.id, now); report.settings.push(`Accessoire ${a.title} : ${old} → ${now} pts`); }
    }
    const cur = game.bonuses();
    if (Object.keys(OLD_STREAK).every((m) => cur[m] === OLD_STREAK[m])) {
      if (!dryRun) game.setBonuses(NEW_STREAK);
      report.settings.push(`Bonus de série : ${Object.values(NEW_STREAK).join(' / ')} pts (3 / 7 / 14 / 30 jours)`);
    }
    if (points.levelXp() === points.DEFAULT_LEVEL_XP) {
      if (!dryRun) points.setLevelXp(LEVEL_XP);
      report.settings.push(`Niveau : ${LEVEL_XP} XP par niveau (au lieu de ${points.DEFAULT_LEVEL_XP})`);
    }
    for (const k of [kp, kg]) {
      if (db.prepare('SELECT streak_min FROM kids WHERE id = ?').get(k.id).streak_min === 100) {
        if (!dryRun) db.prepare('UPDATE kids SET streak_min = ? WHERE id = ?').run(STREAK_MIN, k.id);
        report.settings.push(`Série de ${k.name} : ${STREAK_MIN} % des missions du jour`);
      }
    }
  };
  run(); // pas de transaction englobante : chaque création est atomique et le chargement est relançable
  return report;
}

module.exports = { LEVEL_XP, apply, TASKS, REWARDS, ACCESSORY_PRICES, NEW_STREAK, STREAK_MIN };
