// Outils communs : erreurs HTTP attendues et limiteur de tentatives en mémoire.
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

// Compteur de tentatives sur une fenêtre glissante (clé -> horodatages récents).
function limiter(windowMs) {
  const hits = new Map();
  const recent = (key) => {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length) hits.set(key, list); else hits.delete(key);
    return list;
  };
  return {
    hit(key) { const list = recent(key); list.push(Date.now()); hits.set(key, list); },
    count: (key) => recent(key).length,
    reset: (key) => { hits.delete(key); },
  };
}

// Entier strictement positif ou erreur 400.
function positiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `${label} : nombre entier positif attendu.`);
  return n;
}

module.exports = { httpError, limiter, positiveInt };
