/* ============================================================
   Closures Page — Day-end cash register closures & auditing
   ============================================================ */

import { useEffect, useState, type FormEvent } from 'react';
import { Banknote, AlertCircle, FileText, CheckCircle2, AlertTriangle, Calendar, User, Search, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface RegisterClosure {
  id: number;
  vendor_id: number;
  closed_at: string;
  expected_cash: number;
  actual_cash: number;
  cash_difference: number;
  expected_wave: number;
  actual_wave: number;
  wave_difference: number;
  comment: string | null;
  vendor_name: string | null;
}

interface TodayStatus {
  expected_cash: number;
  expected_wave: number;
  already_closed: boolean;
  last_closure: RegisterClosure | null;
}

export default function ClosuresPage() {
  const { user, addToast } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [closures, setClosures] = useState<RegisterClosure[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [loading, setLoading] = useState(true);

  // Vendor state
  const [todayStatus, setTodayStatus] = useState<TodayStatus>({
    expected_cash: 0,
    expected_wave: 0,
    already_closed: false,
    last_closure: null
  });
  const [actualCash, setActualCash] = useState('');
  const [actualWave, setActualWave] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const formatCFA = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        // Load all closures and vendors list for filters
        const [closuresRes, vendorsRes] = await Promise.all([
          api.get('/api/register-closures/'),
          api.get('/api/users/')
        ]);
        setClosures(closuresRes.data);
        setVendors(vendorsRes.data.filter((u: any) => u.role === 'vendor'));
      } else {
        // Load vendor's expected sales and past closures
        const [statusRes, closuresRes] = await Promise.all([
          api.get('/api/register-closures/today-status'),
          api.get('/api/register-closures/')
        ]);
        setTodayStatus(statusRes.data);
        setClosures(closuresRes.data);
      }
    } catch (err) {
      console.error(err);
      addToast('Erreur lors du chargement des données', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitClosure = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm('Voulez-vous soumettre la clôture de caisse pour aujourd\'hui ? Cette action est irréversible.')) return;
    setSubmitting(true);
    try {
      const res = await api.post('/api/register-closures/', {
        actual_cash: Number(actualCash),
        actual_wave: Number(actualWave),
        comment: comment || null
      });
      addToast('Clôture de caisse enregistrée avec succès !', 'success');
      setActualCash('');
      setActualWave('');
      setComment('');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur lors de la clôture', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const getDifferenceBadge = (diff: number) => {
    if (diff === 0) {
      return <span style={{ color: '#10b981', fontWeight: 700 }}>Conforme (0 FCFA)</span>;
    }
    if (diff > 0) {
      return <span style={{ color: '#3b82f6', fontWeight: 700 }}>Surplus (+{formatCFA(diff)})</span>;
    }
    return <span style={{ color: '#ef4444', fontWeight: 700 }}>Déficit ({formatCFA(diff)})</span>;
  };

  const filteredClosures = closures.filter(c => {
    if (isAdmin && selectedVendorId) {
      return c.vendor_id === Number(selectedVendorId);
    }
    return true;
  });

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⏳</div>
        <h4>Chargement des clôtures...</h4>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Clôtures de Caisse</h2>
          <p className="text-muted text-sm" style={{ marginTop: '4px' }}>
            {isAdmin 
              ? 'Consulter et auditer les rapprochements de caisse soumis par les vendeurs.' 
              : 'Déclarer les espèces physiques et comptes Wave à la fin de votre journée.'}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadData} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Rafraîchir
        </button>
      </div>

      {/* VENDOR VIEW: Submit day-end closure */}
      {!isAdmin && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '32px' }}>
          {todayStatus.already_closed ? (
            <div className="card" style={{ padding: '24px', background: 'rgba(16, 185, 129, 0.05)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <CheckCircle2 size={32} color="#10b981" />
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#10b981' }}>Caisse clôturée pour aujourd'hui</h3>
                  <p className="text-muted text-xs" style={{ marginTop: '2px' }}>
                    Clôture soumise le {new Date(todayStatus.last_closure!.closed_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px' }}>
                <div className="card" style={{ padding: '16px', background: 'var(--bg-input)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ESPÈCES (CASH)</div>
                  <div style={{ marginTop: '6px', fontSize: '0.85rem' }}>Attendu : {formatCFA(todayStatus.last_closure!.expected_cash)}</div>
                  <div style={{ fontSize: '0.85rem' }}>Déclaré : {formatCFA(todayStatus.last_closure!.actual_cash)}</div>
                  <div style={{ marginTop: '4px', fontSize: '0.9rem' }}>Écart : {getDifferenceBadge(todayStatus.last_closure!.cash_difference)}</div>
                </div>
                <div className="card" style={{ padding: '16px', background: 'var(--bg-input)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>COMPTE WAVE</div>
                  <div style={{ marginTop: '6px', fontSize: '0.85rem' }}>Attendu : {formatCFA(todayStatus.last_closure!.expected_wave)}</div>
                  <div style={{ fontSize: '0.85rem' }}>Déclaré : {formatCFA(todayStatus.last_closure!.actual_wave)}</div>
                  <div style={{ marginTop: '4px', fontSize: '0.9rem' }}>Écart : {getDifferenceBadge(todayStatus.last_closure!.wave_difference)}</div>
                </div>
              </div>
              {todayStatus.last_closure?.comment && (
                <div style={{ marginTop: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <strong>Commentaire :</strong> "{todayStatus.last_closure.comment}"
                </div>
              )}
            </div>
          ) : (
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Banknote size={20} color="var(--primary-400)" />
                Soumettre la clôture de fin de service
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div className="card" style={{ padding: '16px', background: 'var(--bg-input)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>VENTES ESPÈCES ATTENDUES</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '6px' }}>
                    {formatCFA(todayStatus.expected_cash)}
                  </div>
                </div>
                <div className="card" style={{ padding: '16px', background: 'var(--bg-input)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>VENTES WAVE ATTENDUES</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary-300)', marginTop: '6px' }}>
                    {formatCFA(todayStatus.expected_wave)}
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmitClosure} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Espèces physiques en main (CFA) *</label>
                    <input
                      type="number"
                      className="form-input"
                      required
                      min={0}
                      value={actualCash}
                      onChange={(e) => setActualCash(e.target.value)}
                      placeholder="Ex: 5000"
                    />
                    {actualCash !== '' && (() => {
                      const diff = Number(actualCash) - todayStatus.expected_cash;
                      return (
                        <span style={{ fontSize: '0.75rem', marginTop: '4px', display: 'block', fontWeight: 600, color: diff === 0 ? '#10b981' : diff > 0 ? '#3b82f6' : '#ef4444' }}>
                          Écart : {diff === 0 ? 'Conforme' : diff > 0 ? `Surplus (+${formatCFA(diff)})` : `Déficit (${formatCFA(Math.abs(diff))})`}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Solde Wave déclaré (CFA) *</label>
                    <input
                      type="number"
                      className="form-input"
                      required
                      min={0}
                      value={actualWave}
                      onChange={(e) => setActualWave(e.target.value)}
                      placeholder="Ex: 10000"
                    />
                    {actualWave !== '' && (() => {
                      const diff = Number(actualWave) - todayStatus.expected_wave;
                      return (
                        <span style={{ fontSize: '0.75rem', marginTop: '4px', display: 'block', fontWeight: 600, color: diff === 0 ? '#10b981' : diff > 0 ? '#3b82f6' : '#ef4444' }}>
                          Écart : {diff === 0 ? 'Conforme' : diff > 0 ? `Surplus (+${formatCFA(diff)})` : `Déficit (${formatCFA(Math.abs(diff))})`}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Note / Explication d'écart (optionnel)</label>
                  <textarea
                    className="form-input"
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Saisissez une note si vous constatez un écart de caisse..."
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button type="submit" className="btn btn-accent" disabled={submitting}>
                    {submitting ? 'Enregistrement...' : 'Valider et clôturer la caisse'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ADMIN VIEW: Filter closures */}
      {isAdmin && (
        <div className="card mb-6" style={{ padding: '16px', display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label className="form-label">Filtrer par vendeur</label>
            <select
              className="form-select"
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
            >
              <option value="">Tous les vendeurs</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.full_name} ({v.username})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Closures History Table */}
      <div className="data-table-container">
        <div className="table-header">
          <h3>Historique des clôtures</h3>
          <span className="text-muted text-sm">{filteredClosures.length} clôture(s) enregistrée(s)</span>
        </div>

        {filteredClosures.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                {isAdmin && <th>Vendeur</th>}
                <th>Date / Heure</th>
                <th>Espèces attendues</th>
                <th>Espèces déclarées</th>
                <th>Écart Espèces</th>
                <th>Wave attendu</th>
                <th>Wave déclaré</th>
                <th>Écart Wave</th>
                <th>Commentaires</th>
              </tr>
            </thead>
            <tbody>
              {filteredClosures.map((c) => {
                const dateObj = new Date(c.closed_at);
                const isMismatch = c.cash_difference !== 0 || c.wave_difference !== 0;

                return (
                  <tr key={c.id} style={isMismatch ? { borderLeft: '3px solid #ef4444' } : {}}>
                    {isAdmin && <td style={{ fontWeight: 600 }}>{c.vendor_name || '—'}</td>}
                    <td style={{ fontSize: '0.85rem' }}>
                      {dateObj.toLocaleDateString('fr-FR')} {dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>{formatCFA(c.expected_cash)}</td>
                    <td>{formatCFA(c.actual_cash)}</td>
                    <td>{getDifferenceBadge(c.cash_difference)}</td>
                    <td>{formatCFA(c.expected_wave)}</td>
                    <td>{formatCFA(c.actual_wave)}</td>
                    <td>{getDifferenceBadge(c.wave_difference)}</td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.comment || ''}>
                      {c.comment || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="empty-state" style={{ padding: '48px 24px' }}>
            <div className="empty-icon" style={{ fontSize: '2rem' }}>💰</div>
            <h4>Aucune clôture de caisse</h4>
            <p className="text-muted text-sm">Les clôtures de fin de journée apparaîtront ici.</p>
          </div>
        )}
      </div>
    </div>
  );
}
