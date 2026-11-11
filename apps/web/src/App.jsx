import React, { useState } from 'react';
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { FridayBoot } from './components/boot/FridayBoot';
import { FridayDashboard } from './features/friday/pages/FridayDashboard';
import { EdithPlaceholder } from './features/edith/pages/EdithPlaceholder';
import { Login } from './features/auth/pages/Login';

function MainApp() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isLoginPage = location.pathname === '/login';
  const skipBootParam = searchParams.get('noboot') === 'true' || isLoginPage;
  const [bootCompleted, setBootCompleted] = useState(skipBootParam);

  const shouldShowBoot = !bootCompleted && !isLoginPage;

  return (
    <>
      {shouldShowBoot && (
        <FridayBoot onComplete={() => setBootCompleted(true)} />
      )}
      <div className={`transition-opacity duration-700 ${bootCompleted || isLoginPage ? 'opacity-100' : 'opacity-0'}`}>
        <Routes>
          <Route path="/" element={<Navigate to="/friday" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/friday" element={<FridayDashboard />} />
          <Route path="/edith" element={<EdithPlaceholder />} />
          <Route path="*" element={<Navigate to="/friday" replace />} />
        </Routes>
      </div>
    </>
  );
}

export default function App() {
  return <MainApp />;
}
