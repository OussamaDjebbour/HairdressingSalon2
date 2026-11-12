import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { DirectionProvider } from '@radix-ui/react-direction';
import { queryClient } from './lib/queryClient';
import { LanguageProvider, useLang } from './context/LanguageContext';
import { HomePage } from './pages/HomePage';

// The admin and settings screens load on demand, so the public site's first download stays small.
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SettingsSectionPage = lazy(() =>
  import('./pages/SettingsSectionPage').then((m) => ({ default: m.SettingsSectionPage })),
);

function RouteFallback() {
  return (
    <div role="status" aria-busy="true" className="flex justify-center py-20">
      <div className="w-8 h-8 rounded-full border-2 border-rose-300 border-t-rose-700 animate-spin" />
    </div>
  );
}

function AppRoutes() {
  const { dir } = useLang();
  return (
    <DirectionProvider dir={dir}>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
            <Route path="/admin/settings/:section" element={<SettingsSectionPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </DirectionProvider>
  );
}

function App() {
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <AppRoutes />
      </QueryClientProvider>
    </LanguageProvider>
  );
}

export default App;
