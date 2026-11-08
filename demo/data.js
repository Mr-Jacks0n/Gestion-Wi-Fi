/* ═══════════════════════════════════════════════════════════════════
   Adven's Manager — MODE DÉMO / SIMULATION
   Données 100 % fictives générées localement (aucun backend, aucun
   réseau). Même grille de design que l'app réelle (tokens de
   frontend/src/index.css).
   ═══════════════════════════════════════════════════════════════════ */

/* ── Prng déterministe (même graine = même histoire de vente) ─────── */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261108);
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function rint(min, max) { return min + Math.floor(rng() * (max - min + 1)); }

/* ── Données fictives ─────────────────────────────────────────────── */
const TICKET_TYPES = [
  { code: 'F12', label: 'Forfait 12 h', price: 500 },
  { code: 'F6',  label: 'Forfait 6 h',  price: 300 },
  { code: 'F2',  label: 'Forfait 2 h',  price: 150 },
];

const VENDORS = ['Awa Konaté', 'Moussa Diarra', 'Fatou Bakayoko', 'Ibrahim Coulibaly'];
const CLIENTS = [
  'Karim Touré', 'Aïcha Sissoko', 'Jean-Marc Kouassi', 'Adama Fofana',
  'Nadia Diallo', 'Olivier Tanoh', 'Salif Gbagbo', 'Léa Ouattara',
  'Yacouba Camara', 'Mireille Bamba', 'Drissa Sangaré', 'Rokia Traoré',
];
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function ticketCode() {
  const seg = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[rint(0, 30)]).join('');
  return `ADVN-${seg()}-${seg()}`;
}

/* Base de simulation : 30 derniers jours d'activité. */
function buildHistory() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = rint(8, 34);                        // ventes du jour
    const tickets = Array.from({ length: d }, () => {
      const t = pick(TICKET_TYPES);
      return {
        type: t, price: t.price,
        hour: Math.max(8, Math.min(22, rint(8, 22))),
        method: rng() < 0.68 ? 'CASH' : 'WAVE',
        vendor: pick(VENDORS),
        client: pick(CLIENTS),
        code: ticketCode(),
      };
    });
    const expenses = Array.from({ length: rint(0, 2) }, () => ({
      label: pick(['Recharge fibre', 'Carburant groupe électrogène', 'Consommables', 'Maintenance']),
      amount: rint(2, 12) * 500,
    }));
    days.push({
      offset: i,
      sales: tickets,
      expenses,
      stockImported: rint(10, 40),
    });
  }
  return days;
}
const history = buildHistory();

/* État vivant de la session démo (aujourd'hui). */
const state = {
  today: history[history.length - 1],     // sales manipulables
  stockCentral: 18,
  stockVendors: { 'Awa Konaté': 6, 'Moussa Diarra': 4, 'Fatou Bakayoko': 2, 'Ibrahim Coulibaly': 0 },
  pendingResupply: [
    { vendor: 'Ibrahim Coulibaly', type: 'F6', qty: 20, status: 'EN ATTENTE', at: '09:41' },
    { vendor: 'Fatou Bakayoko',    type: 'F2', qty: 15, status: 'APProuvée', at: '08:12' },
  ],
  pendingResupplyLabel: ['EN ATTENTE', 'APPROUVÉE', 'EN ATTENTE'],
  pendingResupplyFixed: false,
  audit: [
    { at: '08:02', actor: 'admin', action: 'IMPORT_LOT', detail: 'Lot de 30 tickets F12 importé (fichier démo)' },
    { at: '08:12', actor: 'admin', action: 'RESUPPLY_APPROVE', detail: 'Réappro. de 15 × F2 vers Fatou Bakayoko' },
    { at: '09:41', actor: 'Awa Konaté', action: 'RESUPPLY_REQUEST', detail: 'Demande de 20 × F6' },
  ],
  clock: '10:24',
};

state.pendingResupply[1].status = 'APPROUVÉE';

