// La Tribu : interface (SPA sans build). Étapes 1-2 : connexion, enfants, tâches, validation, points.
// Magasin, notifications et ludique arrivent aux étapes suivantes.
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
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  chevl: '<polyline points="15 18 9 12 15 6"/>',
  chevr: '<polyline points="9 18 15 12 9 6"/>',
};
const ic = (n) => `<svg class="i" viewBox="0 0 24 24">${P[n]}</svg>`;
const PAL = [['#14b8a6', '#0ea5e9'], ['#7c5cff', '#d946ef'], ['#f59e0b', '#ef4444'], ['#3b82f6', '#6366f1'], ['#ec4899', '#f43f5e'], ['#22c55e', '#14b8a6']];
const MOMENTS = [['matin', 'Matin'], ['apres', 'Après-midi'], ['soir', 'Soir']];
const MOMENT_REMIND = { matin: '07:30', apres: '16:30', soir: '18:30' };
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const REPEATS = [['daily', 'Tous les jours'], ['days', 'Certains jours'], ['weekly', 'Chaque semaine'], ['monthly', 'Chaque mois'], ['date', 'Date précise']];
const ICONS = ['🛏️', '🍽️', '📚', '🧹', '🗑️', '🐶', '🧺', '🌱', '✨'];

// ---------- Réseau ----------
async function api(path, method = 'GET', body) {
  let res;
  try {
    res = await fetch('api/' + path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    S.offline = true;
    const e = new Error('Pas de connexion.'); e.network = true; throw e;
  }
  if (S.offline) { S.offline = false; setTimeout(() => qFlush(), 0); } // le réseau est revenu : envoi des missions en attente
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Erreur réseau.'); e.status = res.status; throw e; }
  return data;
}

// ---------- État ----------
const S = { session: null, view: 'login', tab: 'home', pin: '', kidId: null, profiles: [], kids: [], tasks: [], review: [], me: null, missions: { today: [], open: [], upcoming: [] }, hist: [], shop: { rewards: [], accessories: [] }, purchases: [], rewards: [], accessories: [], pending: [], shopSeg: 'rew', settings: { streakBonus: {}, notif: { alert: true, digest: '20:00', remindAgain: true }, photo: { enabled: false, keepDays: 7 } }, templates: [], taskDraft: null, offline: false, push: 'unknown', fx: false, sheet: null, F: {} };

function toast(m) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = m;
  $('#phone').append(t); setTimeout(() => t.remove(), 2400);
}
function confetti() {
  const p = $('#phone'), cs = ['#8b7bff', '#3dd68c', '#f5b84a', '#ff6b70', '#38bdf8'];
  for (let i = 0; i < 22; i++) {
    const c = document.createElement('span'); c.className = 'conf'; c.style.background = cs[i % 5]; c.style.left = '50%'; c.style.top = '40%';
    c.style.setProperty('--dx', (Math.random() * 400 - 200) + 'px'); c.style.setProperty('--dy', (Math.random() * 360 - 100) + 'px');
    p.append(c); setTimeout(() => c.remove(), 1200);
  }
}
const dl = (ts) => {
  if (!ts) return '';
  const n = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 864e5);
  return n <= 0 ? "Aujourd'hui" : n === 1 ? 'Hier' : new Date(ts).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' });
};

const avatar = (k, s = 48) => { const c = PAL[k.palette % PAL.length]; return `<div class="av" style="--s:${s}px;--c1:${c[0]};--c2:${c[1]}">${esc(k.name[0].toUpperCase())}${k.accessory ? `<em>${esc(k.accessory)}</em>` : ''}</div>`; };
const heroAvatar = (k, s = 52) => `<div class="av" style="--s:${s}px;--c1:#ffffff40;--c2:#ffffff22">${esc(k.name[0].toUpperCase())}${k.accessory ? `<em>${esc(k.accessory)}</em>` : ''}</div>`;
const logoBadge = () => `<div class="av" style="--s:64px;--c1:#6d5efc;--c2:#a78bfa;margin:0 auto 14px;border-radius:20px">${ic('home').replace('class="i"', 'class="i" style="width:32px;height:32px"')}</div>`;
const kidName = (id) => (S.kids.find((k) => k.id === id) || { name: '?' }).name;

// ---------- Chargement ----------
async function loadData() {
  if (S.view === 'parent') {
    [S.kids, S.review, S.pending] = await Promise.all([api('kids'), api('review'), api('purchases/pending')]);
    if (S.tab === 'tasks' || S.sheet) S.tasks = await api('tasks');
    if (S.tab === 'shops' || S.sheet) [S.rewards, S.accessories] = await Promise.all([api('rewards'), api('accessories')]);
    if (S.tab === 'set') S.settings = await api('settings');
  } else if (S.view === 'kid') {
    [S.me, S.missions] = await Promise.all([api('me'), api('me/missions')]);
    const cel = S.me.celebrate; // niveau gagné ou badge obtenu depuis la dernière ouverture
    if (!S.sheet && (cel.levelUp || cel.badges.length)) { S.sheet = sheetCelebrate; S.fx = true; }
    applyQueued(); kidCacheSave();
    if (S.tab === 'shop') [S.shop, S.purchases] = await Promise.all([api('me/shop'), api('me/purchases')]);
    if (S.tab === 'me') [S.hist, S.purchases] = await Promise.all([api('me/history'), api('me/purchases')]);
  }
}
async function refresh() {
  try { S.session = await api('session'); } catch (e) {
    const cache = e.network && kidCacheLoad(); // hors connexion : l'enfant retrouve sa dernière vue
    if (!cache) throw e;
    S.session = cache.session; S.view = 'kid'; S.me = cache.me; S.missions = cache.missions; applyQueued(); render();
    return;
  }
  if (S.session.setup) S.view = 'setup';
  else if (S.session.role === 'parent') S.view = 'parent';
  else if (S.session.role === 'kid') S.view = 'kid';
  else { S.view = 'login'; S.profiles = await api('profiles'); }
  await loadData();
  render();
  if (S.view === 'parent' || S.view === 'kid') pushRefresh();
  if (S.view === 'kid') qFlush();
}

// ---------- Rendu ----------
function render() {
  document.querySelectorAll('.sheet-bg').forEach((e) => e.remove());
  const a = $('#app'), nav = $('#nav'), root = document.documentElement;
  if (S.view === 'kid' && S.me) { const c = PAL[S.me.palette % PAL.length]; root.style.setProperty('--acc', c[0]); root.style.setProperty('--acc2', c[1]); }
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
    ${gatewayBlock()}
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
  else if (S.view === 'kid' && S.me) renderKid(a, nav);

  if (S.sheet) $('#phone').insertAdjacentHTML('beforeend', `<div class="sheet-bg" data-a="closesheet"><div class="sheet">${S.sheet()}</div></div>`);
  if (S.fx) { S.fx = false; confetti(); beep(); }
}

// Connexion par la plateforme (node-gateway) : bouton si un compte parent est lié, explication sinon.
function gatewayBlock() {
  const g = S.session && S.session.gateway;
  if (S.session && S.session.setupClosed) return '<div class="card mini" style="margin-top:16px">Aucun compte parent pour l\'instant. Il se crée en SSH (<code>npm run set-password</code>) ou depuis la plateforme par un administrateur.</div>';
  if (!g) return '';
  if (g.admin && g.linked) return `<button class="btn full" style="margin-top:16px" data-a="gwlogin">Continuer avec la plateforme · ${esc(g.name)}</button>`;
  if (g.admin) return `<div class="card mini" style="margin-top:16px">Connecté à la plateforme comme ${esc(g.name)}, mais aucun compte parent n'est lié. L'administrateur de la plateforme doit indiquer l'e-mail du compte parent dans « compte local » (La Tribu).</div>`;
  return `<div class="card mini" style="margin-top:16px">Connecté à la plateforme comme ${esc(g.name)} : l'espace parents demande le droit « admin » sur La Tribu.</div>`;
}

function tabs(list, current, badges = {}) {
  return `<div class="tabs">${list.map(([t, i, l]) => `<button class="${current === t ? 'on' : ''}" data-a="tab" data-t="${t}">${ic(i)}${l}${badges[t] ? `<b class="badge">${badges[t]}</b>` : ''}</button>`).join('')}</div>`;
}
const soon = (title) => `<h2>${title}</h2><div class="card mini" style="margin-top:14px">Bientôt disponible.</div>`;
const emptyCard = (text) => `<div class="card mini">${text}</div>`;

