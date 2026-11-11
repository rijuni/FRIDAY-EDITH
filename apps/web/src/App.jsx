import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { FridayBoot } from './components/boot/FridayBoot';
import { EdithBoot } from './components/boot/EdithBoot';
import { FridayDashboard } from './features/friday/pages/FridayDashboard';
import { EdithWorkspace } from './features/edith/pages/EdithWorkspace';
import { Login } from './features/auth/pages/Login';
import { useAuthStore } from './stores/authStore';

function SessionBootstrapScreen() {
  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center nebula-canvas starfield text-slate-200 select-none">
      <div className="w-8 h-8 rounded-full border-2 border-purple-400/40 border-t-purple-400 animate-spin mb-3" />
      <p className="text-xs font-mono tracking-widest text-purple-300/80 uppercase">
        Verifying Session...
      </p>
    </div>
  );
}

function ProtectedRoute({ children, isEdith = false, bootCompleted, setBootCompleted }) {
  const { isAuthenticated, isCheckingSession } = useAuthStore();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const skipBootParam = import.meta.env.DEV && searchParams.get('noboot') === 'true';

  if (isCheckingSession) {
    return <SessionBootstrapScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const shouldShowBoot = !bootCompleted && !skipBootParam;

  if (shouldShowBoot) {
    return isEdith ? (
      <EdithBoot onComplete={() => setBootCompleted(true)} />
    ) : (
      <FridayBoot onComplete={() => setBootCompleted(true)} />
    );
  }

  return children;
}

export default function App() {
  const [fridayBootCompleted, setFridayBootCompleted] = useState(false);
  const [edithBootCompleted, setEdithBootCompleted] = useState(false);
  const { isAuthenticated, isCheckingSession, bootstrapSession } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

  if (isCheckingSession) {
    return <SessionBootstrapScreen />;
  }

  const from = location.state?.from;
  const safeDestination =
    from?.pathname && from.pathname !== '/login' && from.pathname !== '/'
      ? `${from.pathname}${from.search || ''}`
      : '/friday';

  return (
    <Routes>
      {/* Root redirects based on verified session state */}
      <Route
        path="/"
        element={<Navigate to={isAuthenticated ? '/friday' : '/login'} replace />}
      />

      {/* Login Screen */}
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to={safeDestination} replace />
          ) : (
            <Login
              onLoginSuccess={() => {
                setFridayBootCompleted(false);
                setEdithBootCompleted(false);
              }}
            />
          )
        }
      />

      {/* F.R.I.D.A.Y. Dashboard: Protected by Auth & Shows Friday 3D Plasma Orb Boot Animation */}
      <Route
        path="/friday"
        element={
          <ProtectedRoute
            isEdith={false}
            bootCompleted={fridayBootCompleted}
            setBootCompleted={setFridayBootCompleted}
          >
            <FridayDashboard />
          </ProtectedRoute>
        }
      />

      {/* E.D.I.T.H. Developer IDE Workspace: Shows Tactical Stark HUD Boot Animation */}
      <Route
        path="/edith"
        element={
          <ProtectedRoute
            isEdith={true}
            bootCompleted={edithBootCompleted}
            setBootCompleted={setEdithBootCompleted}
          >
            <EdithWorkspace />
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
