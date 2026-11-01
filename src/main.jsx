import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@fontsource/cairo/400.css'
import '@fontsource/cairo/600.css'
import '@fontsource/cairo/700.css'
import '@fontsource/cairo/800.css'
import '@fontsource/cairo/900.css'
import '@fontsource/tajawal/400.css'
import '@fontsource/tajawal/500.css'
import '@fontsource/tajawal/700.css'
import '@fontsource/tajawal/800.css'
import '@fontsource/tajawal/900.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import api from './services/api.js'

// Global safety filter: Never allow technical IndexedDB/objectStore internal errors to popup to user
if (typeof window !== 'undefined') {
  window.api = api;
  const _origAlert = window.alert;
  window.alert = function (message) {
    const str = String(message || '');
    if (
      str.includes('objectStore') ||
      str.includes('IDBTransaction') ||
      str.includes('NotFoundError') ||
      str.includes('The specified object store was not found')
    ) {
      console.warn('Suppressed internal IDB alert popup:', str);
      return;
    }
    return _origAlert.apply(this, arguments);
  };

  // Safe global unhandled rejection & error listeners to prevent Electron UI freezes
  window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault();
    console.warn('Safely intercepted unhandled promise rejection in renderer:', event.reason);
  });

  window.addEventListener('error', (event) => {
    console.warn('Safely intercepted global window error in renderer:', event.error || event.message);
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
