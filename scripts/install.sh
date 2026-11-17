#!/usr/bin/env bash
# Installe ou met à jour La Tribu depuis GitHub dans la passerelle Node (apps/latribu).
#
#   Première installation (en SSH, depuis le dossier de la passerelle) :
#     curl -fsSL https://raw.githubusercontent.com/Gatomlo/LaTribu/main/scripts/install.sh | bash
#   ou en indiquant le dossier de la passerelle :
#     curl -fsSL https://raw.githubusercontent.com/Gatomlo/LaTribu/main/scripts/install.sh | bash -s -- /chemin/vers/node-gateway
#
#   Mise à jour : relancer la même commande (ou "bash apps/latribu/scripts/install.sh").
#   Retour en arrière : REF=<commit ou étiquette> bash apps/latribu/scripts/install.sh
#   (une exécution suivante sans REF revient sur la branche main).
#
# Le dossier data/ (base SQLite, sauvegardes, clés des notifications) n'est JAMAIS touché : il est ignoré
# par git. L'application sauvegarde elle-même la base avant toute migration (data/backups/).
set -euo pipefail

REPO="${REPO:-https://github.com/Gatomlo/LaTribu.git}"
BRANCH="${BRANCH:-main}"
REF="${REF:-}"
GW="${1:-$PWD}"
GW="$(cd "$GW" 2>/dev/null && pwd)" || { echo "Dossier introuvable : ${1:-$PWD}" >&2; exit 1; }
APP="$GW/apps/latribu"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { echo "Erreur : $*" >&2; exit 1; }

# 1. Vérifications
[ -f "$GW/server.js" ] && [ -d "$GW/apps" ] || die "« $GW » n'est pas le dossier de la passerelle (server.js et apps/ attendus).
Lance la commande depuis ce dossier ou passe son chemin en argument."
command -v git  >/dev/null || die "git est introuvable sur ce serveur."
command -v node >/dev/null || die "node est introuvable sur ce serveur."
command -v npm  >/dev/null || die "npm est introuvable sur ce serveur."
node -e 'require("node:sqlite")' 2>/dev/null \
  || die "Node $(node -v) ne fournit pas le module node:sqlite : il faut Node 22.5 ou plus (22.13+ conseillé). Change la version dans le manager."

# 2. Code : clone, mise à jour, ou reprise d'un dossier envoyé à la main (zip / SFTP)
if [ -d "$APP/.git" ]; then
  say "Mise à jour de $APP"
  cd "$APP"
  [ -z "$(git status --porcelain)" ] || die "des fichiers ont été modifiés à la main dans $APP :
$(git status --short)
Annule-les (git checkout -- .) ou sauvegarde-les, puis relance."
  git fetch --quiet --tags origin "$BRANCH"
  if [ -n "$REF" ]; then
    git checkout --quiet --detach "$REF"
  else
    git checkout --quiet "$BRANCH"
    git merge --ff-only --quiet "origin/$BRANCH"
  fi
elif [ -d "$APP" ] && [ -n "$(ls -A "$APP")" ]; then
  say "Dossier existant sans git : rattachement au dépôt (data/ conservé)"
  cd "$APP"
  git init --quiet
  git remote add origin "$REPO" 2>/dev/null || git remote set-url origin "$REPO"
  git fetch --quiet --tags origin "$BRANCH"
  git checkout --quiet -f -B "$BRANCH" "origin/$BRANCH"
  [ -z "$REF" ] || git checkout --quiet --detach "$REF"
else
  say "Installation dans $APP"
  git clone --quiet --branch "$BRANCH" "$REPO" "$APP"
  cd "$APP"
  [ -z "$REF" ] || git checkout --quiet --detach "$REF"
fi
echo "Version : $(git log -1 --format='%h %s')"

# 3. Dépendances (production seulement ; aucune n'a besoin de compilation)
say "Installation des dépendances"
npm install --omit=dev --no-audit --no-fund --loglevel=error

# 4. Essai de chargement dans un dossier de données jetable (la vraie base n'est pas touchée)
say "Vérification"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
LATRIBU_DATA_DIR="$TMP" LATRIBU_PUSH=off node -e 'require("./server"); console.log("Le code se charge correctement.")' \
  || die "le code ne se charge pas. Ne redémarre pas le site : la version qui tourne actuellement reste active tant que tu ne le fais pas."

# 5. Suite
say "Terminé."
if [ -f "$APP/data/latribu.db" ]; then
  echo "Mise à jour : la base existante est conservée (sauvegarde automatique avant migration dans data/backups/)."
  cat <<EOF

Reste à faire :
  Redémarrer le site Node.js depuis le manager Infomaniak.
EOF
else
  cat <<EOF

Première installation. Reste à faire, dans cet ordre :
  1. Créer le compte parent AVANT d'ouvrir le site (sinon le premier visiteur pourrait le créer) :
       cd "$APP" && npm run set-password -- <ton-email> <un-mot-de-passe-de-8-caracteres-ou-plus>
  2. Dans le manager Infomaniak, ajouter ces variables d'environnement du site Node.js :
       LATRIBU_VAPID_SUBJECT=mailto:<ton-email>   (contact transmis aux services de notification)
       LATRIBU_TRUST_PROXY=1                      (conseillé derrière un proxy : adresse réelle des visiteurs pour les limites de tentatives)
  3. Redémarrer le site Node.js, puis ouvrir https://<ton-domaine>/latribu/ et te connecter.
  4. Créer les enfants dans Réglages, puis installer l'app sur chaque téléphone (écran d'accueil)
     et activer les notifications.
EOF
fi
cat <<EOF

Mettre à jour plus tard : relancer cette même commande, puis redémarrer le site.
Sauvegarde : conserve le dossier $APP/data (base + sauvegardes automatiques).
EOF
