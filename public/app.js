// La Tribu : interface (SPA sans build). Étape 1 : installation, connexion parent/enfant,
// gestion des enfants. Les autres écrans arrivent aux étapes suivantes.
'use strict';
const $ = (s) => document.querySelector(s);
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const P = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  bag: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  gear: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  flame: '<path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z"/>',
};
const ic = (n) => `<svg class="i" viewBox="0 0 24 24">${P[n]}</svg>`;
const PAL = [['#14b8a6', '#0ea5e9'], ['#7c5cff', '#d946ef'], ['#f59e0b', '#ef4444'], ['#3b82f6', '#6366f1'], ['#ec4899', '#f43f5e'], ['#22c55e', '#14b8a6']];

// ---------- Réseau ----------
async function api(path, method = 'GET', body) {
  const res = await fetch('api/' + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Erreur réseau.'); e.status = res.status; throw e; }
  return data;
}

// ---------- État ----------
const S = { session: null, view: 'login', tab: 'home', pin: '', kidId: null, profiles: [], kids: [], sheet: null, F: {} };

function toast(m) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = m;
  $('#phone').append(t); setTimeout(() => t.remove(), 2400);
}

const avatar = (k, s = 48) => {
  const c = PAL[k.palette % PAL.length];
  return `<div class="av" style="--s:${s}px;--c1:${c[0]};--c2:${c[1]}">${esc(k.name[0].toUpperCase())}</div>`;
};
const logoBadge = () => `<div class="av" style="--s:64px;--c1:#6d5efc;--c2:#a78bfa;margin:0 auto 14px;border-radius:20px">${ic('home').replace('class="i"', 'class="i" style="width:32px;height:32px"')}</div>`;

// ---------- Démarrage ----------
async function refresh() {
  S.session = await api('session');
  if (S.session.setup) S.view = 'setup';
  else if (S.session.role === 'parent') { S.view = 'parent'; S.kids = await api('kids'); }
  else if (S.session.role === 'kid') S.view = 'kid';
  else { S.view = 'login'; S.profiles = await api('profiles'); }
  render();
}

// ---------- Rendu ----------
function render() {
  document.querySelectorAll('.sheet-bg').forEach((e) => e.remove());
  const a = $('#app'), nav = $('#nav');
  const root = document.documentElement;
  if (S.view === 'kid') { const c = PAL[S.session.kid.palette % PAL.length]; root.style.setProperty('--acc', c[0]); root.style.setProperty('--acc2', c[1]); }
  else { root.style.removeProperty('--acc'); root.style.removeProperty('--acc2'); }
  nav.innerHTML = '';

  if (S.view === 'setup') {
    a.innerHTML = `<div style="text-align:center;margin-top:36px">${logoBadge()}<h1 style="font-size:28px;letter-spacing:-.03em">Bienvenue</h1><p class="mini" style="margin-top:4px">Crée le compte parent, partagé par les deux parents.</p></div>
    <label>Adresse e-mail</label><input id="f_mail" type="email" autocomplete="username">
    <label>Mot de passe (8 caractères minimum)</label><input id="f_pw" type="password" autocomplete="new-password">
    <button class="btn full" style="margin-top:20px" data-a="setup">Créer le compte</button>`;
  } else if (S.view === 'login') {
    a.innerHTML = `<div style="text-align:center;margin-top:36px">${logoBadge()}<h1 style="font-size:30px;letter-spacing:-.03em">La Tribu</h1><p class="mini" style="margin-top:4px">Qui es-tu ?</p></div>
    ${S.profiles.length ? `<div class="who">${S.profiles.map((k) => `<button data-a="pickkid" data-id="${k.id}">${avatar(k, 64)}${esc(k.name)}</button>`).join('')}</div>`
      : '<div class="card mini" style="margin-top:20px;text-align:center">Aucun profil enfant. Un parent doit les créer dans Réglages.</div>'}
    <button class="btn ghost full" style="margin-top:16px" data-a="pickparent">Espace parents</button>`;
  } else if (S.view === 'plogin') {
    a.innerHTML = `<button class="back" data-a="tologin">‹ Retour</button><div style="margin-top:20px"><h2>Espace parents</h2><p class="mini" style="margin-top:4px">Connecte-toi pour gérer la famille.</p></div>
    <label>Adresse e-mail</label><input id="f_mail" type="email" autocomplete="username">
    <label>Mot de passe</label><input id="f_pw" type="password" autocomplete="current-password">
    <button class="btn full" style="margin-top:20px" data-a="plogin">Se connecter</button>`;
  } else if (S.view === 'pin') {
    const k = S.profiles.find((x) => x.id === S.kidId);
    a.innerHTML = `<button class="back" data-a="tologin">‹ Retour</button><div style="text-align:center;margin-top:14px;display:grid;justify-items:center;gap:10px">${avatar(k, 72)}<h2>Salut ${esc(k.name)}</h2><p class="mini">Entre ton code à 4 chiffres</p></div>
    <div class="dots">${[0, 1, 2, 3].map((i) => `<i class="${i < S.pin.length ? 'on' : ''}"></i>`).join('')}</div>
    <div class="pin">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((n) => n === '' ? '<span></span>' : `<button data-a="pin" data-n="${n}">${n}</button>`).join('')}</div>`;
  } else if (S.view === 'parent') renderParent(a, nav);
  else if (S.view === 'kid') renderKid(a, nav);

  if (S.sheet) $('#phone').insertAdjacentHTML('beforeend', `<div class="sheet-bg" data-a="closesheet"><div class="sheet">${S.sheet()}</div></div>`);
}

