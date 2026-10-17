import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LandingPage from './landing/LandingPage.jsx';
import DashboardApp from './DashboardApp.jsx';

function getRoute() {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  if (path.startsWith('/dashboard') || hash.startsWith('#dashboard')) {
    return 'dashboard';
  }
  return 'landing';
}

function Root() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onLocationChange = () => {
      setRoute(getRoute());
    };
    window.addEventListener('popstate', onLocationChange);
    window.addEventListener('hashchange', onLocationChange);
    return () => {
      window.removeEventListener('popstate', onLocationChange);
      window.removeEventListener('hashchange', onLocationChange);
    };
  }, []);

  const navigateTo = (target) => {
    if (target === 'dashboard') {
      window.history.pushState({}, '', '/dashboard');
      setRoute('dashboard');
      window.scrollTo({ top: 0, behavior: 'instant' });
    } else {
      window.history.pushState({}, '', '/');
      setRoute('landing');
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  if (route === 'dashboard') {
    return <DashboardApp onNavigateHome={() => navigateTo('landing')} />;
  }

  return <LandingPage onNavigateDashboard={() => navigateTo('dashboard')} />;
}

createRoot(document.getElementById('root')).render(<Root />);
