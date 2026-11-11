import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { FridayBoot } from './components/boot/FridayBoot';
import { FridayDashboard } from './features/friday/pages/FridayDashboard';
import { EdithPlaceholder } from './features/edith/pages/EdithPlaceholder';
import { Login } from './features/auth/pages/Login';
import { useAuthStore } from './stores/authStore';

function ProtectedRoute({ children, bootCompleted, setBootCompleted }) {
  const { isAuthenticated } = useAuthStore();
  const [searchParams] = useSearchParams();
  const skipBootParam = searchParams.get('noboot') === 'true';

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const shouldShowBoot = !bootCompleted && !skipBootParam;

  if (shouldShowBoot) {
    return <FridayBoot onComplete={() => setBootCompleted(true)} />;
  }

  return children;
}

export default function App() {
  const [bootCompleted, setBootCompleted] = useState(false);
  const { isAuthenticated } = useAuthStore();

  return (
    <Routes>
      {/* Root always redirects to /login first */}
      <Route
        path="/"
        element={<Navigate to={isAuthenticated ? "/friday" : "/login"} replace />}
      />

      {/* Login Screen */}
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/friday" replace />
          ) : (
            <Login onLoginSuccess={() => setBootCompleted(false)} />
          )
        }
      />

      {/* F.R.I.D.A.Y. Dashboard: Protected by Auth & Shows Boot Animation first */}
      <Route
        path="/friday"
        element={
          <ProtectedRoute
            bootCompleted={bootCompleted}
            setBootCompleted={setBootCompleted}
          >
            <FridayDashboard />
          </ProtectedRoute>
        }
      />

      {/* E.D.I.T.H. Developer IDE Workspace */}
      <Route
        path="/edith"
        element={
          <ProtectedRoute
            bootCompleted={bootCompleted}
            setBootCompleted={setBootCompleted}
          >
            <EdithPlaceholder />
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
