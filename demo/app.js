/* ═══ Adven's Manager — pages de la simulation (routing + rendu) ═══ */

const NAV = [
  { id: 'dashboard',  label: 'Tableau de bord',  icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { id: 'tickets',    label: 'Tickets',          icon: 'M4 8a2 2 0 0 0 0 8v3h16v-3a2 2 0 0 1 0-8V5H4zM13 5v14' },
  { id: 'vendors',    label: 'Vendeurs',         icon: 'M17 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM10 20v-1a5 5 0 0 1 8 0v1M7 9a2 2 0 1 0 0 .01M3 19v-1a4 4 0 0 1 4-1' },
  { id: 'clients',    label: 'Clients',          icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20v-1a8 8 0 0 1 16 0v1' },
  { id: 'expenses',   label: 'Dépenses',         icon: 'M12 3v18M8 7h8a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h8' },
  { id: 'audit',      label: 'Audit Logs',       icon: 'M12 3l9 5-9 5-9-5zM5 12v5c4 3 10 3 14 0v-5' },
  { id: 'sales',      label: 'Ventes',           icon: 'M3 6h2l2 12h13l2-8H7M9 21a1 1 0 1 0 0 .01M18 21a1 1 0 1 0 0 .01' },
  { id: 'closures',   label: 'Clôtures de caisse', icon: 'M4 6h16v12H4zM4 10h16M8 6V4M16 6V4' },
  { id: 'resupply',   label: 'Réappro.',         icon: 'M4 8a8 8 0 0 1 14-2M20 16a8 8 0 0 1-14 2M18 2v4h-4M6 22v-4h4' },
  { id: 'reports',    label: 'Rapports',         icon: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7' },
  { id: 'settings',   label: 'Paramètres',       icon: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2m12 0h2M12 4v2m0 12v2M6.4 6.4l1.4 1.4m8.4 8.4 1.4 1.4M17.6 6.4l-1.4 1.4M7.8 16.2l-1.4 1.4' },
];

function sidebarHTML(active) {
  return `
    <div class="brand">
      <div class="brand-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="#0b1612" stroke-width="2.2" stroke-linecap="round">
          <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a10 10 0 0 1 13 0M8.7 16a5.5 5.5 0 0 1 6.6 0"/>
          <circle cx="12" cy="19.4" r="1.6" fill="#0b1612" stroke="none"/>
        </svg>
      </div>
      <div><div class="brand-name">Adven's Manager</div>
      <div class="brand-sub">GESTION WI-FI</div></div>
    </div>
    <nav>${NAV.map((n) => `
      <a href="#${n.id}" class="nav-item ${active === n.id ? 'active' : ''}" data-page="${n.id}">
        <span class="nav-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${n.icon}"/></svg></span>
        ${n.label}</a>`).join('')}
    </nav>
    <div class="sidebar-user">
      <div class="avatar user-avatar">D</div>
      <div class="user-name">Demo Admin</div>
      <button class="icon-btn" id="btn-reset" title="Réinitialiser la simulation">⟲</button>
    </div>`;
}

function headerHTML(sub) {
  return `
    <div class="topbar">
      <span class="welcome">Ravi de vous revoir, <strong>Demo Admin</strong> 👋</span>
      <span class="top-actions">
        <span class="demo-chip" title="Aucune donnée réelle — simulation exécutée dans votre navigateur">⚠️ MODE DÉMO</span>
        <span class="clock-chip" id="demo-clock">${state.clock}</span>
      </span>
    </div>
    <h1 class="page-title">${pageTitle(page)}</h1>
    <p class="page-sub">${sub}</p>`;
}

function pageTitle(id) { return (NAV.find((n) => n.id === id) || {}).label || '—'; }

const kpiCard = (label, value, opts = {}) => `
  <div class="kpi ${opts.cls || ''}" ${opts.title ? `title="${opts.title}"` : ''}>
    <div class="kpi-ico" style="background:${opts.icoBg || 'rgba(16,185,129,.12)'};color:${opts.icoFg || '#34d399'}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round"><path d="${opts.icon}"/></svg>
    </div>
    <div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div></div>
  </div>`;

const section = (icon, title, inner) => `
  <div class="section-head"><span class="sec-ico">${icon}</span><h2>${title}</h2></div>
  ${inner}`;

/* ── Page : Tableau de bord ───────────────────────────────────────── */
function pageDashboard() {
  const t = todayTotals();
  const at = allTime();
  const stock = state.stockCentral;
  const sv = totalStockVendors();
  const cashToday = sum(state.today.sales.filter((s) => s.method === 'CASH'), (s) => s.price);
  const waveToday = t.ca - cashToday;
  const depToday = t.dep;
  const trend = history.slice(-14).map((d) => dayTotals(d).ca);

  return `
    ${headerHTML('Vue d\u2019ensemble de votre activité')}
    ${section('📈', 'Vue d\u2019ensemble', `
      <div class="grid kpis">
        ${kpiCard('STOCK CENTRAL', stock, { icon: 'M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8M12 13v10', icoBg: 'rgba(56,189,248,.14)', icoFg: '#38bdf8' })}
        ${kpiCard('STOCK VENDEURS', sv, { icon: 'M4 8a2 2 0 0 0 0 8v3h16v-3a2 2 0 0 1 0-8V5H4zM13 5v14', icoBg: 'rgba(167,139,250,.14)', icoFg: '#a78bfa' })}
        ${kpiCard('VENTES DU JOUR', t.count, { icon: 'M3 6h2l2 12h13l2-8H7' })}
        ${kpiCard('DEMANDES EN ATTENTE', state.pendingResupply.filter((r) => r.status === 'EN ATTENTE').length, { icon: 'M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18', icoBg: 'rgba(244,63,94,.14)', icoFg: '#fb7185' })}
        ${kpiCard('VENDEURS ACTIFS', VENDORS.filter((v) => state.stockVendors[v] > 0).length, { icon: 'M17 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM10 20v-1a5 5 0 0 1 8 0v1', icoBg: 'rgba(167,139,250,.14)', icoFg: '#a78bfa' })}
      </div>`)}
    ${section('💰', 'Chiffre d\u2019affaires', `
      <div class="grid kpis">
        ${kpiCard('CA DU JOUR', fcafa(t.ca), { icon: 'M12 2v20M16.5 6.5h-7a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H7' })}
        ${kpiCard('CA TOTAL (30 j)', fcafa(at.ca), { icon: 'M3 17l5-8 4 4 5-7 4 5', icoBg: 'rgba(52,211,153,.14)', icoFg: '#34d399' })}
        ${kpiCard('BÉNÉFICE DU JOUR', fcafa(t.profit), { icon: 'M4 20V10m6 10V4m6 16v-8m4 8h-16', icoBg: 'rgba(14,165,233,.14)', icoFg: '#38bdf8' })}
        ${kpiCard('DÉPENSES DU JOUR', fcafa(depToday), { icon: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 6h16v12H4zM4 10h16', icoBg: 'rgba(245,158,11,.14)', icoFg: '#fbbf24' })}
      </div>`)}
    ${section('💳', 'Répartition des paiements', `
      <div class="grid kpis">
        ${kpiCard('ESPÈCES (JOUR)', fcafa(cashToday), { icon: 'M2 6h20v12H2zM7 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0' })}
        ${kpiCard('ESPÈCES (30 J)', fcafa(at.cash), { icon: 'M2 6h20v12H2zM7 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0' })}
        ${kpiCard('WAVE (JOUR)', fcafa(waveToday), { icon: 'M7 2h10v20H7zM11 18h2', icoBg: 'rgba(14,165,233,.14)', icoFg: '#38bdf8' })}
        ${kpiCard('WAVE (30 J)', fcafa(at.wave), { icon: 'M7 2h10v20H7zM11 18h2', icoBg: 'rgba(14,165,233,.14)', icoFg: '#38bdf8' })}
      </div>`)}
    <div class="grid two">
      <div class="panel">
        <h3>CA des 14 derniers jours</h3>
        <div class="chart-wrap">${sparkline(trend)}</div>
      </div>
      <div class="panel">
        <h3>Paiements du jour (Espèces vs Wave)</h3>
        <div class="donut-row">
          ${doughnut(cashToday, waveToday, 'Espèces')}
          <div class="donut-legend">
            <div><span class="dot" style="background:#34d399"></span>Espèces — ${fcafa(cashToday)}</div>
            <div><span class="dot" style="background:rgba(148,179,161,.4)"></span>Wave — ${fcafa(waveToday)}</div>
            <div class="muted">Le marchand Wave de l'app génère un QR code au moment de la vente.</div>
          </div>
        </div>
      </div>
    </div>
    <div class="grid full"><div class="panel">
      <h3>Affluence par heure (30 jours cumulés)</h3>
      <div class="chart-wrap">${bars(peakHours())}</div>
    </div></div>
    ${section('🏆', 'Top vendeurs (30 jours)', `
      <div class="panel">${vendorRows()}</div>`)}
    <div class="cta-row">
      <button class="btn primary" onclick="openSale()">＋ Simuler une vente</button>
      <button class="btn" onclick="openImport()">⬆ Simuler un import de tickets</button>
    </div>`;
}

function vendorRows() {
  const rows = VENDORS.map((v) => {
    const sold = sum(history, (d) => sum(d.sales.filter((s) => s.vendor === v), (s) => s.price));
    return { v, sold, stock: state.stockVendors[v] };
  });
  const tot = Math.max(sum(rows, (r) => r.sold), 1);
  rows.sort((a, b) => b.sold - a.sold);
  return rows.map((r) => `
    <div class="vrow">
      <span class="vpct-label">${r.v}</span>
      <div class="vbar"><span style="width:${(r.sold / tot * 100).toFixed(1)}%"></span></div>
      <span class="vnum">${fcafa(r.sold)}</span>
      <span class="vstock badge ${r.stock === 0 ? 'danger' : ''}">${r.stock} tickets</span>
    </div>`).join('');
}

/* ── Page : Tickets ───────────────────────────────────────────────── */
function lotsTable() {
  const lots = [];
  for (const d of history.slice(-10)) for (const s of d.sales) lots.push(s);
  const latest = lots.slice(-12).reverse();
  return `
    <div class="panel">
      <table class="tbl">
        <thead><tr><th>Code ticket</th><th>Type</th><th>Prix</th><th>Statut</th><th>Heure</th></tr></thead>
        <tbody>${latest.map((s) => `
          <tr>
            <td class="mono">${s.code}</td><td>${s.type.label}</td><td>${fcafa(s.price)}</td>
            <td><span class="badge ok">VENDU</span></td>
            <td class="muted">${String(s.hour).padStart(2, '0')}:h</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function pageTickets() {
  const stock = state.stockCentral + totalStockVendors();
  return `
    ${headerHTML('Inventaire complet des tickets Wi-Fi en stock')}
    ${section('🎟', 'Totaux', `
      <div class="grid kpis">
        ${kpiCard('TOTAL EN STOCK', stock, { icon: 'M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8' })}
        ${kpiCard('STOCK CENTRAL', state.stockCentral, { icon: 'M21 8l-9-5-9 5 9 5zM3 8v8l9 5 9-5V8', icoBg: 'rgba(56,189,248,.14)', icoFg: '#38bdf8' })}
        ${kpiCard('STOCK VENDEURS', totalStockVendors(), { icon: 'M4 8a2 2 0 0 0 0 8v3h16v-3a2 2 0 0 1 0-8V5H4zM13 5v14', icoBg: 'rgba(167,139,250,.14)', icoFg: '#a78bfa' })}
        ${kpiCard('IMPORTS (30 J)', sum(history, (d) => d.stockImported), { icon: 'M12 3v12m0-12l-4 4m4-4l4 4M5 21h14' })}
      </div>`)}
    ${section('⬇', 'Derniers tickets générés', lotsTable())}
    <div class="cta-row">
      <button class="btn primary" onclick="openImport()">⬆ Simuler un import (Excel / coller)</button>
    </div>`;
}

/* ── Page : Vendeurs ──────────────────────────────────────────────── */
function pageVendors() {
  return `
    ${headerHTML('Comptes vendeurs et attribution FIFO des tickets')}
    <div class="grid two">
      ${VENDORS.map((v, i) => {
        const sold = sum(history, (d) => sum(d.sales.filter((s) => s.vendor === v), (s) => s.price));
        const n = sum(history, (d) => d.sales.filter((s) => s.vendor === v).length);
        return `
          <div class="panel">
            <div class="vend-head">
              <div class="avatar">${v.split(' ').map((w) => w[0]).join('')}</div>
              <div><strong>${v.replace(' ', ' ')}</strong><div class="muted small">vendor${i + 1}@advens-demo — Rôle : vendeur</div></div>
            </div>
            <div class="vstats">
              <div><span class="kpi-label">STOCK ATTRIBUÉ</span><span class="kpi-value sm">${state.stockVendors[v]}</span></div>
              <div><span class="kpi-label">TICKETS VENDUS</span><span class="kpi-value sm">${n}</span></div>
              <div><span class="kpi-label">CA GÉNÉRÉ</span><span class="kpi-value sm">${fcafa(sold)}</span></div>
            </div>
            <div class="cta-row nopad">
              <button class="btn" onclick="simAssign('${v}')">⬇ Attribuer 5 tickets (FIFO)</button>
              <button class="btn" onclick="simRequest('${v}')">↩ Demander réappro.</button>
            </div>
          </div>`;
      }).join('')}
    </div>`;
}

/* ── Page : Clients ───────────────────────────────────────────────── */
function pageClients() {
  const rows = CLIENTS.map((c, i) => {
    const purchases = sum(history, (d) => d.sales.filter((s) => s.client === c).length);
    return { c, i, purchases, mac: `3E:1A:${(0x20 + i * 7).toString(16).toUpperCase()}:9B:F${i % 10}:2C` };
  }).sort((a, b) => b.purchases - a.purchases);
  return `
    ${headerHTML('Historique clients (apparié aux ventes), données fictives')}
    <div class="panel"><table class="tbl">
      <thead><tr><th>Client</th><th>Appareil (MAC)</th><th>Factures / tickets</th><th>Note</th></tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr><td>${r.c}</td><td class="mono muted">${r.mac}</td>
          <td>${r.purchases}</td><td>${r.purchases > 6 ? '<span class="badge ok">Fidèle</span>' : '<span class="badge">Occasionnel</span>'}</td></tr>`).join('')}
      </tbody></table>
      <p class="muted small pad">MAC anonymisées et noms générés pour la démo — dans l'app réelle,
      la correspondance client ↔ vente se fait via un numéro au choix du vendeur.</p>
    </div>`;
}

/* ── Page : Dépenses ──────────────────────────────────────────────── */
function pageExpenses() {
  const t = todayTotals();
  const at = allTime();
  return `
    ${headerHTML('Charges d\u2019exploitation du point d\u2019accès')}
    <div class="grid kpis">
      ${kpiCard('AUJOURD\u2019HUI', fcafa(t.dep), { icon: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 6h16v12H4zM4 10h16' })}
      ${kpiCard('TOTAL (30 J)', fcafa(at.dep), { icon: 'M12 2v20M16.5 6.5h-7a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H7' })}
      ${kpiCard('MARGE DU JOUR', fcafa(t.profit), { icon: 'M4 20V10m6 10V4m6 16v-8', icoBg: 'rgba(52,211,153,.14)', icoFg: '#34d399' })}
    </div>
    ${section('🧾', 'Détail des 10 derniers jours', `
      <div class="panel"><table class="tbl">
        <thead><tr><th>Jour</th><th>Libellé</th><th>Montant</th></tr></thead>
        <tbody>
          ${history.slice(-10).reverse().flatMap((d) => d.expenses.map((e) => `
            <tr><td class="muted">J-${d.offset}</td><td>${e.label}</td><td>${fcafa(e.amount)}</td></tr>`)).join('')
            || '<tr><td colspan=3 class="muted">—</td></tr>'}
        </tbody></table></div>`)}
    <div class="cta-row"><button class="btn primary" onclick="simExpense()">＋ Saisir une dépense</button></div>`;
}

/* ── Page : Audit Logs ────────────────────────────────────────────── */
function pageAudit() {
  return `
    ${headerHTML('Piste d\u2019audit inaltérable des actions sensibles')}
    <div class="panel"><table class="tbl">
      <thead><tr><th>Heure</th><th>Acteur</th><th>Action</th><th>Détail</th></tr></thead>
      <tbody>${state.audit.slice().reverse().map((a) => `
        <tr><td class="mono">${a.at}</td><td>${a.actor}</td>
        <td><span class="badge mono">${a.action}</span></td><td class="muted">${a.detail}</td></tr>`).join('')}
      </tbody></table></div>
    <p class="muted small pad">Chaque action que vous faites dans cette simulation (vente, import,
    attribution) est ajoutée à cette piste — exactement comme l'app réelle.</p>`;
}

/* ── Page : Ventes ────────────────────────────────────────────────── */
function pageSales() {
  const latest = [];
  for (const d of history.slice(-6)) for (const s of d.sales) latest.push({ ...s, off: d.offset });
  return `
    ${headerHTML('Historique immuable — chaque ticket délivré, jour par jour')}
    <div class="panel"><table class="tbl">
      <thead><tr><th>Ticket</th><th>Type</th><th>Montant</th><th>Méthode</th><th>Vendeur</th><th>Client</th><th>Quand</th></tr></thead>
      <tbody>${latest.slice(-30).reverse().map((s) => `
        <tr>
          <td class="mono">${s.code}</td><td>${s.type.label}</td><td>${fcafa(s.price)}</td>
          <td><span class="badge ${s.method === 'WAVE' ? 'wave' : ''}">${s.method === 'WAVE' ? 'Wave' : 'Espèces'}</span></td>
          <td>${s.vendor}</td><td class="muted">${s.client}</td>
          <td class="muted">${s.off === 0 ? 'aujourd\u2019hui' : `J-${s.off}`} · ${s.hour}h</td>
        </tr>`).join('')}</tbody></table>
      <p class="muted small pad">🔒 Les lignes ci-dessous ne sont jamais modifiables : l'app
      garantit un historique immuable (aucune route de modification ni de suppression en base).</p>
    </div>
    <div class="cta-row"><button class="btn primary" onclick="openSale()">＋ Simuler une vente</button></div>`;
}

/* ── Modal vente ──────────────────────────────────────────────────── */
window.openSale = function () {
  modal(`
    <h3>🛒 Nouvelle vente (simulation)</h3>
    <p class="muted small">Choisissez le forfait, le mode de paiement et le vendeur.</p>
    <div class="form">
      <label>Forfait ${TICKET_TYPES.map((t, i) => `
        <span class="choice"><input type="radio" name="ttype" value="${i}" ${i === 0 ? 'checked' : ''}> ${t.label} — ${t.price} FCFA</span>`).join('')}</label>
      <label>Paiement
        <select id="sale-method"><option value="CASH">Espèces</option><option value="WAVE">Wave</option></select></label>
      <label>Vendeur <select id="sale-vendor">${VENDORS.map((v) => `<option>${v}</option>`).join('')}</select></label>
      <label>Client <select id="sale-client">${CLIENTS.map((c) => `<option>${c}</option>`).join('')}</select></label>
    </div>
    <div class="cta-row">
      <button class="btn primary" onclick="confirmSale()">Valider la vente</button>
      <button class="btn" onclick="closeModal()">Annuler</button>
    </div>`);
};

window.confirmSale = function () {
  const ti = +document.querySelector('input[name=ttype]:checked').value;
  const t = TICKET_TYPES[ti];
  const method = el('sale-method').value;
  const vendor = el('sale-vendor').value;
  const client = el('sale-client').value;
  const hour = Math.max(8, Math.min(22, rint(8, 22)));
  const sale = { type: t, price: t.price, method, vendor, client, code: ticketCode(), hour };
  state.today.sales.push(sale);
  if (state.stockCentral > 0) { state.stockCentral--; }
  else if (state.stockVendors[vendor] > 0) { state.stockVendors[vendor]--; }
  log('SALE_CREATE', `Vente ${t.code} ${t.price} FCFA (${method}) par ${vendor}`);
  closeModal(`✅ Vente enregistrée — ticket <span class="mono">${sale.code}</span>
    ${method === 'WAVE' ? '· QR marchand Wave affiché au comptoir (simulation)' : ''}`);
  render();
};

window.simAssign = function (vendor) {
  state.stockCentral = Math.max(0, state.stockCentral - 5);
  state.stockVendors[vendor] += 5;
  log('STOCK_ASSIGN', `5 tickets attribués à ${vendor} (FIFO)`);
  render();
};

window.simRequest = function (vendor) {
  state.pendingResupply.unshift({ vendor, type: 'F6', qty: 10, status: 'EN ATTENTE', at: state.clock });
  log('RESUPPLY_REQUEST', `${vendor} demande 10 × F6`);
  render();
};

window.simExpense = function () { state.today.expenses.push({ label: 'Dépense saisie en démo', amount: rint(1, 6) * 500 }); log('EXPENSE_CREATE', 'Dépense saisie'); render(); };

window.openImport = function () {
  modal(`
    <h3>⬆ Import de tickets (simulation)</h3>
    <p class="muted small">Dans l'app réelle : import Excel/presse-papiers d'un lot acheté à l'ISP,
    avec détection automatique des doublons.</p>
    <div class="form">
      <label>Type de lot
        <select id="imp-type">${TICKET_TYPES.map((t) => `<option value="${t.price}">${t.label} (${t.price} FCFA)</option>`).join('')}</select></label>
      <label>Quantité <input id="imp-qty" type="number" value="20" min="1" max="200"/></label>
    </div>
    <div class="cta-row">
      <button class="btn primary" onclick="confirmImport()">Importer</button>
      <button class="btn" onclick="closeModal()">Annuler</button>
    </div>`);
};

window.confirmImport = function () {
  const qty = Math.min(200, Math.max(1, +el('imp-qty').value || 20));
  state.stockCentral += qty;
  log('IMPORT_LOT', `Lot de ${qty} tickets importé — 0 doublon détecté`);
  closeModal(`✅ Lot de ${qty} tickets importé — détection des doublons : <strong>aucun</strong> (lot propre)`);
  render();
};

window.resetSim = function () {
  location.hash = '#dashboard';
  location.reload();
};

function log(action, detail) {
  state.audit.push({ at: `${state.clock}`, actor: 'Demo Admin', action, detail });
}

/* ── Pages simples ───────────────────────────────────────────────── */
function pageClosures() {
  const at = allTime();
  return `
    ${headerHTML('Résumés de fermeture de caisse (fin de journée)')}
    <div class="panel"><table class="tbl">
      <thead><tr><th>Journée</th><th>Tickets</th><th>CA</th><th>Espèces</th><th>Wave</th><th>Écart caisse</th><th>Statut</th></tr></thead>
      <tbody>${history.slice(-8).reverse().map((d) => {
        const T = dayTotals(d);
        const cash = sum(d.sales.filter((s) => s.method === 'CASH'), (s) => s.price);
        return `<tr><td class="muted">${d.offset === 0 ? 'aujourd\u2019hui' : `J-${d.offset}`}</td>
          <td>${T.count}</td><td>${fcafa(T.ca)}</td><td>${fcafa(cash)}</td>
          <td>${fcafa(T.ca - cash)}</td><td class="mono">${rint(-1000, 1000)} FCFA</td>
          <td><span class="badge ok">Clôturée</span></td></tr>`;
      }).join('')}</tbody></table></div>
    <p class="muted small pad">Chaque clôture fige un résumé PDF pour la comptabilité — le total
    des 30 jours simulés : <strong>${fcafa(at.ca)}</strong>.</p>`;
}

function pageResupply() {
  return `
    ${headerHTML('Flux d\u2019approvisionnement vendeurs (demande → approbation admin)')}
    <div class="panel"><table class="tbl">
      <thead><tr><th>Vendeur</th><th>Type</th><th>Qté</th><th>Statut</th><th>Demandé à</th><th></th></tr></thead>
      <tbody>${state.pendingResupply.map((r, i) => `
        <tr><td>${r.vendor}</td><td>${r.type}</td><td>${r.qty}</td>
        <td><span class="badge ${r.status === 'EN ATTENTE' ? 'warn' : 'ok'}">${r.status}</span></td>
        <td class="mono muted">${r.at}</td>
        <td>${r.status === 'EN ATTENTE' ? `<button class="btn sm" onclick="approve(${i})">Approuver</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>
    <p class="muted small pad">Flux réel : le vendeur demande depuis son téléphone → l'admin
    voit une notification sur le tableau de bord → approbation → attribution FIFO automatique.</p>`;
}
window.approve = function (i) {
  const r = state.pendingResupply[i];
  r.status = 'APPROUVÉE';
  state.stockVendors[r.vendor] += r.qty;
  log('RESUPPLY_APPROVE', `Réappro. de ${r.qty} × ${r.type} vers ${r.vendor}`);
  render();
};

function pageReports() {
  return `
    ${headerHTML('Exports comptables et analyses de performance')}
    <div class="grid kpis">
      ${kpiCard('CA 30 JOURS', fcafa(allTime().ca), { icon: 'M3 17l5-8 4 4 5-7 4 5' })}
      ${kpiCard('TODO', `${allTime().count} tickets`, { icon: 'M12 8v4l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18' })}
      ${kpiCard('TICKET MOYEN', fcafa(Math.round(allTime().ca / Math.max(allTime().count, 1))), { icon: 'M12 2v20M16.5 6.5h-7a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H7' })}
      ${kpiCard('MARGE MOYENNE', fcafa(Math.round(allTime().profit / 30)), { icon: 'M4 20V10m6 10V4m6 16v-8', icoBg: 'rgba(52,211,153,.14)', icoFg: '#34d399' })}
    </div>
    <div class="panel"><h3>Téléchargements (réels, générés depuis les données de simulation)</h3>
      <div class="cta-row">
        <button class="btn primary" onclick="downloadCSV('ventes_demo.csv')">⬇ Export ventes (CSV ≈ Excel)</button>
        <button class="btn" onclick="downloadCSV('depenses_demo.csv')">⬇ Export dépenses (CSV)</button>
        <button class="btn" onclick="downloadCSV('cloture_demo.csv')">⬇ Bilan clôture (CSV)</button>
      </div></div>
    <div class="panel"><h3>Heures de pointe</h3>
      <div class="chart-wrap">${bars(peakHours())}</div></div>`;
}

window.downloadCSV = function (name) {
  let rows;
  if (name.startsWith('ventes')) rows = [['code', 'type', 'prix_fcfa', 'methode', 'vendeur', 'client', 'jour'],
    ...history.flatMap((d) => d.sales.map((s) => [s.code, s.type.code, s.price, s.method, s.vendor, s.client, `J-${d.offset}`]))];
  else if (name.startsWith('depenses')) rows = [['jour', 'libelle', 'montant_fcfa'],
    ...history.flatMap((d) => d.expenses.map((e) => [`J-${d.offset}`, e.label, e.amount]))];
  else rows = [['jour', 'tickets', 'ca_fcfa'], ...history.map((d) => [`J-${d.offset}`, dayTotals(d).count, dayTotals(d).ca])];
  const csv = rows.map((r) => r.join(',')).join('\\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
  log('EXPORT', `Export ${name}`);
};

function pageSettings() {
  return `
    ${headerHTML('Configuration du centre Adven\u2019s (exemple factice)')}
    <div class="panel"><table class="tbl">
      <tbody>
        <tr><td>Nom du point</td><td><strong>Adven's Center — Hotspot Wi-Fi</strong></td></tr>
        <tr><td>Devise</td><td class="mono">XOF (FCFA)</td></tr>
        <tr><td>Marchand Wave</td><td class="mono">+225 07 XX XX XX XX (masqué en démo)</td></tr>
        <tr><td>Vendeurs actifs</td><td>${VENDORS.length}</td></tr>
        <tr><td>Sauvegardes automatiques</td><td><span class="badge ok">Chaque nuit 03:00</span></td></tr>
        <tr><td>PWA smartphone</td><td><span class="badge ok">Installée sur 4 téléphones</span></td></tr>
      </tbody></table>
      <p class="muted small pad">Dans l'app réelle, cette page est réservée au rôle <strong>admin</strong> :
      RBAC strict, jetons rotatifs, uploads authentifiés et journalisation complète
      (voir README → Security).</p></div>`;
}

/* ── Modal engine ─────────────────────────────────────────────────── */
function modal(html) {
  const m = el('modal');
  m.querySelector('.modal-body').innerHTML = html;
  m.classList.add('open');
}
window.closeModal = function () { el('modal').classList.remove('open'); };
function closeModal(html) {
  const m = el('modal');
  m.querySelector('.modal-body').innerHTML = `
    <div class="success"><strong>${html}</strong>
    <p class="muted small">Ajouté à la piste d'audit — visible dans l'onglet « Audit Logs ».</p></div>
    <div class="cta-row"><button class="btn primary" onclick="closeModal()">Fermer</button></div>`;
  m.classList.add('open');
}

/* ── Router + rendu ───────────────────────────────────────────────── */
const pages = {
  dashboard: pageDashboard, tickets: pageTickets, vendors: pageVendors,
  clients: pageClients, audit: pageAudit, sales: pageSales, closures: pageClosures,
  resupply: pageResupply, reports: pageReports, settings: pageSettings, expenses: pageExpenses,
};

function render() {
  page = (location.hash || '#dashboard').slice(1);
  if (!pages[page]) page = 'dashboard';
  el('sidebar').innerHTML = sidebarHTML(page);
  el('main').innerHTML = pages[page]();
  el('btn-reset').onclick = window.resetSim;
}
addEventListener('hashchange', render);
render();
setInterval(() => {
  state.clock = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const c = el('demo-clock');
  if (c) c.textContent = state.clock;
}, 15000);
