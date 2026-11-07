import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Ticket,
  Users,
  Contact,
  Receipt,
  Shield,
  ShoppingCart,
  Banknote,
  PackagePlus,
  FileBarChart,
  Settings,
  Bell,
  LogOut,
  Wifi,
  MoreHorizontal,
  X as CloseIcon,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';

export default function AppLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role === 'admin' || user?.role === 'technician';

  // Apply the dark emerald body background class on mount
  useEffect(() => {
    document.body.classList.add('theme-emerald-phantom');
    return () => {
      document.body.classList.remove('theme-emerald-phantom');
    };
  }, []);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const timer = setInterval(fetchNotifications, 20000);
      return () => clearInterval(timer);
    }
  }, [user]);

  /* Click-outside to close notification dropdown */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifDropdown(false);
      }
    };
    if (showNotifDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNotifDropdown]);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/api/notifications/');
      setNotifications(res.data);
    } catch (err) {
      console.error('Error fetching notifications', err);
    }
  };

  const markAsRead = async (id: number) => {
    try {
      await api.post(`/api/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/api/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
    { to: '/tickets', icon: Ticket, label: 'Tickets', admin: false },
    ...(isAdmin ? [
      { to: '/vendors', icon: Users, label: 'Vendeurs', admin: true },
      { to: '/clients', icon: Contact, label: 'Clients', admin: true },
      { to: '/expenses', icon: Receipt, label: 'Dépenses', admin: true },
      { to: '/audit-logs', icon: Shield, label: 'Audit Logs', admin: true }
    ] : []),
    { to: '/sales', icon: ShoppingCart, label: 'Ventes', admin: false },
    { to: '/closures', icon: Banknote, label: 'Clôtures de caisse', admin: false },
    { to: '/resupply', icon: PackagePlus, label: 'Réappro.', admin: false },
    { to: '/reports', icon: FileBarChart, label: 'Rapports', admin: false },
    { to: '/settings', icon: Settings, label: 'Paramètres', admin: false },
  ];

  return (
    <div className="app-layout-container">
      {/* Sidebar for Desktop */}
      <aside className="app-sidebar">
        <div className="sidebar-logo-section">
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(16, 185, 129, 0.3)'
          }}>
            <Wifi size={16} color="#10b981" />
          </div>
          <div>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', display: 'block' }}>Adven's Manager</span>
            <span style={{ fontSize: '0.65rem', color: '#92b5a5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Gestion Wi-Fi</span>
          </div>
        </div>

        <div className="sidebar-links-section">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className="sidebar-link"
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="sidebar-profile-section">
          <div className="sidebar-profile-info">
            <div className="sidebar-avatar">
              {user?.full_name?.charAt(0) || 'A'}
            </div>
            <span className="sidebar-username" title={user?.full_name}>
              {user?.full_name}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="sidebar-logout-btn"
            title="Déconnexion"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Floating Top Header Pill */}
      <header className="app-header">
        {/* Left Branding (Mobile) or Welcome (Desktop) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="hide-on-desktop" style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(16, 185, 129, 0.3)'
          }}>
            <Wifi size={16} color="#10b981" />
          </div>
          <div className="hide-on-desktop">
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', display: 'block' }}>Adven's Manager</span>
          </div>
          {/* Welcome Message on Desktop */}
          <span className="hide-on-mobile" style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>
            Ravi de vous revoir, {user?.full_name} 👋
          </span>
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Unread Notifications Bell */}
          <div ref={notifRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowNotifDropdown(!showNotifDropdown)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '50%',
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)')}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 8px #10b981'
                }} />
              )}
            </button>

            {showNotifDropdown && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: '44px',
                width: '320px',
                borderRadius: '16px',
                background: 'rgba(11, 22, 17, 0.95)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
                backdropFilter: 'blur(20px)',
                zIndex: 110,
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff' }}>Notifications {unreadCount > 0 && `(${unreadCount})`}</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      style={{ background: 'none', border: 'none', color: '#10b981', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Tout marquer lu
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                  {notifications.length > 0 ? (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => !n.is_read && markAsRead(n.id)}
                        style={{
                          padding: '12px 16px',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                          background: !n.is_read ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                          cursor: !n.is_read ? 'pointer' : 'default',
                          transition: 'background 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ffffff' }}>{n.title}</span>
                          {!n.is_read && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />}
                        </div>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#92b5a5', lineHeight: 1.4 }}>{n.message}</p>
                        <span style={{ fontSize: '0.65rem', color: '#527464', display: 'block', marginTop: '6px' }}>
                          {new Date(n.created_at).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '24px', textAlign: 'center', fontSize: '0.8rem', color: '#527464' }}>
                      Aucune notification
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User profile & logout (Mobile Only) */}
          <div className="header-profile-pill hide-on-desktop">
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981, #047857)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.75rem',
              color: '#ffffff'
            }}>
              {user?.full_name?.charAt(0) || 'A'}
            </div>
            <span className="hide-on-mobile" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#ffffff' }}>{user?.full_name}</span>
            <button
              onClick={handleLogout}
              style={{
                background: 'none',
                border: 'none',
                color: '#527464',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
                marginLeft: '4px',
                transition: 'color 0.2s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#527464')}
              title="Déconnexion"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ position: 'relative', zIndex: 1 }}>
        <Outlet />
      </main>

      {/* Floating Bottom Dock Menu */}
      <nav className="dock-nav">
        {navItems.map((item) => {
          const isPrimary = ['Tableau de bord', 'Tickets', 'Ventes'].includes(item.label);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `dock-item ${isPrimary ? '' : 'dock-item-secondary'} ${isActive ? 'active' : ''}`}
              title={item.label}
            >
              <item.icon size={20} />
            </NavLink>
          );
        })}
        <button
          className="dock-item-more"
          onClick={() => setShowMoreMenu(true)}
          title="Plus d'options"
        >
          <MoreHorizontal size={20} />
        </button>
      </nav>

      {/* Bottom Sheet Menu Drawer */}
      <div
        className={`bottom-sheet-overlay ${showMoreMenu ? 'open' : ''}`}
        onClick={() => setShowMoreMenu(false)}
      >
        <div
          className="bottom-sheet"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bottom-sheet-header">
            <span className="bottom-sheet-title">Plus d'options</span>
            <button className="bottom-sheet-close" onClick={() => setShowMoreMenu(false)}>
              <CloseIcon size={16} />
            </button>
          </div>

          <div className="bottom-sheet-grid">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className="bottom-sheet-item"
                onClick={() => setShowMoreMenu(false)}
                style={({ isActive }) => ({
                  background: isActive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                  borderColor: isActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.05)'
                })}
              >
                <div className="bottom-sheet-item-icon">
                  <item.icon size={22} />
                </div>
                <span className="bottom-sheet-item-label">{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
