// Charge le pack de départ (tâches, récompenses, réglages) pour les deux enfants.
//   npm run seed-famille                       essai à blanc conseillé : ajouter --dry-run
//   npm run seed-famille -- --petit Mylo --grande Elynn [--dry-run]
// Les profils enfants doivent déjà exister. Sans danger à relancer : l'existant est ignoré.
// Utilise LATRIBU_DATA_DIR comme le serveur. Sauvegarde conseillée de data/latribu.db avant.
const seed = require('../lib/seed');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const dryRun = args.includes('--dry-run');
try {
  const r = seed.apply({ petit: opt('--petit', 'Mylo'), grande: opt('--grande', 'Elynn'), dryRun });
  console.log(dryRun ? 'ESSAI À BLANC (rien n\'est écrit)\n' : '');
  console.log(`${dryRun ? 'À créer' : 'Créé'} (${r.created.length}) :\n  ${r.created.join('\n  ') || '–'}`);
  console.log(`\nDéjà présent, ignoré (${r.skipped.length}) :\n  ${r.skipped.join('\n  ') || '–'}`);
  console.log(`\nRéglages ${dryRun ? 'à ajuster' : 'ajustés'} :\n  ${r.settings.join('\n  ') || '–'}`);
} catch (e) {
  console.error('Erreur :', e.message);
  process.exitCode = 1;
}
