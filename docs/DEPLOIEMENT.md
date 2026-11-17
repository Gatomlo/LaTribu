# Déploiement de La Tribu (GitHub → serveur)

La Tribu se déploie comme les autres outils : un clone git dans `apps/latribu` de la passerelle Node
(`node-gateway`), mis à jour par `scripts/install.sh`. Les données (`data/`) ne sont **jamais** touchées.

## 1. Première installation (une fois, en SSH)

Depuis le dossier de la passerelle sur le serveur :

```bash
curl -fsSL https://raw.githubusercontent.com/Gatomlo/LaTribu/main/scripts/install.sh | bash
```

(ou `… | bash -s -- /chemin/vers/node-gateway` depuis un autre dossier). Le script vérifie Node (module
`node:sqlite`), clone le dépôt dans `apps/latribu`, installe les dépendances de production, charge le code
dans un dossier jetable pour s'assurer qu'il démarre, puis affiche la suite :

1. **Créer le compte parent AVANT d'ouvrir le site** (sinon le premier visiteur pourrait le créer) :
   `cd apps/latribu && npm run set-password -- <email> <mot de passe de 8 caractères ou plus>`
2. **Variables d'environnement** du site Node.js (manager Infomaniak) :

   | Variable | Rôle |
   |---|---|
   | `LATRIBU_VAPID_SUBJECT` | `mailto:<ton e-mail>` : contact transmis aux services de notification |
   | `LATRIBU_TRUST_PROXY` | `1` derrière un proxy : adresse réelle des visiteurs pour les limites de tentatives |
   | `LATRIBU_DATA_DIR` | (facultatif) dossier de données ailleurs que `apps/latribu/data` |
   | `LATRIBU_PUSH` | `off` coupe les notifications planifiées (déconseillé en production) |
   | `LATRIBU_PUSH_HOSTS` | (facultatif) hôtes de push supplémentaires, séparés par des virgules |

3. **Redémarrer le site Node.js** (manager), ouvrir `https://<domaine>/latribu/`, se connecter.
4. Créer les enfants dans Réglages, installer l'app sur chaque téléphone (écran d'accueil) et activer les
   notifications.

### Variante : à la main avec `git clone` (sans le script)

Depuis le dossier de la passerelle sur le serveur :

```bash
git clone https://github.com/Gatomlo/LaTribu.git apps/latribu
cd apps/latribu
npm install --omit=dev
npm run set-password -- <email> <mot de passe de 8 caractères ou plus>   # compte parent, AVANT d'ouvrir le site
```

Puis variables d'environnement et redémarrage du site (étapes 2 et 3 ci-dessus). Mise à jour :

```bash
cd apps/latribu && git pull --ff-only && npm install --omit=dev
```

puis redémarrer le site. `data/` est ignoré par git : le `git pull` ne le touche pas.

## 2. Mise à jour manuelle

Relancer la même commande (ou `bash apps/latribu/scripts/install.sh` depuis la passerelle), puis redémarrer le
site. Le script refuse de continuer si des fichiers ont été modifiés à la main dans `apps/latribu` (il les liste).
Avant toute migration de la base, l'app fait une sauvegarde datée dans `data/backups/` (5 conservées).

**Retour en arrière** : `REF=<commit ou étiquette> bash apps/latribu/scripts/install.sh`, puis redémarrer.
Une exécution suivante sans `REF` revient sur `main`. (Une base déjà migrée vers une version plus récente ne se
« dé-migre » pas : restaurer au besoin la sauvegarde de `data/backups/`.)

## 3. Déploiement automatique à chaque push sur `main` (facultatif)

Le workflow `.github/workflows/ci.yml` :

- **toujours** : lance les tests (`npm test`) et l'audit des dépendances sur chaque push et pull request ;
- **si activé** : après des tests réussis sur `main`, se connecte en SSH au serveur et y exécute le
  `install.sh` du commit testé (`REF=<commit>`). Il ne redémarre le site que si une commande est configurée.

Prérequis : **un accès SSH à l'hébergement** (déjà nécessaire pour la première installation).

### Mise en place (une fois)

1. **Clé dédiée au déploiement** (sur ton PC) :

   ```bash
   ssh-keygen -t ed25519 -f latribu_deploy -C "github-actions-latribu" -N ""
   ```

   Ajouter `latribu_deploy.pub` aux clés autorisées du serveur (`~/.ssh/authorized_keys`).
2. **Empreinte du serveur** : `ssh-keyscan -t ed25519 <hôte>` (à vérifier à la main la première fois).
3. **Environnement GitHub « production »** (Settings > Environments) : y créer ces *secrets* :
   `DEPLOY_HOST` (hôte SSH), `DEPLOY_USER`, `DEPLOY_PATH` (dossier de la passerelle sur le serveur),
   `DEPLOY_SSH_KEY` (contenu de `latribu_deploy`), `DEPLOY_KNOWN_HOSTS` (sortie de `ssh-keyscan`).
   Optionnel : « Required reviewers » pour valider chaque déploiement à la main. En ligne de commande :

   ```bash
   gh secret set DEPLOY_HOST --env production --repo Gatomlo/LaTribu
   gh secret set DEPLOY_USER --env production --repo Gatomlo/LaTribu
   gh secret set DEPLOY_PATH --env production --repo Gatomlo/LaTribu
   gh secret set DEPLOY_SSH_KEY --env production --repo Gatomlo/LaTribu < latribu_deploy
   ssh-keyscan -t ed25519 <hôte> | gh secret set DEPLOY_KNOWN_HOSTS --env production --repo Gatomlo/LaTribu
   ```

4. **Activer** : variable de dépôt `DEPLOY_ENABLED=true`
   (`gh variable set DEPLOY_ENABLED --body true --repo Gatomlo/LaTribu`).
   Variable facultative `RESTART_CMD` : commande exécutée en SSH après le déploiement pour redémarrer le site,
   si l'hébergement en propose une (sinon redémarrer depuis le manager).
5. Détruire la clé privée locale une fois enregistrée dans GitHub.

Désactiver : supprimer la variable `DEPLOY_ENABLED` (ou la mettre à autre chose que `true`).

### Bonnes pratiques

- Restreindre la clé côté serveur (`command="…",no-port-forwarding,no-pty` devant la clé dans `authorized_keys`)
  si l'hébergeur le permet.
- Le dépôt est public : aucun secret ne doit y figurer (les secrets sont dans l'environnement « production »).
- Protéger `main` (Settings > Branches : tests obligatoires avant fusion).

## 4. Données et sauvegardes

- `data/` (base `latribu.db`, `backups/`) est ignoré par git : jamais écrasé par une mise à jour. Il contient aussi
  les clés des notifications : **ne pas le supprimer** (sinon tous les téléphones devraient se réabonner).
- Copier régulièrement `apps/latribu/data/` hors du serveur (ou avec la sauvegarde de la passerelle).

## 5. Dépannage

| Message / symptôme | Cause et remède |
|---|---|
| « ne fournit pas le module node:sqlite » | Node trop ancien : choisir Node 22.13+ dans le manager. |
| « des fichiers ont été modifiés à la main » | `cd apps/latribu && git checkout -- .` puis relancer. |
| « le code ne se charge pas » | Lire l'erreur affichée ; le site en cours n'est pas touché tant qu'on ne le redémarre pas. |
| Notifications sans effet | Site non servi en HTTPS, ou app non installée sur l'écran d'accueil (iPhone). |
| Beaucoup de « Trop de tentatives » | `LATRIBU_TRUST_PROXY=1` manquant : tous les visiteurs apparaissent avec l'adresse du proxy. |
