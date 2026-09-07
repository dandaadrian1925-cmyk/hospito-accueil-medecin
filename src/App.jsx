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
const BilletsSessionPage = lazy(() => import('./pages/billets/BilletsSessionPage'));
const AdmissionsPage = lazy(() => import('./pages/admissions/AdmissionsPage'));
const RendezVousPage = lazy(() => import('./pages/rendez-vous/RendezVousPage'));
const PaiementGuichetPage = lazy(() => import('./pages/paiement/PaiementGuichetPage'));
const VisitesPage = lazy(() => import('./pages/visites/VisitesPage'));
const TransparenceAttentePage = lazy(() => import('./pages/transparence/TransparenceAttentePage'));
const PlanningPage = lazy(() => import('./pages/planning/PlanningPage'));
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

              <Route path="billets" element={<BilletsSessionPage />} />
              <Route path="admissions" element={<AdmissionsPage />} />
              <Route path="rendez-vous" element={<RendezVousPage />} />
              <Route path="paiement" element={<PaiementGuichetPage />} />
              <Route path="visites" element={<VisitesPage />} />
              <Route path="transparence" element={<TransparenceAttentePage />} />
              <Route path="planning" element={<PlanningPage />} />
              {HOSPITAL_MODULES.filter((m) => !['billets', 'admissions', 'rendez-vous', 'paiement', 'visites', 'transparence', 'planning'].includes(m.path)).map((m) => (
                <Route key={m.path} path={m.path} element={<ModulePrevu titre={m.label} phase={m.phase} />} />
              ))}

              <Route path="messages" element={<MessagesPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="profil" element={<ProfilPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
