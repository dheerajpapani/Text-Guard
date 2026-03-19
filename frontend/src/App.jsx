import React, { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header.jsx';
import Home from './views/Home.jsx';
import SimulationLab from './views/SimulationLab.jsx';
import Review from './views/Review.jsx';
import Toast from './components/Toast.jsx';

export default function App() {
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  return (
    <div className="flex min-h-screen flex-col bg-transparent text-slate-100">
      <Header />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<SimulationLab showToast={showToast} />} />
          <Route path="/overview" element={<Home showToast={showToast} />} />
          <Route path="/simulate" element={<SimulationLab showToast={showToast} />} />
          <Route path="/review" element={<Review showToast={showToast} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {toast ? <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} /> : null}
    </div>
  );
}
