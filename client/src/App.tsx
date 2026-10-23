import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { DisplayPreferencesProvider } from './context/DisplayPreferencesContext';
import { SidebarProvider, useSidebar } from './context/SidebarContext';
import { ServerModeProvider, useServerMode } from './context/ServerModeContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { ToastProvider } from './context/ToastContext';
import AboutPage from './pages/AboutPage';
import AdminPage from './pages/AdminPage';
import CollectionPage from './pages/CollectionPage';
import MoviesPage from './pages/MoviesPage';
import PhysicalLibraryPage from './pages/PhysicalLibraryPage';
import StatisticsPage from './pages/StatisticsPage';
import Navigation from './components/Navigation';
import MobileBottomTabs from './components/MobileBottomTabs';
import DynamicFavicon from './components/DynamicFavicon';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SkipLink } from './components/SkipLink';
import { EmptyState } from './components/ui/EmptyState';
import { Button } from './components/ui/Button';
import { Spinner } from './components/ui/Spinner';
import Logo from './components/Logo';

const AppContent: React.FC = () => {
  const { isCollapsed } = useSidebar();
  const { isReadOnly, isLoading: isModeLoading } = useServerMode();

  // Show loading while checking server mode
  if (isModeLoading) {
    return (
      <div className="min-h-screen bg-surface p-4 md:p-6 flex items-center justify-center">
        <div className="text-center">
          <Spinner size="lg" className="mx-auto mb-4" />
          <p className="text-content-muted">Loading Cinefile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <SkipLink />
      <Navigation />
      {/* Main content area with spacing for top header, sidebar on desktop, and bottom tabs on mobile */}
      <main
        id="main"
        tabIndex={-1}
        className={`pt-16 lg:pt-16 transition-all duration-300 ease-in-out pb-[calc(var(--tabbar-h)+var(--safe-b))] lg:pb-0 ${
          isCollapsed ? 'lg:pl-16' : 'lg:pl-64'
        }`}
      >
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<CollectionPage />} />
            <Route path="/library" element={<PhysicalLibraryPage />} />
            <Route path="/statistics" element={<StatisticsPage />} />
            <Route path="/about" element={<AboutPage />} />
            {isReadOnly ? (
              // In read-only mode, redirect admin routes to home
              <>
                <Route path="/admin" element={<Navigate to="/" replace />} />
                <Route path="/media" element={<Navigate to="/" replace />} />
                <Route path="/movies" element={<Navigate to="/media" replace />} />
              </>
            ) : (
              // In full mode, show all admin routes
              <>
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/media" element={<MoviesPage />} />
                <Route path="/movies" element={<Navigate to="/media" replace />} />
              </>
            )}
          </Routes>
        </ErrorBoundary>
      </main>
      <MobileBottomTabs />
    </div>
  );
};

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    // Check if the backend is available
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Health check failed with status ${res.status}`);
        }
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('Backend connection failed:', err);
        setHealthError('Could not reach the Cinefile server. Please check that the server is running.');
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4 p-4">
        <Logo size="xl" />
        <div className="flex items-center gap-2 text-content-muted">
          <Spinner size="sm" />
          <span>Starting Cinefile…</span>
        </div>
      </div>
    );
  }

  if (healthError) {
    return (
      <div className="min-h-screen bg-surface p-4 md:p-6 flex items-center justify-center" role="alert">
        <div className="w-full max-w-md">
          <EmptyState
            icon={<Logo size="lg" />}
            title="Server unreachable"
            description={healthError}
            action={
              <Button onClick={() => window.location.reload()}>
                Retry
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <DisplayPreferencesProvider>
        <ServerModeProvider>
          <ToastProvider>
            <ConfirmProvider>
              <AuthProvider>
                <SidebarProvider>
                  <DynamicFavicon />
                  <Router>
                    <AppContent />
                  </Router>
                </SidebarProvider>
              </AuthProvider>
            </ConfirmProvider>
          </ToastProvider>
        </ServerModeProvider>
      </DisplayPreferencesProvider>
    </ThemeProvider>
  );
}

export default App;
