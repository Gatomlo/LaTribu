// Dates calendaires (AAAA-MM-JJ) dans le fuseau de la famille. Lundi = 1 ... dimanche = 7.
const TZ = 'Europe/Brussels';
const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

const today = () => fmt.format(new Date());
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && parse(s).toISOString().slice(0, 10) === s;
const weekday = (s) => { const d = parse(s).getUTCDay(); return d === 0 ? 7 : d; };
const dayOfMonth = (s) => Number(s.slice(8, 10));
const daysInMonth = (s) => new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 0)).getUTCDate();
const frDate = (s) => s.split('-').reverse().join('/');

module.exports = { TZ, today, isDate, weekday, dayOfMonth, daysInMonth, frDate };
