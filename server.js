// La Tribu : serveur Express. Seul (npm start, PORT) ou monté dans node-gateway sur
// /latribu (dossier apps/latribu) : le module exporte l'app, et n'écoute un port ou
// n'installe de gestionnaire global que s'il est lancé directement.
const fs = require('fs');
const path = require('path');
const express = require('express');
const compression = require('compression');
const security = require('./lib/security');
const auth = require('./lib/auth');
const { router } = require('./lib/api');

if (require.main === module) {
  const fatal = (kind) => (err) => { console.error(`${kind} :`, err); process.exit(1); };
  process.on('uncaughtException', fatal('Erreur non interceptée'));
  process.on('unhandledRejection', fatal('Promesse rejetée non gérée'));
}

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');

app.disable('x-powered-by');
app.use(security.headers);
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Interface : fichiers toujours revalidés (304 si inchangés), sauf la page elle-même.
app.use(express.static(PUBLIC_DIR, { index: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

app.use('/api', auth.loadSession, security.jsonOnly, router());
app.use('/api', (req, res) => res.status(404).json({ error: 'Adresse inconnue.' }));
app.use('/api', (err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  if (status >= 500 && !err.expose) console.error(err);
  res.status(status).json({ error: status >= 500 && !err.expose ? 'Erreur interne du serveur.' : err.message });
});

// Page unique (navigation par #). <base> = racine de l'app, pour des chemins relatifs
// valables seule comme sous /latribu.
app.get('/', (req, res) => {
  security.pagePolicy(res);
  const root = auth.rootPath(req).replace(/[<>"&]/g, '');
  res.set('Cache-Control', 'no-cache').type('html').send(INDEX.replace(/\{\{ROOT\}\}/g, root));
});

// Rappels et résumés push : un minuteur unique, non bloquant (LATRIBU_PUSH=off pour le couper).
require('./lib/push').start();

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`La Tribu : http://localhost:${PORT}/`));
}

module.exports = app;