function tabs(list, current) {
  return `<div class="tabs">${list.map(([t, i, l]) => `<button class="${current === t ? 'on' : ''}" data-a="tab" data-t="${t}">${ic(i)}${l}</button>`).join('')}</div>`;
}
const soon = (title, text) => `<h2>${title}</h2><div class="card mini" style="margin-top:14px">${text}</div>`;

function renderKid(a, nav) {
  const k = S.session.kid, c = PAL[k.palette % PAL.length];
  nav.innerHTML = tabs([['home', 'home', 'Accueil'], ['missions', 'target', 'Missions'], ['shop', 'bag', 'Magasin'], ['me', 'user', 'Moi']], S.tab);
  const hero = `<div class="hero" style="--c1:${c[0]};--c2:${c[1]}"><div class="row">${avatar(k, 52).replace('background:linear-gradient', 'background:#ffffff33;x:linear-gradient')}<div class="sp"><small>${esc(k.name)}</small><div style="font-weight:700;font-size:18px">Niveau 1</div></div><span class="chip">${ic('flame')}0 j</span></div><div style="margin-top:16px"><small>Points</small><div class="big">0</div></div></div>`;
  if (S.tab === 'home') a.innerHTML = hero + '<div class="card mini" style="margin-top:14px">Tes missions apparaîtront ici dès que les parents en auront créé.</div>';
  else if (S.tab === 'me') a.innerHTML = hero + `<div class="card mini" style="margin-top:14px">Session ouverte sur ce téléphone : pas besoin de ressaisir ton code.</div><button class="btn ghost full" style="margin-top:18px" data-a="logout">Me déconnecter</button>`;
  else a.innerHTML = soon(S.tab === 'missions' ? 'Missions' : 'Magasin', 'Bientôt disponible.');
}

function renderParent(a, nav) {
  nav.innerHTML = tabs([['home', 'check', 'À valider'], ['tasks', 'list', 'Tâches'], ['shops', 'bag', 'Magasins'], ['kids', 'users', 'Enfants'], ['set', 'gear', 'Réglages']], S.tab);
  if (!S.kids.length && S.tab !== 'set') {
    a.innerHTML = `<div style="text-align:center;margin-top:60px"><h2>Aucun enfant pour l'instant</h2><p class="mini" style="margin:8px 0 22px">Crée le profil de chaque enfant pour lui confier des tâches.</p><button class="btn full" data-a="newkid">Ajouter un enfant</button></div>`;
    return;
  }
  if (S.tab === 'set') {
    a.innerHTML = `<h2>Réglages</h2><div class="sec">Enfants</div><div class="card" style="padding:0 14px">${S.kids.map((k) => `<div class="line">${avatar(k, 38)}<div class="sp"><b>${esc(k.name)}</b><div class="mini">${k.age ? k.age + ' ans' : ''}</div></div><button class="btn ghost sm" data-a="revoke" data-id="${k.id}">Déconnecter</button><button class="btn ko sm" data-a="delkid" data-id="${k.id}">Supprimer</button></div>`).join('')}<div class="line" data-a="newkid" style="color:var(--acc);font-weight:600">${ic('plus')}Ajouter un enfant</div></div>
    <div class="sec">Compte</div><div class="card" style="padding:0 14px"><div class="line"><div class="sp"><b>${esc(S.session.email)}</b><div class="mini">Compte partagé</div></div></div><div class="line" data-a="chpw"><div class="sp"><b>Changer le mot de passe</b></div></div></div>
    <button class="btn ghost full" style="margin-top:18px" data-a="logout">Se déconnecter</button>`;
  } else if (S.tab === 'kids') {
    a.innerHTML = `<h2>Enfants</h2>${S.kids.map((k) => `<div class="card"><div class="row">${avatar(k, 48)}<div class="sp"><b>${esc(k.name)}</b><div class="mini">${k.age ? k.age + ' ans' : ''}</div></div></div></div>`).join('')}`;
  } else a.innerHTML = soon({ home: 'À valider', tasks: 'Tâches', shops: 'Magasins' }[S.tab], 'Bientôt disponible.');
}

