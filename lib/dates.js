// Dates calendaires (AAAA-MM-JJ) dans le fuseau de la famille. Lundi = 1 ... dimanche = 7.
const TZ = 'Europe/Brussels';
const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

const today = () => fmt.format(new Date());
const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const nowMinutes = () => { const [h, m] = hm.format(new Date()).split(':').map(Number); return h * 60 + m; };
const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && parse(s).toISOString().slice(0, 10) === s;
const weekday = (s) => { const d = parse(s).getUTCDay(); return d === 0 ? 7 : d; };
const dayOfMonth = (s) => Number(s.slice(8, 10));
const daysInMonth = (s) => new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 0)).getUTCDate();
const addDays = (s, n) => new Date(parse(s).getTime() + n * 864e5).toISOString().slice(0, 10);
const weekStart = (s) => addDays(s, -(weekday(s) - 1));
const monthStart = (s) => s.slice(0, 8) + '01';
const frDate = (s) => s.split('-').reverse().join('/');

module.exports = { TZ, today, nowMinutes, toMinutes, isDate, weekday, dayOfMonth, daysInMonth, addDays, weekStart, monthStart, frDate };
