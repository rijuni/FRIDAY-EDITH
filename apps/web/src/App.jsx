import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { FridayBoot } from './components/boot/FridayBoot';
import { FridayDashboard } from './features/friday/pages/FridayDashboard';
import { EdithPlaceholder } from './features/edith/pages/EdithPlaceholder';

export default function App() {
  const [bootCompleted, setBootCompleted] = useState(false);

  return (
    <>
      {!bootCompleted && (
        <FridayBoot onComplete={() => setBootCompleted(true)} />
      )}
      <div className={`transition-opacity duration-700 ${bootCompleted ? 'opacity-100' : 'opacity-0'}`}>
        <Routes>
          <Route path="/" element={<Navigate to="/friday" replace />} />
          <Route path="/friday" element={<FridayDashboard />} />
          <Route path="/edith" element={<EdithPlaceholder />} />
          <Route path="*" element={<Navigate to="/friday" replace />} />
        </Routes>
      </div>
    </>
  );
}

