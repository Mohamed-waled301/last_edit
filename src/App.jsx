import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import HomeScreen from './components/HomeScreen';
import Toast from './components/Toast';
import SetupScreen from './components/SetupScreen';
import LoginScreen from './components/LoginScreen';
import BackupReminderBanner from './components/BackupReminderBanner';
import ErrorBoundary from './components/ErrorBoundary';

// Master Data & Full-Page Modules
import ItemsListPage from './modules/items/ItemsListPage';
import ItemFormPage from './modules/items/ItemFormPage';
import PartiesListPage from './modules/parties/PartiesListPage';
import PartyFormPage from './modules/parties/PartyFormPage';
import PurchasesListPage from './modules/purchases/PurchasesListPage';
import PurchaseOrderFormPage from './modules/purchases/PurchaseOrderFormPage';
import InventoryListPage from './modules/inventory/InventoryListPage';
import StockAdjustmentFormPage from './modules/inventory/StockAdjustmentFormPage';
import StockTransferFormPage from './modules/inventory/StockTransferFormPage';
import StorageLocationsPage from './modules/inventory/StorageLocationsPage';
import ManufacturingListPage from './modules/manufacturing/ManufacturingListPage';
import ProductionOrderFormPage from './modules/manufacturing/ProductionOrderFormPage';
import OutsourcedListPage from './modules/outsourced/OutsourcedListPage';
import OutsourcedOrderFormPage from './modules/outsourced/OutsourcedOrderFormPage';
import SalesInvoicesListPage from './modules/sales/SalesInvoicesListPage';
import SalesInvoiceFormPage from './modules/sales/SalesInvoiceFormPage';
import SalesInvoicePrintPage from './modules/sales/SalesInvoicePrintPage';
import SalesReturnsListPage from './modules/returns/SalesReturnsListPage';
import SalesReturnFormPage from './modules/returns/SalesReturnFormPage';
import TreasuriesListPage from './modules/treasuries/TreasuriesListPage';
import OutletTransferFormPage from './modules/treasuries/OutletTransferFormPage';
import DailyClosingFormPage from './modules/treasuries/DailyClosingFormPage';
import DisbursementsListPage from './modules/disbursements/DisbursementsListPage';
import CashDisbursementFormPage from './modules/disbursements/CashDisbursementFormPage';
import ExpenseCodesPage from './modules/disbursements/ExpenseCodesPage';
import PaymentMethodsPage from './modules/disbursements/PaymentMethodsPage';
import ReportsModule from './modules/ReportsModule';
import SettingsModule from './modules/SettingsModule';
import BackupModule from './modules/BackupModule';

import { getActiveUser, setActiveUser } from './services/api';
import { usersRepo, backupRepo } from './data';
import { ensureDatabaseIntegrity, DB_NAME } from './data/db';
import Dexie from 'dexie';