// ---------- Enfant ----------
function stepList(o, can) {
  if (!o.steps || !o.steps.length) return '';
  const n = o.steps.filter((x) => x.checked).length, each = o.stepsMode === 'each', done = o.status === 'done';
  const mark = (x) => (done && each ? (x.approved ? '☑' : '✗') : x.checked ? '☑' : '☐');
  return `<div style="margin-top:6px">${o.steps.map((x) => `<button class="mini" ${can ? `data-a="step" data-id="${o.id}" data-step="${x.id}" data-on="${x.checked ? 0 : 1}"` : 'disabled'} style="display:flex;gap:8px;align-items:center;text-align:left;padding:5px 0;width:100%;${x.checked ? 'text-decoration:line-through;opacity:.7' : ''}"><span aria-hidden="true">${mark(x)}</span><span class="sp">${esc(x.label)}</span>${each ? `<b>+${x.points}</b>` : ''}</button>`).join('')}<div class="mini">${n}/${o.steps.length}${each && !done ? ' · les sous-tâches non faites ne rapportent rien' : ''}</div></div>`;
}
// Validation parent : en mode « points par sous-tâche », chaque sous-tâche cochée se valide ou non (décochée = perdue).
const desel = (S.desel = {});
const reviewPts = (o) => (o.stepsMode === 'each' ? o.steps.filter((x) => x.checked && !(desel[o.id] || []).includes(x.id)).reduce((n, x) => n + x.points, 0) : o.points);
function reviewSteps(o) {
  if (o.stepsMode !== 'each') return stepList(o, false);
  return `<div style="margin-top:6px">${o.steps.map((x) => {
    const on = x.checked && !(desel[o.id] || []).includes(x.id);
    return `<button class="mini" ${x.checked ? `data-a="rvstep" data-id="${o.id}" data-step="${x.id}"` : 'disabled'} style="display:flex;gap:8px;align-items:center;text-align:left;padding:5px 0;width:100%;${x.checked ? '' : 'opacity:.5'}"><span aria-hidden="true">${on ? '☑' : x.checked ? '☐' : '✗'}</span><span class="sp">${esc(x.label)}${x.checked ? '' : ' (non faite)'}</span><b>+${x.points}</b></button>`;
  }).join('')}</div>`;
}
function missionRow(o, interactive) {
  const st = o.status, can = interactive && (st === 'todo' || st === 'refused');
  const icon = st === 'done' ? ic('check') : st === 'wait' ? ic('clock') : '';
  return `<div class="task ${st === 'refused' ? '' : st}"><div class="ic">${esc(o.icon)}</div><div class="sp"><b>${esc(o.title)}</b>
    <small>${esc(o.label)}${o.photoRequired && (st === 'todo' || st === 'refused') ? `<span class="chip" style="padding:2px 7px;font-size:11px">${ic('camera')}Photo</span>` : ''}${o.queued ? '<span class="chip" style="padding:2px 7px;font-size:11px">En attente d\'envoi</span>' : ''}${o.remindAt ? `<span class="chip" style="padding:2px 7px;font-size:11px">${ic('bell')}${esc(o.remindAt)}</span>` : ''}</small>
    ${o.description ? `<div class="mini" style="margin-top:3px">${esc(o.description)}</div>` : ''}${st === 'refused' ? `<div class="mini" style="margin-top:3px;color:var(--ko)">Refusé${o.note ? ' : ' + esc(o.note) : ''}. À refaire.</div>` : ''}${stepList(o, can)}</div>
    <span class="pts">+${o.points}</span>${interactive ? `<button class="chk ${st}" data-a="done" data-id="${o.id}" ${can && (!o.steps || !o.steps.length || (o.stepsMode === 'each' ? o.steps.some((x) => x.checked) : o.steps.every((x) => x.checked))) ? '' : 'disabled'}>${icon}</button>` : ''}</div>`;
}
function byMoment(list) {
  const now = new Date().getHours(), cur = now < 12 ? 'matin' : now < 18 ? 'apres' : 'soir';
  return [...MOMENTS.map(([k, l]) => [k, l]), [null, 'Dans la journée']].map(([k, l]) => {
    const items = list.filter((o) => (o.moment || null) === k);
    return items.length ? `<div class="sec" style="display:flex;gap:8px;align-items:center">${l}${k && k === cur ? '<span class="tag p">Maintenant</span>' : ''}</div>${items.map((o) => missionRow(o, true)).join('')}` : '';
  }).join('');
}
function histRow(h) {
  return `<div class="line"><div class="sp"><b style="font-size:14px;font-weight:500">${esc(h.label)}</b><div class="mini">${dl(h.at)}</div></div><span class="pts ${h.delta < 0 ? 'neg' : ''}">${h.delta > 0 ? '+' : ''}${h.delta}</span></div>`;
}
function renderKid(a, nav) {
  const m = S.me;
  nav.innerHTML = tabs([['home', 'home', 'Accueil'], ['missions', 'target', 'Missions'], ['shop', 'bag', 'Magasin'], ['me', 'user', 'Moi']], S.tab);
  const c = PAL[m.palette % PAL.length];
  const hero = `<div class="hero" style="--c1:${c[0]};--c2:${c[1]}"><div class="row">${heroAvatar(m)}<div class="sp"><small>${esc(m.name)}</small><div style="font-weight:700;font-size:18px">Niveau ${m.level}</div></div><span class="chip">${ic('flame')}${m.streak} j</span></div>
    <div style="margin-top:16px"><small>Points</small><div class="big">${m.points}</div></div><div class="bar"><i style="width:${m.xpInLevel / m.levelXp * 100}%"></i></div><small>${m.levelXp - m.xpInLevel} XP avant le niveau ${m.level + 1}</small></div>`;
  const M = S.missions;
  if (S.tab === 'home') {
    const done = M.today.filter((o) => o.status === 'done').length;
    a.innerHTML = hero + offlineBanner() + pushBanner() + goalCard() + (M.today.length ? `<div class="sec" style="margin-bottom:-14px">Aujourd'hui · ${done}/${M.today.length} faites</div>${byMoment(M.today)}`
      : '<div class="card mini" style="margin-top:14px;text-align:center">Rien de prévu aujourd\'hui. Jette un œil aux missions à prendre.</div>');
  } else if (S.tab === 'missions') {
    a.innerHTML = `<h2>Missions</h2><div class="sec">À prendre</div>` + (M.open.length ? M.open.map((o) => `<div class="task"><div class="ic">${esc(o.icon)}</div><div class="sp"><b>${esc(o.title)}</b><small>${o.kind === 'open' ? 'Sans date' : 'Pour aujourd\'hui'} · premier arrivé, premier servi</small>${o.description ? `<div class="mini" style="margin-top:3px">${esc(o.description)}</div>` : ''}</div><span class="pts">+${o.points}</span><button class="btn sm" data-a="claim" data-id="${o.id}">Prendre</button></div>`).join('') : emptyCard('Rien à prendre pour le moment.'))
      + `<div class="sec">À venir</div>` + (M.upcoming.length ? M.upcoming.map((o) => missionRow({ ...o, label: o.label }, false)).join('') : emptyCard('Rien de prévu les prochains jours.'));
  } else if (S.tab === 'me') {
    a.innerHTML = hero + `<div class="sec">Badges</div><div class="badges">${m.badges.map((b) => `<div class="bdg ${b.earned ? '' : 'lock'}" title="${esc(b.desc)}"><i>${esc(b.emoji)}</i>${esc(b.title)}</div>`).join('')}</div><button class="btn ghost full" style="margin-top:16px" data-a="stats">Ma semaine en chiffres</button><div class="sec">Historique</div><div class="card" style="padding:0 14px">${S.hist.slice(0, 3).map(histRow).join('') || '<div class="line mini">Rien pour l\'instant.</div>'}${S.hist.length ? '<button class="btn ghost sm full" style="margin:4px 0 14px" data-a="hist">Tout voir</button>' : ''}</div>
    <div class="sec">Application</div>${installCard()}<div class="sec">Notifications</div><div class="card" style="padding:0 14px">${pushLine()}${S.push === 'on' ? '<button class="btn ghost sm full" style="margin-bottom:14px" data-a="pushtest">Voir un exemple de rappel</button>' : ''}</div><div class="card" style="margin-top:14px;padding:0 14px"><div class="line" data-a="sound"><div class="sp"><b>Sons</b><div class="mini">Petits sons de réussite (coupés par défaut)</div></div>${sw(soundOn())}</div></div><div class="card mini" style="margin-top:14px">Session ouverte sur ce téléphone : pas besoin de ressaisir ton code.</div><button class="btn ghost full" style="margin-top:18px" data-a="logout">Me déconnecter</button>`;
  } else a.innerHTML = kidShop();
}

