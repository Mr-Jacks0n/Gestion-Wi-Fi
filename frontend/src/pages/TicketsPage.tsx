/* ============================================================
   Tickets Page — Import batches, view/search tickets
   ============================================================ */

import { useEffect, useState, type FormEvent } from 'react';
import { Package, Search, Plus, Upload, X, Trash2, Edit } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import type { Ticket, Batch, SubscriptionType, UserWithStats } from '../types';

export default function TicketsPage() {
  const { user, addToast } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [subTypes, setSubTypes] = useState<SubscriptionType[]>([]);
  const [vendors, setVendors] = useState<UserWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchCode, setSearchCode] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importRef, setImportRef] = useState('');
  const [importTypeId, setImportTypeId] = useState('');
  const [importPrice, setImportPrice] = useState('');
  const [importCodes, setImportCodes] = useState('');
  const [importNotes, setImportNotes] = useState('');
  const [importing, setImporting] = useState(false);

  // Edit batch modal
  const [showEditBatch, setShowEditBatch] = useState<Batch | null>(null);
  const [editBatchRef, setEditBatchRef] = useState('');
  const [editBatchTypeId, setEditBatchTypeId] = useState('');
  const [editBatchNotes, setEditBatchNotes] = useState('');
  const [updatingBatch, setUpdatingBatch] = useState(false);

  // Assign modal
  const [showAssign, setShowAssign] = useState(false);
  const [assignVendorId, setAssignVendorId] = useState('');
  const [assignTypeId, setAssignTypeId] = useState('');
  const [assignQty, setAssignQty] = useState('');

  useEffect(() => {
    loadData();
  }, [filterStatus, filterType]);

  const loadData = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterType) params.set('subscription_type_id', filterType);

      const [ticketsRes, typesRes] = await Promise.all([
        api.get(`/api/tickets/?${params}`),
        api.get('/api/tickets/subscription-types'),
      ]);
      setTickets(ticketsRes.data);
      setSubTypes(typesRes.data);

      if (isAdmin) {
        const [batchesRes, vendorsRes] = await Promise.all([
          api.get('/api/tickets/batches'),
          api.get('/api/users/?role=vendor'),
        ]);
        setBatches(batchesRes.data);
        setVendors(vendorsRes.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchCode.trim()) return loadData();
    try {
      const res = await api.get(`/api/tickets/search?code=${searchCode.trim()}`);
      setTickets([res.data]);
    } catch {
      addToast('Ticket introuvable', 'error');
    }
  };

  const handleImport = async (e: FormEvent) => {
    e.preventDefault();
    setImporting(true);
    try {
      const codes = importCodes.split(/[\n,;]+/).map(c => c.trim()).filter(Boolean);
      const res = await api.post('/api/tickets/batches', {
        reference: importRef,
        subscription_type_id: Number(importTypeId),
        codes,
        notes: importNotes || null,
      });
      addToast(`${res.data.imported} tickets importés ! ${res.data.duplicate_count} doublons rejetés.`, 'success');
      setShowImport(false);
      setImportRef(''); setImportTypeId(''); setImportPrice(''); setImportCodes(''); setImportNotes('');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur lors de l\'import', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleBulkAssign = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/api/tickets/bulk-assign', {
        vendor_id: Number(assignVendorId),
        subscription_type_id: Number(assignTypeId),
        quantity: Number(assignQty),
      });
      addToast(res.data.message, 'success');
      setShowAssign(false);
      setAssignVendorId(''); setAssignTypeId(''); setAssignQty('');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    }
  };

  const handleUpdateBatch = async (e: FormEvent) => {
    e.preventDefault();
    if (!showEditBatch) return;
    setUpdatingBatch(true);
    try {
      await api.put(`/api/tickets/batches/${showEditBatch.id}`, {
        reference: editBatchRef,
        subscription_type_id: Number(editBatchTypeId),
        notes: editBatchNotes || null,
      });
      addToast('Lot de tickets et durée mis à jour avec succès !', 'success');
      setShowEditBatch(null);
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur lors de la modification du lot', 'error');
    } finally {
      setUpdatingBatch(false);
    }
  };

  const deleteBatch = async (id: number) => {
    if (!confirm('Supprimer ce lot de tickets ? Cela supprimera TOUS les tickets non vendus associés.')) return;
    try {
      await api.delete(`/api/tickets/batches/${id}`);
      addToast('Lot supprimé avec succès', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur lors de la suppression', 'error');
    }
  };

  const deleteTicket = async (id: number) => {
    if (!confirm('Supprimer ce ticket ?')) return;
    try {
      await api.delete(`/api/tickets/${id}`);
      addToast('Ticket supprimé avec succès', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur lors de la suppression', 'error');
    }
  };

  const handleUpdateStatus = async (id: number, newStatus: string) => {
    try {
      await api.put(`/api/tickets/${id}/status`, { status: newStatus });
      addToast('Statut du ticket mis à jour avec succès', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur lors de la mise à jour', 'error');
    }
  };

  const statusLabels: Record<string, string> = {
    available: 'Disponible',
    assigned: 'Attribué',
    sold: 'Vendu',
    defective: 'Défectueux',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Tickets</h2>
          <p className="text-muted text-sm">
            {isAdmin ? 'Gérer les lots et tickets Wi-Fi' : 'Consulter votre stock de tickets'}
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => setShowAssign(true)}>
              <Package size={16} /> Attribuer
            </button>
            <button className="btn btn-primary" onClick={() => setShowImport(true)}>
              <Upload size={16} /> Importer un lot
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="card mb-4" style={{ padding: '16px 20px' }}>
        <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', display: 'flex', gap: '8px' }}>
            <input
              className="form-input"
              placeholder="Rechercher un code..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className="btn btn-ghost btn-icon" onClick={handleSearch}>
              <Search size={18} />
            </button>
          </div>
          <select className="form-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: '160px' }}>
            <option value="">Tous les statuts</option>
            <option value="available">Disponible</option>
            <option value="assigned">Attribué</option>
            <option value="sold">Vendu</option>
          </select>
          <select className="form-select" value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ width: '160px' }}>
            <option value="">Tous les types</option>
            {subTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      {/* Batches (admin) */}
      {isAdmin && batches.length > 0 && (
        <div className="data-table-container mb-4">
          <div className="table-header">
            <h3>Lots importés</h3>
            <span className="text-muted text-sm">{batches.length} lot(s)</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Référence</th>
                <th>Type</th>
                <th>Tickets</th>
                <th>Importé par</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 600 }}>{b.reference}</td>
                  <td>{b.subscription_type?.name}</td>
                  <td>{b.total_tickets}</td>
                  <td>{b.admin_name}</td>
                  <td>{new Date(b.created_at).toLocaleDateString('fr-FR')}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--primary-300)', padding: '4px', marginRight: '6px' }}
                      onClick={() => {
                        setShowEditBatch(b);
                        setEditBatchRef(b.reference);
                        setEditBatchTypeId(String(b.subscription_type_id));
                        setEditBatchNotes(b.notes || '');
                      }}
                      title="Modifier la durée et le lot"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)', padding: '4px' }}
                      onClick={() => deleteBatch(b.id)}
                      title="Supprimer le lot"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tickets Table */}
      <div className="data-table-container">
        <div className="table-header">
          <h3>Liste des tickets</h3>
          <span className="text-muted text-sm">{tickets.length} ticket(s)</span>
        </div>
        {tickets.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Type</th>
                <th>Statut</th>
                <th>Lot</th>
                {isAdmin && <th>Attribué à</th>}
                <th>Date</th>
                {isAdmin && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{t.code}</td>
                  <td>{t.subscription_type?.name}</td>
                  <td>
                    {isAdmin ? (
                      <select
                        className="form-select text-xs"
                        style={{ padding: '2px 8px', height: 'auto', width: 'auto', fontSize: '0.75rem', fontWeight: 600 }}
                        value={t.status}
                        onChange={(e) => handleUpdateStatus(t.id, e.target.value)}
                      >
                        <option value="available">Disponible</option>
                        <option value="assigned">Attribué</option>
                        <option value="sold">Vendu</option>
                        <option value="defective">Défectueux</option>
                      </select>
                    ) : (
                      <span className={`badge badge-${t.status}`}>
                        {statusLabels[t.status] || t.status}
                      </span>
                    )}
                  </td>
                  <td>{t.batch_reference}</td>
                  {isAdmin && <td>{t.assigned_user_name || '—'}</td>}
                  <td>{t.assigned_at ? new Date(t.assigned_at).toLocaleDateString('fr-FR') : '—'}</td>
                  {isAdmin && (
                    <td style={{ textAlign: 'right' }}>
                      {t.status !== 'sold' && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger)', padding: '4px' }}
                          onClick={() => deleteTicket(t.id)}
                          title="Supprimer le ticket"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h4>Aucun ticket trouvé</h4>
            <p>{isAdmin ? 'Importez un lot pour commencer' : 'Demandez un réapprovisionnement'}</p>
          </div>
        )}
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="modal-header" style={{ justifyContent: 'center', position: 'relative', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Créer un lot de tickets</h3>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setShowImport(false)}
                style={{ position: 'absolute', right: '0px', top: '0px' }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleImport}>
              <div className="form-group">
                <label className="form-label">Nom du lot</label>
                <input
                  className="form-input"
                  required
                  value={importRef}
                  onChange={(e) => setImportRef(e.target.value)}
                  placeholder="Ex: Lot Juillet 2026"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Type d'abonnement</label>
                  <select
                    className="form-select"
                    required
                    value={importTypeId}
                    onChange={(e) => {
                      setImportTypeId(e.target.value);
                      const selected = subTypes.find(t => t.id === Number(e.target.value));
                      setImportPrice(selected ? `${new Intl.NumberFormat('fr-FR').format(selected.price)}` : '');
                    }}
                  >
                    <option value="">Sélectionner</option>
                    {subTypes.filter(t => t.is_active).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Prix unitaire (FCFA)</label>
                  <input
                    className="form-input"
                    disabled
                    value={importPrice}
                    placeholder=""
                    style={{ opacity: 0.8 }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Importer depuis un fichier (Optionnel)</label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const text = event.target?.result as string;
                        if (text) {
                          const parsed = text.split(/[\n,;\r]+/).map(c => c.trim()).filter(Boolean).join('\n');
                          setImportCodes(parsed);
                          addToast(`Fichier "${file.name}" chargé avec succès !`, 'success');
                        }
                      };
                      reader.readAsText(file);
                    }
                  }}
                  style={{
                    border: '2px dashed rgba(16, 185, 129, 0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    textAlign: 'center',
                    background: 'rgba(16, 185, 129, 0.02)',
                    cursor: 'pointer',
                    color: '#92b5a5',
                    fontSize: '0.85rem',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#10b981')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)')}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.txt,.csv';
                    input.onchange = (e: any) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const text = event.target?.result as string;
                          if (text) {
                            const parsed = text.split(/[\n,;\r]+/).map(c => c.trim()).filter(Boolean).join('\n');
                            setImportCodes(parsed);
                            addToast(`Fichier "${file.name}" chargé avec succès !`, 'success');
                          }
                        };
                        reader.readAsText(file);
                      }
                    };
                    input.click();
                  }}
                >
                  <Upload size={16} /> Glissez-déposez un fichier .txt ou .csv, ou cliquez ici
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Codes Wi-Fi (un par ligne)</label>
                <textarea
                  className="form-textarea"
                  required
                  value={importCodes}
                  onChange={(e) => setImportCodes(e.target.value)}
                  rows={6}
                  placeholder="CODE001&#10;CODE002&#10;CODE003"
                  style={{ fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ marginTop: '24px' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '1rem',
                    fontWeight: 600,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                  disabled={importing}
                >
                  {importing ? 'Création...' : 'Créer le lot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssign && (
        <div className="modal-overlay" onClick={() => setShowAssign(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Attribuer des tickets</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAssign(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleBulkAssign}>
              <div className="form-group">
                <label className="form-label">Vendeur *</label>
                <select className="form-select" required value={assignVendorId} onChange={(e) => setAssignVendorId(e.target.value)}>
                  <option value="">Sélectionner...</option>
                  {vendors.filter(v => v.is_active).map(v => (
                    <option key={v.id} value={v.id}>{v.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Type d'abonnement *</label>
                <select className="form-select" required value={assignTypeId} onChange={(e) => setAssignTypeId(e.target.value)}>
                  <option value="">Sélectionner...</option>
                  {subTypes.filter(t => t.is_active).map(t => (
                    <option key={t.id} value={t.id}>{t.name} — {t.price} FCFA</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Quantité *</label>
                <input type="number" className="form-input" required min={1} value={assignQty} onChange={(e) => setAssignQty(e.target.value)} placeholder="Nombre de tickets" />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowAssign(false)}>Annuler</button>
                <button type="submit" className="btn btn-accent">Attribuer</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Batch Modal */}
      {showEditBatch && (
        <div className="modal-overlay" onClick={() => setShowEditBatch(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div className="modal-header">
              <h3>Modifier le lot #{showEditBatch.reference}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowEditBatch(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleUpdateBatch}>
              <div className="form-group">
                <label className="form-label">Référence du lot *</label>
                <input
                  className="form-input"
                  required
                  value={editBatchRef}
                  onChange={(e) => setEditBatchRef(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Type d'abonnement / Durée du forfait *</label>
                <select
                  className="form-select"
                  required
                  value={editBatchTypeId}
                  onChange={(e) => setEditBatchTypeId(e.target.value)}
                >
                  {subTypes.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.duration_hours % 24 === 0 ? `${t.duration_hours / 24} jour(s)` : `${t.duration_hours}h`}) — {new Intl.NumberFormat('fr-FR').format(t.price)} FCFA
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  ℹ️ La modification du forfait et de la durée s'appliquera à tous les tickets non vendus de ce lot.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Notes (Optionnel)</label>
                <textarea
                  className="form-textarea"
                  value={editBatchNotes}
                  onChange={(e) => setEditBatchNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowEditBatch(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary" disabled={updatingBatch}>
                  {updatingBatch ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