function parseHash(hash) {
  const clean = (hash || '').replace(/^#\/?/, '').replace(/\/$/, '');
  const parts = clean.split('/').filter(Boolean);
  const root = parts[0] || 'home';
  return {
    raw: clean,
    root,
    parts,
    action: parts[1] || null,
    param: parts[1] || null,
    subAction: parts[2] || null
  };
}

export default function App() {
  const [hasOwnerUser, setHasOwnerUser] = useState(null); // null = checking, true/false
  const [isLocked, setIsLocked] = useState(false);
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeUserRole, setActiveUserRole] = useState(getActiveUser().role);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  // Initialize and check setup state with automatic database integrity validation
  useEffect(() => {
    async function checkSystemState() {
      try {
        await ensureDatabaseIntegrity();

        const ownerExists = await usersRepo.hasOwner();
        if (!ownerExists) {
          const users = await usersRepo.getAll();
          if (users.length === 0) {
            setHasOwnerUser(false);
            return;
          }
        }
        setHasOwnerUser(true);

        const session = getActiveUser();
        if (!session.id) {
          setIsLocked(true);
        } else {
          setActiveUserRole(session.role);
        }
      } catch (e) {
        console.warn('System state check error:', e);
        if (e.name === 'NotFoundError' || String(e).includes('objectStore') || String(e).includes('NotFound')) {
          try {
            await Dexie.delete(DB_NAME);
            await Dexie.delete('WorkshopERP_DB');
            await ensureDatabaseIntegrity();
          } catch (resetErr) {
            console.error('Failed to reset broken DB:', resetErr);
          }
        }
        setHasOwnerUser(false);
      }
    }
    checkSystemState();

    // Full-Page SPA Safe Hash Routing Sync
    const handleHashChange = () => {
      setRoute(parseHash(window.location.hash));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTo = (path) => {
    const formatted = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
    window.location.hash = formatted;
    setSidebarOpen(false);
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

  // Determine active item in Sidebar
  const getSidebarActiveScreen = () => {
    const r = route.root;
    if (['items', 'products'].includes(r)) return 'items';
    if (r === 'suppliers') return 'suppliers';
    if (r === 'customers') return 'customers';
    if (r === 'purchases') return 'purchases';
    if (['inventory', 'stock-adjustments', 'stock-transfers', 'locations'].includes(r)) return 'inventory';
    if (r === 'manufacturing') return 'manufacturing';
    if (['outsourced', 'finishing'].includes(r)) return 'outsourced';
    if (r === 'sales') return 'sales';
    if (r === 'returns') return 'returns';
    if (['treasuries', 'cash'].includes(r)) return 'treasuries';
    if (['disbursements', 'expense-codes', 'payment-methods'].includes(r)) return 'disbursements';
    if (r === 'reports') return 'reports';
    if (r === 'backup') return 'backup';
    if (r === 'settings') return 'settings';
    return 'home';
  };

  const currentSidebarScreen = getSidebarActiveScreen();

  // If system owner check is still in progress
  if (hasOwnerUser === null) {
    return (
      <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center p-4" dir="rtl">
        <div className="text-center font-bold text-gray-600 text-lg">
          جاري تحميل نظام إدارة مصانع الملابس (Apex Apparel ERP)...
        </div>
      </div>
    );
  }

  // 1. First Launch Setup Screen
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

  // 2. PIN Login / Lock Screen
  if (isLocked) {
    return (
      <LoginScreen
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  // Full-Page Route Renderer
  const renderScreen = () => {
    const { root, parts, action, subAction } = route;

    switch (root) {
      // A) Items (Master Data)
      case 'items':
      case 'products':
        if (action === 'new') {
          return <ItemFormPage onBack={() => navigateTo('items')} onNotify={showNotification} />;
        }
        if (subAction === 'edit' && parts[1]) {
          return <ItemFormPage itemId={parts[1]} onBack={() => navigateTo('items')} onNotify={showNotification} />;
        }
        return <ItemsListPage onNavigate={navigateTo} onNotify={showNotification} />;

      // B) Parties (Suppliers & Customers)
      case 'suppliers':
        if (action === 'new') {
          return <PartyFormPage initialType="supplier" onBack={() => navigateTo('suppliers')} onNotify={showNotification} />;
        }
        if (subAction === 'edit' && parts[1]) {
          return <PartyFormPage partyId={parts[1]} initialType="supplier" onBack={() => navigateTo('suppliers')} onNotify={showNotification} />;
        }
        return <PartiesListPage defaultTab="suppliers" onNavigate={navigateTo} onNotify={showNotification} />;

      case 'customers':
        if (action === 'new') {
          return <PartyFormPage initialType="customer" onBack={() => navigateTo('customers')} onNotify={showNotification} />;
        }
        if (subAction === 'edit' && parts[1]) {
          return <PartyFormPage partyId={parts[1]} initialType="customer" onBack={() => navigateTo('customers')} onNotify={showNotification} />;
        }
        return <PartiesListPage defaultTab="customers" onNavigate={navigateTo} onNotify={showNotification} />;

      // C) Purchases
      case 'purchases':
        if (action === 'new') {
          return <PurchaseOrderFormPage onBack={() => navigateTo('purchases')} onNotify={showNotification} />;
        }
        if (subAction === 'edit' && parts[1]) {
          return <PurchaseOrderFormPage orderId={parts[1]} onBack={() => navigateTo('purchases')} onNotify={showNotification} />;
        }
        return <PurchasesListPage onNavigate={navigateTo} onNotify={showNotification} />;

      // D) Inventory
      case 'inventory':
        if (action === 'adjust') {
          return <StockAdjustmentFormPage onBack={() => navigateTo('inventory')} onNotify={showNotification} />;
        }
        if (action === 'transfer') {
          return <StockTransferFormPage onBack={() => navigateTo('inventory')} onNotify={showNotification} />;
        }
        return <InventoryListPage onNavigate={navigateTo} onNotify={showNotification} />;

      case 'stock-adjustments':
        return <StockAdjustmentFormPage onBack={() => navigateTo('inventory')} onNotify={showNotification} />;

      case 'stock-transfers':
        return <StockTransferFormPage onBack={() => navigateTo('inventory')} onNotify={showNotification} />;

      case 'locations':
        return <StorageLocationsPage onBack={() => navigateTo('inventory')} onNotify={showNotification} />;

      // E) Manufacturing
      case 'manufacturing':
        if (action === 'new') {
          return <ProductionOrderFormPage onBack={() => navigateTo('manufacturing')} onNotify={showNotification} />;
        }
        if (subAction === 'edit' && parts[1]) {
          return <ProductionOrderFormPage orderId={parts[1]} onBack={() => navigateTo('manufacturing')} onNotify={showNotification} />;
        }
        return <ManufacturingListPage onNavigate={navigateTo} onNotify={showNotification} />;

      // Outsourced Manufacturing (التصنيع لدى الغير)
      case 'outsourced':
      case 'finishing':
        if (action === 'new') {
          return <OutsourcedOrderFormPage onBack={() => navigateTo('outsourced')} onNotify={showNotification} />;
        }
        if (subAction === 'edit' && parts[1]) {
          return <OutsourcedOrderFormPage orderId={parts[1]} onBack={() => navigateTo('outsourced')} onNotify={showNotification} />;
        }
        return <OutsourcedListPage onNavigate={navigateTo} onNotify={showNotification} />;

      // F) Sales & Invoices
      case 'sales':
        if (action === 'new') {
          return <SalesInvoiceFormPage onBack={() => navigateTo('sales')} onNotify={showNotification} />;
        }
        if (subAction === 'print' && parts[1]) {
          return <SalesInvoicePrintPage invoiceId={parts[1]} onBack={() => navigateTo('sales')} />;
        }
        return <SalesInvoicesListPage onNavigate={navigateTo} onNotify={showNotification} />;

      // Returns (مرتجع حر / مرتجع بفاتورة)
      case 'returns':
        if (action === 'new') {
          return <SalesReturnFormPage onBack={() => navigateTo('returns')} onNotify={showNotification} />;
        }
        return <SalesReturnsListPage onNavigate={navigateTo} onNotify={showNotification} />;

      // G & B) Treasuries & Outlets
      case 'treasuries':
      case 'cash':
        if (action === 'transfer') {
          return <OutletTransferFormPage onBack={() => navigateTo('treasuries')} onNotify={showNotification} />;
        }
        if (action === 'closing') {
          return <DailyClosingFormPage onBack={() => navigateTo('treasuries')} onNotify={showNotification} />;
        }
        return <TreasuriesListPage onNavigate={navigateTo} onNotify={showNotification} />;

      // Cash Disbursements (صرف النقدية)
      case 'disbursements':
        if (action === 'new') {
          return <CashDisbursementFormPage onBack={() => navigateTo('disbursements')} onNotify={showNotification} />;
        }
        return <DisbursementsListPage onNavigate={navigateTo} onNotify={showNotification} />;

      case 'expense-codes':
        return <ExpenseCodesPage onBack={() => navigateTo('disbursements')} onNotify={showNotification} />;

      case 'payment-methods':
        return <PaymentMethodsPage onBack={() => navigateTo('disbursements')} onNotify={showNotification} />;

      // H) Reports
      case 'reports':
        return (
          <ReportsModule
            onBack={() => navigateTo('home')}
            userRole={activeUserRole}
            onNotify={showNotification}
          />
        );

      // J) System Settings & Backup
      case 'settings':
        return (
          <SettingsModule
            onBack={() => navigateTo('home')}
            onNavigate={navigateTo}
            onNotify={showNotification}
          />
        );

      case 'backup':
        return (
          <BackupModule
            onBack={() => navigateTo('home')}
            onNotify={showNotification}
          />
        );

      // Home Dashboard
      case 'home':
      default:
        return (
          <HomeScreen
            onNavigate={navigateTo}
            userRole={activeUserRole}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] text-[#1F2937] font-sans antialiased flex flex-row relative overflow-x-hidden" dir="rtl">
      {/* Responsive Right-Side Sidebar (RTL) */}
      <Sidebar
        currentScreen={currentSidebarScreen}
        onNavigate={navigateTo}
        userRole={activeUserRole}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area (Offset by mr-0 on mobile, mr-64 on desktop lg screens) */}
      <div className="flex-1 flex flex-col min-h-screen mr-0 lg:mr-64 min-w-0 transition-all duration-200">
        {/* Top Header Bar with Hamburger Toggle */}
        <Header
          currentScreen={currentSidebarScreen}
          onNavigate={navigateTo}
          onNotify={handleRoleChanged}
          onLockSession={handleLockSession}
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        />

        {/* Dynamic Screen View wrapped with ErrorBoundary */}
        <main className="flex-1 p-3 sm:p-5 lg:p-6 w-full max-w-[1700px] mx-auto min-w-0 overflow-y-auto">
          {/* Backup Reminder Banner */}
          <BackupReminderBanner onOpenBackup={() => navigateTo('backup')} />

          <ErrorBoundary>
            {renderScreen()}
          </ErrorBoundary>
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
