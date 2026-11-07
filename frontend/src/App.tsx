/* ============================================================
   App — Main application with routing and toast notifications
   ============================================================ */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

import LoginPage from './pages/LoginPage';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/DashboardPage';
import TicketsPage from './pages/TicketsPage';
import VendorsPage from './pages/VendorsPage';
import ClientsPage from './pages/ClientsPage';
import SalesPage from './pages/SalesPage';
import ResupplyPage from './pages/ResupplyPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import AuditLogsPage from './pages/AuditLogsPage';
import ExpensesPage from './pages/ExpensesPage';
import ClosuresPage from './pages/ClosuresPage';

import './index.css';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ToastContainer() {
  const { toasts, removeToast } = useAuthStore();
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          onClick={() => removeToast(t.id)}
          style={{ cursor: 'pointer' }}
        >
          <span>
            {t.type === 'success' && '✅ '}
            {t.type === 'error' && '❌ '}
            {t.type === 'info' && 'ℹ️ '}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const { loadFromStorage, isAuthenticated } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="tickets" element={<TicketsPage />} />
          <Route
            path="vendors"
            element={
              <AdminRoute>
                <VendorsPage />
              </AdminRoute>
            }
          />
          <Route
            path="clients"
            element={
              <AdminRoute>
                <ClientsPage />
              </AdminRoute>
            }
          />
          <Route path="sales" element={<SalesPage />} />
          <Route path="closures" element={<ClosuresPage />} />
          <Route path="resupply" element={<ResupplyPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="audit-logs"
            element={
              <AdminRoute>
                <AuditLogsPage />
              </AdminRoute>
            }
          />
          <Route
            path="expenses"
            element={
              <AdminRoute>
                <ExpensesPage />
              </AdminRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
