// En-têtes de sécurité. Sur la page : politique de contenu (CSP) n'autorisant que les
// scripts de l'application (aucun script ni onclick en ligne).
function headers(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

function pagePolicy(res) {
  res.set('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; '));
}

// Les POST/PUT/PATCH/DELETE doivent être en JSON : un formulaire d'un autre site ne peut
// pas en envoyer sans CORS (protection CSRF, avec le cookie SameSite=Lax).
function jsonOnly(req, res, next) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method) || req.is('application/json')) return next();
  res.status(415).json({ error: 'Requête JSON attendue.' });
}

module.exports = { headers, pagePolicy, jsonOnly };
