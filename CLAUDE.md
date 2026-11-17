# La Tribu

## Objectif
App familiale privée (parents = un compte partagé e-mail + mot de passe ; enfants créés/supprimés dans les réglages, jamais en dur) : tâches récurrentes/ponctuelles confiées aux enfants, points gagnés après validation parent, magasin de récompenses par enfant, ambiance ludique (niveaux, séries, badges, avatar à accessoires achetés en points), style sobre. Smartphone first. Spécifications : `CAHIER_DES_CHARGES.md`. Maquette interactive : `maquette/index.html` (`npx http-server maquette -p 5190`) ; état gardé dans le navigateur (localStorage), « Réinitialiser » dans Réglages, démo chargeable depuis l'état vide.

## Stack (cible)
Node >= 22.5, Express, SQLite (`node:sqlite`), front PWA. Calquée sur `../listes-courses` (Cabas). Monté dans `../node-gateway` sous `/latribu`.

## État
**Étapes 1-5 codées (application complète).** Étape 1 (socle) : installation (premier compte parent), connexion parent (e-mail + mot de passe, scrypt), profils enfants créés/supprimés par les parents (PIN scrypt, verrou 5 min après 5 échecs), **session enfant persistante** (cookie 1 an, révocable). Étape 2 : tâches planifiées (tous les jours / certains jours / chaque semaine / chaque mois / date précise, pour 1 à N enfants, moment matin-après-midi-soir, description, points libres, heure de rappel **stockée mais pas encore notifiée**), missions ouvertes (premier arrivé), génération paresseuse des occurrences, déclaration par l'enfant, validation/refus (avec motif) par le parent, registre de points (solde + XP + niveau, 100 XP/niveau), ajustement libre bonus/pénalité (plancher 0), historique des points enfant et parent. Étape 3 (magasin) : récompenses créées pour 1 à N enfants (description, prix libre, limite par enfant jour/semaine/mois, stock individuel ou partagé), achat avec approbation parent (points et stock réservés à la demande, rendus si refus), objectif d'épargne (étoile), accessoires d'avatar payés avec les mêmes points (prix modifiables par le parent), historique points + récompenses côté enfant et parent. Étape 4 (ludique) : série de jours (toutes les missions faites ; jour sans mission neutre), bonus aux paliers 3/7/14/30 réglables (Réglages), badges automatiques + badges décernés par un parent, célébration niveau/badge au prochain affichage de l'enfant (`kids.level_seen`, `badges.seen`), sons optionnels (localStorage). Étape 5 : PWA (manifeste, icônes `scripts/make-icons.py`, `public/sw.js` réseau d'abord) et notifications Web Push (clés VAPID générées et gardées en base) : rappel de chaque tâche à son heure + second rappel 1 h après, décisions des parents, alertes et résumé quotidien aux parents (réglages). **Non vérifié sur un vrai téléphone** : le navigateur intégré à l'outil de développement refuse les service workers ; à tester sur Android/iPhone (iOS : app installée sur l'écran d'accueil).

Tests : `npm test` (node:test).

**Après audit de sécurité** : verrous de connexion par appareil + profil (cookie `latribu_device`, table `trusted_devices`) et par adresse IP (`LATRIBU_TRUST_PROXY=1` derrière le proxy de l'hébergeur : dernière entrée de `X-Forwarded-For`) ; un tiers ne bloque plus la famille ; au plus 2 calculs scrypt en parallèle (file de 16, sinon 503) ; abonnements push limités aux services des navigateurs (`LATRIBU_PUSH_HOSTS` pour en ajouter) ; textes validés comme chaînes (`util.text`), emoji filtrés (`util.emoji`) et échappés côté interface ; API en `Cache-Control: no-store` ; messages d'erreur internes masqués. Non traités volontairement : installation ouverte tant qu'aucun compte n'existe (créer le compte parent dès le déploiement) et origine partagée de la passerelle (préférer un sous-domaine dédié).
**Fonctions ajoutées** : photo preuve (réglage global désactivé par défaut + option par tâche, JPEG réduit par l'appareil, purge N jours après la décision), changement de PIN (Réglages > Gérer), statistiques hebdomadaires (parent et enfant), bibliothèque de 16 modèles de tâches (modifiable, « Enregistrer comme modèle »), validité des récompenses (dates + activation), file d'attente hors connexion pour le bouton « fait » avec dernière vue de l'enfant gardée (localStorage).

## Fichiers clés
- `server.js` — app Express exportée (statique, `/api`, page avec `<base>` = `{{ROOT}}`).
- `lib/db.js` — SQLite `data/latribu.db` (`LATRIBU_DATA_DIR`), migrations par `PRAGMA user_version` : ne jamais modifier une migration déployée, en ajouter une.
- `lib/tasks.js` — tâches, génération des occurrences (`generate()` idempotente, invalidée à chaque modif), cycle déclaré/validé/refusé. `lib/points.js` — registre `movements` (solde = SUM(delta), XP = SUM(xp)). `lib/dates.js` — dates AAAA-MM-JJ, fuseau Europe/Brussels, lundi = 1.
- `lib/game.js` — séries, bonus, badges, célébrations. `lib/push.js` — abonnements, envois, `tick()` (rappels + résumé, fenêtre de 10 min, anti-doublon `notif_log`), minuteur 1 min `unref` (`LATRIBU_PUSH=off` le coupe ; `LATRIBU_VAPID_SUBJECT` = contact transmis au service de push). `lib/settings.js` — réglages clé/valeur.
- `lib/photos.js` (photo preuve), `lib/stats.js` (semaine lundi-dimanche), `lib/templates.js` (modèles de tâches).
- `lib/shop.js` — récompenses, achats (transactions : le solde et le stock ne peuvent pas être dépassés), objectif, accessoires.
- `lib/auth.js` — sessions en base (rôle parent/enfant), empreintes, limiteurs. `lib/api.js` — routes. `lib/util.js`, `lib/security.js`.
- `public/` — `index.html`, `style.css`, `app.js` (SPA sans build, CSP sans script en ligne). `maquette/` — référence visuelle et fonctionnelle (état local, non reliée à l'API).
- `scripts/set-password.js` — secours : `npm run set-password -- <email> <mot de passe>`.

## Contraintes node-gateway
- `module.exports = app` ; `listen()` et handlers globaux uniquement sous `if (require.main === module)`.
- Chemins front/API relatifs, cookies `path=/latribu`. Pas de `process.exit()`. Exception assumée : un seul `setInterval` (1 min, `unref`, jamais d'exception) dans `lib/push.js` pour les rappels, lancé à l'import.
- Lancement local : jonction `node-gateway/apps/latribu` -> ce dépôt (déjà créée), puis `npm start` dans la passerelle (`/latribu/`). Seul : `PORT=5191 npm start`.

## Modèle de données non évident
- Session enfant persistante après le PIN (cookie longue durée), révocable par un parent.
- Tâche planifiée pour N enfants = N occurrences liées par `tid` ; répétitions : tous les jours / certains jours / chaque semaine / chaque mois / date précise. Récompense créée pour N enfants = N entrées de catalogue ; stock par enfant par défaut, ou stock partagé (compteur commun) ; limite par enfant par jour/semaine/mois ; stock réservé à la demande, rendu si refus.
- Descriptions facultatives sur tâches et récompenses ; historique points + récompenses côté enfant et parent.
- Points libres (gain, prix, ajustement) ; aucun lien avec l'euro. Accessoires payés avec le même solde.
- Tâche : moment (matin/après-midi/soir) + heure de rappel push.
- Solde = somme du registre `mouvements` (jamais d'UPDATE) ; XP séparé, ne diminue jamais.
- Achat : points ET stock réservés à la demande (movement négatif `Réservé : …`), rendus si refus (movement `Remboursé : …`, sans XP). Limite par enfant comptée sur `purchases.created_date` (hors refusés). Stock partagé = `rewards.stock` + `shared=1` ; individuel = `reward_kids.stock`. Modifier le stock d'une récompense le réinitialise.
- Occurrence = tâche x enfant x date (mission ouverte : `kid_id` NULL jusqu'à la prise, `due_date` = jour de la prise) ; statuts : à faire / en attente / validée / refusée / manquée.

## Mises à jour et déploiement
- **Tout l'état durable est dans la base SQLite** (`data/latribu.db`, ou `LATRIBU_DATA_DIR`) : comptes, enfants, points, **réglages de notification** (table `settings`), **clés VAPID**, **abonnements push par appareil**. Une mise à jour du code ne doit donc jamais écraser ce dossier : en production (copie dans `apps/latribu`), garder `data/` à part (ou définir `LATRIBU_DATA_DIR` hors du dossier déployé) et ne copier que le code.
- **Déploiement via GitHub** (détails : `docs/DEPLOIEMENT.md`) : sur le serveur, `curl -fsSL https://raw.githubusercontent.com/Gatomlo/LaTribu/main/scripts/install.sh | bash` depuis le dossier de la passerelle (clone ou `git pull --ff-only` dans `apps/latribu`, `npm install --omit=dev`, essai de chargement, `data/` jamais touché, refuse si fichiers modifiés à la main ; `REF=<commit>` pour revenir en arrière), puis redémarrer le site. Première installation : créer le compte parent par `npm run set-password` AVANT d'ouvrir le site. Déploiement automatique facultatif : `.github/workflows/ci.yml` (tests + audit à chaque push ; job SSH inactif tant que la variable de dépôt `DEPLOY_ENABLED` n'est pas `true`, secrets dans l'environnement `production`). Adresse du client : `X-Forwarded-For` (dernière entrée) n'est lue que si la connexion vient d'une adresse locale/privée ou si `LATRIBU_TRUST_PROXY=1`.
- Migrations : uniquement additives (`lib/db.js`), jouées au démarrage ; avant toute migration d'une base existante, une **sauvegarde datée** est faite dans `data/backups/` (5 conservées). Les réglages lus sont fusionnés avec des valeurs par défaut (`{...DEFAULTS, ...stocké}`) : un nouveau réglage ne réinitialise jamais les anciens.
- Clé VAPID : ne jamais la régénérer (tous les abonnements deviendraient invalides). Si la base est restaurée ou la clé change, l'app se réabonne seule à l'ouverture (`pushSync`) et le service worker gère `pushsubscriptionchange`.
- Service worker : changer `VERSION` et `FILES` dans `public/sw.js` quand un fichier est ajouté ; les abonnements push survivent aux changements de version.
- Icônes : `python scripts/make-icons.py` (Pillow) régénère l'icône de l'app (« la tribu » : trois bouilles souriantes sur dégradé violet-rose-orange, aussi dessinée en SVG), le favicon, l'icône monochrome `badge-96.png` et une icône par type de notification (`notif-reminder|ok|reward|review|alert.png`, choisies dans `lib/push.js` via `ICONS`). `tests/update.test.js` vérifie que tout ce qui est référencé existe.

## Méthode
Réponses en français. Tester par API/curl avant captures. Mettre ce fichier à jour quand l'architecture change.
