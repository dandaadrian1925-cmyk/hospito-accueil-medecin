import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import AdminLayout from './components/layout/AdminLayout';
import Loader from './components/common/Loader';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CommandeDetailPage = lazy(() => import('./pages/commandes/CommandeDetailPage'));
const OpportunitesPage = lazy(() => import('./pages/OpportunitesPage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));
const ProfilPage = lazy(() => import('./pages/ProfilPage'));
const GainsPage = lazy(() => import('./pages/GainsPage'));
const TourneePage = lazy(() => import('./pages/TourneePage'));
const RetoursPage = lazy(() => import('./pages/RetoursPage'));
const RetourDetailPage = lazy(() => import('./pages/RetourDetailPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const VerifCNIPage = lazy(() => import('./pages/VerifCNIPage'));
const ContactPage = lazy(() => import('./pages/ContactPage'));

function ProtectedRoute({ children }) {
  const { user, isLivreur, loading } = useAuth();
  if (loading) return <Loader label="Vérification de l'accès…" />;
  if (!user || !isLivreur) return <Navigate to="/login" replace />;
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
              <Route path="commandes/:id" element={<CommandeDetailPage />} />
              <Route path="opportunites" element={<OpportunitesPage />} />
              <Route path="wallet" element={<WalletPage />} />
              <Route path="gains" element={<GainsPage />} />
              <Route path="tournee" element={<TourneePage />} />
              <Route path="retours" element={<RetoursPage />} />
              <Route path="retours/:id" element={<RetourDetailPage />} />
              <Route path="profil" element={<ProfilPage />} />
              <Route path="verification-cni" element={<VerifCNIPage />} />
              <Route path="aide" element={<ContactPage />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="chat/:convId" element={<ChatPage />} />
              <Route path="notifications" element={<NotificationsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
