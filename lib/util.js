// Outils communs : erreurs HTTP attendues et limiteur de tentatives en mémoire.
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

// Compteur de tentatives sur une fenêtre glissante (clé -> horodatages récents). Les clés
// oubliées sont purgées au-delà de 5000 entrées (pas de croissance mémoire illimitée).
function limiter(windowMs) {
  const hits = new Map();
  const prune = () => { const now = Date.now(); for (const [k, list] of hits) if (!list.some((t) => now - t < windowMs)) hits.delete(k); };
  const recent = (key) => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length) hits.set(key, list); else hits.delete(key);
    return list;
  };
  return {
    hit(key) { if (hits.size > 5000) prune(); const list = recent(key); list.push(Date.now()); hits.set(key, list); },
    count: (key) => recent(key).length,
    reset: (key) => { hits.delete(key); },
  };
}

// Texte saisi : doit être une chaîne (jamais un objet ou un tableau), nettoyé, de longueur bornée.
// multiline : les retours à la ligne sont conservés (descriptions).
function text(value, label, { max = 80, required = false, multiline = false } = {}) {
  if (value === undefined || value === null) {
    if (required) throw httpError(400, `${label} : requis.`);
    return '';
  }
  if (typeof value !== 'string') throw httpError(400, `${label} : texte attendu.`);
  const t = multiline ? value.trim() : value.trim().replace(/\s+/g, ' ');
  if (required && !t) throw httpError(400, `${label} : requis.`);
  if (t.length > max) throw httpError(400, `${label} : ${max} caractères maximum.`);
  return t;
}

// Emoji : uniquement des pictogrammes (jamais du HTML) ; valeur par défaut si invalide.
const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200d|\ufe0f|\u20e3){1,12}$/u;
const emoji = (value, fallback) => (typeof value === 'string' && EMOJI.test(value.trim()) ? value.trim() : fallback);

// Entier strictement positif ou erreur 400.
function positiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `${label} : nombre entier positif attendu.`);
  return n;
}

module.exports = { httpError, limiter, positiveInt, text, emoji };