// ---------- Parent ----------
function renderParent(a, nav) {
  nav.innerHTML = tabs([['home', 'check', 'À valider'], ['tasks', 'list', 'Tâches'], ['shops', 'bag', 'Magasins'], ['kids', 'users', 'Enfants'], ['set', 'gear', 'Réglages']], S.tab, { home: S.review.length + S.pending.length });
  if (!S.kids.length && S.tab !== 'set') {
    a.innerHTML = `<div style="text-align:center;margin-top:60px"><h2>Aucun enfant pour l'instant</h2><p class="mini" style="margin:8px 0 22px">Crée le profil de chaque enfant pour lui confier des tâches.</p><button class="btn full" data-a="newkid">Ajouter un enfant</button></div>`;
    return;
  }
  if (S.tab === 'home') {
    a.innerHTML = `<h2>À valider</h2><p class="mini" style="margin-top:2px">${S.review.length + S.pending.length ? 'Des décisions t\'attendent.' : 'Rien à valider pour le moment.'}</p>${pushBanner()}<div class="sec">Missions déclarées (${S.review.length})</div>` +
      (S.review.map((o) => `<div class="task wait"><div class="ic">${esc(o.icon)}</div><div class="sp"><b>${esc(o.title)}</b><small>${esc(o.kidName)} · ${dl(o.doneAt)}</small>${reviewSteps(o)}</div>${o.hasPhoto ? `<img class="thumb" src="api/occurrences/${o.id}/photo" alt="Photo" data-a="viewphoto" data-id="${o.id}">` : ''}<span class="pts">+${reviewPts(o)}</span></div>
      <div class="row" style="margin-top:8px"><button class="btn ko sp" data-a="refusesheet" data-id="${o.id}">Refuser</button><button class="btn ok sp" data-a="approve" data-id="${o.id}">Valider</button></div>`).join('') || emptyCard('Aucune mission en attente.')) + purchasesSection();
  } else if (S.tab === 'tasks') {
    const plan = S.tasks.filter((t) => t.kind === 'plan'), open = S.tasks.filter((t) => t.kind === 'open');
    const row = (t) => `<div class="task" data-a="edittask" data-id="${t.id}"><div class="ic">${esc(t.icon)}</div><div class="sp"><b>${esc(t.title)}</b><small>${(t.kids.length ? t.kids.map(kidName).map(esc).join(' + ') : 'Non attribuée') + ' · '}${t.moment ? MOMENTS.find((m) => m[0] === t.moment)[1] + ' · ' : ''}${esc(t.label)}${t.remindAt ? `<span class="chip" style="padding:2px 7px;font-size:11px">${ic('bell')}${esc(t.remindAt)}</span>` : ''}</small>${t.description ? `<div class="mini" style="margin-top:3px">${esc(t.description)}</div>` : ''}${t.steps && t.steps.length ? `<div class="mini" style="margin-top:3px">${t.steps.length} sous-tâche${t.steps.length > 1 ? 's' : ''}</div>` : ''}</div><span class="tag ${t.repeat === 'date' ? 'o' : 'p'}">${t.kind === 'open' ? 'Ouverte' : t.repeat === 'date' ? 'Ponctuelle' : 'Récurrente'}</span><span class="pts">${t.points}</span></div>`;
    a.innerHTML = `<div class="row"><h2 class="sp">Tâches</h2><button class="btn sm" data-a="newtask">${ic('plus')}Nouvelle</button></div><div class="sec">Planifiées</div>${plan.map(row).join('') || emptyCard('Aucune tâche.')}<div class="sec">Ouvertes (sans date)</div>${open.map(row).join('') || emptyCard('Aucune tâche ouverte.')}`;
  } else if (S.tab === 'kids') {
    a.innerHTML = `<h2>Enfants</h2>` + S.kids.map((k) => { const c = PAL[k.palette % PAL.length]; return `<div class="hero" style="margin-top:14px;--c1:${c[0]};--c2:${c[1]}"><div class="row">${heroAvatar(k, 48)}<div class="sp"><b style="font-size:18px">${esc(k.name)}</b>${k.age ? ' · ' + k.age + ' ans' : ''}<br><small>Niveau ${k.level} · ${k.xp} XP · série ${k.streak} j · ${k.badges} badge${k.badges > 1 ? 's' : ''}</small></div></div>
      <div class="row" style="margin-top:14px"><div class="big sp">${k.points}<small style="font-size:14px;font-weight:500"> pts</small></div><button class="btn sm" style="background:#ffffff2e" data-a="adjsheet" data-id="${k.id}">Ajuster</button></div></div>
      <div class="row" style="margin-top:8px"><button class="btn ghost sm sp" data-a="hist" data-id="${k.id}">Historique</button><button class="btn ghost sm sp" data-a="stats" data-id="${k.id}">Stats</button><button class="btn ghost sm sp" data-a="badgesheet" data-id="${k.id}">Badge</button></div>`; }).join('');
  } else if (S.tab === 'set') {
    a.innerHTML = `<h2>Réglages</h2><div class="sec">Enfants</div><div class="card" style="padding:0 14px">${S.kids.map((k) => `<div class="line">${avatar(k, 38)}<div class="sp"><b>${esc(k.name)}</b><div class="mini">${k.age ? k.age + ' ans · ' : ''}${k.points} pts</div></div><button class="btn ghost sm" data-a="managekid" data-id="${k.id}">Gérer</button></div>`).join('')}<div class="line" data-a="newkid" style="color:var(--acc);font-weight:600">${ic('plus')}Ajouter un enfant</div></div>
    <div class="sec">Application</div>${installCard()}<div class="sec">Notifications</div><div class="card" style="padding:0 14px">${pushLine()}
    <div class="line" data-a="notifalert">${ic('check')}<div class="sp"><b>À chaque mission ou demande</b><div class="mini">Alerte immédiate à valider</div></div>${sw(S.settings.notif.alert)}</div>
    <div class="line" data-a="notifagain">${ic('clock')}<div class="sp"><b>Second rappel aux enfants</b><div class="mini">1 h après l'heure si la tâche n'est pas faite</div></div>${sw(S.settings.notif.remindAgain)}</div>
    <div class="line" style="border:0;padding-bottom:6px">${ic('bell')}<div class="sp"><b>Rappel quotidien de validation</b><div class="mini">S'il reste des éléments en attente</div></div></div>
    <div class="opts" style="padding-bottom:14px">${[['', 'Aucun'], ['19:00', '19:00'], ['20:00', '20:00'], ['21:00', '21:00']].map(([v, l]) => `<button class="${(S.settings.notif.digest || '') === v ? 'on' : ''}" data-a="notifdigest" data-v="${v}">${l}</button>`).join('')}</div>
    ${S.push === 'on' ? '<button class="btn ghost sm full" style="margin-bottom:14px" data-a="pushtest">Envoyer une notification de test</button>' : ''}</div>
    <div class="sec">Preuve par photo</div><div class="card" style="padding:0 14px">
    <div class="line" data-a="photoglobal">${ic('camera')}<div class="sp"><b>Demander des photos</b><div class="mini">Interrupteur général : désactivé, aucune photo n'est demandée</div></div>${sw(S.settings.photo.enabled)}</div>
    <div class="line" style="border:0;padding-bottom:6px"><div class="sp"><b>Conservation</b><div class="mini">Photo supprimée après la décision</div></div></div>
    <div class="opts" style="padding-bottom:14px">${[[3, '3 jours'], [7, '7 jours'], [30, '30 jours']].map(([v, l]) => `<button class="${S.settings.photo.keepDays === v ? 'on' : ''}" data-a="photokeep" data-v="${v}">${l}</button>`).join('')}</div></div>
    <p class="mini" style="margin:8px 2px 0">Dans une tâche, « Photo demandée » active l'exigence pour cette tâche seulement.</p>
    <div class="sec">Bonus de série</div><div class="card"><p class="mini">Points offerts quand un enfant fait toutes ses missions plusieurs jours de suite (0 = aucun bonus).</p>
    ${[3, 7, 14, 30].map((m) => `<div class="line" style="border:0;padding:6px 0"><div class="sp"><b>${m} jours</b></div><input id="f_b${m}" type="number" min="0" inputmode="numeric" value="${S.settings.streakBonus[m] ?? ''}" style="width:90px;text-align:center"></div>`).join('')}
    <button class="btn ghost sm full" style="margin-top:8px" data-a="savebonus">Enregistrer les bonus</button></div><div class="sec">Compte</div><div class="card" style="padding:0 14px"><div class="line"><div class="sp"><b>${esc(S.session.email)}</b><div class="mini">Compte partagé</div></div></div><div class="line" data-a="chpw"><div class="sp"><b>Changer le mot de passe</b></div></div></div>
    <button class="btn ghost full" style="margin-top:18px" data-a="logout">Se déconnecter</button>`;
  } else a.innerHTML = parentShops();
}

// ---------- Feuilles ----------
const field = (id, label, value = '', attrs = '') => `<label>${label}</label><input id="${id}" value="${esc(value)}" ${attrs}>`;
const chips = (action, f, items, isOn) => `<div class="opts">${items.map(([v, l]) => `<button class="${isOn(v) ? 'on' : ''}" data-a="${action}" data-f="${f}" data-v="${v}">${l}</button>`).join('')}</div>`;

