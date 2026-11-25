// Régénère docs/BAREME.md à partir du pack de départ (lib/seed.js) : node scripts/make-bareme.js
process.env.LATRIBU_DATA_DIR = process.env.LATRIBU_DATA_DIR || require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'latribu-b-'));
process.env.LATRIBU_PUSH = 'off';
const seed = require('../lib/seed');
const DAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const pts = (t) => (t.stepsMode === 'each' ? t.steps.reduce((n, s) => n + s.points, 0) + (t.stepsBonus || 0) : t.points);
const when = (t) => (t.repeat === 'daily' ? 'tous les jours' : t.repeat === 'weekly' ? `chaque ${DAYS[t.days[0] - 1]}` : t.days ? t.days.slice().sort((a, b) => a - b).map((d) => DAYS[d - 1]).join(' ') : 'sans date');
const detail = (t) => (t.stepsMode === 'each' ? t.steps.map((s) => `${s.label} ${s.points}`).join(' · ') + (t.stepsBonus ? ` · **bonus ${t.stepsBonus}**` : '') : '');
const day = (list, d) => list.filter((t) => t.repeat === 'daily' || (t.days || []).includes(d)).reduce((n, t) => n + pts(t), 0);
const table = (list) => '| Tâche | Quand | Détail | Points |\n|---|---|---|---|\n' + list.map((t) => `| ${t.title}${t.remindAt ? ` (rappel ${t.remindAt})` : ''} | ${when(t)} | ${detail(t)}${t.goalCount ? `Bonus ${t.goalBonus} si ${t.goalCount} fois/semaine` : ''} | ${pts(t)} |`).join('\n');
const lim = { day: 'jour', week: 'semaine', month: 'mois' };
let md = `# Barème de points — pack famille\n\nGénéré par \`node scripts/make-bareme.js\` à partir de \`lib/seed.js\` (chargé avec \`npm run seed-famille\`). **1 point ≈ 3 minutes d'effort, 5 points minimum par geste.** Aucune pénalité : un oubli fait seulement perdre le bonus « tout est fait ». Rappels : matin 7 h, après-midi 16 h 30, soir 18 h (mélatonine 20 h). Tous les chiffres se modifient ensuite dans l'application.\n\n`;
md += `## Petit (9 ans) — jour d'école : ${day(seed.TASKS.petit, 2)} points (mercredi : ${day(seed.TASKS.petit, 3)})\n\n${table(seed.TASKS.petit)}\n\n`;
md += `## Grande (14 ans) — jour d'école : ${day(seed.TASKS.grande, 2)} points (mercredi : ${day(seed.TASKS.grande, 3)})\n\n${table(seed.TASKS.grande)}\n\n`;
md += `## Tâches communes (au premier qui la prend)\n\n${table(seed.TASKS.commun)}\n\n`;
md += `## Magasin (limite par enfant)\n\n| Récompense | Limite | Prix |\n|---|---|---|\n${seed.REWARDS.map((r) => `| ${r.title} | 1 par ${lim[r.limit]} | ${r.price} |`).join('\n')}\n\n`;
md += `Avatar : ${Object.entries(seed.ACCESSORY_PRICES).map(([k, v]) => `${k} ${v[1]}`).join(' · ')}.\n\nBonus de série (3 / 7 / 14 / 30 jours) : ${Object.values(seed.NEW_STREAK).join(' / ')}. Une journée compte dans la série à partir de ${seed.STREAK_MIN} % des missions faites (réglable par enfant).\n`;
require('fs').writeFileSync(require('path').join(__dirname, '..', 'docs', 'BAREME.md'), md);
console.log('docs/BAREME.md régénéré');
