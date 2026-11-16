// Statistiques hebdomadaires d'un enfant (semaine du lundi au dimanche, fuseau de la famille).
//  - gagné : points gagnés (missions, séries, bonus) ; dépensé : achats et accessoires, remboursements déduits ;
//  - missions : faites (validées) sur prévues, jusqu'à aujourd'hui pour le taux de réussite.
const { db } = require('./db');
const dates = require('./dates');
const game = require('./game');

const SPENT = ['purchase', 'accessory', 'refund'];

function week(kidId, startParam) {
  const today = dates.today();
  const current = dates.weekStart(today);
  // semaine demandée : une date valide, jamais dans le futur
  let start = dates.isDate(startParam) ? dates.weekStart(startParam) : current;
  if (start > current) start = current;
  return { today, current, start, totals: totals(kidId, start, today), days: days(kidId, start, today) };
}

function days(kidId, start, today) {
  const list = Array.from({ length: 7 }, (_, i) => dates.addDays(start, i));
  const lo = new Date(`${start}T00:00:00Z`).getTime() - 864e5, hi = lo + 9 * 864e5;
  const mov = db.prepare('SELECT delta, xp, ref_type AS refType, created_at AS at FROM movements WHERE kid_id = ? AND created_at >= ? AND created_at < ?').all(kidId, lo, hi);
  const occ = db.prepare('SELECT due_date AS d, status FROM occurrences WHERE kid_id = ? AND due_date >= ? AND due_date <= ?').all(kidId, start, list[6]);
  return list.map((date) => {
    const m = mov.filter((x) => dates.dayOf(x.at) === date), o = occ.filter((x) => x.d === date);
    return {
      date, future: date > today,
      earned: m.reduce((s, x) => s + x.xp, 0),
      spent: -m.filter((x) => SPENT.includes(x.refType)).reduce((s, x) => s + x.delta, 0),
      done: o.filter((x) => x.status === 'done').length,
      total: o.length,
    };
  });
}

function totals(kidId, start, today) {
  const ds = days(kidId, start, today);
  const past = ds.filter((d) => !d.future);
  const done = ds.reduce((s, d) => s + d.done, 0), total = past.reduce((s, d) => s + d.total, 0);
  return { earned: ds.reduce((s, d) => s + d.earned, 0), spent: ds.reduce((s, d) => s + d.spent, 0), done, total, rate: total ? Math.round(done / total * 100) : null };
}

// Semaine + semaine précédente (comparaison) + série en cours.
function report(kidId, startParam) {
  const w = week(kidId, startParam);
  const prevStart = dates.addDays(w.start, -7);
  return {
    weekStart: w.start, weekEnd: dates.addDays(w.start, 6), isCurrent: w.start === w.current,
    days: w.days, totals: w.totals, prev: totals(kidId, prevStart, w.today), streak: game.streak(kidId).days,
  };
}

module.exports = { report };
