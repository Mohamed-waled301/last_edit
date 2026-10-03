import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Global safety filter: Never allow technical IndexedDB/objectStore internal errors to popup to user
if (typeof window !== 'undefined') {
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

  window.addEventListener('unhandledrejection', (event) => {
    const reasonStr = String(event.reason || '');
    if (
      reasonStr.includes('objectStore') ||
      reasonStr.includes('IDBTransaction') ||
      reasonStr.includes('NotFoundError')
    ) {
      event.preventDefault();
      console.warn('Silently handled unhandled IDB error:', event.reason);
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