function sheetKid() {
  const F = S.F;
  return `<h2>Nouvel enfant</h2>${field('f_name', 'Prénom', F.name, 'placeholder="Prénom"')}${field('f_age', 'Âge (facultatif)', F.age, 'type="number" inputmode="numeric"')}
  <label>Couleur</label><div class="opts">${PAL.map((c, i) => `<button class="sw2 ${F.palette === i ? 'on' : ''}" style="background:linear-gradient(135deg,${c[0]},${c[1]})" data-a="palette" data-v="${i}"></button>`).join('')}</div>
  ${field('f_pin', 'Code PIN (4 chiffres)', F.pin, 'inputmode="numeric" maxlength="4" placeholder="••••"')}<p class="mini" style="margin-top:6px">L'enfant le saisit une seule fois : sa session reste ouverte sur son téléphone.</p>
  <button class="btn full" style="margin-top:18px" data-a="savekid">Créer le profil</button>`;
}
function sheetConfirm(title, text, action, label) {
  return `<h2>${title}</h2><p class="mini" style="margin:8px 0 16px">${text}</p><button class="btn ko full" data-a="${action}">${label}</button><button class="btn ghost full" style="margin-top:8px" data-a="closesheet">Annuler</button>`;
}
const sheetDelKid = () => sheetConfirm(`Supprimer ${esc(kidName(S.F.id))} ?`, 'Son profil, ses points, ses tâches, son magasin et son historique seront supprimés. Action irréversible.', 'confirmdel', 'Supprimer définitivement');
const sheetDelTask = () => sheetConfirm('Supprimer cette tâche ?', 'Ses occurrences à venir disparaissent. Les points déjà gagnés restent dans l\'historique.', 'confirmdeltask', 'Supprimer la tâche');
function sheetPw() {
  return `<h2>Changer le mot de passe</h2>${field('f_cur', 'Mot de passe actuel', '', 'type="password"')}${field('f_new', 'Nouveau mot de passe (8 caractères minimum)', '', 'type="password"')}<button class="btn full" style="margin-top:18px" data-a="savepw">Enregistrer</button>`;
}
function sheetTask() {
  const F = S.F, open = F.kind === 'open', ks = S.kids, each = F.stepsMode === 'each' && (F.steps || []).length > 0;
  return `<h2>${F.id ? 'Modifier la tâche' : 'Nouvelle tâche'}</h2>${F.id ? '' : `<button class="btn ghost sm full" style="margin-top:10px" data-a="tplpicker">Choisir un modèle de tâche</button>`}${field('f_title', 'Titre', F.title, 'placeholder="Ex. Arroser les plantes"')}
  ${iconField(F, 'icon', ICONS)}
  <label>Description (facultatif)</label><textarea id="f_desc" rows="2" placeholder="Ex. Toutes les plantes du salon">${esc(F.description)}</textarea>
  ${each ? `<label>Points gagnés</label><div class="mini">Total possible : <b>${(F.steps || []).reduce((n, x) => n + (Number(x.points) || 0), 0)}</b> (somme des sous-tâches)</div>` : `<label>Points gagnés (valeur libre)</label><input id="f_pts" class="ptsin" type="number" inputmode="numeric" value="${esc(F.points)}" placeholder="0">`}
  ${F.id ? '' : `<label>Quand ?</label>${chips('fset', 'kind', [['plan', 'Planifiée'], ['open', 'Ouverte']], (v) => F.kind === v)}`}
  <label>Pour qui ?</label><div class="opts">${ks.map((k) => `<button class="${F.kids.includes(k.id) ? 'on' : ''}" data-a="ftoggle" data-f="kids" data-v="${k.id}">${esc(k.name)}</button>`).join('')}<button class="${F.kids.length ? '' : 'on'}" data-a="fnone">Non attribuée</button></div>
  ${open ? '' : `<label>Répétition</label>${chips('fset', 'repeat', REPEATS, (v) => F.repeat === v)}
  ${F.repeat === 'days' ? `<div class="opts" style="margin-top:8px">${DAYS.map((d, i) => `<button class="${F.days.includes(i + 1) ? 'on' : ''}" data-a="ftoggle" data-f="days" data-v="${i + 1}">${d}</button>`).join('')}</div>` : ''}
  ${F.repeat === 'weekly' ? `<div style="margin-top:8px">${chips('fset', 'weekday', DAYS.map((d, i) => [i + 1, d]), (v) => F.days[0] === Number(v))}</div>` : ''}
  ${F.repeat === 'monthly' ? field('f_md', 'Jour du mois', F.monthDay, 'type="number" min="1" max="31"') : ''}
  ${F.repeat === 'date' ? field('f_date', 'Date', F.date, 'type="date"') : ''}
  <label>Moment de la journée</label>${chips('fset', 'moment', [...MOMENTS, ['', 'Dans la journée']], (v) => (F.moment || '') === v)}`}
  <label>Sous-tâches (facultatif)</label>
  ${(F.steps || []).length ? `${chips('fset', 'stepsMode', [['all', 'Tout ou rien'], ['each', 'Points par sous-tâche']], (v) => (F.stepsMode || 'all') === v)}<p class="mini" style="margin-top:6px">${each ? 'Chaque sous-tâche validée rapporte ses points ; celles qui ne sont pas faites sont perdues.' : 'Toutes les sous-tâches doivent être faites pour gagner les points de la tâche.'}</p>` : ''}
  ${(F.steps || []).map((x, i) => `<div class="row" style="margin-top:6px"><input id="f_step${i}" value="${esc(x.label)}" maxlength="80" placeholder="Ex. Vider le lave-vaisselle" style="flex:1">${each ? `<input id="f_stepp${i}" class="ptsin" type="number" inputmode="numeric" value="${esc(x.points || '')}" placeholder="pts" style="width:72px">` : ''}<button class="btn ghost sm" data-a="delstep" data-i="${i}" aria-label="Retirer la sous-tâche">×</button></div>`).join('')}
  ${(F.steps || []).length < 12 ? `<button class="btn ghost sm full" style="margin-top:8px" data-a="addstep">${ic('plus')}Ajouter une sous-tâche</button>` : ''}
  <div class="line" data-a="fphoto" style="border:0;padding-bottom:0">${ic('camera')}<div class="sp"><b>Photo demandée</b></div>${sw(F.photoRequired)}</div>
  ${open ? '' : `<label>Rappel sur le téléphone</label>${chips('fset', 'remindAt', [['', 'Aucun'], ['07:30', '07:30'], ['16:30', '16:30'], ['18:00', '18:00'], ['19:30', '19:30']], (v) => (F.remindAt || '') === v)}
  <input id="f_rt" type="time" value="${esc(F.remindAt)}" style="margin-top:8px">`}
  <button class="btn full" style="margin-top:18px" data-a="savetask">${F.id ? 'Enregistrer' : 'Créer la tâche'}</button>
  ${F.kind === 'plan' && F.repeat !== 'date' ? '<button class="btn ghost sm full" style="margin-top:8px" data-a="savetpl">Enregistrer comme modèle</button>' : ''}
  ${F.id ? '<button class="btn ko full" style="margin-top:8px" data-a="deltask">Supprimer la tâche</button>' : ''}`;
}
function sheetRefuse() {
  return `<h2>Refuser la mission</h2><p class="mini" style="margin-top:4px">L'enfant la verra à refaire, avec ton motif.</p>${field('f_note', 'Motif (facultatif)', '', 'placeholder="Ex. Le lit n\'est pas fait"')}<button class="btn ko full" style="margin-top:18px" data-a="refuse">Refuser</button>`;
}
function sheetAdjust() {
  const k = S.kids.find((x) => x.id === S.F.id);
  return `<h2>Ajuster les points · ${esc(k.name)}</h2><p class="mini" style="margin-top:4px">Solde actuel : ${k.points} pts. Un nombre négatif retire des points (jamais sous 0).</p>
  <label>Variation</label><input id="f_delta" class="ptsin" type="number" inputmode="numeric" value="${esc(S.F.delta)}" placeholder="0">
  <div class="opts" style="margin-top:8px">${[5, 10, 25, -5, -10, -25].map((v) => `<button data-a="quick" data-v="${v}">${v > 0 ? '+' : ''}${v}</button>`).join('')}</div>
  ${field('f_label', 'Motif (visible par l\'enfant)', S.F.label, 'placeholder="Ex. Aide spontanée / Écran après l\'heure"')}
  <button class="btn full" style="margin-top:18px" data-a="saveadj">Appliquer</button>`;
}
function purchaseRow(p) {
  return `<div class="line"><div style="font-size:24px">${esc(p.icon)}</div><div class="sp"><b style="font-size:14px;font-weight:500">${esc(p.title)}</b><div class="mini">${dl(p.at)} · ${p.price} pts</div></div><span class="tag ${p.status === 'req' ? 'o' : p.status === 'refused' ? 'p' : ''}">${{ req: 'En attente', given: 'Remis', refused: 'Refusé' }[p.status]}</span></div>`;
}
function sheetHist() {
  const parent = S.view === 'parent', name = parent ? esc(kidName(S.F.id)) : esc(S.me.name);
  const pts = parent ? S.F.hist : S.hist, buys = parent ? S.F.purch : S.purchases;
  const body = S.F.hs === 'rew'
    ? (buys.map(purchaseRow).join('') || '<p class="mini" style="padding:16px 0">Aucune récompense demandée.</p>')
    : (pts.map(histRow).join('') || '<p class="mini" style="padding:16px 0">Aucun mouvement pour l\'instant.</p>');
  return `<h2>Historique · ${name}</h2><div class="seg"><button class="${S.F.hs === 'rew' ? '' : 'on'}" data-a="hseg" data-v="pts">Points</button><button class="${S.F.hs === 'rew' ? 'on' : ''}" data-a="hseg" data-v="rew">Récompenses</button></div><div style="margin-top:6px">${body}</div>`;
}

// ---------- Magasin ----------
const LIMITS = { none: '', day: '1 par jour', week: '1 par semaine', month: '1 par mois' };
const REW_ICONS = ['🎁', '🎮', '🍿', '🏊', '🍕', '🎬', '🛍️', '🌙'];
// Sélecteur d'icônes : quelques favoris en ligne, un catalogue par catégorie et la saisie libre d'un emoji.
const ICON_CATS = [
  ['Maison', '🛏️ 🧹 🧺 🧽 🪣 🧼 🚿 🛁 🚽 🪟 🪴 🗑️ ♻️ 🧴 🪥 🔧 🔨 💡 🛋️ 🚪 📦 🧸 🪑 👕 👖 🧦'],
  ['Cuisine', '🍽️ 🍳 🥣 🍴 🥄 🔪 🧊 🍞 🥗 🍎 🥕 🍕 🍝 🥪 🍰 🍪 🥛 ☕ 🧁 🍓 🥦 🌽 🍌 🍫'],
  ['École', '📚 📖 ✏️ 📝 🎒 🖊️ 📐 🧮 🔬 🔭 🎓 💻 🗒️ 📅 🧠 🔤 🔢 🎹 🎻'],
  ['Animaux', '🐶 🐱 🐹 🐰 🐟 🐢 🐦 🐴 🦜 🐾 🐕 🐈 🐠 🐇 🐓'],
  ['Dehors', '🌱 🌻 🌳 🍃 🚲 🛴 🚗 🧤 🌧️ ☀️ 🏡 🚮 🥾 ⛄ 🍂 🪓 🌷 🧑‍🌾'],
  ['Sport', '⚽ 🏀 🎾 🏊 🏃 🧘 🥋 ⛸️ 🎿 🏓 🏐 🤸 🛹 🏸 🚴'],
  ['Loisirs', '🎮 🎬 🎵 🎸 🎨 🧩 🎲 📺 🎧 🎤 🎭 🪁 🧶 📷 🎪 🍿 🎯'],
  ['Récompenses', '🎁 🏆 ⭐ 🌟 💎 👑 🎉 🎈 🍦 🍩 🛍️ 🪙 🎟️ 💰 🌙 🎂 🏅'],
  ['Famille', '❤️ 💪 🤝 🙏 👶 👵 👴 😊 🌈 🦸 🎅 🏠 ✨ 🔥 🚀'],
].map(([name, list]) => [name, list.split(' ')]);
function iconField(F, key, favs) {
  const cur = F[key], favList = favs.includes(cur) ? favs : [cur, ...favs.slice(0, favs.length - 1)];
  const cats = F.ip ? `<div class="opts" style="margin-top:10px">${ICON_CATS.map(([n]) => `<button class="${F.ip === n ? 'on' : ''}" data-a="icat" data-v="${n}">${n}</button>`).join('')}</div>
    <div class="icongrid">${(ICON_CATS.find(([n]) => n === F.ip) || ICON_CATS[0])[1].map((i) => `<button class="${cur === i ? 'on' : ''}" data-a="ichoose" data-f="${key}" data-v="${i}">${i}</button>`).join('')}</div>
    <div class="row" style="gap:8px;margin-top:8px"><input id="f_ico" class="sp" placeholder="Ou colle un emoji" maxlength="12" style="margin:0"><button class="btn ghost sm" data-a="iuse" data-f="${key}">Utiliser</button></div>` : '';
  return `<label>Icône</label><div class="opts">${favList.map((i) => `<button class="${cur === i ? 'on' : ''}" data-a="ichoose" data-f="${key}" data-v="${i}">${i}</button>`).join('')}<button class="${F.ip ? 'on' : ''}" data-a="ipick" aria-label="Plus d'icônes">${F.ip ? 'Moins' : 'Plus…'}</button></div>${cats}`;
}

const stockLabel = (left, shared) => (left == null ? '' : left > 0 ? `${left} restant${left > 1 ? 's' : ''}${shared ? ' (partagé)' : ''}` : 'Épuisé');
const sw = (on) => `<span class="sw ${on ? 'on' : ''}"></span>`;

