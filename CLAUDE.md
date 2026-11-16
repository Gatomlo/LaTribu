# La Tribu

## Objectif
App familiale privée (parents = un compte partagé e-mail + mot de passe ; enfants créés/supprimés dans les réglages, jamais en dur) : tâches récurrentes/ponctuelles confiées aux enfants, points gagnés après validation parent, magasin de récompenses par enfant, ambiance ludique (niveaux, séries, badges, avatar à accessoires achetés en points), style sobre. Smartphone first. Spécifications : `CAHIER_DES_CHARGES.md`. Maquette interactive : `maquette/index.html` (`npx http-server maquette -p 5190`) ; état gardé dans le navigateur (localStorage), « Réinitialiser » dans Réglages, démo chargeable depuis l'état vide.

## Stack (cible)
Node >= 22.5, Express, SQLite (`node:sqlite`), front PWA. Calquée sur `../listes-courses` (Cabas). Monté dans `../node-gateway` sous `/latribu`.

## État
Phase cahier des charges + maquette (aucun code applicatif).

## Contraintes node-gateway
- `module.exports = app` ; `listen()` et handlers globaux uniquement sous `if (require.main === module)`.
- Chemins front/API relatifs, cookies `path=/latribu`. Pas de `process.exit()` ni `setInterval` global.
- Lancement local : jonction `node-gateway/apps/latribu` -> ce dépôt, puis `npm start` dans la passerelle.

## Modèle de données non évident
- Session enfant persistante après le PIN (cookie longue durée), révocable par un parent.
- Tâche planifiée pour N enfants = N occurrences liées par `tid` ; répétitions : tous les jours / certains jours / chaque semaine / chaque mois / date précise. Récompense créée pour N enfants = N entrées de catalogue ; stock par enfant par défaut, ou stock partagé (compteur commun) ; limite par enfant par jour/semaine/mois ; stock réservé à la demande, rendu si refus.
- Descriptions facultatives sur tâches et récompenses ; historique points + récompenses côté enfant et parent.
- Points libres (gain, prix, ajustement) ; aucun lien avec l'euro. Accessoires payés avec le même solde.
- Tâche : moment (matin/après-midi/soir) + heure de rappel push.
- Solde = somme du registre `mouvements` (jamais d'UPDATE) ; XP séparé, ne diminue jamais.
- Achat : points réservés à la demande, rendus si refus.
- Occurrence = tâche x enfant x date ; statuts : à faire / en attente / validée / refusée / manquée.

## Méthode
Réponses en français. Tester par API/curl avant captures. Mettre ce fichier à jour quand l'architecture change.
