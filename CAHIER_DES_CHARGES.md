# La Tribu — Cahier des charges (v0.1)

## 1. Objectif
Application familiale privée pour confier des **tâches** (récurrentes ou ponctuelles) aux enfants. Ils gagnent des **points** en les réalisant, puis les dépensent dans un **magasin** de récompenses propre à chaque enfant. Ambiance ludique mais **sobre et moderne** (pas d'esthétique « bébé »), **smartphone first**. Les points n'ont **aucune équivalence en euros**.

## 2. Utilisateurs
| Rôle | Description |
|---|---|
| **Parents** | Un compte partagé par les deux parents. Crée tâches et récompenses, valide, ajuste les points. |
| **Enfant** | Profils **créés et supprimés par les parents dans les réglages** (aucun enfant en dur dans l'app). Accès par profil + code PIN. Voit ses tâches, son solde, son magasin. |

Interface identique pour les deux, au style sobre (thème clair/sombre automatique, icônes linéaires, peu d'emojis), avec une **couleur d'accent propre à chaque profil**. Textes courts, pictogramme sur chaque tâche.

## 3. Fonctions

### 3.1 Accès et gestion des enfants
- Parents : **e-mail + mot de passe** du compte famille, partagé par les deux parents. Session longue sur l'appareil, changement de mot de passe depuis les réglages.
- Enfants : écran « Qui es-tu ? » (avatars), puis PIN à 4 chiffres défini par le parent à la création du profil. Verrouillage temporaire après 5 essais faux. **Une fois le PIN saisi, la session reste ouverte sur le téléphone de l'enfant** (cookie de longue durée) : il n'a pas à le ressaisir à chaque ouverture. Elle ne se ferme que si l'enfant se déconnecte ou si un parent la révoque (suppression du profil ou « déconnecter les appareils »). Session limitée à ses propres données, sans accès aux écrans parents.
- **Création / suppression des enfants** : dans les réglages parents (prénom, âge facultatif, couleur, PIN). La suppression demande confirmation et efface profil, points, tâches, magasin et historique.
- Un parent peut « passer en mode enfant » et revenir au mode parent par son propre code.

### 3.2 Tâches
Champs : titre, icône, **description facultative**, **points (valeur libre, entier > 0)**, **enfant(s) concerné(s)**, type, répétition, **moment de la journée**, **rappel**, validation.

**Moment de la journée** : *Matin*, *Après-midi*, *Soir* ou *Dans la journée*. L'accueil de l'enfant regroupe ses tâches par moment et met en avant le moment en cours. Choisir un moment propose une heure de rappel par défaut (07:30, 16:30, 18:30), modifiable.

**Rappels** : chaque tâche peut avoir une heure de rappel (valable pour sa répétition ou pour sa date). Une notification push est envoyée sur le téléphone de l'enfant concerné ; un second rappel optionnel part si la tâche n'est pas faite 1 h plus tard.

Types :
1. **Planifiée**, pour **un enfant, plusieurs ou tous** (une occurrence individuelle est générée pour chacun, chacun valide la sienne). Répétition au choix :
   - *Tous les jours* ;
   - *Certains jours* : lundi, mardi… (sélection multiple) ;
   - *Chaque semaine* : le jour choisi ;
   - *Chaque mois* : le jour du mois choisi ;
   - *Date précise* : tâche ponctuelle à une date donnée (bonus possible si faite avant).
2. **Ouverte** :
   - *Premier arrivé* : visible par plusieurs enfants, le premier qui la prend la verrouille (déverrouillage possible si abandon).
   - *Partagée* : chaque enfant concerné obtient sa propre occurrence.

Cycle d'une occurrence : `à faire → en attente de validation → validée` (ou `refusée` avec motif, retour à `à faire`) ; `manquée` si l'échéance passe.
- L'enfant déclare « fait » (photo optionnelle, activable par tâche) ; le **parent valide ou refuse** ; les points sont crédités à la validation.
- Notifications push : au parent à chaque déclaration (désactivable) et en rappel quotidien de validation (heure réglable) ; à l'enfant pour ses rappels de tâches et à chaque décision.

### 3.3 Points, niveaux, pénalités
- **Valeurs libres** : les points d'une tâche, le prix d'une récompense et les ajustements manuels (bonus ou pénalité, avec motif) sont saisis librement, sans barème imposé.
- **Solde** (points dépensables) : registre de mouvements (gains, dépenses, pénalités, ajustements), jamais modifié, seulement complété. Le solde ne descend pas sous 0 *(à confirmer)*.
- **XP** : cumul des gains uniquement, **ne diminue jamais** et ne se dépense pas. Détermine le **niveau**.
- **Pénalités** : le parent retire des points avec un motif (visible par l'enfant). Peut aussi être liée à une tâche manquée (option par tâche).
- **Séries (streaks)** : jours consécutifs où toutes les tâches du jour sont faites ; bonus de points à paliers (3, 7, 14, 30 jours).
- **Badges** : débloqués automatiquement (première tâche, 7 jours d'affilée, 100 points, etc.) et attribuables manuellement par le parent.

### 3.4 Magasin (par enfant)
- Catalogue propre à chaque enfant : titre, icône, **description facultative**, **prix libre en points**. **Un seul bouton « Ajouter »** : le formulaire permet de choisir pour quel(s) enfant(s) la récompense est créée (un seul, plusieurs ou tous) ; une entrée est alors créée dans chaque catalogue concerné, ensuite modifiable séparément.
- **Limites et stock** (deux mécanismes distincts, réglés dans le formulaire de la récompense) :
  - **Limite par enfant** : aucune, 1 par jour, 1 par semaine ou 1 par mois. Chaque enfant a son propre compteur (semaine du lundi au dimanche, mois civil). Quand elle est atteinte, le bouton d'achat affiche « Déjà pris cette semaine » (ou jour / mois).
  - **Stock** (facultatif, vide = illimité) : par défaut **par enfant** (chacun son stock). Si la récompense est créée pour plusieurs enfants, la case **« Stock partagé entre les enfants »** crée un **stock commun** : le premier qui achète l'épuise pour les autres (« Épuisé »).
  - Le stock est **réservé à la demande d'achat** (comme les points) et **rendu si le parent refuse**.
  - Durée de validité et désactivation d'une récompense : possibles à terme.
- **Achat soumis à approbation** : l'enfant « achète », les points sont **réservés**, le parent confirme la remise (ou refuse : points rendus). Historique des achats.
- **Objectif d'épargne** : l'enfant épingle une récompense visée, voit sa progression sur l'accueil.
- Historique des demandes visible côté enfant et côté parent (voir §3.6).

### 3.5 Avatar et ambiance
- Avatar à initiale et couleur du profil, personnalisable par des **accessoires** (casque, lunettes, casquette, couronne…) **achetés avec les mêmes points que les récompenses**, onglet « Accessoires » du magasin. Achat immédiat, sans validation parent ; un accessoire porté à la fois. Catalogue d'accessoires commun, prix libres côté parent.
- Micro-animations discrètes, confettis à la validation, montée de niveau célébrée, sons **optionnels** (coupés par défaut).

### 3.6 Historique
- **Deux vues** dans une feuille unique, sans encombrer les écrans : *Points* (gains, dépenses, pénalités, ajustements, avec date et motif) et *Récompenses* (demandes d'achat avec date et statut : en attente, remise, refusée).
- Côté enfant : un **aperçu des 3 derniers mouvements** dans « Moi », avec « Tout voir » vers l'historique complet.
- Côté parent : bouton « Historique » sur la fiche de chaque enfant (onglet Enfants).
- Alimenté par le registre `mouvements` et la table `achats` ; lecture seule.

### 3.7 Écrans
**Enfant** : Accueil (solde, niveau/XP, série, objectif, tâches du jour regroupées par moment) · Missions (ouvertes, ponctuelles à venir) · Magasin (récompenses / accessoires) · Moi (rappels, badges, aperçu de l'historique).
**Parent** : À valider (missions, demandes d'achat) · Tâches (liste, création/édition) · Magasins (bouton unique « Ajouter », par enfant + accessoires) · Enfants (solde, ajustement libre, historique, voir comme l'enfant) · Réglages (**création et suppression des enfants**, notifications parents, compte et mot de passe).

## 4. Exigences non fonctionnelles
- **Smartphone first**, PWA installable, grandes zones tactiles (≥ 48 px), navigation par barre d'onglets en bas, thème clair/sombre.
- Fluidité : actions optimistes, animations 60 fps, chargement < 2 s sur 4G.
- Français uniquement. Fuseau Europe/Bruxelles (génération des occurrences à minuit local).
- Données privées d'une famille : pas de pistage ni de service tiers. Photos de preuve stockées localement et purgées après validation (délai configurable).
- Sécurité : PIN hachés, limitation des essais, CSRF, un enfant ne peut lire/écrire que ses propres données.

## 5. Architecture technique
Calquée sur le Cabas (`listes-courses`) pour un montage dans **node-gateway** :
- Node ≥ 22.5, Express, **SQLite** (`node:sqlite`), front SPA PWA en JS vanilla modules (sans build) ou léger framework — à trancher.
- `server.js` exporte l'app Express (`module.exports = app`), n'appelle `listen()` que sous `if (require.main === module)`, **aucun** `process.exit()`/`setInterval` global hors de ce bloc (process partagé dans la passerelle).
- Monté sur `/latribu` : **tous les chemins du front et de l'API sont relatifs** ; cookies avec `path=/latribu`.
- Planificateur d'occurrences : exécuté à la demande (à la première requête du jour + à l'ouverture) plutôt qu'avec un `setInterval` global.
- Données dans `data/` (non versionné), sauvegardable.
- Déploiement : copie dans `apps/latribu` de la passerelle (jonction en local), Infomaniak.

## 6. Modèle de données (tables)
`familles` · `parents` · `enfants` (pin_hash, avatar, style, xp) · `taches` (type, recurrence json, moment : matin/apres/soir/null, rappel_heure, echeance, bonus, validation, photo_requise, penalite) · `taches_enfants` · `occurrences` (tache, enfant, date, statut, preuve, motif) · `mouvements` (enfant, delta, motif, ref_type, ref_id, date) · `recompenses` (titre, description, prix, limite_periode, stock, stock_partage, actif) · `recompenses_enfants` (récompense, enfant, stock individuel restant) · `achats` (statut : demande / remis / refuse) · `objectifs` · `badges` · `badges_enfants` · `accessoires` · `accessoires_enfants` (porté) · `push_abonnements` (par appareil) · `notifications`.

## 7. Étapes
1. Socle : dépôt, comptes parent, profils enfants + PIN, montage gateway.
2. Tâches : création, récurrences, génération des occurrences, déclaration, validation, registre de points.
3. Magasin : catalogues, achats avec approbation, limites, objectif d'épargne.
4. Ludique : niveaux/XP, séries, badges, avatar, animations.
5. Notifications push planifiées (Web Push + VAPID, comme le Cabas, planificateur sans `setInterval` global), PWA hors ligne, polish.

## 8. Points à confirmer
- Solde plancher à 0 (hypothèse retenue) ou négatif possible après pénalité ?
- Rappels : un seul par tâche (hypothèse) ou possibilité d'en cumuler ?
- Sur iPhone, le push exige l'installation de la PWA sur l'écran d'accueil (iOS ≥ 16.4) : acceptable ?

Maquette interactive : `maquette/index.html` (servir avec `npx http-server maquette -p 5190`).
