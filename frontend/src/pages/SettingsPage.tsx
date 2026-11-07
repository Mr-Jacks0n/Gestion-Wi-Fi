/* ============================================================
   Settings Page — Payment methods, subscription types, account
   ============================================================ */

import { useEffect, useState, type FormEvent } from 'react';
import { CreditCard, Plus, Edit, Trash2, Upload, X, Lock, Wifi, History, Zap, RefreshCw, Database, Download, QrCode, Copy } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import SecureImage from '../components/SecureImage';
import type { PaymentMethod, SubscriptionType } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');

export default function SettingsPage() {
  const { user, addToast } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [subTypes, setSubTypes] = useState<SubscriptionType[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [backupFiles, setBackupFiles] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [triggeringBackup, setTriggeringBackup] = useState(false);

  // Automation settings
  const [autoSettings, setAutoSettings] = useState<{key: string; value: string; label: string; description?: string}[]>([]);
  const [autoEditing, setAutoEditing] = useState<{[key: string]: string}>({});
  const [autoSaving, setAutoSaving] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState<string | null>(null);
  // Accès smartphone (mode installé) : URL LAN + QR code du backend
  const [accessInfo, setAccessInfo] = useState<{ url: string; qrUrl: string } | null>(null);

  // Password change
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');

  // Payment method form
  const [showPM, setShowPM] = useState(false);
  const [pmName, setPmName] = useState('');
  const [pmMerchant, setPmMerchant] = useState('');
  const [editPmId, setEditPmId] = useState<number | null>(null);

  // Subscription type form
  const [showST, setShowST] = useState(false);
  const [stName, setStName] = useState('');
  const [stDays, setStDays] = useState('');
  const [stUnit, setStUnit] = useState<'hours' | 'days'>('hours');
  const [stPrice, setStPrice] = useState('');
  const [editStId, setEditStId] = useState<number | null>(null);

  useEffect(() => { loadData(); loadAccessInfo(); }, []);

  const loadBackups = async () => {
    if (!isAdmin) return;
    setBackupLoading(true);
    try {
      const res = await api.get('/api/settings/backups');
      setBackupFiles(res.data);
    } catch (err) {
      console.error('Erreur chargement backups:', err);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleTriggerBackup = async () => {
    setTriggeringBackup(true);
    try {
      const res = await api.post('/api/settings/backups/trigger');
      addToast(`✅ ${res.data.message} : ${res.data.filename}`, 'success');
      loadBackups();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur lors de la sauvegarde', 'error');
    } finally {
      setTriggeringBackup(false);
    }
  };

  const handleDownloadBackup = async (filename: string) => {
    try {
      const token = localStorage.getItem('token') || '';
      const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');
      const response = await fetch(`${API_BASE}/api/settings/backups/download/${encodeURIComponent(filename)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      addToast(`Fichier "${filename}" téléchargé`, 'success');
    } catch (err: any) {
      addToast(`Erreur téléchargement : ${err.message}`, 'error');
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!confirm(`Supprimer définitivement "${filename}" ?`)) return;
    try {
      await api.delete(`/api/settings/backups/${encodeURIComponent(filename)}`);
      addToast('Fichier supprimé', 'success');
      loadBackups();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    }
  };

  const loadData = async () => {
    try {
      const [pmRes, stRes, auditRes, autoRes] = await Promise.all([
        isAdmin ? api.get('/api/settings/payment-methods') : api.get('/api/settings/payment-methods/active'),
        api.get('/api/tickets/subscription-types'),
        isAdmin ? api.get('/api/settings/audit-logs') : Promise.resolve({ data: [] }),
        isAdmin ? api.get('/api/automation/settings') : Promise.resolve({ data: [] }),
      ]);
      setPaymentMethods(pmRes.data);
      setSubTypes(stRes.data);
      if (isAdmin) setAuditLogs(auditRes.data);
      if (isAdmin) setAutoSettings(autoRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadAccessInfo = async () => {
    try {
      const res = await api.get('/api/app/access-url');
      if (!res.data?.url) return;
      const qrRes = await api.get('/api/app/access-qr', { responseType: 'blob' });
      setAccessInfo({
        url: res.data.url,
        qrUrl: URL.createObjectURL(new Blob([qrRes.data], { type: 'image/png' })),
      });
    } catch {
      // indisponible en mode dev (Vite) — la carte ne s'affiche pas
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/api/auth/change-password', { current_password: currentPwd, new_password: newPwd });
      addToast('Mot de passe modifié', 'success');
      setCurrentPwd(''); setNewPwd('');
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    }
  };

  // Payment method CRUD
  const handleSavePM = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editPmId) {
        await api.put(`/api/settings/payment-methods/${editPmId}`, {
          name: pmName,
          wave_merchant_number: pmMerchant || null,
        });
      } else {
        await api.post('/api/settings/payment-methods', {
          name: pmName,
          wave_merchant_number: pmMerchant || null,
        });
      }
      addToast(editPmId ? 'Moyen de paiement modifié' : 'Moyen de paiement ajouté', 'success');
      setShowPM(false); setPmName(''); setPmMerchant(''); setEditPmId(null);
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    }
  };

  const deletePM = async (id: number) => {
    if (!confirm('Supprimer ce moyen de paiement ?')) return;
    try {
      await api.delete(`/api/settings/payment-methods/${id}`);
      addToast('Supprimé', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    }
  };

  const uploadQR = async (methodId: number) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      try {
        await api.post(`/api/settings/payment-methods/${methodId}/upload-qr`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        addToast('QR code uploadé', 'success');
        loadData();
      } catch (err: any) {
        addToast(err.response?.data?.detail || 'Erreur d\'upload', 'error');
      }
    };
    input.click();
  };

  // Subscription type CRUD
  const handleSaveST = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const durationHours = stUnit === 'days' ? Math.round(Number(stDays) * 24) : Math.round(Number(stDays));
      if (editStId) {
        await api.put(`/api/tickets/subscription-types/${editStId}`, {
          name: stName,
          duration_hours: durationHours,
          price: Number(stPrice),
        });
      } else {
        await api.post('/api/tickets/subscription-types', {
          name: stName,
          duration_hours: durationHours,
          price: Number(stPrice),
        });
      }
      addToast(editStId ? 'Type d\'abonnement modifié' : 'Type d\'abonnement ajouté', 'success');
      setShowST(false); setStName(''); setStDays(''); setStPrice(''); setEditStId(null);
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    }
  };

  const deleteST = async (id: number) => {
    if (!confirm('Supprimer ce type d\'abonnement ?')) return;
    try {
      await api.delete(`/api/tickets/subscription-types/${id}`);
      addToast('Type d\'abonnement supprimé', 'success');
      loadData();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    }
  };

  const getActionBadgeClass = (action: string) => {
    if (action.startsWith('auth.')) return 'badge-inactive';
    if (action.includes('.delete') || action.includes('cancel') || action.includes('reject')) return 'badge-inactive';
    if (action.includes('.create') || action.includes('approve') || action.includes('login')) return 'badge-active';
    return '';
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      'auth.login': 'Connexion',
      'auth.change_password': 'Mot de passe modifié',
      'subscription_type.create': 'Type créé',
      'subscription_type.update': 'Type modifié',
      'subscription_type.delete': 'Type supprimé',
      'batch.create': 'Lot importé',
      'batch.delete': 'Lot supprimé',
      'tickets.assign': 'Attribué',
      'tickets.bulk_assign': 'Attribué (FIFO)',
      'resupply.request': 'Réappro. demandé',
      'resupply.approve': 'Réappro. approuvé',
      'resupply.reject': 'Réappro. rejeté',
      'sale.create': 'Vente',
      'sale.cancel': 'Annulé',
    };
    return labels[action] || action;
  };

  const formatDetails = (action: string, details: any) => {
    if (!details) return '';
    if (action === 'auth.login') return `Utilisateur : ${details.username} (${details.role})`;
    if (action.startsWith('subscription_type.')) return `Type : ${details.name} (${details.price || ''} FCFA)`;
    if (action === 'batch.create') return `Lot : ${details.reference} (${details.total_tickets} tickets)`;
    if (action === 'batch.delete') return `Lot : ${details.reference}`;
    if (action.startsWith('tickets.')) return `Vendeur : ${details.vendor_name || ('ID: ' + details.entity_id)} (${details.count} tickets)`;
    if (action === 'resupply.request') return `Type : ${details.subscription_type} (Qté : ${details.quantity})`;
    if (action.startsWith('resupply.')) return `Vendeur : ${details.vendor_name} (Qté : ${details.quantity})`;
    if (action === 'sale.create') return `Code : ${details.ticket_code} (Payé par : ${details.payment_method})`;
    if (action === 'sale.cancel') return `Code : ${details.ticket_code} (Raison : ${details.reason || 'Non spécifiée'})`;
    return JSON.stringify(details);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Paramètres</h2>
        <p className="text-muted text-sm">Gérer votre compte et la configuration</p>
      </div>

      <div style={{ display: 'grid', gap: '20px', maxWidth: '800px' }}>
        {/* Password Change */}
        <div className="card">
          <h3 style={{ fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={18} /> Changer mon mot de passe
          </h3>
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label className="form-label">Mot de passe actuel</label>
              <input type="password" className="form-input" required value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Nouveau mot de passe</label>
              <input type="password" className="form-input" required minLength={8} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary">Modifier</button>
          </form>
        </div>

        {/* Accès smartphone (mode installé : le backend sert l'app) */}
        {accessInfo && (
          <div className="card">
            <h3 style={{ fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <QrCode size={18} /> Accès smartphone
            </h3>
            <p className="text-muted text-sm" style={{ marginBottom: '14px' }}>
              Scannez ce QR avec un téléphone connecté au <strong>même réseau Wi-Fi</strong> pour ouvrir l'application.
            </p>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <img
                src={accessInfo.qrUrl}
                alt="QR d'accès smartphone"
                style={{ width: 140, height: 140, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', flexShrink: 0 }}
              />
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--primary-300)', marginBottom: '8px' }}>
                  {accessInfo.url}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(accessInfo.url);
                    addToast('Lien copié', 'success');
                  }}
                >
                  <Copy size={14} /> Copier le lien
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Payment Methods (admin) */}
        {isAdmin && (
          <div className="card">
            <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCard size={18} /> Moyens de paiement
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditPmId(null); setPmName(''); setPmMerchant(''); setShowPM(true); }}>
                <Plus size={14} /> Ajouter
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {paymentMethods.map((pm) => (
                <div key={pm.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{pm.name}</span>
                    {pm.wave_merchant_number && (
                      <span className="text-muted text-sm" style={{ marginLeft: '8px' }}>
                        ({pm.wave_merchant_number})
                      </span>
                    )}
                    <span className={`badge ${pm.is_active ? 'badge-active' : 'badge-inactive'}`} style={{ marginLeft: '8px' }}>
                      {pm.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {pm.name.toLowerCase().includes('wave') && (
                      <button className="btn btn-ghost btn-sm" onClick={() => uploadQR(pm.id)} title="Uploader QR">
                        <Upload size={14} />
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setEditPmId(pm.id); setPmName(pm.name); setPmMerchant(pm.wave_merchant_number || ''); setShowPM(true);
                    }}>
                      <Edit size={14} />
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deletePM(pm.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Wave QR preview */}
            {paymentMethods.filter(pm => pm.wave_qr_image_path).map(pm => (
              <div key={pm.id} className="wave-qr-container" style={{ marginTop: '16px' }}>
                <SecureImage srcPath={pm.wave_qr_image_path} alt="QR Code Wave" />
                {pm.wave_merchant_number && (
                  <>
                    <div className="wave-merchant-label">Numéro Marchand Wave</div>
                    <div className="wave-merchant">{pm.wave_merchant_number}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Subscription Types (admin) */}
        {isAdmin && (
          <div className="card">
            <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Wifi size={18} /> Types d'abonnement
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditStId(null); setStName(''); setStDays(''); setStPrice(''); setShowST(true); }}>
                <Plus size={14} /> Ajouter
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {subTypes.map((st) => (
                <div key={st.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{st.name}</span>
                    <span className="text-muted text-sm" style={{ marginLeft: '8px' }}>
                      {st.duration_hours % 24 === 0 ? `${st.duration_hours / 24} jour(s)` : `${st.duration_hours}h`} — {new Intl.NumberFormat('fr-FR').format(st.price)} FCFA
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setEditStId(st.id);
                      setStName(st.name);
                      if (st.duration_hours % 24 === 0) {
                        setStUnit('days');
                        setStDays(String(st.duration_hours / 24));
                      } else {
                        setStUnit('hours');
                        setStDays(String(st.duration_hours));
                      }
                      setStPrice(String(st.price));
                      setShowST(true);
                    }}>
                      <Edit size={14} />
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteST(st.id)} title="Supprimer">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit Logs (admin only) */}
        {isAdmin && (
          <div className="card" style={{ maxWidth: '100%' }}>
            <h3 style={{ fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={18} /> Historique des actions (Traçabilité)
            </h3>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Utilisateur</th>
                    <th>Action</th>
                    <th>Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-muted" style={{ padding: '24px' }}>
                        Aucune action enregistrée
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{new Date(log.created_at).toLocaleString('fr-FR')}</td>
                        <td style={{ fontWeight: 600 }}>{log.user_name}</td>
                        <td>
                          <span className={`badge ${getActionBadgeClass(log.action)}`}>
                            {getActionLabel(log.action)}
                          </span>
                        </td>
                        <td className="text-muted">
                          {formatDetails(log.action, log.details)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Database Backup (admin) */}
        {isAdmin && (
          <div className="card">
            <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
              <h3 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={18} /> Sauvegardes Automatiques
              </h3>
              <div className="flex gap-2">
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={loadBackups}
                  disabled={backupLoading}
                  title="Actualiser la liste"
                >
                  <RefreshCw size={14} className={backupLoading ? 'spin' : ''} />
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleTriggerBackup}
                  disabled={triggeringBackup}
                >
                  {triggeringBackup ? (
                    <><RefreshCw size={14} className="spin" /> Sauvegarde...</>
                  ) : (
                    <><Database size={14} /> Déclencher une sauvegarde</>  
                  )}
                </button>
              </div>
            </div>

            <p className="text-muted text-sm" style={{ marginBottom: '16px', lineHeight: '1.5' }}>
              Les sauvegardes JSON complètes sont déclenchées <strong>automatiquement</strong> après chaque
              importation de lot et chaque vente. Elles sont stockées dans le dossier <code style={{ background: 'var(--bg-input)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.78rem' }}>backups/</code> du projet.
            </p>

            {/* Backup list */}
            {backupFiles.length === 0 && !backupLoading && (
              <div style={{
                textAlign: 'center', padding: '28px 16px',
                color: 'var(--text-muted)', fontSize: '0.85rem',
                background: 'var(--bg-input)', borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--border-default)'
              }}>
                <Database size={28} style={{ margin: '0 auto 10px', opacity: 0.3, display: 'block' }} />
                Aucun fichier de sauvegarde trouvé.<br />
                <span style={{ fontSize: '0.78rem' }}>Cliquez sur « Actualiser » ou déclenchez une sauvegarde manuelle.</span>
              </div>
            )}

            {backupLoading && (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                <RefreshCw size={20} className="spin" style={{ margin: '0 auto', display: 'block' }} />
              </div>
            )}

            {backupFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                {backupFiles.map((f) => {
                  const dateStr = f.created_at
                    ? new Date(f.created_at * 1000).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—';
                  const triggerLabel: Record<string, string> = {
                    vente: '🛒 Vente',
                    import_lot: '📦 Import lot',
                    manuel: '🖐 Manuel',
                    manual_download: '📥 Téléchargement',
                    auto: '⚙️ Auto',
                  };
                  const trigger = f.trigger || 'auto';
                  return (
                    <div key={f.filename} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)', gap: '12px', flexWrap: 'wrap'
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {f.filename}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '10px' }}>
                          <span>{dateStr}</span>
                          <span>{f.size_kb} KB</span>
                          <span style={{ color: 'var(--primary-300)' }}>{triggerLabel[trigger] || trigger}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDownloadBackup(f.filename)}
                          title="Télécharger ce fichier"
                          style={{ color: 'var(--primary-300)' }}
                        >
                          <Download size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleDeleteBackup(f.filename)}
                          title="Supprimer ce fichier"
                          style={{ color: 'var(--danger)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment Method Modal */}
      {showPM && (
        <div className="modal-overlay" onClick={() => setShowPM(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>{editPmId ? 'Modifier' : 'Ajouter un moyen de paiement'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowPM(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSavePM}>
              <div className="form-group">
                <label className="form-label">Nom *</label>
                <input className="form-input" required value={pmName} onChange={(e) => setPmName(e.target.value)} placeholder="ex: Wave, Orange Money..." />
              </div>
              <div className="form-group">
                <label className="form-label">Numéro marchand (optionnel)</label>
                <input className="form-input" value={pmMerchant} onChange={(e) => setPmMerchant(e.target.value)} placeholder="ex: +225 07 XX XX XX XX" />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowPM(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">{editPmId ? 'Enregistrer' : 'Ajouter'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Subscription Type Modal */}
      {showST && (
        <div className="modal-overlay" onClick={() => setShowST(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>{editStId ? 'Modifier' : "Ajouter un type d'abonnement"}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowST(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveST}>
              <div className="form-group">
                <label className="form-label">Nom du forfait *</label>
                <input className="form-input" required value={stName} onChange={(e) => setStName(e.target.value)} placeholder="ex: 1 Heure, 24 Heures, 7 Jours..." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Durée *</label>
                  <input type="number" step="any" className="form-input" required min={1} value={stDays} onChange={(e) => setStDays(e.target.value)} placeholder="ex: 1, 3, 24..." />
                </div>
                <div className="form-group">
                  <label className="form-label">Unité</label>
                  <select className="form-select" value={stUnit} onChange={(e) => setStUnit(e.target.value as 'hours' | 'days')}>
                    <option value="hours">Heure(s)</option>
                    <option value="days">Jour(s)</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Prix (FCFA) *</label>
                <input type="number" className="form-input" required min={1} value={stPrice} onChange={(e) => setStPrice(e.target.value)} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowST(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">{editStId ? 'Enregistrer' : 'Ajouter'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === Automation Panel (admin) === */}
      {isAdmin && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: -1, display: 'none' }} />
      )}
    </div>
  );
}
