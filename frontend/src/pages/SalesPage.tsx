/* ============================================================
   Sales Page — Sell tickets, view history, cancel (admin)
   ============================================================ */

import { useEffect, useState, type FormEvent } from 'react';
import { ShoppingCart, X, QrCode, Calendar, User, Clock, CreditCard, Tag, AlertTriangle, Shield, CheckCircle2, MessageCircle, MessageSquare, Download, Lock } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import SecureImage from '../components/SecureImage';
import type { Sale, SubscriptionType, PaymentMethod, StockSummaryItem } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');

export default function SalesPage() {
  const { user, addToast } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'technician';

  const [sales, setSales] = useState<Sale[]>([]);
  const [subTypes, setSubTypes] = useState<SubscriptionType[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [stockSummary, setStockSummary] = useState<StockSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Sales History filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Sale form
  const [showSale, setShowSale] = useState(false);
  const [saleTypeId, setSaleTypeId] = useState('');
  const [saleQuantity, setSaleQuantity] = useState<number | ''>(1);
  const [salePayment, setSalePayment] = useState('Espèces');
  const [saleClientName, setSaleClientName] = useState('');
  const [saleClientPhone, setSaleClientPhone] = useState('');
  const [selling, setSelling] = useState(false);
  const [saleResult, setSaleResult] = useState<Sale[] | null>(null);

  // Manual ticket code state for physical sales
  const [isManualTicketCode, setIsManualTicketCode] = useState(false);
  const [manualTicketCode, setManualTicketCode] = useState('');
  const [checkingTicketCode, setCheckingTicketCode] = useState(false);
  const [manualTicketObject, setManualTicketObject] = useState<any | null>(null);
  const [ticketCodeError, setTicketCodeError] = useState('');

  // Autocomplete client state
  const [clients, setClients] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Cancel form
  const [showCancel, setShowCancel] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelMarkDefective, setCancelMarkDefective] = useState(false);

  // Selected sale details modal state
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  // Edit client details state (admin only)
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [editClientName, setEditClientName] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  useEffect(() => {
    setIsEditingClient(false);
  }, [selectedSale]);

  useEffect(() => { loadData(); }, []);

  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!saleTypeId) {
      setSaleQuantity(1);
    }
  }, [saleTypeId]);

  useEffect(() => {
    if (showSale) {
      api.get('/api/sales/clients')
        .then(res => setClients(res.data))
        .catch(err => console.error('Error loading clients:', err));
    }
  }, [showSale]);

  // Debounced verification of physical ticket code
  useEffect(() => {
    if (!isManualTicketCode || !manualTicketCode.trim()) {
      setManualTicketObject(null);
      setTicketCodeError('');
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setCheckingTicketCode(true);
      setTicketCodeError('');
      setManualTicketObject(null);
      try {
        const res = await api.get(`/api/tickets/search?code=${manualTicketCode.trim()}`);
        const ticket = res.data;

        if (ticket.status === 'sold') {
          setTicketCodeError('Ce ticket a déjà été vendu.');
        } else if (ticket.status === 'defective') {
          setTicketCodeError('Ce ticket est marqué comme défectueux.');
        } else {
          // Check role restrictions
          const isUserAdmin = user?.role === 'admin';
          if (isUserAdmin && ticket.status !== 'available') {
            setTicketCodeError("Ce ticket n'est pas disponible dans le stock central.");
          } else if (!isUserAdmin && (ticket.status !== 'assigned' || ticket.assigned_to !== user?.id)) {
            setTicketCodeError("Ce ticket ne vous est pas attribué.");
          } else {
            // Valid ticket
            setManualTicketObject(ticket);
            setSaleTypeId(String(ticket.subscription_type_id));
            setSaleQuantity(1);
          }
        }
      } catch (err: any) {
        if (err.response?.status === 404) {
          setTicketCodeError('Code ticket introuvable.');
        } else {
          setTicketCodeError('Erreur de vérification du ticket.');
        }
      } finally {
        setCheckingTicketCode(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [manualTicketCode, isManualTicketCode, user]);

  const loadData = async () => {
    try {
      const [salesRes, typesRes, pmRes, stockRes] = await Promise.all([
        api.get('/api/sales/'),
        api.get('/api/tickets/subscription-types'),
        api.get('/api/settings/payment-methods/active'),
        api.get('/api/tickets/stock-summary'),
      ]);
      setSales(salesRes.data);
      setSubTypes(typesRes.data);
      setPaymentMethods(pmRes.data);
      setStockSummary(stockRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const formatCFA = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';

  const filteredSales = sales.filter(s => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchCode = s.ticket_code?.toLowerCase().includes(q);
      const matchClient = s.client_name?.toLowerCase().includes(q);
      const matchPhone = s.client_phone?.toLowerCase().includes(q);
      const matchVendor = s.vendor_name?.toLowerCase().includes(q);
      if (!matchCode && !matchClient && !matchPhone && !matchVendor) return false;
    }
    if (paymentFilter && paymentFilter !== 'all') {
      if (s.payment_method !== paymentFilter) return false;
    }
    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'cancelled' && !s.is_cancelled) return false;
      if (statusFilter === 'active' && s.is_cancelled) return false;
      if (statusFilter === 'credit' && (s.payment_method !== 'credit' || s.is_paid)) return false;
    }
    return true;
  });

  const handleExportCSV = () => {
    if (filteredSales.length === 0) {
      addToast('Aucune vente à exporter', 'error');
      return;
    }
    const headers = ['ID', 'Code Ticket', 'Type Forfait', 'Durée (h)', 'Client', 'Téléphone', 'Mode Paiement', 'Montant (FCFA)', 'Vendeur', 'Date', 'Statut', 'Motif Annulation'];
    const rows = filteredSales.map(s => [
      s.id,
      `"${s.ticket_code || ''}"`,
      `"${s.subscription_type_name || ''}"`,
      s.subscription_duration_hours || '',
      `"${s.client_name || ''}"`,
      `"${s.client_phone || ''}"`,
      `"${s.payment_method || ''}"`,
      s.amount,
      `"${s.vendor_name || ''}"`,
      `"${new Date(s.created_at).toLocaleString('fr-FR')}"`,
      s.is_cancelled ? 'Annulée' : (s.payment_method === 'credit' && !s.is_paid ? 'À crédit' : 'Valide'),
      `"${s.cancel_reason || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `historique_ventes_advens_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    addToast('Historique des ventes exporté en CSV avec succès !', 'success');
  };

  const getSaleStatusBadge = (s: Sale) => {
    if (s.ticket_status === 'defective') {
      return <span className="badge badge-rejected">Défectueux</span>;
    }
    if (s.is_cancelled) {
      return <span className="badge badge-rejected">Annulée</span>;
    }
    if (s.payment_method === 'credit' && !s.is_paid) {
      return <span className="badge badge-pending">À crédit</span>;
    }
    if (s.payment_method === 'compensation') {
      return <span className="badge badge-defective">Dédommagement</span>;
    }
    if (!s.subscription_duration_hours) {
      return <span className="badge badge-approved">Valide</span>;
    }

    const createdAt = new Date(s.created_at);
    const expirationTime = new Date(createdAt.getTime() + s.subscription_duration_hours * 60 * 60 * 1000);
    const now = new Date();
    const remainingMs = expirationTime.getTime() - now.getTime();
    const remainingHours = remainingMs / (1000 * 60 * 60);

    if (remainingMs < 0) {
      return <span className="badge badge-inactive">Expiré</span>;
    }
    if (remainingHours <= 8) {
      return <span className="badge badge-pending" title={`Expire le ${expirationTime.toLocaleString('fr-FR')}`}>Presque fini</span>;
    }
    return <span className="badge badge-approved" title={`Expire le ${expirationTime.toLocaleString('fr-FR')}`}>Actif</span>;
  };

  const getPaymentMethodBadge = (s: Sale) => {
    if (s.payment_method === 'cash') {
      return <span className="badge badge-cash">Espèces</span>;
    }
    if (s.payment_method === 'wave') {
      return <span className="badge badge-wave">Wave</span>;
    }
    if (s.payment_method === 'compensation') {
      return <span className="badge badge-defective">Dédommagement</span>;
    }
    if (s.payment_method === 'credit') {
      return (
        <span className={`badge ${s.is_paid ? 'badge-approved' : 'badge-pending'}`}>
          Crédit {s.is_paid ? '(Payé)' : '(Non payé)'}
        </span>
      );
    }
    return <span className="badge">{s.payment_method}</span>;
  };

  const selectedWaveMethod = paymentMethods.find(m => m.name.toLowerCase().includes('wave'));

  const handleSell = async (e: FormEvent) => {
    e.preventDefault();
    if (isManualTicketCode && !manualTicketObject) {
      addToast('Veuillez saisir un code de ticket valide.', 'error');
      return;
    }
    setSelling(true);
    try {
      const payload: any = {
        subscription_type_id: Number(saleTypeId),
        quantity: isManualTicketCode ? 1 : Number(saleQuantity),
        payment_method: salePayment.toLowerCase() === 'espèces' ? 'cash' : (salePayment.toLowerCase() === 'crédit' ? 'credit' : salePayment.toLowerCase()),
        client_name: saleClientName || null,
        client_phone: saleClientPhone || null,
      };
      if (isManualTicketCode && manualTicketObject) {
        payload.ticket_ids = [manualTicketObject.id];
      }

      const res = await api.post('/api/sales/', payload);
      setSaleResult(res.data);
      addToast(res.data.length > 1 ? `${res.data.length} ventes enregistrées !` : 'Vente enregistrée !', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    } finally {
      setSelling(false);
    }
  };

  const handleMarkPaid = async (saleId: number) => {
    if (!window.confirm('Voulez-vous marquer cette vente à crédit comme payée ?')) return;
    try {
      await api.post(`/api/sales/${saleId}/mark-paid`);
      addToast('Crédit encaissé !', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    }
  };
  const handleSaveClient = async () => {
    if (!selectedSale) return;
    setSavingClient(true);
    try {
      const res = await api.put(`/api/sales/${selectedSale.id}/client`, {
        client_name: editClientName || null,
        client_phone: editClientPhone || null,
      });
      setSelectedSale(res.data);
      setSales(prev => prev.map(s => s.id === selectedSale.id ? { ...s, ...res.data } : s));
      setIsEditingClient(false);
      addToast('Informations client mises à jour !', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur lors de la mise à jour', 'error');
    } finally {
      setSavingClient(false);
    }
  };


  const closeSaleModal = () => {
    setShowSale(false);
    setSaleResult(null);
    setSaleTypeId('');
    setSaleQuantity(1);
    setSalePayment('Espèces');
    setSaleClientName('');
    setSaleClientPhone('');
    setShowSuggestions(false);
    setClients([]);
    
    // Reset manual/physical ticket states
    setIsManualTicketCode(false);
    setManualTicketCode('');
    setManualTicketObject(null);
    setTicketCodeError('');
  };

  const handleCancel = async (e: FormEvent) => {
    e.preventDefault();
    if (!showCancel) return;
    try {
      const res = await api.post(`/api/sales/${showCancel}/cancel`, {
        reason: cancelReason,
        mark_defective: cancelMarkDefective,
      });
      
      const newCode = res.data.replacement_ticket_code;
      if (newCode) {
        addToast(`Vente annulée ! Nouveau code Wi-Fi attribué : ${newCode}`, 'success');
      } else {
        addToast('Vente annulée', 'success');
      }
      
      setShowCancel(null);
      setCancelReason('');
      setCancelMarkDefective(false);
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Ventes</h2>
          <p className="text-muted text-sm">Enregistrer et suivre les ventes de tickets</p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowSale(true)}>
          <ShoppingCart size={16} /> Nouvelle vente
        </button>
      </div>

      {/* Quick stock overview */}
      <div className="stats-grid">
        {(() => {
          const totalOutstandingCredit = sales
            .filter(s => s.payment_method === 'credit' && !s.is_paid && !s.is_cancelled)
            .reduce((sum, s) => sum + s.amount, 0);

          return (
            <>
              {stockSummary.filter(s => (isAdmin ? s.available : s.assigned) > 0).map((s) => (
                <div key={s.subscription_type.id} className="stat-card">
                  <div className="stat-icon blue">
                    <ShoppingCart size={20} />
                  </div>
                  <div className="stat-info">
                    <h3>{s.subscription_type.name}</h3>
                    <div className="stat-value">{isAdmin ? s.available : s.assigned}</div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {isAdmin ? 'en stock central' : 'tickets disponibles'}
                    </span>
                  </div>
                </div>
              ))}
              {isAdmin && totalOutstandingCredit > 0 && (
                <div className="stat-card">
                  <div className="stat-icon red" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)' }}>
                    <ShoppingCart size={20} />
                  </div>
                  <div className="stat-info">
                    <h3>Crédits en attente</h3>
                    <div className="stat-value" style={{ color: 'var(--danger)' }}>{formatCFA(totalOutstandingCredit)}</div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>à encaisser</span>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Alert section for clients to follow up */}
      {(() => {
        const expiringSales = sales.filter(s => {
          if (s.is_cancelled || !s.subscription_duration_hours || !s.client_phone) return false;
          const expirationTime = new Date(new Date(s.created_at).getTime() + s.subscription_duration_hours * 60 * 60 * 1000);
          const remainingMs = expirationTime.getTime() - new Date().getTime();
          const remainingHours = remainingMs / (1000 * 60 * 60);
          return remainingHours > 0 && remainingHours <= 8;
        });

        if (expiringSales.length === 0) return null;

        return (
          <div className="card" style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid var(--warning)', marginBottom: '24px' }}>
            <h4 style={{ color: 'var(--warning)', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⚠️</span> Clients à relancer (tickets expirant dans moins de 8h)
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {expiringSales.map(s => {
                const expirationTime = new Date(new Date(s.created_at).getTime() + s.subscription_duration_hours * 60 * 60 * 1000);
                const remainingHours = Math.max(0, (expirationTime.getTime() - new Date().getTime()) / (1000 * 60 * 60));
                const mins = Math.round((remainingHours % 1) * 60);
                const hoursText = Math.floor(remainingHours) > 0 ? `${Math.floor(remainingHours)}h ` : '';
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.1)' }}>
                    <div>
                      <strong>{s.client_name || 'Client sans nom'}</strong> (Tél: <span style={{ fontFamily: 'monospace' }}>{s.client_phone}</span>) — {s.subscription_type_name}
                    </div>
                    <div style={{ color: 'var(--warning)', fontSize: '0.875rem', fontWeight: 600 }}>
                      Reste {hoursText}{mins}min (expire à {expirationTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Sales Table — Permanent Historical Record */}
      <div className="data-table-container">
        <div className="table-header" style={{ flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Shield size={20} style={{ color: 'var(--success)' }} />
              Historique Inaltérable des Ventes
            </h3>
            <span className="text-muted text-xs" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
              <Lock size={12} /> Conservation permanente garantie — Aucune suppression de vente possible
            </span>
          </div>
          <div className="flex gap-2" style={{ alignItems: 'center', marginLeft: 'auto' }}>
            <span className="badge badge-active">{filteredSales.length} / {sales.length} vente(s)</span>
            <button className="btn btn-ghost btn-sm" onClick={handleExportCSV} title="Exporter en fichier CSV">
              <Download size={14} /> Exporter CSV
            </button>
          </div>
        </div>

        {/* Filter bar for sales history */}
        <div style={{ padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px' }}>
            <input
              className="form-input text-xs"
              placeholder="Rechercher (code ticket, client, tél, vendeur)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select className="form-select text-xs" value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} style={{ width: '160px' }}>
            <option value="all">Tous les modes</option>
            <option value="cash">Espèces</option>
            <option value="wave">Wave</option>
            <option value="credit">Crédit</option>
            <option value="compensation">Dédommagement</option>
          </select>
          <select className="form-select text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: '160px' }}>
            <option value="all">Tous les statuts</option>
            <option value="active">Actives uniquement</option>
            <option value="credit">À crédit impayées</option>
            <option value="cancelled">Annulées</option>
          </select>
        </div>

        {filteredSales.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th className="hide-on-mobile">#</th>
                <th>Code ticket</th>
                <th>Type</th>
                <th>Client</th>
                <th>Paiement</th>
                <th>Montant</th>
                {isAdmin && <th className="hide-on-mobile">Vendeur</th>}
                <th className="hide-on-mobile">Date</th>
                <th>Statut</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((s) => (
                <tr 
                  key={s.id} 
                  style={{ 
                    cursor: 'pointer',
                    ...(s.is_cancelled ? { opacity: 0.5, textDecoration: 'line-through' } : {})
                  }}
                  onClick={() => setSelectedSale(s)}
                >
                  <td className="hide-on-mobile">{s.id}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{s.ticket_code}</td>
                  <td>{s.subscription_type_name}</td>
                  <td>{s.client_name || '—'}</td>
                  <td>
                    {getPaymentMethodBadge(s)}
                  </td>
                  <td style={{ fontWeight: 600 }}>{formatCFA(s.amount)}</td>
                  {isAdmin && <td className="hide-on-mobile">{s.vendor_name}</td>}
                  <td className="hide-on-mobile">{new Date(s.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>
                    {getSaleStatusBadge(s)}
                  </td>
                  {isAdmin && (
                    <td onClick={(e) => e.stopPropagation()}>
                      {!s.is_cancelled && s.payment_method === 'credit' && !s.is_paid && (
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--success)', marginRight: '8px' }} onClick={() => handleMarkPaid(s.id)}>
                          Encaisser
                        </button>
                      )}
                      {!s.is_cancelled && s.ticket_status !== 'defective' && (
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => { setShowCancel(s.id); setCancelReason(''); }}>
                          Annuler
                        </button>
                      )}
                      {(s.is_cancelled || s.ticket_status === 'defective') && <span className="text-muted text-xs">—</span>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🛒</div>
            <h4>Aucune vente trouvée</h4>
            <p>{sales.length === 0 ? 'Enregistrez votre première vente' : 'Modifiez vos filtres de recherche'}</p>
          </div>
        )}
      </div>

      {/* Sale Modal */}
      {showSale && (
        <div className="modal-overlay" onClick={closeSaleModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{saleResult ? '✅ Vente enregistrée' : 'Nouvelle vente'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={closeSaleModal}><X size={18} /></button>
            </div>

            {(() => {
              const selectedType = subTypes.find(t => t.id === Number(saleTypeId));
              const stock = stockSummary.find(s => s.subscription_type.id === Number(saleTypeId));
              const availableCount = selectedType ? (isAdmin ? (stock?.available || 0) : (stock?.assigned || 0)) : 0;

              return saleResult ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎉</div>
                  <h4 style={{ fontSize: '1.1rem', marginBottom: '8px' }}>
                    {saleResult.length > 1 ? `${saleResult.length} ventes confirmées` : `Vente #${saleResult[0].id} confirmée`}
                  </h4>
                  <div className="card" style={{ textAlign: 'left', marginTop: '16px' }}>
                    <p><strong>Code(s) Wi-Fi :</strong></p>
                    <div style={{
                      maxHeight: '120px',
                      overflowY: 'auto',
                      background: 'rgba(0,0,0,0.2)',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      fontSize: '1.1rem',
                      color: 'var(--accent-400)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginBottom: '12px',
                      border: '1px solid var(--border)'
                    }}>
                      {saleResult.map(s => (
                        <span key={s.id} style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
                          {s.ticket_code}
                        </span>
                      ))}
                    </div>
                    <p><strong>Type :</strong> {saleResult[0].subscription_type_name}</p>
                    <p><strong>Montant Total :</strong> {formatCFA(saleResult.reduce((acc, s) => acc + s.amount, 0))}</p>
                    <p><strong>Paiement :</strong> {
                      saleResult[0].payment_method === 'cash' ? 'Espèces' :
                      saleResult[0].payment_method === 'wave' ? 'Wave' :
                      saleResult[0].payment_method === 'credit' ? 'Crédit' :
                      saleResult[0].payment_method === 'compensation' ? 'Dédommagement' :
                      saleResult[0].payment_method
                    }</p>
                  </div>
                  <div className="modal-footer" style={{ justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost" onClick={closeSaleModal}>Fermer</button>
                    {saleResult[0].client_phone && (
                      <>
                        <button
                          type="button"
                          className="btn btn-success"
                          style={{
                            backgroundColor: '#25D366',
                            borderColor: '#25D366',
                            color: '#ffffff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          onClick={() => {
                            const waPhone = saleResult[0].client_phone.replace('+', '');
                            const codes = saleResult.map(s => s.ticket_code).join(', ');
                            const message = `Bonjour ! Merci pour votre achat. Voici votre code Wi-Fi : *${codes}* (${saleResult[0].subscription_type_name}). Bon surf !`;
                            window.open(`https://api.whatsapp.com/send?phone=${waPhone}&text=${encodeURIComponent(message)}`, '_blank');
                          }}
                        >
                          <MessageCircle size={16} /> WhatsApp
                        </button>
                        <a
                          href={`sms:${saleResult[0].client_phone}?body=${encodeURIComponent(
                            `Bonjour ! Merci pour votre achat. Voici votre code Wi-Fi : ${saleResult.map(s => s.ticket_code).join(', ')} (${saleResult[0].subscription_type_name}). Bon surf !`
                          )}`}
                          className="btn"
                          style={{
                            backgroundColor: '#007AFF',
                            borderColor: '#007AFF',
                            color: '#ffffff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <MessageSquare size={16} /> SMS
                        </a>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSell}>
                  {/* Toggle physical/manual ticket sale */}
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <input
                      type="checkbox"
                      id="isManualTicket"
                      checked={isManualTicketCode}
                      onChange={(e) => {
                        setIsManualTicketCode(e.target.checked);
                        setManualTicketCode('');
                        setManualTicketObject(null);
                        setTicketCodeError('');
                        setSaleTypeId('');
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    <label htmlFor="isManualTicket" style={{ fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer', userSelect: 'none' }}>
                      Ticket déjà vendu physiquement (saisir le code)
                    </label>
                  </div>

                  {isManualTicketCode && (
                    <div className="form-group">
                      <label className="form-label">Code du ticket *</label>
                      <input
                        type="text"
                        className="form-input"
                        required
                        value={manualTicketCode}
                        onChange={(e) => setManualTicketCode(e.target.value)}
                        placeholder="Ex: 8v5jie"
                        style={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: '1px' }}
                      />
                      {checkingTicketCode && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                          Vérification du code en cours...
                        </span>
                      )}
                      {ticketCodeError && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                          ❌ {ticketCodeError}
                        </span>
                      )}
                      {manualTicketObject && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                          ✅ Ticket valide : {manualTicketObject.subscription_type?.name} (Forfait détecté)
                        </span>
                      )}
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Type d'abonnement *</label>
                    <select
                      className="form-select"
                      required
                      value={saleTypeId}
                      onChange={(e) => setSaleTypeId(e.target.value)}
                      disabled={isManualTicketCode}
                      style={isManualTicketCode ? { opacity: 0.8, cursor: 'not-allowed' } : {}}
                    >
                      <option value="">{isManualTicketCode ? 'Détecté automatiquement...' : 'Sélectionner...'}</option>
                      {subTypes.filter(t => t.is_active).map(t => {
                        const stock = stockSummary.find(s => s.subscription_type.id === t.id);
                        const count = isAdmin ? (stock?.available || 0) : (stock?.assigned || 0);
                        return (
                          <option key={t.id} value={t.id} disabled={count === 0}>
                            {t.name} — {t.price} FCFA ({count} dispo)
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {!isManualTicketCode && saleTypeId && (
                    <>
                      <div className="form-group">
                        <label className="form-label">Quantité *</label>
                        <input
                          type="number"
                          className="form-input"
                          min={1}
                          max={availableCount}
                          required
                          value={saleQuantity}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                              setSaleQuantity('');
                            } else {
                              const num = Number(val);
                              setSaleQuantity(isNaN(num) ? '' : num);
                            }
                          }}
                          onBlur={() => {
                            if (saleQuantity === '' || saleQuantity < 1) {
                              setSaleQuantity(1);
                            } else if (saleQuantity > availableCount) {
                              setSaleQuantity(availableCount);
                            }
                          }}
                        />
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                          Les tickets les plus anciens seront automatiquement sélectionnés (FIFO).
                        </span>
                      </div>
                    </>
                  )}

                  <div className="form-group">
                    <label className="form-label">Mode de paiement *</label>
                    <select className="form-select" value={salePayment} onChange={(e) => setSalePayment(e.target.value)}>
                      {paymentMethods.map(m => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                      ))}
                      {isAdmin && (
                        <option value="compensation">Dédommagement (Gratuit)</option>
                      )}
                    </select>
                  </div>

                  {/* Wave QR display */}
                  {salePayment.toLowerCase().includes('wave') && selectedWaveMethod && (
                    <div className="wave-qr-container">
                      {selectedWaveMethod.wave_qr_image_path && (
                        <SecureImage srcPath={selectedWaveMethod.wave_qr_image_path} alt="QR Code Wave" />
                      )}
                      {selectedWaveMethod.wave_merchant_number && (
                        <>
                          <div className="wave-merchant-label">Numéro Marchand Wave</div>
                          <div className="wave-merchant">{selectedWaveMethod.wave_merchant_number}</div>
                        </>
                      )}
                      {!selectedWaveMethod.wave_qr_image_path && !selectedWaveMethod.wave_merchant_number && (
                        <p style={{ color: '#64748b' }}>QR code et numéro Wave non configurés. Allez dans Paramètres.</p>
                      )}
                    </div>
                  )}

                  <div className="form-group" style={{ position: 'relative' }}>
                    <label className="form-label">Nom du client (optionnel)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={saleClientName}
                      onChange={(e) => {
                        setSaleClientName(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Nom du client (optionnel)"
                    />
                    {showSuggestions && saleClientName && (() => {
                      const filtered = clients.filter(c => 
                        (c.name && c.name.toLowerCase().includes(saleClientName.toLowerCase())) ||
                        (c.phone && c.phone.includes(saleClientName))
                      );
                      if (filtered.length === 0) return null;
                      return (
                        <div className="suggestions-dropdown">
                          {filtered.map((c, index) => (
                            <div
                              key={index}
                              className="suggestion-item"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setSaleClientName(c.name || '');
                                setSaleClientPhone(c.phone || '');
                                setShowSuggestions(false);
                              }}
                            >
                              <div className="suggestion-name">{c.name || 'Nom non renseigné'}</div>
                              {c.phone && <div className="suggestion-phone">Tél: {c.phone}</div>}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Téléphone du client (optionnel)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={saleClientPhone}
                      onChange={(e) => setSaleClientPhone(e.target.value)}
                      placeholder="Ex: 0707070707"
                      pattern="^\+?[0-9\s\-()]+$"
                      title="Veuillez saisir un numéro de téléphone valide (chiffres, espaces, tirets ou parenthèses)"
                    />
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-ghost" onClick={closeSaleModal}>Annuler</button>
                    <button type="submit" className="btn btn-accent" disabled={selling || (isManualTicketCode && !manualTicketObject)}>
                      {selling ? 'Vente...' : 'Valider la vente'}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancel !== null && (
        <div className="modal-overlay" onClick={() => setShowCancel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>Annuler la vente #{showCancel}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowCancel(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCancel}>
              <div className="form-group">
                <label className="form-label">Motif d'annulation *</label>
                <textarea className="form-textarea" required minLength={5} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Expliquez la raison de l'annulation..." />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', marginBottom: '16px' }}>
                <input
                  type="checkbox"
                  id="markDefective"
                  checked={cancelMarkDefective}
                  onChange={(e) => setCancelMarkDefective(e.target.checked)}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
                <label htmlFor="markDefective" style={{ cursor: 'pointer', fontSize: '0.9rem', userSelect: 'none' }}>
                  Marquer le ticket comme défectueux (ne sera plus vendu)
                </label>
              </div>
              {cancelMarkDefective && (
                <div style={{ fontSize: '0.75rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.05)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.15)', marginTop: '-8px', marginBottom: '16px' }}>
                  ℹ️ Un nouveau ticket de remplacement (dédommagement) sera automatiquement généré et attribué au client.
                </div>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowCancel(null)}>Retour</button>
                <button type="submit" className="btn btn-danger">Confirmer l'annulation</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sale Details Modal */}
      {selectedSale !== null && (
        <div className="modal-overlay" onClick={() => setSelectedSale(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShoppingCart size={18} />
                Détails de la vente #{selectedSale.id}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedSale(null)}>
                <X size={18} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Ticket and Type */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '12px',
                padding: '14px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)'
              }}>
                <div>
                  <span className="text-muted text-xs" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Code Ticket</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-300)' }}>
                    {selectedSale.ticket_code}
                  </span>
                </div>
                <div>
                  <span className="text-muted text-xs" style={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Abonnement</span>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    {selectedSale.subscription_type_name}
                  </span>
                </div>
              </div>

              {/* Purchase Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                  <span className="text-muted text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Calendar size={14} /> Date de vente</span>
                  <span style={{ fontSize: '0.9rem' }}>
                    {new Date(selectedSale.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                  <span className="text-muted text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><User size={14} /> Vendu par</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{selectedSale.vendor_name || 'Inconnu'}</span>
                </div>

                {!isEditingClient ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="text-muted text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><User size={14} /> Client</span>
                      {isAdmin && (
                        <button 
                          className="btn btn-ghost btn-xs" 
                          style={{ color: 'var(--primary-300)', padding: '2px 6px', fontSize: '0.75rem', height: 'auto' }}
                          onClick={() => {
                            setEditClientName(selectedSale.client_name || '');
                            setEditClientPhone(selectedSale.client_phone || '');
                            setIsEditingClient(true);
                          }}
                        >
                          Modifier
                        </button>
                      )}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {selectedSale.client_name ? `${selectedSale.client_name} (${selectedSale.client_phone || 'Pas de numéro'})` : '—'}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', background: 'rgba(255,255,255,0.01)', padding: '8px', borderRadius: 'var(--radius-sm)' }}>
                    <span className="text-muted text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><User size={14} /> Modifier le client</span>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="text-muted text-xs" style={{ display: 'block', marginBottom: '2px' }}>Nom</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                        value={editClientName} 
                        onChange={(e) => setEditClientName(e.target.value)} 
                        placeholder="Nom du client"
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="text-muted text-xs" style={{ display: 'block', marginBottom: '2px' }}>Téléphone (optionnel)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                        value={editClientPhone} 
                        onChange={(e) => setEditClientPhone(e.target.value)} 
                        placeholder="Numéro de téléphone"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                      <button 
                        type="button" 
                        className="btn btn-ghost btn-xs" 
                        style={{ padding: '4px 8px', fontSize: '0.75rem', height: 'auto' }}
                        onClick={() => setIsEditingClient(false)}
                        disabled={savingClient}
                      >
                        Annuler
                      </button>
                      <button 
                        type="button" 
                        className="btn btn-accent btn-xs" 
                        style={{ padding: '4px 10px', fontSize: '0.75rem', height: 'auto' }}
                        onClick={handleSaveClient}
                        disabled={savingClient}
                      >
                        {savingClient ? 'Sauvegarde...' : 'Enregistrer'}
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                  <span className="text-muted text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><CreditCard size={14} /> Paiement</span>
                  <span>{getPaymentMethodBadge(selectedSale)}</span>
                </div>

                {selectedSale.payment_method === 'credit' && selectedSale.is_paid && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                    <span className="text-muted text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Clock size={14} /> Payé le</span>
                    <span style={{ fontSize: '0.9rem' }}>
                      {selectedSale.paid_at ? new Date(selectedSale.paid_at).toLocaleString('fr-FR') : '—'}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                  <span className="text-muted text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Tag size={14} /> Montant</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--success)' }}>
                    {formatCFA(selectedSale.amount)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px' }}>
                  <span className="text-muted text-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Shield size={14} /> Statut</span>
                  <span>{getSaleStatusBadge(selectedSale)}</span>
                </div>
              </div>

              {/* Cancel / replacement info if applicable */}
              {(selectedSale.is_cancelled || selectedSale.ticket_status === 'defective') && selectedSale.cancel_reason && (
                <div style={{ 
                  padding: '12px',
                  background: selectedSale.ticket_status === 'defective' ? 'rgba(244, 63, 94, 0.03)' : 'rgba(244, 63, 94, 0.05)',
                  borderRadius: 'var(--radius-md)',
                  border: selectedSale.ticket_status === 'defective' ? '1px solid rgba(244, 63, 94, 0.08)' : '1px solid rgba(244, 63, 94, 0.15)',
                  marginTop: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)', fontWeight: 600, fontSize: '0.85rem', marginBottom: '6px' }}>
                    <AlertTriangle size={14} />
                    <span>
                      {selectedSale.ticket_status === 'defective' ? "Informations de remplacement (Défectueux)" : "Informations d'annulation"}
                    </span>
                  </div>
                  <p className="text-muted text-xs" style={{ margin: 0, lineHeight: 1.4 }}>
                    <strong>Raison :</strong> {selectedSale.cancel_reason}
                  </p>
                  <p className="text-muted text-xs" style={{ margin: '4px 0 0 0' }}>
                    <strong>Déclaré le :</strong> {selectedSale.cancelled_at ? new Date(selectedSale.cancelled_at).toLocaleString('fr-FR') : '—'}
                  </p>
                </div>
              )}

            </div>
            
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setSelectedSale(null)}>
                Fermer
              </button>
              {!selectedSale.is_cancelled && selectedSale.payment_method === 'credit' && !selectedSale.is_paid && isAdmin && (
                <button 
                  className="btn btn-success" 
                  onClick={() => {
                    handleMarkPaid(selectedSale.id);
                    setSelectedSale(null);
                  }}
                >
                  Encaisser le crédit
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
