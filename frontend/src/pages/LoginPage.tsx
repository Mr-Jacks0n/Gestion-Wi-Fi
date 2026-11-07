/* ============================================================
   Login Page — User Profile Selection & Password Entry
   ============================================================ */

import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wifi, Eye, EyeOff, Shield, User, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';

interface UserProfile {
  id: number;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      const res = await api.get('/api/auth/profiles');
      // Show only active users
      setProfiles(res.data.filter((p: UserProfile) => p.is_active));
    } catch (err) {
      console.error('Error fetching profiles', err);
    } finally {
      setLoadingProfiles(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProfile) return;
    setError('');
    try {
      await login(selectedProfile.username, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Mot de passe incorrect');
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  const getAvatarGradient = (role: string, id: number) => {
    if (role === 'admin') {
      return 'linear-gradient(135deg, #1e3a8a, #3b82f6)';
    }
    const gradients = [
      'linear-gradient(135deg, #059669, #10b981)',
      'linear-gradient(135deg, #7c3aed, #8b5cf6)',
      'linear-gradient(135deg, #db2777, #ec4899)',
      'linear-gradient(135deg, #d97706, #f59e0b)',
    ];
    return gradients[id % gradients.length];
  };

  return (
    <div className="login-page">
      <div className="login-card slide-up" style={{ maxWidth: selectedProfile ? '400px' : '550px', width: '100%' }}>
        <div className="login-logo">
          <div className="logo-circle">
            <Wifi size={32} />
          </div>
          <h2>Adven's Manager</h2>
          <p>Gestion des tickets Wi-Fi</p>
        </div>

        {error && <div className="login-error" style={{ marginBottom: '16px' }}>{error}</div>}

        {/* Profile Selection View */}
        {!selectedProfile ? (
          <div>
            <h4 style={{ textAlign: 'center', marginBottom: '20px', fontWeight: 600 }}>
              Sélectionnez votre profil
            </h4>
            {loadingProfiles ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                Chargement des profils...
              </div>
            ) : profiles.length > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: '16px',
                maxHeight: '320px',
                overflowY: 'auto',
                padding: '6px'
              }}>
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedProfile(p);
                      setError('');
                      setPassword('');
                    }}
                    className="profile-select-card"
                  >
                    <div style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      background: getAvatarGradient(p.role, p.id),
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1.2rem',
                      marginBottom: '12px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      position: 'relative'
                    }}>
                      {getInitials(p.full_name)}
                      {p.role === 'admin' && (
                        <div style={{
                          position: 'absolute',
                          bottom: '-2px',
                          right: '-2px',
                          background: 'var(--primary)',
                          borderRadius: '50%',
                          padding: '4px',
                          color: '#fff',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}>
                          <Shield size={10} />
                        </div>
                      )}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', textAlign: 'center', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.full_name.split(' ')[0]}
                    </span>
                    <span className="text-muted" style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                      {p.role === 'admin' ? 'Administrateur' : 'Vendeur'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                Aucun profil actif trouvé.
              </div>
            )}
          </div>
        ) : (
          /* Password Form View */
          <form onSubmit={handleSubmit}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px',
              background: 'var(--bg-input)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              marginBottom: '20px'
            }}>
              <div style={{
                width: '45px',
                height: '45px',
                borderRadius: '50%',
                background: getAvatarGradient(selectedProfile.role, selectedProfile.id),
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '1rem',
              }}>
                {getInitials(selectedProfile.full_name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ fontWeight: 700, fontSize: '0.95rem', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedProfile.full_name}
                </h4>
                <p className="text-muted" style={{ fontSize: '0.75rem', margin: 0 }}>
                  {selectedProfile.role === 'admin' ? 'Administrateur' : selectedProfile.role === 'technician' ? 'Technicien' : 'Vendeur'}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSelectedProfile(null)}
                style={{ padding: '6px' }}
                title="Changer de compte"
              >
                <ArrowLeft size={16} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Saisir le mot de passe</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Entrez votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  style={{ paddingRight: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                >
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={isLoading}
              style={{ marginTop: '8px', padding: '12px' }}
            >
              {isLoading ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
