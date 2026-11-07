/* ============================================================
   Audit Logs Page — Traceability and activity tracking for Admin
   ============================================================ */

import { useEffect, useState } from 'react';
import { Eye, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import type { AuditLog } from '../types';

export default function AuditLogsPage() {
  const { addToast } = useAuthStore();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  
  // Selected log for JSON details modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      const res = await api.get('/api/settings/audit-logs');
      setLogs(res.data);
    } catch (err) {
      console.error(err);
      addToast('Erreur lors du chargement des journaux d\'audit', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeClass = (action: string) => {
    if (action.includes('delete') || action.includes('cancel')) return 'badge-rejected';
    if (action.includes('create') || action.includes('import') || action.includes('add')) return 'badge-approved';
    if (action.includes('login')) return 'badge-cash';
    return 'badge-pending';
  };

  const formatActionName = (action: string) => {
    const maps: Record<string, string> = {
      'login': 'Connexion',
      'logout': 'Déconnexion',
      'user.create': 'Création utilisateur',
      'user.update': 'Modification utilisateur',
      'ticket.import': 'Importation tickets',
      'ticket.assign': 'Attribution tickets',
      'ticket.mark_defective': 'Ticket défectueux',
      'sale.create': 'Vente ticket',
      'sale.cancel': 'Annulation vente',
      'sale.mark_paid': 'Encaissement crédit',
      'resupply.create': 'Demande réappro.',
      'resupply.approve': 'Approbation réappro.',
      'resupply.reject': 'Rejet réappro.',
      'setting.update': 'Modification paramètre',
    };
    return maps[action] || action;
  };

  // Filter logs list
  const filteredLogs = logs.filter((log) => {
    const searchString = `${log.user_name || ''} ${log.action} ${log.entity_type} ${log.ip_address || ''}`.toLowerCase();
    const matchesSearch = searchString.includes(search.toLowerCase());
    const matchesAction = actionFilter ? log.action === actionFilter : true;
    return matchesSearch && matchesAction;
  });

  // Extract unique actions list for dropdown filter
  const uniqueActions = Array.from(new Set(logs.map(l => l.action)));

  return (
    <div>
      <div className="mb-6 flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Journaux d'Audit</h2>
          <p className="text-muted text-sm">Traçabilité complète des actions utilisateur</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadLogs}>
          Actualiser
        </button>
      </div>

      {/* Filters card */}
      <div className="card mb-4" style={{ padding: '16px' }}>
        <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '2 1 300px', marginBottom: 0 }}>
            <input
              type="text"
              placeholder="Rechercher par utilisateur, IP, action..."
              className="form-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
            <select
              className="form-input"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">Toutes les actions</option>
              {uniqueActions.map((action) => (
                <option key={action} value={action}>
                  {formatActionName(action)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Logs list */}
      <div className="data-table-container">
        <div className="table-header">
          <h3>Historique des Actions</h3>
          <span className="text-muted text-sm">{filteredLogs.length} journal(s)</span>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>Chargement...</div>
        ) : filteredLogs.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Utilisateur</th>
                <th>Action</th>
                <th>IP</th>
                <th>Cible</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td>
                    {new Date(log.created_at).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </td>
                  <td style={{ fontWeight: 600 }}>{log.user_name || 'Système'}</td>
                  <td>
                    <span className={`badge ${getActionBadgeClass(log.action)}`}>
                      {formatActionName(log.action)}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {log.ip_address || '—'}
                    </span>
                  </td>
                  <td>
                    <span className="text-muted text-xs">
                      {log.entity_type} {log.entity_id ? `#${log.entity_id}` : ''}
                    </span>
                  </td>
                  <td>
                    {log.details ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '4px', height: 'auto' }}
                        onClick={() => setSelectedLog(log)}
                        title="Voir les détails"
                      >
                        <Eye size={16} />
                      </button>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state" style={{ padding: '48px 24px' }}>
            <div className="empty-icon">🛡️</div>
            <h4>Aucun log trouvé</h4>
            <p>Essayez de modifier vos filtres ou effectuez de nouvelles actions.</p>
          </div>
        )}
      </div>

      {/* Details modal */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Détails de l'action</h3>
              <button className="modal-close" onClick={() => setSelectedLog(null)}>
                <X size={20} />
              </button>
            </div>
            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table className="table table-bordered mb-4" style={{ fontSize: '0.85rem' }}>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 600, width: '30%' }}>Action</td>
                    <td>{formatActionName(selectedLog.action)}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Utilisateur</td>
                    <td>{selectedLog.user_name || 'Système'}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Cible</td>
                    <td>{selectedLog.entity_type} {selectedLog.entity_id ? `#${selectedLog.entity_id}` : ''}</td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Adresse IP</td>
                    <td>{selectedLog.ip_address || 'Non spécifiée'}</td>
                  </tr>
                </tbody>
              </table>

              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Données brutes (JSON)</h4>
              <pre style={{
                background: 'rgba(0,0,0,0.2)',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                overflowX: 'auto',
                margin: 0
              }}>
                {JSON.stringify(selectedLog.details, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