function goalCard() {
  const g = S.me.goal;
  if (!g) return '';
  return `<div class="card"><div class="row"><div style="font-size:28px">${esc(g.icon)}</div><div class="sp"><b>Objectif · ${esc(g.title)}</b><div class="mini">${Math.min(S.me.points, g.price)} / ${g.price} points</div></div></div><div class="bar"><i style="width:${Math.min(100, S.me.points / g.price * 100)}%"></i></div></div>`;
}
function kidShop() {
  const K = S.me, sh = S.shop;
  const seg = `<div class="seg"><button class="${S.shopSeg === 'rew' ? 'on' : ''}" data-a="shopseg" data-v="rew">Récompenses</button><button class="${S.shopSeg === 'acc' ? 'on' : ''}" data-a="shopseg" data-v="acc">Accessoires</button></div>`;
  const head = `<div class="row"><h2 class="sp">Magasin</h2><span class="pts" style="font-size:15px">${K.points} pts</span></div>${seg}`;
  if (S.shopSeg === 'acc') {
    return head + `<p class="mini" style="margin-top:12px">Payés avec les mêmes points que les récompenses, sans validation.</p><div class="grid2">${sh.accessories.map((x) => `<div class="item"><div class="e">${esc(x.emoji)}</div><b>${esc(x.title)}</b><small>${x.owned ? 'Débloqué' : 'Accessoire'}</small>${x.owned
      ? `<button class="btn sm ghost" data-a="equip" data-id="${x.equipped ? 'none' : x.id}">${x.equipped ? 'Porté' : 'Équiper'}</button>`
      : `<button class="btn sm" data-a="buyacc" data-id="${x.id}" ${K.points < x.price ? 'disabled' : ''}>${x.price} pts</button>`}</div>`).join('')}</div>`;
  }
  const rewards = sh.rewards.length ? `<div class="grid2">${sh.rewards.map((i) => `<div class="item"><button class="star ${i.goal ? 'on' : ''}" data-a="goal" data-id="${i.id}">${ic('star')}</button><div class="e">${esc(i.icon)}</div><b>${esc(i.title)}</b><small>${esc(i.info)}${i.description ? '<br>' + esc(i.description) : ''}</small><button class="btn sm" data-a="buy" data-id="${i.id}" ${K.points < i.price || i.pending || i.blocked ? 'disabled' : ''}>${i.pending ? 'Demandé' : i.blocked || i.price + ' pts'}</button></div>`).join('')}</div><p class="mini" style="margin-top:10px">L'étoile fixe ta récompense visée. Un parent confirme la remise.</p>`
    : '<div class="card mini" style="margin-top:12px">Aucune récompense pour le moment. Demande à un parent d\'en ajouter.</div>';
  const mine = S.purchases.slice(0, 5);
  return head + rewards + (mine.length ? `<div class="sec">Mes demandes</div><div class="card" style="padding:0 14px">${mine.map(purchaseRow).join('')}</div>` : '');
}
const purchasesSection = () => `<div class="sec">Demandes d'achat (${S.pending.length})</div>` + (S.pending.map((p) => `<div class="task"><div class="ic">${esc(p.icon)}</div><div class="sp"><b>${esc(p.title)}</b><small>${esc(p.kidName)} · ${p.price} pts réservés</small></div></div>
  <div class="row" style="margin-top:8px"><button class="btn ko sp" data-a="refusebuy" data-id="${p.id}">Refuser</button><button class="btn ok sp" data-a="givebuy" data-id="${p.id}">Remis</button></div>`).join('') || emptyCard('Aucune demande.'));
function parentShops() {
  const row = (r, k) => `<div class="task" data-a="editreward" data-id="${r.id}"><div class="ic">${esc(r.icon)}</div><div class="sp"><b>${esc(r.title)}</b><small>${[AVAIL[r.availability], LIMITS[r.limit], stockLabel(r.left[k.id], r.shared), r.validUntil ? `Jusqu'au ${frd(r.validUntil)}` : ''].filter(Boolean).join(' · ') || 'Sans limite'}</small>${r.description ? `<div class="mini" style="margin-top:3px">${esc(r.description)}</div>` : ''}</div><span class="pts">${r.price} pts</span></div>`;
  return `<div class="row"><h2 class="sp">Magasins</h2><button class="btn sm" data-a="newreward">${ic('plus')}Ajouter</button></div>`
    + S.kids.map((k) => `<div class="sec">${esc(k.name)}</div>${S.rewards.filter((r) => r.kids.includes(k.id)).map((r) => row(r, k)).join('') || emptyCard('Aucune récompense.')}`).join('')
    + `<div class="sec">Accessoires (communs)</div>${S.accessories.map((x) => `<div class="task" data-a="accprice" data-id="${x.id}"><div class="ic">${esc(x.emoji)}</div><div class="sp"><b>${esc(x.title)}</b></div><span class="pts">${x.price} pts</span></div>`).join('')}`;
}
function sheetReward() {
  const F = S.F, ks = S.kids;
  return `<h2>${F.id ? 'Modifier la récompense' : 'Nouvelle récompense'}</h2>${field('f_title', 'Titre', F.title, 'placeholder="Ex. Soirée pizza"')}
  ${iconField(F, 'icon', REW_ICONS)}
  <label>Description (facultatif)</label><textarea id="f_desc" rows="2" placeholder="Ex. Au restaurant de ton choix">${esc(F.description)}</textarea>
  <label>Prix en points (valeur libre)</label><input id="f_price" class="ptsin" type="number" inputmode="numeric" value="${esc(F.price)}" placeholder="0">
  <label>Pour qui ?</label><div class="opts">${ks.map((k) => `<button class="${F.kids.includes(k.id) ? 'on' : ''}" data-a="ftoggle" data-f="kids" data-v="${k.id}">${esc(k.name)}</button>`).join('')}</div>
  <label>Limite par enfant</label>${chips('fset', 'limit', [['none', 'Aucune'], ['day', '1 par jour'], ['week', '1 par semaine'], ['month', '1 par mois']], (v) => F.limit === v)}
  <label>Validité (facultatif)</label><div class="row" style="gap:8px"><div class="sp"><div class="mini">Valable à partir du</div><input id="f_vfrom" type="date" value="${esc(F.validFrom)}"></div><div class="sp"><div class="mini">jusqu'au</div><input id="f_vuntil" type="date" value="${esc(F.validUntil)}"></div></div>
  <div class="line" data-a="ractive" style="border:0;padding-bottom:0"><div class="sp"><b>Active</b><div class="mini">${F.active ? 'Visible dans le magasin des enfants (si dans ses dates)' : 'Cachée aux enfants'}</div></div>${sw(F.active)}</div>
  ${field('f_stock', 'Stock (facultatif)', F.stock, 'type="number" min="1" inputmode="numeric" placeholder="Illimité"')}
  ${F.kids.length > 1 ? `<div class="line" data-a="fshared" style="border:0;padding-bottom:0;${F.stock === '' ? 'opacity:.45' : ''}"><div class="sp"><b>Stock partagé entre les enfants</b><div class="mini">${F.shared && F.stock !== '' ? 'Un seul stock commun : le premier qui l\'achète l\'épuise pour les autres.' : 'Chaque enfant a son propre stock.'}</div></div>${sw(F.shared && F.stock !== '')}</div>` : ''}
  ${F.id ? '<p class="mini" style="margin-top:8px">Modifier le stock le réinitialise pour les enfants concernés.</p>' : ''}
  <button class="btn full" style="margin-top:18px" data-a="savereward">${F.id ? 'Enregistrer' : 'Ajouter au magasin'}</button>
  ${F.id ? '<button class="btn ko full" style="margin-top:8px" data-a="delreward">Supprimer la récompense</button>' : ''}`;
}
const sheetDelReward = () => sheetConfirm('Supprimer cette récompense ?', 'Elle disparaît du magasin des enfants. Les demandes déjà faites restent dans l\'historique.', 'confirmdelreward', 'Supprimer la récompense');
function sheetAccPrice() {
  return `<h2>${esc(S.F.emoji)} ${esc(S.F.title)}</h2><label>Prix en points</label><input id="f_price" class="ptsin" type="number" inputmode="numeric" value="${esc(S.F.price)}"><button class="btn full" style="margin-top:18px" data-a="saveacc">Enregistrer</button>`;
}
// ---------- Notifications push ----------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// Le service worker peut ne jamais s'activer (navigateur restreint) : on n'attend pas indéfiniment.
const swReady = () => Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 1500))]);
async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off'; // pas encore demandé : inutile de toucher au service worker
  try { const reg = await swReady(); return reg ? ((await reg.pushManager.getSubscription()) ? 'on' : 'off') : 'unsupported'; } catch { return 'unsupported'; }
}
const keyBytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4)), (c) => c.charCodeAt(0));
async function pushOn() {
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications refusées : autorise-les dans les réglages du navigateur.');
  const reg = await swReady();
  if (!reg) throw new Error('Les notifications ne sont pas disponibles dans ce navigateur.');
  const { publicKey } = await api('push/key');
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await api('push/subscribe', 'POST', sub.toJSON());
}
// À chaque ouverture : l'abonnement est réenregistré côté serveur (base restaurée, appareil renouvelé) et
// recréé si les clés du serveur ont changé. Les réglages de notification, eux, vivent côté serveur.
async function pushSync() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const reg = await swReady(), sub = reg && await reg.pushManager.getSubscription();
  if (!sub) return;
  const { publicKey } = await api('push/key'), want = keyBytes(publicKey), have = sub.options && sub.options.applicationServerKey;
  if (have && (have.byteLength !== want.length || new Uint8Array(have).some((b, i) => b !== want[i]))) {
    await sub.unsubscribe();
    return api('push/subscribe', 'POST', (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want })).toJSON());
  }
  return api('push/subscribe', 'POST', sub.toJSON());
}
async function pushRefresh() {
  try { await pushSync(); } catch { /* hors connexion : sans importance */ }
  S.push = await pushState();
  if (!S.sheet) render();
}
// Encart d'activation, tant que les notifications ne sont pas actives (masqué 7 jours après « Plus tard »).
function pushBanner() {
  const st = S.push, ios = isIOS && !standalone();
  if (st === 'on' || st === 'unknown' || (st === 'unsupported' && !ios)) return '';
  try { if (Date.now() - Number(localStorage.getItem('tribu_push_later') || 0) < 7 * 864e5) return ''; } catch { /* stockage indisponible */ }
  const kid = S.view === 'kid';
  const [title, text, canEnable] = st === 'denied' ? ['Notifications bloquées', "Autorise-les dans les réglages du navigateur pour recevoir les rappels.", false]
    : st === 'unsupported' ? ["Installe l'app", "Ajoute La Tribu à l'écran d'accueil (Partager, puis Sur l'écran d'accueil) pour recevoir les notifications.", false]
    : kid ? ['Ne rate plus tes missions', "Active les rappels : tu seras prévenu à l'heure de chaque tâche.", true]
    : ['Reste informé', "Active les notifications pour savoir quand une mission ou une demande t'attend.", true];
  return `<div class="card" style="display:flex;gap:12px;align-items:flex-start;border:1.5px solid var(--acc)"><span style="color:var(--acc);margin-top:2px">${ic('bell')}</span><div class="sp"><b>${title}</b><div class="mini" style="margin-top:2px">${text}</div><div class="row" style="margin-top:10px;gap:8px">${canEnable ? '<button class="btn sm" data-a="pushtoggle">Activer</button>' : ''}<button class="btn ghost sm" data-a="pushlater">Plus tard</button></div></div></div>`;
}
async function pushOff() {
  if (!pushSupported() || Notification.permission !== 'granted') return; // jamais abonné : rien à retirer
  const reg = await swReady();
  const sub = reg && await reg.pushManager.getSubscription();
  if (sub) { await api('push/unsubscribe', 'POST', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
}
// ---------- Installation sur l'écran d'accueil ----------
// Android/Chrome : invite native (beforeinstallprompt). iPhone et autres navigateurs : mode d'emploi.
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
window.addEventListener('appinstalled', () => { installEvt = null; if (S.view === 'parent' || S.view === 'kid') render(); });
const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function installCard() {
  if (isStandalone()) return '<div class="card mini" style="padding:14px">✓ Application installée sur cet appareil.</div>';
  return `<div class="card" style="padding:0 14px"><div class="line"><div class="sp"><b>Installer l'application</b></div><button class="btn sm" data-a="install">Installer</button></div></div>`;
}
function sheetInstall() {
  const steps = isIos()
    ? ['Ouvre cette page dans <b>Safari</b>.', 'Touche le bouton <b>Partager</b> (le carré avec une flèche).', 'Choisis <b>Sur l\'écran d\'accueil</b>, puis <b>Ajouter</b>.']
    : ['Ouvre le menu du navigateur (<b>⋮</b> ou <b>⋯</b>).', 'Choisis <b>Installer l\'application</b> ou <b>Ajouter à l\'écran d\'accueil</b>.', 'Confirme : l\'icône apparaît sur ton écran d\'accueil.'];
  return `<h2>Installer La Tribu</h2><ol class="mini" style="margin:12px 0 0 18px;line-height:1.7">${steps.map((t) => `<li>${t}</li>`).join('')}</ol><button class="btn full" style="margin-top:18px" data-a="closesheet">J'ai compris</button>`;
}
function pushLine() {
  const st = S.push;
  if (st === 'unsupported') return `<div class="line">${ic('bell')}<div class="sp"><b>Notifications</b><div class="mini">${isIOS && !standalone() ? 'Sur iPhone, ajoute d\'abord l\'app à l\'écran d\'accueil (Partager, puis Sur l\'écran d\'accueil).' : 'Ce navigateur ne gère pas les notifications.'}</div></div></div>`;
  if (st === 'denied') return `<div class="line">${ic('bell')}<div class="sp"><b>Notifications bloquées</b><div class="mini">Autorise-les dans les réglages du navigateur, puis reviens ici.</div></div></div>`;
  return `<div class="line" data-a="pushtoggle">${ic('bell')}<div class="sp"><b>Notifications sur ce téléphone</b><div class="mini">${st === 'on' ? 'Activées' : 'L\'autorisation te sera demandée'}</div></div>${sw(st === 'on')}</div>`;
}
const soundOn = () => { try { return localStorage.getItem('tribu_sound') === '1'; } catch { return false; } };
function beep() {
  if (!soundOn()) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(), t = ctx.currentTime;
    [523, 659, 784].forEach((f, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.0001, t + i * 0.12); g.gain.exponentialRampToValueAtTime(0.15, t + i * 0.12 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.2); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.22); });
  } catch { /* son indisponible : sans importance */ }
}
function sheetCelebrate() {
  const c = S.me.celebrate;
  return `<div style="text-align:center"><div style="font-size:54px">${c.levelUp ? '🎉' : '🏅'}</div><h2 style="margin-top:6px">${c.levelUp ? `Niveau ${c.levelUp} !` : 'Nouveau badge !'}</h2>
  ${c.badges.length ? `<div class="badges" style="margin-top:14px">${c.badges.map((b) => `<div class="bdg"><i>${esc(b.emoji)}</i>${esc(b.title)}</div>`).join('')}</div>` : '<p class="mini" style="margin-top:6px">Bravo, tu progresses !</p>'}
  <button class="btn full" style="margin-top:18px" data-a="celebrated">Super !</button></div>`;
}
const BADGE_ICONS = ['🏅', '💪', '🧠', '❤️', '⭐', '🎯'];
function sheetBadge() {
  return `<h2>Décerner un badge · ${esc(kidName(S.F.id))}</h2>${field('f_btitle', 'Titre du badge', S.F.title, 'placeholder="Ex. Super grand frère"')}${iconField(S.F, 'emoji', BADGE_ICONS)}<button class="btn full" style="margin-top:18px" data-a="savebadge">Décerner</button>`;
}
const rewardBody = (F) => ({ title: F.title, description: F.description, icon: F.icon, price: Number(F.price), limit: F.limit, stock: F.stock === '' ? null : Number(F.stock), shared: !!F.shared, kids: F.kids, validFrom: F.validFrom || null, validUntil: F.validUntil || null, active: !!F.active });

