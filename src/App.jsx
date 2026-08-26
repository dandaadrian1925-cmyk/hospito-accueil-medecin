import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import AdminLayout from './components/layout/AdminLayout';
import Loader from './components/common/Loader';
import { HOSPITAL_MODULES } from './lib/hospitalModules';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ModulePrevu = lazy(() => import('./pages/ModulePrevu'));
const AdmissionsPage = lazy(() => import('./pages/admissions/AdmissionsPage'));
const RendezVousPage = lazy(() => import('./pages/rendez-vous/RendezVousPage'));
const LitsPage = lazy(() => import('./pages/lits/LitsPage'));
const AuditLogPage = lazy(() => import('./pages/audit/AuditLogPage'));
const MessagesPage = lazy(() => import('./pages/messages/MessagesPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ProfilPage = lazy(() => import('./pages/profil/ProfilPage'));

function ProtectedRoute({ children }) {
  const { user, isStaff, loading } = useAuth();
  if (loading) return <Loader label="Vérification de l'accès…" />;
  if (!user || !isStaff) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#17181A', color: '#fff',
              borderRadius: '999px',
              fontFamily: 'Inter, sans-serif',
              fontSize: '14px', fontWeight: '600',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            },
            success: { style: { background: '#2F7D5C' } },
            error: { style: { background: '#C2402F' } },
          }}
        />
        <Suspense fallback={<Loader label="Chargement…" />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/mot-de-passe-oublie" element={<ForgotPasswordPage />} />

            <Route path="/" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
              <Route index element={<DashboardPage />} />

              <Route path="admissions" element={<AdmissionsPage />} />
              <Route path="rendez-vous" element={<RendezVousPage />} />
              <Route path="lits" element={<LitsPage />} />
              {HOSPITAL_MODULES.filter((m) => !['admissions', 'rendez-vous', 'lits'].includes(m.path)).map((m) => (
                <Route key={m.path} path={m.path} element={<ModulePrevu titre={m.label} phase={m.phase} />} />
              ))}

              <Route path="messages" element={<MessagesPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="audit" element={<AuditLogPage />} />
              <Route path="profil" element={<ProfilPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
