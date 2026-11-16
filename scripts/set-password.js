// Secours : (re)définit le mot de passe parent depuis le serveur, ou crée le compte s'il n'existe pas.
// Usage : npm run set-password -- <email> <mot de passe>
// (LATRIBU_DATA_DIR pour une autre base que data/.)
const { db } = require('../lib/db');
const { hashPassword } = require('../lib/auth');

(async () => {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage : npm run set-password -- <email> <mot de passe>');
    process.exit(1);
  }
  try {
    const hash = await hashPassword(password);
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (user) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    else db.prepare('INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)').run(email.toLowerCase(), hash, Date.now());
  } catch (e) { console.error(e.message); process.exit(1); }
  console.log(`Mot de passe de ${email} enregistré.`);
})();
