import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SidebarProvider, useSidebar } from './context/SidebarContext';
import { ServerModeProvider, useServerMode } from './context/ServerModeContext';
import AboutPage from './pages/AboutPage';
import AdminPage from './pages/AdminPage';
import CollectionPage from './pages/CollectionPage';
import MoviesPage from './pages/MoviesPage';
import PhysicalLibraryPage from './pages/PhysicalLibraryPage';
import Navigation from './components/Navigation';
import DynamicFavicon from './components/DynamicFavicon';

const AppContent: React.FC = () => {
  const { isCollapsed } = useSidebar();
  const { isReadOnly, isLoading: isModeLoading } = useServerMode();

  // Show loading while checking server mode
  if (isModeLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading Cinefile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800">
      <Navigation />
      {/* Main content area with proper spacing for sidebar and header */}
      <div className={`pt-16 lg:pt-16 transition-all duration-300 ease-in-out ${
        isCollapsed ? 'lg:pl-16' : 'lg:pl-64'
      }`}>
        <Routes>
          <Route path="/" element={<CollectionPage />} />
          <Route path="/library" element={<PhysicalLibraryPage />} />
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
      </div>
    </div>
  );
};

function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if the backend is available
    fetch('/api/health')
      .then(() => {
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Backend connection failed:', err);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Cinefile...</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <ServerModeProvider>
        <AuthProvider>
          <SidebarProvider>
            <DynamicFavicon />
            <Router>
              <AppContent />
            </Router>
          </SidebarProvider>
        </AuthProvider>
      </ServerModeProvider>
    </ThemeProvider>
  );
}

export default App;