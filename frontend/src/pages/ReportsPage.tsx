/* ============================================================
   ReportsPage.tsx — Premium Export & Reporting Center
   Refined dark theme design, glassmorphism, native HTTP download
   ============================================================ */

import { useState, useEffect } from 'react';
import { 
  FileText, 
  FileSpreadsheet, 
  ChevronDown, 
  ChevronUp, 
  User as UserIcon, 
  CreditCard, 
  ShieldCheck, 
  Download, 
  CalendarDays, 
  Filter,
  Info
} from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

export default function ReportsPage() {
  const { user, addToast } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  // Config States
  const [reportType, setReportType] = useState('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Filter States
  const [vendors, setVendors] = useState<any[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [selectedPaidStatus, setSelectedPaidStatus] = useState('');

  // Fetch vendors list for Admin
  useEffect(() => {
    if (isAdmin) {
      api.get('/api/users/')
        .then((res) => setVendors(res.data))
        .catch((err) => console.error('Erreur de chargement des vendeurs:', err));
    }
  }, [isAdmin]);

  // Téléchargement fiable via fetch() + Blob URL — garantit le bon nom de fichier sur tous les navigateurs
  const triggerDownload = async (format: 'pdf' | 'excel') => {
    setGenerating(true);
    try {
      const token = localStorage.getItem('token') || '';
      
      const payload: any = { report_type: reportType, format };

      if (reportType === 'custom') {
        if (!startDate || !endDate) {
          addToast('Veuillez sélectionner les dates de début et de fin', 'error');
          setGenerating(false);
          return;
        }
        payload.start_date = startDate;
        payload.end_date = endDate;
      }

      if (isAdmin && selectedVendorId) {
        payload.vendor_id = Number(selectedVendorId);
      }
      if (selectedPaymentMethod) {
        payload.payment_method = selectedPaymentMethod;
      }
      if (selectedPaidStatus) {
        payload.is_paid = selectedPaidStatus === 'paid';
      }

      const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000' : '');

      const response = await fetch(`${API_BASE_URL}/api/reports/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erreur serveur ${response.status}: ${errText}`);
      }

      // Lire la réponse comme un Blob binaire et forcer le téléchargement
      const blob = await response.blob();
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      const mimeType = format === 'excel'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf';

      const blobUrl = URL.createObjectURL(new Blob([blob], { type: mimeType }));
      const formattedDate = new Date().toISOString().split('T')[0];
      const filename = `rapport_${reportType}_${formattedDate}.${ext}`;

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);

      addToast(`Rapport ${format.toUpperCase()} "${filename}" téléchargé avec succès`, 'success');
    } catch (err: any) {
      console.error('Erreur lors de l\'exportation :', err);
      addToast(`Erreur lors de la génération du rapport : ${err.message || 'Inconnue'}`, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const reportTypes = [
    { value: 'daily', label: 'Journalier', desc: "Ventes d'aujourd'hui uniquement", icon: <CalendarDays size={22} /> },
    { value: 'weekly', label: 'Hebdomadaire', desc: 'Ventes de la semaine en cours', icon: <CalendarDays size={22} /> },
    { value: 'monthly', label: 'Mensuel', desc: 'Ventes du mois en cours', icon: <CalendarDays size={22} /> },
    { value: 'custom', label: 'Personnalisé', desc: 'Choisir un intervalle de dates', icon: <Filter size={20} /> },
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', animation: 'fadeIn var(--transition-normal)' }}>
      
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Export & Rapports d'Activité
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '2px' }}>
            Compilez et exportez les données de vente de votre réseau Wi-Fi.
          </p>
        </div>
        <div style={{ 
          padding: '6px 14px', 
          background: 'rgba(99, 102, 241, 0.08)', 
          border: '1px solid var(--border-accent)', 
          borderRadius: 'var(--radius-pill)', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px' 
        }}>
          <ShieldCheck size={16} style={{ color: 'var(--primary-300)' }} />
          <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-primary)' }}>
            Téléchargement Sécurisé
          </span>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column — Selection & Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Period Selector Card */}
          <div className="card" style={{ padding: '24px' }}>
            <h4 className="text-label" style={{ marginBottom: '16px' }}>Sélection de la période</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {reportTypes.map((rt) => (
                <div
                  key={rt.value}
                  className="card"
                  onClick={() => setReportType(rt.value)}
                  style={{
                    cursor: 'pointer',
                    padding: '16px',
                    borderColor: reportType === rt.value ? 'var(--primary-400)' : 'var(--border-default)',
                    background: reportType === rt.value ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-elevated)',
                    transition: 'all var(--transition-fast)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px'
                  }}
                >
                  <div style={{ 
                    padding: '10px', 
                    borderRadius: 'var(--radius-md)', 
                    background: reportType === rt.value ? 'var(--primary-500)' : 'rgba(255,255,255,0.03)',
                    color: reportType === rt.value ? '#ffffff' : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all var(--transition-fast)'
                  }}>
                    {rt.icon}
                  </div>
                  <div>
                    <h5 style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{rt.label}</h5>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', marginTop: '2px' }}>{rt.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Conditional Custom Date Inputs */}
            {reportType === 'custom' && (
              <div style={{ marginTop: '20px', padding: '16px', borderTop: '1px solid var(--border-default)', animation: 'slideDown var(--transition-normal)' }}>
                <h5 style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '12px', color: 'var(--text-primary)' }}>Période personnalisée</h5>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>Date de début</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={startDate} 
                      onChange={(e) => setStartDate(e.target.value)} 
                      style={{ fontSize: '0.85rem', padding: '10px' }}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>Date de fin</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={endDate} 
                      onChange={(e) => setEndDate(e.target.value)} 
                      style={{ fontSize: '0.85rem', padding: '10px' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Advanced Filters Accordion */}
          <div className="card" style={{ padding: '0px', overflow: 'hidden' }}>
            <div 
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{ 
                padding: '18px 24px', 
                cursor: 'pointer', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                background: 'rgba(255,255,255,0.01)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Filter size={18} style={{ color: showAdvanced ? 'var(--primary-400)' : 'var(--text-secondary)' }} />
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Filtres Avancés Optionnels</span>
              </div>
              {showAdvanced ? <ChevronUp size={18} style={{ color: 'var(--text-secondary)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-secondary)' }} />}
            </div>

            {showAdvanced && (
              <div style={{ padding: '24px', borderTop: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '16px', animation: 'slideDown var(--transition-normal)' }}>
                {isAdmin && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <UserIcon size={14} /> Filtrer par vendeur
                    </label>
                    <select
                      className="form-input"
                      value={selectedVendorId}
                      onChange={(e) => setSelectedVendorId(e.target.value)}
                    >
                      <option value="">Tous les vendeurs</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>{v.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <CreditCard size={14} /> Mode de paiement
                  </label>
                  <select
                    className="form-input"
                    value={selectedPaymentMethod}
                    onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                  >
                    <option value="">Tous les modes</option>
                    <option value="cash">Espèces</option>
                    <option value="wave">Wave</option>
                    <option value="credit">Crédit</option>
                    <option value="compensation">Dédommagement</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Statut du paiement
                  </label>
                  <select
                    className="form-input"
                    value={selectedPaidStatus}
                    onChange={(e) => setSelectedPaidStatus(e.target.value)}
                  >
                    <option value="">Tous les statuts</option>
                    <option value="paid">Payé</option>
                    <option value="unpaid">Non payé (Crédits en cours)</option>
                  </select>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Right Column — Export Actions & Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Main Download Card */}
          <div className="card card-accent" style={{ padding: '28px', position: 'relative' }}>
            <h4 className="text-label" style={{ marginBottom: '14px' }}>Téléchargement du document</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: '1.5' }}>
              Sélectionnez le format de rapport ci-dessous. Le traitement s'effectue côté serveur avant de lancer le téléchargement.
            </p>

            {/* Active Export Configuration Summary */}
            <div style={{ 
              background: 'var(--bg-elevated)', 
              borderRadius: 'var(--radius-md)', 
              padding: '16px', 
              border: '1px solid var(--border-default)', 
              marginBottom: '28px',
              fontSize: '0.8rem'
            }}>
              <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem' }}>Résumé de l'export :</span>
              <div style={{ color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>Période : <strong>{reportType === 'custom' ? `${startDate || '?'} au ${endDate || '?'}` : reportType.toUpperCase()}</strong></div>
                <div>Vendeur : <strong>{isAdmin ? (selectedVendorId ? vendors.find(v => v.id.toString() === selectedVendorId)?.full_name : 'Tous') : user?.full_name}</strong></div>
                <div>Paiement : <strong>{selectedPaymentMethod ? selectedPaymentMethod.toUpperCase() : 'Tous'}</strong></div>
                <div>Statut : <strong>{selectedPaidStatus === 'paid' ? 'Payé' : selectedPaidStatus === 'unpaid' ? 'Non payé' : 'Tous'}</strong></div>
              </div>
            </div>

            {/* Export Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                className="btn btn-primary"
                onClick={() => triggerDownload('pdf')}
                disabled={generating}
                style={{ 
                  padding: '14px', 
                  fontSize: '0.9rem', 
                  fontWeight: 700, 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '10px',
                  background: 'linear-gradient(135deg, var(--primary-500) 0%, var(--primary-600) 100%)',
                  border: 'none',
                  boxShadow: 'var(--shadow-glow)',
                  cursor: 'pointer'
                }}
              >
                <FileText size={18} />
                {generating ? 'Génération...' : 'Exporter en PDF'}
              </button>
              <button
                className="btn btn-accent"
                onClick={() => triggerDownload('excel')}
                disabled={generating}
                style={{ 
                  padding: '14px', 
                  fontSize: '0.9rem', 
                  fontWeight: 700, 
                  width: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '10px',
                  background: 'linear-gradient(135deg, var(--accent-500) 0%, var(--accent-600) 100%)',
                  border: 'none',
                  color: '#080c18',
                  cursor: 'pointer'
                }}
              >
                <FileSpreadsheet size={18} />
                {generating ? 'Génération...' : 'Exporter en Excel'}
              </button>
            </div>
          </div>

          {/* Quick Guide Card */}
          <div className="card" style={{ padding: '24px', background: 'rgba(255, 255, 255, 0.01)' }}>
            <h5 style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Info size={16} style={{ color: 'var(--primary-300)' }} /> Guide Rapide
            </h5>
            <ul style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '8px', lineHeight: '1.4' }}>
              <li><strong>Rapport PDF :</strong> Idéal pour les impressions papier ou l'archivage propre des performances financières de la période.</li>
              <li><strong>Rapport Excel (.xlsx) :</strong> Recommandé si vous souhaitez effectuer vos propres calculs, graphiques ou importations comptables.</li>
              <li><strong>Filtres de paiement :</strong> Permet d'isoler uniquement les crédits clients pour faire des bilans des dettes à recouvrer.</li>
            </ul>
          </div>

        </div>

      </div>

    </div>
  );
}
