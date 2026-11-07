/* ============================================================
   Vendors Page — Admin CRUD for vendor management
   ============================================================ */

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Edit, Trash2, Lock, X, UserCheck, UserX } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import type { UserWithStats } from '../types';

export default function VendorsPage() {
  const { user, addToast } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [vendors, setVendors] = useState<UserWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit modal
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ username: '', full_name: '', phone: '', email: '', password: '', role: 'vendor' });

  // Password modal
  const [showPwdModal, setShowPwdModal] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => { loadVendors(); }, []);

  const loadVendors = async () => {
    try {
      const res = await api.get('/api/users/');
      setVendors(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const formatCFA = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editId) {
        await api.put(`/api/users/${editId}`, {
          full_name: formData.full_name,
          phone: formData.phone,
          email: formData.email || null,
        });
        addToast('Vendeur modifié', 'success');
      } else {
        await api.post('/api/users/', formData);
        addToast('Vendeur créé', 'success');
      }
      setShowForm(false);
      setEditId(null);
      setFormData({ username: '', full_name: '', phone: '', email: '', password: '', role: 'vendor' });
      loadVendors();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    }
  };

  const openEdit = (v: UserWithStats) => {
    setEditId(v.id);
    setFormData({ username: v.username, full_name: v.full_name, phone: v.phone, email: v.email || '', password: '', role: v.role });
    setShowForm(true);
  };

  const toggleActive = async (v: UserWithStats) => {
    try {
      await api.put(`/api/users/${v.id}`, { is_active: !v.is_active });
      addToast(v.is_active ? 'Vendeur désactivé' : 'Vendeur réactivé', 'success');
      loadVendors();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    }
  };

  const deleteVendor = async (v: UserWithStats) => {
    if (!confirm(`Supprimer définitivement le compte de ${v.full_name} ? Ses tickets en cours seront transférés à l'administrateur.`)) return;
    try {
      await api.delete(`/api/users/${v.id}`);
      addToast('Vendeur supprimé définitivement et tickets transférés', 'success');
      loadVendors();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!showPwdModal) return;
    try {
      await api.post(`/api/users/${showPwdModal}/change-password`, { new_password: newPassword });
      addToast('Mot de passe modifié', 'success');
      setShowPwdModal(null);
      setNewPassword('');
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur', 'error');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Vendeurs</h2>
          <p className="text-muted text-sm">Gérer les comptes vendeurs</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => { setEditId(null); setFormData({ username: '', full_name: '', phone: '', email: '', password: '', role: 'vendor' }); setShowForm(true); }}>
            <Plus size={16} /> Nouveau vendeur
          </button>
        )}
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Identifiant</th>
              <th>Téléphone</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Ventes</th>
              <th>CA</th>
              <th>Stock</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id}>
                <td style={{ fontWeight: 600 }}>{v.full_name}</td>
                <td>{v.username}</td>
                <td>{v.phone}</td>
                <td>
                  <span className={`badge ${v.role === 'admin' ? 'badge-assigned' : v.role === 'technician' ? 'badge-pending' : 'badge-sold'}`}>
                    {v.role === 'admin' ? 'Admin' : v.role === 'technician' ? 'Technicien' : 'Vendeur'}
                  </span>
                </td>
                <td><span className={`badge ${v.is_active ? 'badge-active' : 'badge-inactive'}`}>{v.is_active ? 'Actif' : 'Inactif'}</span></td>
                <td>{v.total_sales}</td>
                <td>{formatCFA(v.total_revenue)}</td>
                <td>{v.stock_count}</td>
                {isAdmin && (
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(v)} title="Modifier"><Edit size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setShowPwdModal(v.id); setNewPassword(''); }} title="Mot de passe"><Lock size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(v)} title={v.is_active ? 'Désactiver' : 'Activer'}>
                        {v.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                      </button>
                      {v.role !== 'admin' && (
                        <button className="btn btn-ghost btn-sm" onClick={() => deleteVendor(v)} title="Supprimer" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {vendors.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <h4>Aucun vendeur</h4>
            <p>Créez votre premier vendeur</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editId ? 'Modifier' : 'Nouveau vendeur'}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              {!editId && (
                <div className="form-group">
                  <label className="form-label">Nom d'utilisateur *</label>
                  <input className="form-input" required value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Nom complet *</label>
                <input className="form-input" required value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Téléphone *</label>
                <input className="form-input" required value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Email (optionnel)</label>
                <input className="form-input" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              {!editId && (
                <>
                  <div className="form-group">
                    <label className="form-label">Mot de passe *</label>
                    <input className="form-input" type="password" required value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Rôle</label>
                    <select className="form-select" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                      <option value="vendor">Vendeur</option>
                      <option value="technician">Technicien</option>
                      <option value="admin">Administrateur</option>
                    </select>
                  </div>
                </>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Annuler</button>
                <button type="submit" className="btn btn-primary">{editId ? 'Enregistrer' : 'Créer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {showPwdModal !== null && (
        <div className="modal-overlay" onClick={() => setShowPwdModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3>Changer le mot de passe</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowPwdModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={changePassword}>
              <div className="form-group">
                <label className="form-label">Nouveau mot de passe *</label>
                <input className="form-input" type="password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowPwdModal(null)}>Annuler</button>
                <button type="submit" className="btn btn-primary">Modifier</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
