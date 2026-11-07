/* ============================================================
   Clients Page — List of clients and purchase history
   ============================================================ */

import { useEffect, useState } from 'react';
import { Contact, Search, Crown, Star, User, History, X, Ticket, MessageCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface ClientStats {
  name: string | null;
  phone: string | null;
  tickets_bought: number;
  total_spent: number;
  last_purchase: string | null;
  favorite_subscription: string | null;
  days_inactive: number;
}

export default function ClientsPage() {
  const { addToast } = useAuthStore();
  const [clients, setClients] = useState<ClientStats[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive' | 'vip'>('all');
  const [loading, setLoading] = useState(true);

  const [selectedClient, setSelectedClient] = useState<ClientStats | null>(null);
  const [clientHistory, setClientHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Client edit form
  const [showEditClient, setShowEditClient] = useState<ClientStats | null>(null);
  const [editClientName, setEditClientName] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [savingClient, setSavingClient] = useState(false);

  const handleEditClient = (c: ClientStats) => {
    setShowEditClient(c);
    setEditClientName(c.name || '');
    setEditClientPhone(c.phone || '');
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditClient) return;
    setSavingClient(true);
    try {
      await api.put('/api/sales/clients/update', {
        old_name: showEditClient.name,
        old_phone: showEditClient.phone,
        new_name: editClientName,
        new_phone: editClientPhone,
      });
      addToast('Fiche client mise à jour avec succès', 'success');
      setShowEditClient(null);
      loadClients();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur lors de la modification', 'error');
    } finally {
      setSavingClient(false);
    }
  };

  const formatCFA = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';

  const handleViewHistory = async (client: ClientStats) => {
    setSelectedClient(client);
    setHistoryLoading(true);
    try {
      const params: any = {};
      if (client.phone) params.client_phone = client.phone;
      if (client.name) params.client_name = client.name;
      
      const res = await api.get('/api/sales/', { params });
      setClientHistory(res.data);
    } catch (err) {
      console.error(err);
      addToast('Erreur lors du chargement de l\'historique', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    try {
      const res = await api.get('/api/sales/clients');
      setClients(res.data);
    } catch (err) {
      console.error(err);
      addToast('Erreur lors du chargement des clients', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter((c) => {
    // 1. Search filter
    const nameMatch = c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
    const phoneMatch = c.phone?.includes(searchQuery) || false;
    const matchesSearch = searchQuery === '' || nameMatch || phoneMatch;

    if (!matchesSearch) return false;

    // 2. Tab filter
    if (activeFilter === 'active') {
      return c.days_inactive <= 7;
    }
    if (activeFilter === 'inactive') {
      return c.days_inactive > 14;
    }
    if (activeFilter === 'vip') {
      return c.tickets_bought >= 15;
    }
    return true;
  });

  const getClientTierBadge = (count: number) => {
    if (count >= 15) {
      return {
        label: 'VIP',
        color: '#eab308',
        icon: Crown,
        fill: '#eab308'
      };
    }
    if (count >= 5) {
      return {
        label: 'Fidèle',
        color: '#3b82f6',
        icon: Star,
        fill: '#3b82f6'
      };
    }
    return {
      label: 'Standard',
      color: '#64748b',
      icon: User,
      fill: 'none'
    };
  };

  const getActivityBadge = (days: number) => {
    if (days <= 7) {
      return {
        label: 'Actif',
        class: 'badge-approved',
        color: '#10b981'
      };
    }
    if (days <= 14) {
      return {
        label: 'Inactif',
        class: 'badge-pending',
        color: '#f59e0b'
      };
    }
    return {
      label: 'À relancer',
      class: 'badge-rejected',
      color: '#ef4444'
    };
  };

  const formatLastPurchase = (dateStr: string | null, days: number) => {
    if (!dateStr) return '—';
    const dateObj = new Date(dateStr);
    const dateFormatted = dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (days === 0) return `Aujourd'hui (${dateFormatted})`;
    if (days === 1) return `Hier (${dateFormatted})`;
    return `Il y a ${days} jours (${dateFormatted})`;
  };

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⏳</div>
        <h4>Chargement des clients...</h4>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Clients & CRM</h2>
        <p className="text-muted text-sm" style={{ marginTop: '4px' }}>
          Suivez l'activité de vos clients, repérez les inactifs et analysez les habitudes d'achat.
        </p>
      </div>

      {/* Search Filter & Segment Tabs */}
      <div className="card mb-6" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Rechercher par nom ou numéro de téléphone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: 'Tous les clients' },
            { id: 'active', label: 'Actifs (≤ 7 jours)' },
            { id: 'inactive', label: 'À relancer (> 14 jours)' },
            { id: 'vip', label: 'VIP (≥ 15 achats)' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as any)}
              className={`btn btn-sm ${activeFilter === tab.id ? 'btn-accent' : 'btn-ghost'}`}
              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clients Table */}
      <div className="data-table-container">
        <div className="table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>Base de données clients</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '4px', fontWeight: 500 }}>
              Base de données CRM et historique des clients.
            </span>
          </div>
          <span className="text-muted text-sm">{filteredClients.length} client(s) affiché(s)</span>
        </div>

        {filteredClients.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom du client</th>
                <th>Numéro de téléphone</th>
                <th>Abonnements achetés</th>
                <th>Dépenses totales</th>
                <th className="hide-on-mobile">Dernier achat</th>
                <th className="hide-on-mobile">Statut d'activité</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((c, i) => {
                const tier = getClientTierBadge(c.tickets_bought);
                const TierIcon = tier.icon;
                const activity = getActivityBadge(c.days_inactive);

                return (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {c.name || 'Nom non renseigné'}
                        {c.tickets_bought >= 5 && (
                          <span title={`${tier.label} (${c.tickets_bought} achats)`} style={{ display: 'inline-flex', alignItems: 'center' }}>
                            <TierIcon size={14} color={tier.color} style={{ fill: tier.fill }} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'monospace' }}>{c.phone || 'Aucun numéro'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--primary-300)' }}>
                      {c.tickets_bought} ticket(s)
                    </td>
                    <td style={{ fontWeight: 700, color: 'var(--success, #10b981)' }}>
                      {formatCFA(c.total_spent)}
                    </td>
                    <td className="hide-on-mobile" style={{ fontSize: '0.85rem' }}>
                      {formatLastPurchase(c.last_purchase, c.days_inactive)}
                    </td>
                    <td className="hide-on-mobile">
                      <span
                        className={`badge ${activity.class}`}
                        style={{
                          color: activity.color,
                          borderColor: activity.color,
                          fontWeight: 600
                        }}
                      >
                        {activity.label}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--primary-300)' }}
                          onClick={() => handleViewHistory(c)}
                        >
                          <History size={14} /> Historique & Stats
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent, #eab308)' }}
                          onClick={() => handleEditClient(c)}
                        >
                          <Contact size={14} /> Modifier
                        </button>
                        {c.days_inactive >= 10 && c.phone && (
                          <a
                            href={`https://wa.me/${c.phone.replace(/[^0-9+]/g, '')}?text=${encodeURIComponent(
                              `Bonjour ${c.name || 'cher client'}, nous avons remarqué que vous n'avez pas rechargé votre forfait Wi-Fi Adven's depuis ${c.days_inactive} jours. Besoin de connexion ? Profitez de nos forfaits haut débit ! 📶`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ghost btn-sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#10b981' }}
                            title="Relancer via WhatsApp"
                          >
                            <MessageCircle size={14} /> Relancer
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty-state" style={{ padding: '48px 24px' }}>
            <div className="empty-icon" style={{ fontSize: '2rem' }}>👥</div>
            <h4>Aucun client trouvé</h4>
            <p className="text-muted text-sm">Aucun client ne correspond aux critères de recherche ou de filtre.</p>
          </div>
        )}
      </div>

      {/* History & CRM Stats Modal */}
      {selectedClient !== null && (
        <div className="modal-overlay" onClick={() => setSelectedClient(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800, width: '95%' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Contact size={18} />
                Fiche Client — {selectedClient.name || 'Client sans nom'}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedClient(null)}>
                <X size={18} />
              </button>
            </div>
            
            {/* Highlights Summary Cards */}
            {(() => {
              const activity = getActivityBadge(selectedClient.days_inactive);
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                  <div className="card" style={{ padding: '16px', background: 'var(--bg-input, #1e293b)', border: '1px solid var(--border-default)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dépenses & Panier Moyen</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--success, #10b981)', marginTop: '4px' }}>{formatCFA(selectedClient.total_spent)}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Moyenne : {formatCFA(selectedClient.total_spent / selectedClient.tickets_bought)} / ticket</div>
                  </div>
                  <div className="card" style={{ padding: '16px', background: 'var(--bg-input, #1e293b)', border: '1px solid var(--border-default)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Abonnement Favori</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary-300)', marginTop: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={selectedClient.favorite_subscription || 'Aucun'}>
                      {selectedClient.favorite_subscription || '—'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{selectedClient.tickets_bought} achat(s) au total</div>
                  </div>
                  <div className="card" style={{ padding: '16px', background: 'var(--bg-input, #1e293b)', border: '1px solid var(--border-default)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activité</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: activity.color, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: activity.color }}></span>
                      {activity.label}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Dernier achat : {selectedClient.days_inactive === 0 ? "Aujourd'hui" : `il y a ${selectedClient.days_inactive} jours`}</div>
                  </div>
                </div>
              );
            })()}

            <h4 style={{ marginBottom: '12px', fontWeight: 700 }}>Historique des achats</h4>

            {historyLoading ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <div style={{ fontSize: '2rem', animation: 'spin 1s infinite linear' }}>⏳</div>
                <h4 style={{ marginTop: '12px' }}>Chargement de l'historique...</h4>
              </div>
            ) : clientHistory.length > 0 ? (
              <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
                <table className="data-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Abonnement</th>
                      <th>Prix</th>
                      <th>Date d'achat</th>
                      <th>Vendeur</th>
                      <th>Paiement</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientHistory.map((h) => (
                      <tr key={h.id} style={h.is_cancelled ? { opacity: 0.5, textDecoration: 'line-through' } : {}}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{h.ticket_code}</td>
                        <td>{h.subscription_type_name}</td>
                        <td style={{ fontWeight: 600 }}>{formatCFA(h.amount)}</td>
                        <td style={{ fontSize: '0.85rem' }}>
                          {new Date(h.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td>{h.vendor_name}</td>
                        <td>
                          <span className={`badge ${h.payment_method === 'cash' ? 'badge-cash' : h.payment_method === 'wave' ? 'badge-wave' : h.payment_method === 'compensation' ? 'badge-defective' : h.is_paid ? 'badge-approved' : 'badge-pending'}`}>
                            {h.payment_method === 'cash' ? 'Espèces' : h.payment_method === 'wave' ? 'Wave' : h.payment_method === 'compensation' ? 'Dédomm.' : h.payment_method === 'credit' ? `Crédit ${h.is_paid ? '(Payé)' : '(Non payé)'}` : h.payment_method}
                          </span>
                        </td>
                        <td>
                          {h.ticket_status === 'defective' ? (
                            <span className="badge badge-rejected" title={`Raison: ${h.cancel_reason || 'Ticket remplacé'}`}>Défectueux</span>
                          ) : h.is_cancelled ? (
                            <span className="badge badge-rejected" title={`Raison: ${h.cancel_reason}`}>Annulé</span>
                          ) : (
                            <span className="badge badge-approved">Vendu</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '32px 0' }}>
                <div style={{ fontSize: '2rem' }}>🎫</div>
                <h4>Aucun achat trouvé</h4>
                <p className="text-muted text-sm">Ce client n'a aucun ticket enregistré.</p>
              </div>
            )}
            
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setSelectedClient(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Client Modal */}
      {showEditClient !== null && (
        <div className="modal-overlay" onClick={() => setShowEditClient(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 450, width: '95%' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Contact size={18} />
                Modifier la fiche client
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowEditClient(null)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveClient}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label">Nom du client *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={editClientName}
                  onChange={(e) => setEditClientName(e.target.value)}
                  placeholder="ex: Jean Christ..."
                />
              </div>
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label className="form-label">Numéro de téléphone</label>
                <input
                  type="text"
                  className="form-input"
                  value={editClientPhone}
                  onChange={(e) => setEditClientPhone(e.target.value)}
                  placeholder="ex: +225..."
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                  Modifier le numéro appliquera la modification à toutes ses ventes correspondantes.
                </span>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditClient(null)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingClient}>
                  {savingClient ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
