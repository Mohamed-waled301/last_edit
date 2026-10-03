import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import HomeScreen from './components/HomeScreen';
import Toast from './components/Toast';
import SetupScreen from './components/SetupScreen';
import LoginScreen from './components/LoginScreen';
import BackupReminderBanner from './components/BackupReminderBanner';
import SuppliersModule from './modules/SuppliersModule';
import InventoryModule from './modules/InventoryModule';
import ProductsModule from './modules/ProductsModule';
import ManufacturingModule from './modules/ManufacturingModule';
import FinishingModule from './modules/FinishingModule';
import SalesModule from './modules/SalesModule';
import CashModule from './modules/CashModule';
import ReportsModule from './modules/ReportsModule';
import SettingsModule from './modules/SettingsModule';
import BackupModule from './modules/BackupModule';
import { getActiveUser, setActiveUser } from './services/api';
import { usersRepo, backupRepo } from './data';

export default function App() {
  const [hasOwnerUser, setHasOwnerUser] = useState(null); // null = checking, true/false
  const [isLocked, setIsLocked] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('home');
  const [activeUserRole, setActiveUserRole] = useState(getActiveUser().role);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  // Initialize and check setup state
  useEffect(() => {
    async function checkSystemState() {
      try {
        const ownerExists = await usersRepo.hasOwner();
        if (!ownerExists) {
          // Check if there are any users at all
          const users = await usersRepo.getAll();
          if (users.length === 0) {
            setHasOwnerUser(false);
            return;
          }
        }
        setHasOwnerUser(true);

        // Check if there is an active session
        const session = getActiveUser();
        if (!session.id) {
          setIsLocked(true);
        } else {
          setActiveUserRole(session.role);
        }
      } catch (e) {
        console.warn('System state check error:', e);
        setHasOwnerUser(true);
      }
    }
    checkSystemState();

    // Hash navigation sync (SPA safe routing)
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '');
      if (hash && [
        'home', 'suppliers', 'inventory', 'products', 'manufacturing', 
        'finishing', 'sales', 'cash', 'reports', 'settings', 'backup'
      ].includes(hash)) {
        setCurrentScreen(hash);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTo = (screen) => {
    setCurrentScreen(screen);
    window.location.hash = `#${screen}`;
  };

  const showNotification = (message, type = 'success') => {
    setToast({ message, type });
  };

  const handleRoleChanged = (message) => {
    const user = getActiveUser();
    setActiveUserRole(user.role);
    showNotification(message, 'success');
  };

  const handleLockSession = () => {
    setIsLocked(true);
  };

  const handleLoginSuccess = (user) => {
    setActiveUserRole(user.role);
    setIsLocked(false);
    showNotification(`أهلاً بك يا ${user.full_name}`, 'success');
  };

  // If system owner check is still in progress
  if (hasOwnerUser === null) {
    return (
      <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center p-4" dir="rtl">
        <div className="text-center font-bold text-gray-600 text-lg">
          جاري تحميل نظام ورشة الأصيل...
        </div>
      </div>
    );
  }

  // 1. First Launch Setup Screen (Prompt Requirement 3)
  if (!hasOwnerUser) {
    return (
      <SetupScreen
        onComplete={() => {
          setHasOwnerUser(true);
          setIsLocked(false);
          const user = getActiveUser();
          setActiveUserRole(user.role);
          showNotification('تم إعداد النظام وتشغيله بنجاح!', 'success');
        }}
      />
    );
  }

  // 2. PIN Login / Lock Screen (Prompt Requirement 3)
  if (isLocked) {
    return (
      <LoginScreen
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-[#1F2937] font-sans antialiased flex flex-row">
      {/* Fixed Right-Side Sidebar (RTL) */}
      <Sidebar
        currentScreen={currentScreen}
        onNavigate={navigateTo}
        userRole={activeUserRole}
      />

      {/* Main Content Area (Offset by mr-64 for right sidebar in RTL) */}
      <div className="flex-1 flex flex-col min-h-screen mr-64 transition-all duration-150">
        {/* Top Header Bar */}
        <Header
          currentScreen={currentScreen}
          onNavigate={navigateTo}
          onNotify={handleRoleChanged}
          onLockSession={handleLockSession}
        />

        {/* Dynamic Screen View */}
        <main className="flex-1 p-6 w-full max-w-[1700px] mx-auto overflow-y-auto">
          {/* Backup Reminder Banner (Prompt Requirement 4) */}
          <BackupReminderBanner onOpenBackup={() => navigateTo('backup')} />

          {currentScreen === 'home' && (
            <HomeScreen
              onNavigate={navigateTo}
              userRole={activeUserRole}
            />
          )}

          {currentScreen === 'suppliers' && (
            <SuppliersModule
              onBack={() => navigateTo('home')}
              onNotify={showNotification}
            />
          )}

          {currentScreen === 'inventory' && (
            <InventoryModule
              onBack={() => navigateTo('home')}
              onNotify={showNotification}
            />
          )}

          {currentScreen === 'products' && (
            <ProductsModule
              onBack={() => navigateTo('home')}
              onNotify={showNotification}
            />
          )}

          {currentScreen === 'manufacturing' && (
            <ManufacturingModule
              onBack={() => navigateTo('home')}
              onNotify={showNotification}
            />
          )}

          {currentScreen === 'finishing' && (
            <FinishingModule
              onBack={() => navigateTo('home')}
              onNotify={showNotification}
            />
          )}

          {currentScreen === 'sales' && (
            <SalesModule
              onBack={() => navigateTo('home')}
              onNotify={showNotification}
            />
          )}

          {currentScreen === 'cash' && (
            <CashModule
              onBack={() => navigateTo('home')}
              onNotify={showNotification}
            />
          )}

          {currentScreen === 'reports' && (
            <ReportsModule
              onBack={() => navigateTo('home')}
              userRole={activeUserRole}
              onNotify={showNotification}
            />
          )}

          {currentScreen === 'settings' && (
            <SettingsModule
              onBack={() => navigateTo('home')}
              onNavigate={navigateTo}
              onNotify={showNotification}
            />
          )}

          {currentScreen === 'backup' && (
            <BackupModule
              onBack={() => navigateTo('home')}
              onNotify={showNotification}
            />
          )}
        </main>
      </div>

      {/* Save Confirmation & Warning Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />
    </div>
  );
}