// ---------- Feuilles ----------
const field = (id, label, value = '', attrs = '') => `<label>${label}</label><input id="${id}" value="${esc(value)}" ${attrs}>`;
function sheetKid() {
  const F = S.F;
  return `<h2>Nouvel enfant</h2>${field('f_name', 'Prénom', F.name, 'placeholder="Prénom"')}${field('f_age', 'Âge (facultatif)', F.age, 'type="number" inputmode="numeric"')}
  <label>Couleur</label><div class="opts">${PAL.map((c, i) => `<button class="sw2 ${F.palette === i ? 'on' : ''}" style="background:linear-gradient(135deg,${c[0]},${c[1]})" data-a="palette" data-v="${i}"></button>`).join('')}</div>
  ${field('f_pin', 'Code PIN (4 chiffres)', F.pin, 'inputmode="numeric" maxlength="4" placeholder="••••"')}<p class="mini" style="margin-top:6px">L'enfant le saisit une seule fois : sa session reste ouverte sur son téléphone.</p>
  <button class="btn full" style="margin-top:18px" data-a="savekid">Créer le profil</button>`;
}
function sheetDel() {
  const k = S.kids.find((x) => x.id === S.F.id);
  return `<h2>Supprimer ${esc(k.name)} ?</h2><p class="mini" style="margin:8px 0 16px">Son profil, ses points, ses tâches, son magasin et son historique seront supprimés. Action irréversible.</p><button class="btn ko full" data-a="confirmdel">Supprimer définitivement</button><button class="btn ghost full" style="margin-top:8px" data-a="closesheet">Annuler</button>`;
}
function sheetPw() {
  return `<h2>Changer le mot de passe</h2>${field('f_cur', 'Mot de passe actuel', '', 'type="password"')}${field('f_new', 'Nouveau mot de passe (8 caractères minimum)', '', 'type="password"')}<button class="btn full" style="margin-top:18px" data-a="savepw">Enregistrer</button>`;
}
function readInputs() {
  const g = (id) => document.getElementById(id);
  if (g('f_name')) S.F.name = g('f_name').value;
  if (g('f_age')) S.F.age = g('f_age').value;
  if (g('f_pin')) S.F.pin = g('f_pin').value;
}

// ---------- Actions ----------
const val = (id) => (document.getElementById(id) || {}).value || '';
const A = {
  async setup() { await api('setup', 'POST', { email: val('f_mail'), password: val('f_pw') }); S.tab = 'home'; await refresh(); },
  async plogin() { await api('login', 'POST', { email: val('f_mail'), password: val('f_pw') }); S.tab = 'home'; await refresh(); },
  pickparent() { S.view = 'plogin'; },
  tologin() { S.view = 'login'; S.pin = ''; },
  pickkid(d) { S.kidId = Number(d.id); S.pin = ''; S.view = 'pin'; },
  async pin(d) {
    if (d.n === '⌫') S.pin = S.pin.slice(0, -1); else if (S.pin.length < 4) S.pin += d.n;
    if (S.pin.length < 4) return;
    const pin = S.pin; S.pin = '';
    try { await api(`kids/${S.kidId}/login`, 'POST', { pin }); S.tab = 'home'; await refresh(); toast('Session ouverte sur ce téléphone'); } catch (e) { toast(e.message); }
  },
  async logout() { await api('logout', 'POST', {}); S.tab = 'home'; await refresh(); },
  tab(d) { S.tab = d.t; $('#app').scrollTop = 0; },
  newkid() { S.F = { name: '', age: '', palette: S.kids.length % PAL.length, pin: '' }; S.sheet = sheetKid; },
  palette(d) { S.F.palette = Number(d.v); },
  async savekid() {
    const F = S.F;
    await api('kids', 'POST', { name: F.name, age: F.age, palette: F.palette, pin: F.pin });
    S.sheet = null; S.kids = await api('kids'); toast(`${F.name.trim()} ajouté`);
  },
  delkid(d) { S.F = { id: Number(d.id) }; S.sheet = sheetDel; },
  async confirmdel() {
    const k = S.kids.find((x) => x.id === S.F.id);
    await api(`kids/${S.F.id}`, 'DELETE'); S.sheet = null; S.kids = await api('kids'); toast(`${k.name} supprimé`);
  },
  async revoke(d) { await api(`kids/${d.id}/revoke`, 'POST', {}); toast('Appareils déconnectés'); },
  chpw() { S.sheet = sheetPw; },
  async savepw() { await api('password', 'POST', { current: val('f_cur'), next: val('f_new') }); S.sheet = null; toast('Mot de passe modifié'); },
  closesheet() { S.sheet = null; },
};

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  if (b.dataset.a === 'closesheet' && e.target !== b) return;
  const f = A[b.dataset.a];
  if (!f) return;
  readInputs();
  try { await f(b.dataset); } catch (err) { toast(err.message); if (err.status === 401 && S.view === 'parent') return refresh(); }
  render();
});

refresh().catch((e) => { $('#app').innerHTML = `<p class="mini" style="padding:24px">Impossible de joindre le serveur : ${esc(e.message)}</p>`; });