// ---------- Réglages d'affichage de la validité ----------
const AVAIL = { off: 'Désactivée', expired: 'Expirée', upcoming: 'Pas encore ouverte', ok: '' };
const frd = (d) => d.split('-').reverse().slice(0, 2).join('/'); // AAAA-MM-JJ -> JJ/MM
const addDaysJs = (d, n) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) + n * 864e5).toISOString().slice(0, 10);

// ---------- Photo preuve ----------
// Photo prise ou choisie, réduite (1024 px, JPEG, < 450 Ko) avant envoi.
function pickPhoto() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.setAttribute('capture', 'environment');
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return resolve(null);
      try { resolve(await shrink(f)); } catch { toast('Photo illisible, réessaie.'); resolve(null); }
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
async function shrink(file) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  for (const q of [0.7, 0.55, 0.4, 0.3]) { const url = cv.toDataURL('image/jpeg', q); if (url.length * 0.75 < 450 * 1024) return url; }
  throw new Error('photo trop lourde');
}
const sheetPhoto = () => `<h2>Photo de la mission</h2><img class="photo-big" src="api/occurrences/${S.F.id}/photo" alt="Photo preuve">`;

// ---------- Statistiques de la semaine ----------
function sheetStats() {
  const st = S.F.stats, parent = S.view === 'parent', name = parent ? kidName(S.F.id) : S.me.name;
  const max = Math.max(1, ...st.days.map((d) => Math.max(d.earned, d.spent)));
  const diff = (cur, prev) => (cur === prev ? '' : `<span class="mini">${cur > prev ? '+' : ''}${cur - prev} vs semaine précédente</span>`);
  return `<h2>Semaine · ${esc(name)}</h2>
  <div class="row" style="margin-top:10px"><button class="btn ghost sm" data-a="statnav" data-dir="-1" aria-label="Semaine précédente">${ic('chevl')}</button><div class="sp" style="text-align:center"><b>${frd(st.weekStart)} au ${frd(st.weekEnd)}</b>${st.isCurrent ? '<div class="mini">Cette semaine</div>' : ''}</div><button class="btn ghost sm" data-a="statnav" data-dir="1" aria-label="Semaine suivante" ${st.isCurrent ? 'disabled' : ''}>${ic('chevr')}</button></div>
  <div class="chart">${st.days.map((d, i) => `<div class="col ${d.future ? 'future' : ''}"><div class="pair"><i class="e" style="height:${d.earned / max * 100}%"></i><i class="s" style="height:${d.spent / max * 100}%"></i></div><small>${DAYS[i][0]}</small></div>`).join('')}</div>
  <p class="mini" style="margin-top:6px"><span style="color:var(--acc)">■</span> gagnés <span style="color:var(--ko);margin-left:8px">■</span> dépensés</p>
  <div class="tiles"><div class="tile"><b>${st.totals.earned}</b>points gagnés<br>${diff(st.totals.earned, st.prev.earned)}</div><div class="tile"><b>${st.totals.spent}</b>points dépensés<br>${diff(st.totals.spent, st.prev.spent)}</div>
  <div class="tile"><b>${st.totals.done}/${st.totals.total}</b>missions faites</div><div class="tile"><b>${st.totals.rate == null ? '–' : st.totals.rate + ' %'}</b>de réussite<br>${st.prev.rate != null && st.totals.rate != null ? diff(st.totals.rate, st.prev.rate).replace('vs semaine précédente', 'pts vs préc.') : ''}</div></div>
  <p class="mini" style="margin-top:12px">${ic('flame')} Série en cours : ${st.streak} jour${st.streak > 1 ? 's' : ''}</p>`;
}

// ---------- Bibliothèque de tâches types ----------
function sheetTemplates() {
  return `<h2>Modèles de tâches</h2><p class="mini" style="margin-top:4px">Touche un modèle pour préremplir la tâche.</p><div style="margin-top:8px">${S.templates.map((t) => `<div class="line"><div style="font-size:24px">${esc(t.icon)}</div><button class="sp" style="text-align:left" data-a="usetpl" data-id="${t.id}"><b style="font-size:14px">${esc(t.title)}</b><div class="mini">${esc(t.label)}${t.moment ? ' · ' + MOMENTS.find((m) => m[0] === t.moment)[1] : ''}</div></button><span class="pts">${t.points}</span><button class="btn ghost sm" data-a="deltpl" data-id="${t.id}" aria-label="Supprimer le modèle">×</button></div>`).join('') || '<p class="mini" style="padding:16px 0">Aucun modèle.</p>'}</div><button class="btn ghost full" style="margin-top:12px" data-a="tplback">Retour</button>`;
}

// ---------- Gérer un enfant (PIN, appareils, suppression) ----------
function sheetManageKid() {
  const k = S.kids.find((x) => x.id === S.F.id);
  return `<h2>${esc(k.name)}</h2><label>Nouveau code PIN (4 chiffres)</label><input id="f_newpin" inputmode="numeric" maxlength="4" placeholder="••••" value="${esc(S.F.newpin || '')}">
  <button class="btn full" style="margin-top:10px" data-a="savepin">Changer le PIN</button><p class="mini" style="margin-top:6px">Les téléphones de l'enfant devront ressaisir le nouveau code.</p>
  <div class="sec">Autres actions</div><button class="btn ghost full" data-a="revoke" data-id="${k.id}">Déconnecter ses appareils</button><button class="btn ko full" style="margin-top:8px" data-a="delkid" data-id="${k.id}">Supprimer ${esc(k.name)}</button>`;
}

