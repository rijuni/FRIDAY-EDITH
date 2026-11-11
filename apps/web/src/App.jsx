import React, { useState } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { FridayBoot } from './components/boot/FridayBoot';
import { EdithBoot } from './components/boot/EdithBoot';
import { FridayDashboard } from './features/friday/pages/FridayDashboard';
import { EdithPlaceholder } from './features/edith/pages/EdithPlaceholder';
import { Login } from './features/auth/pages/Login';
import { useAuthStore } from './stores/authStore';

function ProtectedRoute({ children, isEdith = false, bootCompleted, setBootCompleted }) {
  const { isAuthenticated } = useAuthStore();
  const [searchParams] = useSearchParams();
  const skipBootParam = searchParams.get('noboot') === 'true';

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
            <EdithPlaceholder />
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
