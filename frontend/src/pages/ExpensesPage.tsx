/* ============================================================
   Expenses Page — Manage operational costs & billing
   ============================================================ */

import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Trash2, X, Wallet, Wifi, Zap, Home, User, Receipt } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string;
  payment_source: string;
  created_at: string;
  created_by_name: string;
}

export default function ExpensesPage() {
  const { addToast } = useAuthStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({ description: '', amount: '', category: 'internet', payment_source: 'cash' });

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    try {
      const res = await api.get('/api/expenses/');
      setExpenses(res.data);
    } catch (err) {
      console.error(err);
      addToast('Erreur lors du chargement des dépenses', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.description || !formData.amount) return;

    try {
      await api.post('/api/expenses/', {
        description: formData.description,
        amount: Number(formData.amount),
        category: formData.category,
        payment_source: formData.payment_source
      });
      addToast('Dépense ajoutée avec succès', 'success');
      setShowAddModal(false);
      setFormData({ description: '', amount: '', category: 'internet', payment_source: 'cash' });
      loadExpenses();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur lors de l\'ajout', 'error');
    }
  };

  const handleDelete = async (id: number, desc: string) => {
    if (!confirm(`Supprimer la dépense "${desc}" ?`)) return;
    try {
      await api.delete(`/api/expenses/${id}`);
      addToast('Dépense supprimée', 'success');
      loadExpenses();
    } catch (err: any) {
      addToast(err.response?.data?.detail || 'Erreur lors de la suppression', 'error');
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'internet': return <Wifi size={16} />;
      case 'fuel': return <Zap size={16} />;
      case 'rent': return <Home size={16} />;
      case 'salary': return <User size={16} />;
      default: return <Receipt size={16} />;
    }
  };

  const formatCategoryName = (category: string) => {
    switch (category) {
      case 'internet': return 'Abonnement Internet';
      case 'fuel': return 'Carburant / Énergie';
      case 'rent': return 'Loyer Hotspot';
      case 'salary': return 'Salaires / Rémunération';
      default: return 'Autres Dépenses';
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'internet': return 'badge-cash';
      case 'fuel': return 'badge-pending';
      case 'rent': return 'badge-defective';
      case 'salary': return 'badge-approved';
      default: return '';
    }
  };

  const formatCFA = (n: number) =>
    new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' FCFA';

  // Filter list
  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch = e.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter ? e.category === categoryFilter : true;
    return matchesSearch && matchesCategory;
  });

  const totalFilteredAmount = filteredExpenses.reduce((acc, curr) => acc + Number(curr.amount), 0);

  return (
    <div>
      <div className="mb-6 flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Dépenses</h2>
          <p className="text-muted text-sm">Gérer les charges et frais opérationnels</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <Plus size={18} />
          Nouvelle dépense
        </button>
      </div>

      {/* Summary KPI card */}
      <div className="stats-grid mb-6" style={{ gridTemplateColumns: '1fr' }}>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.02))', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
          <div className="stat-icon red">
            <Wallet size={22} />
          </div>
          <div className="stat-info">
            <h3>Frais cumulés (période filtrée)</h3>
            <div className="stat-value" style={{ color: 'var(--danger)' }}>
              {formatCFA(totalFilteredAmount)}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4" style={{ padding: '16px' }}>
        <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '2 1 300px', marginBottom: 0 }}>
            <input
              type="text"
              placeholder="Rechercher par description..."
              className="form-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
            <select
              className="form-input"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">Toutes les catégories</option>
              <option value="internet">Abonnement Internet</option>
              <option value="fuel">Carburant / Énergie</option>
              <option value="rent">Loyer Hotspot</option>
              <option value="salary">Salaires / Rémunération</option>
              <option value="others">Autres</option>
            </select>
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="data-table-container">
        <div className="table-header">
          <h3>Frais et Charges</h3>
          <span className="text-muted text-sm">{filteredExpenses.length} dépense(s)</span>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>Chargement...</div>
        ) : filteredExpenses.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Catégorie</th>
                <th>Description</th>
                <th>Source</th>
                <th>Créé par</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th style={{ width: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.map((exp) => (
                <tr key={exp.id}>
                  <td>
                    {new Date(exp.created_at).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric'
                    })}
                  </td>
                  <td>
                    <span className={`badge ${getCategoryBadgeClass(exp.category)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {getCategoryIcon(exp.category)}
                      {formatCategoryName(exp.category)}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{exp.description}</td>
                  <td>
                    <span className={`badge ${exp.payment_source === 'wave' ? 'badge-wave' : 'badge-cash'}`}>
                      {exp.payment_source === 'wave' ? 'Wave' : 'Espèces'}
                    </span>
                  </td>
                  <td>{exp.created_by_name}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>
                    {formatCFA(exp.amount)}
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)', padding: '4px' }}
                      onClick={() => handleDelete(exp.id, exp.description)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state" style={{ padding: '48px 24px' }}>
            <div className="empty-icon">💸</div>
            <h4>Aucune dépense trouvée</h4>
            <p>Ajoutez des frais pour suivre vos coûts opérationnels.</p>
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Nouvelle Dépense</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Catégorie</label>
                <select
                  className="form-input"
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="internet">Abonnement Internet</option>
                  <option value="fuel">Carburant / Énergie</option>
                  <option value="rent">Loyer Hotspot</option>
                  <option value="salary">Salaires / Rémunération</option>
                  <option value="others">Autres</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Description / Détail</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: Facture CanalBox Avril, Achat gasoil groupe..."
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Montant (FCFA)</label>
                <input
                  type="number"
                  className="form-input"
                  min={100}
                  required
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Source de paiement</label>
                <select
                  className="form-input"
                  required
                  value={formData.payment_source}
                  onChange={(e) => setFormData({ ...formData, payment_source: e.target.value })}
                >
                  <option value="cash">Espèces (Physique)</option>
                  <option value="wave">Compte Wave</option>
                </select>
              </div>

              <div className="modal-footer" style={{ marginTop: '24px' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowAddModal(false)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
