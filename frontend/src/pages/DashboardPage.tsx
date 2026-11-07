/* ============================================================
   Dashboard Page — Real-time statistics
   ============================================================ */

import { useEffect, useState } from 'react';
import {
  Package, ShoppingCart, DollarSign, Banknote, Smartphone,
  Clock, Users, BarChart3, TrendingUp, Ticket, Crown, UserCheck, CalendarDays, Zap, Wallet, Activity, PieChart as PieIcon
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import type { DashboardStats, StockSummaryItem } from '../types';

interface SalesTrendItem {
  date: string;
  revenue: number;
  sales_count: number;
}

/* Skeleton loading placeholder */
function DashboardSkeleton() {
  return (
    <div>
      <div className="mb-6">
        <div className="skeleton" style={{ height: 28, width: 220, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 14, width: 300 }} />
      </div>
      <div className="stats-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton skeleton-icon" />
            <div>
              <div className="skeleton skeleton-text-sm" />
              <div className="skeleton skeleton-text-lg" />
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 20, marginTop: 24 }}>
        <div className="skeleton" style={{ height: 18, width: 280, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 200, width: '100%' }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [stockSummary, setStockSummary] = useState<StockSummaryItem[]>([]);
  const [salesTrend, setSalesTrend] = useState<SalesTrendItem[]>([]);
  const [hourlyTrend, setHourlyTrend] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [vendorsList, setVendorsList] = useState<any[]>([]);

  useEffect(() => {
    loadData(selectedVendorId);
  }, [selectedVendorId]);

  const loadData = async (vendorId: string = '') => {
    try {
      const params = vendorId ? { vendor_id: Number(vendorId) } : {};
      const promises: Promise<any>[] = [
        api.get('/api/dashboard/', { params }),
        api.get('/api/tickets/stock-summary'),
        api.get('/api/dashboard/sales-trend', { params }),
        api.get('/api/dashboard/hourly-trend'),
      ];
      if (isAdmin) {
        promises.push(api.get('/api/expenses/'));
      }
      
      const results = await Promise.all(promises);
      setStats(results[0].data);
      setStockSummary(results[1].data);
      setSalesTrend(results[2].data);
      setHourlyTrend(results[3].data);
      
      if (isAdmin) {
        setExpenses(results[4].data);
      }

      if (isAdmin && vendorsList.length === 0) {
        const vendorsRes = await api.get('/api/users/');
        setVendorsList(vendorsRes.data.filter((u: any) => u.role === 'vendor'));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return <DashboardSkeleton />;
  }

  const formatCFA = (n: number) =>
    new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';

  const todayStr = new Date().toISOString().split('T')[0];
  const todayExpenses = expenses
    .filter(e => e.created_at.startsWith(todayStr))
    .reduce((sum, curr) => sum + Number(curr.amount), 0);
  const netProfit = stats.today_revenue - todayExpenses;

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'internet': return 'Internet';
      case 'fuel': return 'Carburant';
      case 'rent': return 'Loyer';
      case 'salary': return 'Salaires';
      default: return 'Autres';
    }
  };

  const expensesByCategory = expenses.reduce((acc: any, curr: any) => {
    const category = curr.category;
    if (!acc[category]) {
      acc[category] = 0;
    }
    acc[category] += Number(curr.amount);
    return acc;
  }, {});

  const expensesPieData = Object.keys(expensesByCategory).map(cat => ({
    name: getCategoryName(cat),
    value: expensesByCategory[cat]
  }));
  const expensesColors = ['#f43f5e', '#f59e0b', '#3b82f6', '#10b981', '#6366f1'];

  /* Overview cards — stock & activity */
  const overviewCards = [
    ...(isAdmin
      ? [{ icon: Package, label: 'Stock central', value: stats.central_stock, color: 'blue' }]
      : []),
    { icon: Ticket, label: isAdmin ? 'Stock vendeurs' : 'Mon stock', value: stats.vendor_stock, color: 'purple' },
    { icon: ShoppingCart, label: 'Ventes du jour', value: stats.today_sales, color: 'green' },
    { icon: Clock, label: 'Demandes en attente', value: stats.pending_requests, color: 'red' },
    ...(isAdmin
      ? [{ icon: Users, label: 'Vendeurs actifs', value: stats.total_vendors, color: 'purple' }]
      : []),
  ];

  /* Revenue hero cards — prominently displayed */
  const heroCards = [
    { icon: DollarSign, label: 'CA du jour', value: formatCFA(stats.today_revenue), color: 'gold' },
    { icon: TrendingUp, label: 'CA total', value: formatCFA(stats.total_revenue), color: 'green' },
    ...(isAdmin
      ? [{ icon: BarChart3, label: 'Bénéfice Net du jour', value: formatCFA(netProfit), color: netProfit >= 0 ? 'green' : 'red' }]
      : []),
  ];

  /* Payment breakdown cards */
  const paymentCards = [
    { icon: Banknote, label: 'Espèces (Jour)', value: formatCFA(stats.cash_payments), color: 'green' },
    { icon: Banknote, label: 'Espèces (Total)', value: formatCFA(stats.total_cash_payments), color: 'green' },
    { icon: Smartphone, label: 'Wave (Jour)', value: formatCFA(stats.wave_payments), color: 'blue' },
    { icon: Smartphone, label: 'Wave (Total)', value: formatCFA(stats.total_wave_payments), color: 'blue' },
    ...(isAdmin
      ? [{ icon: Wallet, label: 'Dépenses du jour', value: formatCFA(todayExpenses), color: 'red' }]
      : []),
  ];

  const pieData = [
    { name: 'Espèces', value: stats.total_cash_payments || 1 },
    { name: 'Wave', value: stats.total_wave_payments || 1 },
  ];
  const pieColors = ['#22c55e', '#3b82f6'];

  const ticketPieData = [
    { name: 'Ventes', value: (stats.total_sold || 0) - (stats.total_compensation || 0) },
    { name: 'Dédommagements', value: stats.total_compensation || 0 },
    { name: 'Erreurs (Défectueux)', value: stats.total_defective || 0 },
  ];
  const ticketPieColors = ['#10b981', '#3b82f6', '#ef4444'];

  return (
    <div>
      {/* Page Title & Vendor Filter */}
      <div className="mb-6 flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>
            {isAdmin ? 'Tableau de bord' : `Bonjour, ${user?.full_name}`}
          </h2>
          <p className="text-muted text-sm" style={{ marginTop: '4px' }}>
            {isAdmin ? 'Vue d\'ensemble de votre activité' : 'Résumé de votre activité du jour'}
          </p>
        </div>
        {isAdmin && (
          <div className="form-group" style={{ marginBottom: 0, minWidth: '220px' }}>
            <select
              className="form-input"
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
            >
              <option value="">Tous les vendeurs (Global)</option>
              {vendorsList.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.full_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ─── Section 1: Overview ─── */}
      <div className="section-title">
        <div className="section-icon blue"><Activity size={16} /></div>
        Vue d'ensemble
      </div>
      <div className="stats-grid">
        {overviewCards.map((card, i) => (
          <div key={i} className="stat-card">
            <div className={`stat-icon ${card.color}`}>
              <card.icon size={22} />
            </div>
            <div className="stat-info">
              <h3>{card.label}</h3>
              <div className="stat-value">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Section 2: Revenue (Hero Cards) ─── */}
      {isAdmin && (
        <>
          <div className="section-title" style={{ marginTop: '28px' }}>
            <div className="section-icon gold"><DollarSign size={16} /></div>
            Chiffre d'affaires
          </div>
          <div className="stats-grid" style={{ gridTemplateColumns: `repeat(${heroCards.length}, 1fr)` }}>
            {heroCards.map((card, i) => (
              <div key={i} className="stat-card-hero">
                <div className={`stat-icon ${card.color}`}>
                  <card.icon size={24} />
                </div>
                <div className="stat-info">
                  <h3>{card.label}</h3>
                  <div className="stat-value">{card.value}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ─── Section 3: Payment Breakdown ─── */}
      {isAdmin && (
        <>
          <div className="section-title" style={{ marginTop: '28px' }}>
            <div className="section-icon green"><Banknote size={16} /></div>
            Répartition des paiements
          </div>
          <div className="stats-grid">
            {paymentCards.map((card, i) => (
              <div key={i} className="stat-card">
                <div className={`stat-icon ${card.color}`}>
                  <card.icon size={22} />
                </div>
                <div className="stat-info">
                  <h3>{card.label}</h3>
                  <div className="stat-value">{card.value}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ─── Section 3.5: Cash Situation (Net Balance) ─── */}
      {isAdmin && (
        <>
          <div className="section-title" style={{ marginTop: '28px' }}>
            <div className="section-icon gold"><Wallet size={16} /></div>
            Situation de Caisse (Solde Net)
          </div>
          <div className="stats-grid">
            <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(34, 197, 94, 0.01))', borderColor: 'rgba(34, 197, 94, 0.15)' }}>
              <div className="stat-icon green">
                <Banknote size={22} />
              </div>
              <div className="stat-info">
                <h3>Caisse Physique (Espèces)</h3>
                <div className="stat-value" style={{ color: '#22c55e' }}>{formatCFA(stats.cash_balance)}</div>
              </div>
            </div>
            <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.01))', borderColor: 'rgba(59, 130, 246, 0.15)' }}>
              <div className="stat-icon blue">
                <Smartphone size={22} />
              </div>
              <div className="stat-info">
                <h3>Solde Compte Wave</h3>
                <div className="stat-value" style={{ color: '#3b82f6' }}>{formatCFA(stats.wave_balance)}</div>
              </div>
            </div>
            <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.08), rgba(234, 179, 8, 0.01))', borderColor: 'rgba(234, 179, 8, 0.15)' }}>
              <div className="stat-icon gold">
                <Wallet size={22} />
              </div>
              <div className="stat-info">
                <h3>Somme Globale</h3>
                <div className="stat-value" style={{ color: '#eab308' }}>{formatCFA(stats.global_balance)}</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── Section 4: Revenue Trend ─── */}
      {isAdmin && (
        <div className="card mb-4 slide-up" style={{ padding: '24px', marginTop: '8px' }}>
          <div className="section-title" style={{ marginBottom: '20px', marginTop: 0 }}>
            <div className="section-icon blue"><TrendingUp size={16} /></div>
            Évolution du chiffre d'affaires (7 derniers jours)
          </div>
          {salesTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={salesTrend}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickFormatter={(val) => `${val / 1000}k`} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(value) => formatCFA(value as number)}
                  contentStyle={{
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    color: '#f1f5f9',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  }}
                />
                <Area type="monotone" dataKey="revenue" name="Chiffre d'affaires" stroke="#818cf8" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">
              <p>Aucune donnée disponible</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Section 5: Charts ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? 'repeat(auto-fit, minmax(350px, 1fr))' : '1fr', gap: '20px', marginTop: '8px' }}>
        {/* Stock by Type */}
        <div className="card slide-up" style={{ padding: '24px' }}>
          <div className="section-title" style={{ marginBottom: '20px', marginTop: 0 }}>
            <div className="section-icon purple"><BarChart3 size={16} /></div>
            Stock par type
          </div>
          {stockSummary.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stockSummary.map((s) => ({
                name: s.subscription_type.name,
                Disponible: s.available,
                Attribué: s.assigned,
                Vendu: s.sold,
              }))}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    color: '#f1f5f9',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  }}
                />
                <Bar dataKey="Disponible" fill="#818cf8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Attribué" fill="#a855f7" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Vendu" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">
              <p>Aucune donnée</p>
            </div>
          )}
        </div>

        {/* Hourly Trend Chart (Peak Hours) */}
        <div className="card slide-up" style={{ padding: '24px' }}>
          <div className="section-title" style={{ marginBottom: '20px', marginTop: 0 }}>
            <div className="section-icon blue"><Clock size={16} /></div>
            Heures d'affluence (Peak Hours)
          </div>
          {hourlyTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={hourlyTrend}>
                <defs>
                  <linearGradient id="colorHourly" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="hour" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(val) => [`${val} vente(s)`, 'Ventes']}
                  contentStyle={{
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    color: '#f1f5f9',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  }}
                />
                <Area type="monotone" dataKey="sales_count" name="Ventes" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorHourly)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">
              <p>Aucune donnée disponible</p>
            </div>
          )}
        </div>

        {/* Expenses Category Pie Chart */}
        {isAdmin && expensesPieData.length > 0 && (
          <div className="card slide-up" style={{ padding: '24px' }}>
            <div className="section-title" style={{ marginBottom: '20px', marginTop: 0 }}>
              <div className="section-icon red"><Wallet size={16} /></div>
              Répartition des dépenses
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={expensesPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                >
                  {expensesPieData.map((_, i) => (
                    <Cell key={i} fill={expensesColors[i % expensesColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatCFA((value as unknown) as number)}
                  contentStyle={{
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '10px',
                    color: '#f1f5f9',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Payment Distribution Pie */}
        {isAdmin && (
          <div className="card slide-up" style={{ padding: '24px' }}>
            <div className="section-title" style={{ marginBottom: '20px', marginTop: 0 }}>
              <div className="section-icon gold"><PieIcon size={16} /></div>
              Répartition des paiements
            </div>
            {stats.total_revenue > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={pieColors[i]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCFA((value as unknown) as number)}
                    contentStyle={{
                      background: '#1e293b',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '10px',
                      color: '#f1f5f9',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '60px 24px' }}>
                <p>Aucune vente enregistrée</p>
              </div>
            )}
          </div>
        )}

        {/* Ticket Distribution Pie */}
        {isAdmin && (
          <div className="card slide-up" style={{ padding: '24px' }}>
            <div className="section-title" style={{ marginBottom: '20px', marginTop: 0 }}>
              <div className="section-icon red"><PieIcon size={16} /></div>
              Répartition des tickets (Ventes vs. Erreurs vs. Dédommagements)
            </div>
            {stats.total_sold > 0 || stats.total_defective > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={ticketPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, value, percent }) => `${name}: ${value} (${((percent || 0) * 100).toFixed(0)}%)`}
                  >
                    {ticketPieData.map((_, i) => (
                      <Cell key={i} fill={ticketPieColors[i]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `${value} ticket(s)`}
                    contentStyle={{
                      background: '#1e293b',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '10px',
                      color: '#f1f5f9',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: '60px 24px' }}>
                <p>Aucun ticket vendu ou défectueux</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Section 6: Performance Stats (Admin only) ─── */}
      {isAdmin && (
        <div style={{ marginTop: '32px', marginBottom: '24px' }}>
          <div className="section-title">
            <div className="section-icon gold"><Crown size={16} /></div>
            Statistiques détaillées (Performances)
          </div>
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {/* Top Client */}
            <div className="stat-card">
              <div className="stat-icon gold">
                <Crown size={22} />
              </div>
              <div className="stat-info">
                <h3>Meilleur client</h3>
                <div className="stat-value" style={{ fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={stats.top_client_name || 'Aucun'}>
                  {stats.top_client_name || 'Aucun'}
                </div>
                <div className="text-muted text-sm">{stats.top_client_tickets} ticket(s) acheté(s)</div>
              </div>
            </div>

            {/* Top Vendor */}
            <div className="stat-card">
              <div className="stat-icon purple">
                <UserCheck size={22} />
              </div>
              <div className="stat-info">
                <h3>Meilleur vendeur</h3>
                <div className="stat-value" style={{ fontSize: '1.1rem' }}>
                  {stats.top_vendor_name || 'Aucun'}
                </div>
                <div className="text-muted text-sm">{stats.top_vendor_tickets} ticket(s) vendu(s)</div>
              </div>
            </div>

            {/* Top Subscription Type */}
            <div className="stat-card">
              <div className="stat-icon blue">
                <Zap size={22} />
              </div>
              <div className="stat-info">
                <h3>Forfait le plus vendu</h3>
                <div className="stat-value" style={{ fontSize: '1.1rem' }}>
                  {stats.top_subscription_type_name || 'Aucun'}
                </div>
                <div className="text-muted text-sm">{stats.top_subscription_type_tickets} vente(s)</div>
              </div>
            </div>

            {/* Top Day */}
            <div className="stat-card">
              <div className="stat-icon red">
                <CalendarDays size={22} />
              </div>
              <div className="stat-info">
                <h3>Jour de forte affluence</h3>
                <div className="stat-value" style={{ fontSize: '1.1rem' }}>
                  {stats.top_day_name || 'Aucun'}
                </div>
                <div className="text-muted text-sm">{stats.top_day_tickets} ticket(s) acheté(s)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Section 7: Vendor Leaderboard (Admin only) ─── */}
      {isAdmin && stats.vendor_performance && stats.vendor_performance.length > 0 && (
        <div style={{ marginTop: '32px', marginBottom: '24px' }} className="slide-up">
          <div className="section-title">
            <div className="section-icon purple"><TrendingUp size={16} /></div>
            Classement de performance des vendeurs
          </div>
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Rang</th>
                  <th>Vendeur</th>
                  <th>Tickets vendus</th>
                  <th>Chiffre d'affaires</th>
                </tr>
              </thead>
              <tbody>
                {stats.vendor_performance.map((v, index) => (
                  <tr key={v.vendor_id}>
                    <td style={{ fontWeight: 700, color: index === 0 ? '#fbbf24' : 'var(--text-secondary)' }}>
                      {index === 0 ? '🏆 1' : `${index + 1}`}
                    </td>
                    <td style={{ fontWeight: 600 }}>{v.vendor_name}</td>
                    <td style={{ fontWeight: 700, color: '#a855f7' }}>{v.sales_count} ticket(s)</td>
                    <td style={{ fontWeight: 700, color: '#10b981' }}>{formatCFA(v.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