// ---------- Hors connexion : file d'attente des missions « faites » et dernière vue de l'enfant ----------
const QKEY = 'tribu_queue', CKEY = 'tribu_kid_cache';
const qLoad = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } };
const qSave = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { toast('Stockage plein : la mission ne peut pas être gardée hors connexion.'); } };
const kidCacheSave = () => { try { localStorage.setItem(CKEY, JSON.stringify({ session: S.session, me: S.me, missions: S.missions })); } catch { /* stockage indisponible */ } };
const kidCacheLoad = () => { try { return JSON.parse(localStorage.getItem(CKEY) || 'null'); } catch { return null; } };
function applyQueued() {
  const ids = new Set(qLoad().map((i) => i.occ));
  for (const o of S.missions.today) if (ids.has(o.id) && o.status !== 'done') { o.status = 'wait'; o.queued = true; }
}
let flushing = false;
async function qFlush() {
  if (flushing || S.view !== 'kid' || !S.session || !S.session.kid) return;
  flushing = true;
  let sent = 0;
  try {
    const mine = qLoad().filter((i) => i.kid === S.session.kid.id), rest = []; // les envois d'un autre profil sont abandonnés
    for (const [idx, item] of mine.entries()) {
      try { await api(item.path, 'POST', item.body); sent++; } catch (e) {
        if (e.network) { rest.push(...mine.slice(idx)); break; }
        /* refusé par le serveur (déjà déclarée...) : abandonné */
      }
    }
    qSave(rest);
  } finally { flushing = false; }
  if (sent) { toast(`${sent} mission${sent > 1 ? 's' : ''} envoyée${sent > 1 ? 's' : ''} aux parents`); try { await loadData(); } catch { /* réessai plus tard */ } render(); }
}
function offlineBanner() {
  const n = qLoad().length;
  if (!S.offline && !n) return '';
  return `<div class="card mini" style="margin-top:12px">${S.offline ? 'Hors connexion. ' : ''}${n ? `${n} mission${n > 1 ? 's' : ''} en attente d'envoi : elle${n > 1 ? 's partiront' : ' partira'} dès le retour du réseau.` : 'Les informations seront à jour dès le retour du réseau.'}</div>`;
}
window.addEventListener('online', () => qFlush());
setInterval(() => { if (qLoad().length) qFlush(); }, 30000);

function readInputs() {
  const g = (id) => document.getElementById(id), F = S.F;
  if (g('f_name')) F.name = g('f_name').value;
  if (g('f_age')) F.age = g('f_age').value;
  if (g('f_pin')) F.pin = g('f_pin').value;
  if (g('f_title')) F.title = g('f_title').value;
  if (g('f_desc')) F.description = g('f_desc').value;
  if (g('f_pts')) F.points = g('f_pts').value;
  if (g('f_md')) F.monthDay = g('f_md').value;
  if (g('f_date')) F.date = g('f_date').value;
  if (g('f_rt')) F.remindAt = g('f_rt').value;
  (F.steps || []).forEach((x, i) => { if (g('f_step' + i)) x.label = g('f_step' + i).value; if (g('f_stepp' + i)) x.points = g('f_stepp' + i).value; });
  if (g('f_delta')) F.delta = g('f_delta').value;
  if (g('f_label')) F.label = g('f_label').value;
  if (g('f_btitle')) F.title = g('f_btitle').value;
  if (g('f_vfrom')) F.validFrom = g('f_vfrom').value;
  if (g('f_vuntil')) F.validUntil = g('f_vuntil').value;
  if (g('f_newpin')) F.newpin = g('f_newpin').value;
  if (g('f_price')) F.price = g('f_price').value;
  if (g('f_stock')) F.stock = g('f_stock').value;
}
const val = (id) => (document.getElementById(id) || {}).value || '';
const blankTask = () => ({ title: '', description: '', icon: '✨', points: '', kind: 'plan', kids: S.kids.length ? [S.kids[0].id] : [], repeat: 'daily', days: [1, 3, 5], monthDay: 1, date: '', moment: 'soir', remindAt: '', photoRequired: false, steps: [], stepsMode: 'all' });
const taskBody = (F) => ({ title: F.title, description: F.description, icon: F.icon, points: Number(F.points), kind: F.kind, kids: F.kids, repeat: F.repeat, days: F.days, monthDay: Number(F.monthDay), date: F.date, moment: F.moment || null, remindAt: F.remindAt || null, photoRequired: !!F.photoRequired, steps: (F.steps || []).filter((x) => x.label.trim()).map((x) => ({ id: x.id, label: x.label, points: Number(x.points) || 0 })), stepsMode: (F.steps || []).some((x) => x.label.trim()) ? F.stepsMode : 'all' });