/* ── Agrégats ─────────────────────────────────────────────────────── */
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
function dayTotals(day) {
  const ca = sum(day.sales, (s) => s.price);
  const dep = sum(day.expenses, (e) => e.amount);
  return { ca, dep, profit: ca - dep, count: day.sales.length };
}
function totalsRange(days) {
  let ca = 0, dep = 0, count = 0, cash = 0, wave = 0;
  for (const d of days) {
    const t = dayTotals(d);
    ca += t.ca; dep += t.dep; count += t.count;
    cash += sum(d.sales.filter((s) => s.method === 'CASH'), (s) => s.price);
    wave += sum(d.sales.filter((s) => s.method === 'WAVE'), (s) => s.price);
  }
  return { ca, dep, profit: ca - dep, count, cash, wave };
}
const fmt = (n) => n.toLocaleString('fr-FR');
const fcafa = (n) => `${fmt(n)} FCFA`;

function totalStockVendors() { return sum(Object.values(state.stockVendors), (v) => v); }

/* ═══════════════════════════ Vues ═════════════════════════════════ */
const el = (id) => document.getElementById(id);
let page = 'dashboard';

function todayTotals() { return dayTotals(state.today); }
function allTime() { return totalsRange(history); }

/* ── Chart helpers (SVG pur, zéro dépendance) ─────────────────────── */
function sparkline(values, w = 560, h = 140) {
  const max = Math.max(...values, 1);
  const step = w / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 6 - (v / max) * (h - 18)).toFixed(1)}`);
  const area = `M0,${h} L${pts.join(' L')} L${w},${h} Z`;
  return `
    <svg viewBox="0 0 ${w} ${h}" class="chart">
      <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#10b981" stop-opacity=".35"/>
        <stop offset="1" stop-color="#10b981" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${area}" fill="url(#g1)"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="#34d399" stroke-width="2.5"
        stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p, i) => i === pts.length - 1
        ? `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="4" fill="#34d399"/>` : '').join('')}
    </svg>`;
}

function doughnut(cash, wave, label) {
  const tot = cash + wave || 1;
  const c = 2 * Math.PI * 44;
  const cw = (cash / tot) * c;
  return `
    <svg viewBox="0 0 120 120" class="donut">
      <circle cx="60" cy="60" r="44" fill="none" stroke="rgba(148,179,161,.12)" stroke-width="14"/>
      <circle cx="60" cy="60" r="44" fill="none" stroke="#34d399" stroke-width="14"
        stroke-dasharray="${cw} ${c - cw}" transform="rotate(-90 60 60)" stroke-linecap="round"/>
      <text x="60" y="57" text-anchor="middle" fill="#92b5a5" font-size="10">${label}</text>
      <text x="60" y="74" text-anchor="middle" fill="#fff" font-size="15" font-weight="700"
        font-family="inherit">${Math.round((cash / tot) * 100)} %</text>
    </svg>`;
}

function bars(hoursMap) {
  const w = 560, h = 130, bw = w / 15 - 6;
  const max = Math.max(...hoursMap.map((h) => h.n), 1);
  return `<svg viewBox="0 0 ${w} ${h}" class="chart">
    ${hoursMap.map((hh, i) => {
      const bh = (hh.n / max) * (h - 30);
      const hot = hh.n === max ? '#34d399' : 'rgba(52,211,153,.35)';
      return `<rect x="${(i * (bw + 6)) + 3}" y="${h - 22 - bh}" width="${bw}" height="${Math.max(bh, 2)}"
        rx="3" fill="${hot}"/>
        <text x="${i * (bw + 6) + 3 + bw / 2}" y="${h - 8}" text-anchor="middle"
          fill="#527464" font-size="9">${hh.label}</text>`;
    }).join('')}</svg>`;
}

function peakHours() {
  const map = Array.from({ length: 15 }, (_, i) => ({ label: `${i + 8}h`, n: 0 }));
  for (const d of history) for (const s of d.sales) {
    const idx = Math.min(Math.max(s.hour - 8, 0), 14);
    map[idx].n += 1;
  }
  return map;
}