// ---------- Actions ----------
const A = {
  async setup() { await api('setup', 'POST', { email: val('f_mail'), password: val('f_pw') }); S.tab = 'home'; await refresh(); },
  async plogin() { await api('login', 'POST', { email: val('f_mail'), password: val('f_pw') }); S.tab = 'home'; await refresh(); },
  async install() {
    if (installEvt) { const e = installEvt; installEvt = null; e.prompt(); const r = await e.userChoice.catch(() => null); if (r && r.outcome === 'accepted') toast('Installation en cours'); return; }
    S.sheet = sheetInstall;
  },
  pickparent() { S.view = 'plogin'; },
  async gwlogin() { await api('gateway/login', 'POST', {}); S.tab = 'home'; await refresh(); },
  tologin() { S.view = 'login'; S.pin = ''; },
  pickkid(d) { S.kidId = Number(d.id); S.pin = ''; S.view = 'pin'; },
  async pin(d) {
    if (d.n === '⌫') S.pin = S.pin.slice(0, -1); else if (S.pin.length < 4) S.pin += d.n;
    if (S.pin.length < 4) return;
    const pin = S.pin; S.pin = '';
    try { await api(`kids/${S.kidId}/login`, 'POST', { pin }); S.tab = 'home'; await refresh(); toast('Session ouverte sur ce téléphone'); } catch (e) { toast(e.message); }
  },
  async logout() { try { localStorage.removeItem(CKEY); } catch { /* sans importance */ } try { await pushOff(); } catch { /* sans importance */ } await api('logout', 'POST', {}); S.tab = 'home'; await refresh(); },
  tab(d) { S.tab = d.t; $('#app').scrollTop = 0; },
  async closesheet() { if (S.sheet === sheetCelebrate) await api('me/seen', 'POST', {}); S.sheet = null; },
  async celebrated() { await api('me/seen', 'POST', {}); S.sheet = null; },
  async pushtoggle() {
    if (S.push === 'on') { await pushOff(); S.push = await pushState(); toast('Notifications coupées'); } else { await pushOn(); S.push = await pushState(); toast('Notifications activées'); }
  },
  pushlater() { try { localStorage.setItem('tribu_push_later', String(Date.now())); } catch { /* stockage indisponible */ } },
  async pushtest() { const r = await api('push/test', 'POST', {}); toast(r.sent ? 'Notification envoyée' : 'Aucun appareil abonné'); },
  async notifalert() { S.settings = await api('settings', 'PUT', { notif: { alert: !S.settings.notif.alert } }); },
  async notifagain() { S.settings = await api('settings', 'PUT', { notif: { remindAgain: !S.settings.notif.remindAgain } }); },
  async notifdigest(d) { S.settings = await api('settings', 'PUT', { notif: { digest: d.v || null } }); },
  sound() { try { localStorage.setItem('tribu_sound', soundOn() ? '0' : '1'); } catch { /* stockage indisponible */ } beep(); },
  badgesheet(d) { S.F = { id: Number(d.id), title: '', emoji: '🏅' }; S.sheet = sheetBadge; },
  async savebadge() { await api(`kids/${S.F.id}/badges`, 'POST', { title: S.F.title, emoji: S.F.emoji }); S.sheet = null; toast('Badge décerné'); },
  async savebonus() { const b = {}; for (const m of [3, 7, 14, 30]) b[m] = Number(val(`f_b${m}`)); S.settings = await api('settings', 'PUT', { streakBonus: b }); toast('Bonus enregistrés'); },
  fset(d) { const F = S.F; if (d.f === 'weekday') F.days = [Number(d.v)]; else if (d.f === 'points') F.points = d.v; else F[d.f] = d.v;
    if (d.f === 'moment' && d.v && !F.remindAt) F.remindAt = MOMENT_REMIND[d.v];
    if (d.f === 'repeat' && d.v === 'weekly') F.days = [F.days[0] || 1]; },
  ftoggle(d) { const a = S.F[d.f], v = Number(d.v), i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); },
  fall() { S.F.kids = S.F.kids.length === S.kids.length ? [] : S.kids.map((k) => k.id); },
  fnone() { S.F.kids = []; },
  ipick() { S.F.ip = S.F.ip ? '' : ICON_CATS[0][0]; },
  icat(d) { S.F.ip = d.v; },
  ichoose(d) { S.F[d.f] = d.v; S.F.ip = ''; },
  iuse(d) {
    const raw = (val('f_ico') || '').trim();
    const first = raw && (typeof Intl !== 'undefined' && Intl.Segmenter ? [...new Intl.Segmenter().segment(raw)][0].segment : [...raw][0]);
    if (first && /\p{Extended_Pictographic}/u.test(first)) { S.F[d.f] = first; S.F.ip = ''; } else throw new Error('Colle un emoji.');
  },
  quick(d) { S.F.delta = d.v; },
  palette(d) { S.F.palette = Number(d.v); },

  // enfants
  newkid() { S.F = { name: '', age: '', palette: S.kids.length % PAL.length, pin: '' }; S.sheet = sheetKid; },
  async savekid() { const F = S.F; await api('kids', 'POST', { name: F.name, age: F.age, palette: F.palette, pin: F.pin }); S.sheet = null; toast(`${F.name.trim()} ajouté`); },
  delkid(d) { S.F = { id: Number(d.id) }; S.sheet = sheetDelKid; },
  async confirmdel() { const n = kidName(S.F.id); await api(`kids/${S.F.id}`, 'DELETE'); S.sheet = null; toast(`${n} supprimé`); },
  async revoke(d) { await api(`kids/${d.id}/revoke`, 'POST', {}); toast('Appareils déconnectés'); },
  chpw() { S.sheet = sheetPw; },
  async savepw() { await api('password', 'POST', { current: val('f_cur'), next: val('f_new') }); S.sheet = null; toast('Mot de passe modifié'); },

  // tâches
  newtask() { S.F = blankTask(); S.sheet = sheetTask; },
  edittask(d) {
    const t = S.tasks.find((x) => x.id === Number(d.id));
    S.F = { id: t.id, title: t.title, description: t.description, icon: t.icon, points: t.points, kind: t.kind, kids: t.kids.slice(), repeat: t.repeat || 'daily', days: t.days ? t.days.slice() : [1, 3, 5], monthDay: t.monthDay || 1, date: t.date || '', moment: t.moment || '', remindAt: t.remindAt || '', photoRequired: t.photoRequired, steps: (t.steps || []).map((x) => ({ ...x })), stepsMode: t.stepsMode || 'all' };
    S.sheet = sheetTask;
  },
  async savetask() {
    const F = S.F;
    if (F.id) await api(`tasks/${F.id}`, 'PUT', taskBody(F)); else await api('tasks', 'POST', taskBody(F));
    S.sheet = null; toast(F.id ? 'Tâche modifiée' : 'Tâche créée');
  },
  deltask() { S.sheet = sheetDelTask; },
  async confirmdeltask() { await api(`tasks/${S.F.id}`, 'DELETE'); S.sheet = null; toast('Tâche supprimée'); },

  // validation (parent)
  rvstep(d) { const id = Number(d.id), st = Number(d.step), l = (desel[id] = desel[id] || []), i = l.indexOf(st); if (i >= 0) l.splice(i, 1); else l.push(st); },
  async approve(d) {
    const o = S.review.find((x) => x.id === Number(d.id)), body = o && o.stepsMode === 'each' ? { steps: o.steps.filter((x) => x.checked && !(desel[o.id] || []).includes(x.id)).map((x) => x.id) } : {};
    const r = await api(`occurrences/${d.id}/approve`, 'POST', body); confetti(); beep(); toast(`+${r.points} pts pour ${kidName(r.kidId)}${r.awarded.length ? ` · bonus de série +${r.awarded[0].points}` : ''}`); },
  refusesheet(d) { S.F = { id: Number(d.id) }; S.sheet = sheetRefuse; },
  async refuse() { await api(`occurrences/${S.F.id}/refuse`, 'POST', { note: val('f_note') }); S.sheet = null; toast('Renvoyé à l\'enfant'); },
  adjsheet(d) { S.F = { id: Number(d.id), delta: '', label: '' }; S.sheet = sheetAdjust; },
  async saveadj() {
    const r = await api(`kids/${S.F.id}/adjust`, 'POST', { delta: Number(S.F.delta), label: S.F.label });
    S.sheet = null; toast(`${r.applied > 0 ? '+' : ''}${r.applied} pts pour ${kidName(S.F.id)}`);
  },
  async hist(d) {
    if (S.view === 'parent') { const id = Number(d.id); S.F = { id, hs: 'pts', hist: await api(`kids/${id}/history`), purch: await api(`kids/${id}/purchases`) }; } else S.F = { hs: 'pts' };
    S.sheet = sheetHist;
  },
  hseg(d) { S.F.hs = d.v; },

  // photo, stats, modèles, gestion d'un enfant
  viewphoto(d) { S.F = { id: Number(d.id) }; S.sheet = sheetPhoto; },
  fphoto() { S.F.photoRequired = !S.F.photoRequired; },
  addstep() { (S.F.steps = S.F.steps || []).push({ label: '', points: '' }); setTimeout(() => { const el = document.getElementById('f_step' + (S.F.steps.length - 1)); if (el) el.focus(); }, 0); },
  delstep(d) { S.F.steps.splice(Number(d.i), 1); if (!S.F.steps.length) S.F.stepsMode = 'all'; },
  ractive() { S.F.active = !S.F.active; },
  async photoglobal() { S.settings = await api('settings', 'PUT', { photo: { enabled: !S.settings.photo.enabled } }); },
  async photokeep(d) { S.settings = await api('settings', 'PUT', { photo: { keepDays: Number(d.v) } }); },
  async stats(d) {
    const parent = S.view === 'parent', id = parent ? Number(d.id) : null;
    S.F = { id, stats: await api(parent ? `kids/${id}/stats` : 'me/stats') };
    S.sheet = sheetStats;
  },
  async statnav(d) {
    const F = S.F, week = addDaysJs(F.stats.weekStart, Number(d.dir) * 7);
    F.stats = await api((S.view === 'parent' ? `kids/${F.id}/stats` : 'me/stats') + `?week=${week}`);
  },
  async tplpicker() { S.taskDraft = S.F; S.templates = await api('templates'); S.sheet = sheetTemplates; },
  tplback() { S.F = S.taskDraft; S.sheet = sheetTask; },
  usetpl(d) {
    const t = S.templates.find((x) => x.id === Number(d.id));
    S.F = { ...S.taskDraft, title: t.title, description: t.description, icon: t.icon, points: t.points, repeat: t.repeat, days: t.days ? t.days.slice() : [1, 3, 5], monthDay: t.monthDay || 1, moment: t.moment || '', remindAt: t.remindAt || '', photoRequired: t.photoRequired };
    S.sheet = sheetTask;
  },
  async deltpl(d) { await api(`templates/${d.id}`, 'DELETE'); S.templates = await api('templates'); },
  async savetpl() {
    const F = S.F;
    await api('templates', 'POST', { title: F.title, description: F.description, icon: F.icon, points: Number(F.points), repeat: F.repeat, days: F.days, monthDay: Number(F.monthDay), moment: F.moment || null, remindAt: F.remindAt || null, photoRequired: !!F.photoRequired });
    toast('Modèle enregistré dans la bibliothèque');
  },
  managekid(d) { S.F = { id: Number(d.id), newpin: '' }; S.sheet = sheetManageKid; },
  async savepin() { await api(`kids/${S.F.id}`, 'PATCH', { pin: S.F.newpin }); S.sheet = null; toast('PIN modifié'); },

  // magasin (parent)
  newreward() { S.F = { title: '', description: '', icon: '🎁', price: '', kids: S.kids.length ? [S.kids[0].id] : [], limit: 'none', stock: '', shared: false, validFrom: '', validUntil: '', active: true }; S.sheet = sheetReward; },
  editreward(d) {
    const r = S.rewards.find((x) => x.id === Number(d.id));
    S.F = { id: r.id, title: r.title, description: r.description, icon: r.icon, price: r.price, kids: r.kids.slice(), limit: r.limit, stock: r.stock == null ? '' : r.stock, shared: r.shared, validFrom: r.validFrom || '', validUntil: r.validUntil || '', active: r.active };
    S.sheet = sheetReward;
  },
  fshared() { S.F.shared = !S.F.shared; },
  async savereward() {
    const F = S.F;
    if (F.id) await api(`rewards/${F.id}`, 'PUT', rewardBody(F)); else await api('rewards', 'POST', rewardBody(F));
    S.sheet = null; toast(F.id ? 'Récompense modifiée' : 'Ajoutée au magasin');
  },
  delreward() { S.sheet = sheetDelReward; },
  async confirmdelreward() { await api(`rewards/${S.F.id}`, 'DELETE'); S.sheet = null; toast('Récompense supprimée'); },
  accprice(d) { const x = S.accessories.find((a) => a.id === Number(d.id)); S.F = { id: x.id, title: x.title, emoji: x.emoji, price: x.price }; S.sheet = sheetAccPrice; },
  async saveacc() { await api(`accessories/${S.F.id}`, 'PUT', { price: Number(S.F.price) }); S.sheet = null; toast('Prix modifié'); },
  async givebuy(d) { await api(`purchases/${d.id}/give`, 'POST', {}); toast('Remise enregistrée'); },
  async refusebuy(d) { const r = await api(`purchases/${d.id}/refuse`, 'POST', {}); toast(`Points rendus à ${kidName(r.kidId)}`); },

  // magasin (enfant)
  shopseg(d) { S.shopSeg = d.v; },
  async buy(d) { await api('me/purchases', 'POST', { rewardId: Number(d.id) }); confetti(); toast('Demande envoyée aux parents'); },
  async goal(d) { const id = Number(d.id); await api('me/goal', 'PUT', { rewardId: S.me.goal && S.me.goal.id === id ? null : id }); },
  async buyacc(d) { await api(`me/accessories/${d.id}/buy`, 'POST', {}); confetti(); toast('Accessoire débloqué et équipé'); },
  async equip(d) { await api(`me/accessories/${d.id}/equip`, 'POST', {}); },

  // enfant
  async done(d) {
    const m = S.missions.today.find((o) => o.id === Number(d.id));
    let photo = null;
    if (m && m.photoRequired) { photo = await pickPhoto(); if (!photo) return; } // le sélecteur s'ouvre dans le geste de l'utilisateur
    try {
      await api(`occurrences/${d.id}/done`, 'POST', photo ? { photo } : {}); confetti(); beep(); toast('Envoyé aux parents pour validation');
    } catch (e) {
      if (!e.network) throw e;
      qSave([...qLoad(), { kid: S.session.kid.id, occ: Number(d.id), path: `occurrences/${d.id}/done`, body: photo ? { photo } : {} }]);
      applyQueued(); kidCacheSave(); toast('Hors connexion : la mission partira dès le retour du réseau.');
    }
  },
  async step(d) { await api(`occurrences/${d.id}/steps/${d.step}`, 'PUT', { checked: d.on === '1' }); },
  async claim(d) { await api(`occurrences/${d.id}/claim`, 'POST', {}); toast('Mission ajoutée à ta liste'); },
};

// Actions qui ne changent que le formulaire ouvert : pas de rechargement des données, la fiche est mise à jour sur place
// (même élément, même défilement, aucune animation d'ouverture rejouée).
const LOCAL = new Set(['fset', 'ftoggle', 'fall', 'fnone', 'fphoto', 'addstep', 'delstep', 'fshared', 'ractive', 'quick', 'ipick', 'icat', 'ichoose', 'iuse']);
function renderSheetInPlace() {
  const sh = S.sheet && document.querySelector('.sheet-bg .sheet');
  if (!sh) return false;
  const top = sh.scrollTop;
  sh.innerHTML = S.sheet();
  sh.scrollTop = top;
  return true;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-a]');
  if (!b || b.disabled) return;
  if (b.dataset.a === 'closesheet' && e.target !== b) return;
  const f = A[b.dataset.a];
  if (!f) return;
  readInputs();
  try {
    await f(b.dataset);
    if (LOCAL.has(b.dataset.a) && renderSheetInPlace()) return;
    if (S.view === 'parent' || S.view === 'kid') await loadData();
  } catch (err) {
    toast(err.message);
    if (err.status === 401 && (S.view === 'parent' || S.view === 'kid')) return refresh();
  }
  render();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible : sans importance */ });
refresh().catch((e) => { $('#app').innerHTML = `<p class="mini" style="padding:24px">Impossible de joindre le serveur : ${esc(e.message)}</p>`; });
