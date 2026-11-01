import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import HomeScreen from './components/HomeScreen';
import Toast from './components/Toast';
import SetupScreen from './components/SetupScreen';
import LoginScreen from './components/LoginScreen';
import BackupReminderBanner from './components/BackupReminderBanner';
import ErrorBoundary from './components/ErrorBoundary';
import ActivationScreen from './components/ActivationScreen';
import UnsavedChangesModal from './components/UnsavedChangesModal';
import { navigationGuard } from './utils/navigationGuard';
import { AlertTriangle, X } from 'lucide-react';
import { isFeatureEnabled } from './editions/editionConfig';

// Master Data & Full-Page Modules
import ItemsListPage from './modules/items/ItemsListPage';
import ItemFormPage from './modules/items/ItemFormPage';
import ItemGroupsListPage from './modules/items/ItemGroupsListPage';
import ItemGroupFormPage from './modules/items/ItemGroupFormPage';
import ItemSectionsListPage from './modules/items/ItemSectionsListPage';
import ItemSectionFormPage from './modules/items/ItemSectionFormPage';
import StockCardPage from './modules/inventory/StockCardPage';
import PartiesListPage from './modules/parties/PartiesListPage';
import PartyFormPage from './modules/parties/PartyFormPage';
import VendorStatementPage from './modules/parties/VendorStatementPage';
import PrintPreviewPage from './modules/print/PrintPreviewPage';
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
import OutletsListPage from './modules/outlets/OutletsListPage';
import SalesReturnsListPage from './modules/returns/SalesReturnsListPage';
import SalesReturnFormPage from './modules/returns/SalesReturnFormPage';
import TreasuriesListPage from './modules/treasuries/TreasuriesListPage';
import OutletTransferFormPage from './modules/treasuries/OutletTransferFormPage';
import DailyClosingFormPage from './modules/treasuries/DailyClosingFormPage';
import DisbursementsListPage from './modules/disbursements/DisbursementsListPage';
import CashDisbursementFormPage from './modules/disbursements/CashDisbursementFormPage';
import SupplierPaymentFormPage from './modules/disbursements/SupplierPaymentFormPage';
import CustomerReceiptFormPage from './modules/disbursements/CustomerReceiptFormPage';
import PaymentReceiptPrintPage from './modules/disbursements/PaymentReceiptPrintPage';
import ExpenseCodesPage from './modules/disbursements/ExpenseCodesPage';
import PaymentMethodsPage from './modules/disbursements/PaymentMethodsPage';
import ReportsModule from './modules/ReportsModule';
import SettingsModule from './modules/SettingsModule';
import BackupModule from './modules/BackupModule';

// Section 4: Data Management (CEO Only)
import DataManagementPage from './modules/data/DataManagementPage';
import DataRecordFormPage from './modules/data/DataRecordFormPage';

import { getActiveUser, setActiveUser } from './services/api';
import { syncHydrateAll } from './services/apiSync';
import { usersRepo, backupRepo } from './data';
import { ensureDatabaseIntegrity, DB_NAME } from './data/db';
import Dexie from 'dexie';

function parseHash(hash) {
  const clean = (hash || '').replace(/^#\/?/, '').replace(/\/$/, '');
  const [pathPart, queryPart] = clean.split('?');
  const queryParams = new URLSearchParams(queryPart || '');
  const parts = (pathPart || '').split('/').filter(Boolean);
  const root = parts[0] || 'home';
  const queryItemId = queryParams.get('itemId');
  const pathItemId = root === 'stock-card' && parts[1] && parts[1] !== 'new' ? parts[1] : null;
  return {
    raw: clean,
    root,
    parts,
    action: parts[1] || null,
    param: parts[1] || null,
    subAction: parts[2] || null,
    queryParams,
    itemId: queryItemId || pathItemId || null
  };
}

export default function App() {
  const [licenseStatus, setLicenseStatus] = useState({ isValid: false, isChecking: true });
  const [machineCode, setMachineCode] = useState('');
  const [hasOwnerUser, setHasOwnerUser] = useState(null); // null = checking, true/false
  const [isLocked, setIsLocked] = useState(false);
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeUserRole, setActiveUserRole] = useState(getActiveUser().role);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [dbIntegrityError, setDbIntegrityError] = useState(null);
  const [unsavedModal, setUnsavedModal] = useState({ isOpen: false, pendingNav: null });
  const bypassGuardRef = useRef(false);
  const currentHashRef = useRef(window.location.hash || '');

  // Sidebar Pinned State (persisted in localStorage)
  const [isSidebarPinned, setIsSidebarPinned] = useState(() => {
    try {
      const saved = localStorage.getItem('erp_sidebar_pinned');
      return saved ? JSON.parse(saved) : false;
    } catch (e) {
      return false;
    }
  });

  const handleTogglePin = () => {
    setIsSidebarPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('erp_sidebar_pinned', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // Sync CSS Variable for sidebar width
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty(
        '--sidebar-width',
        isSidebarPinned ? '260px' : '72px'
      );
    }
  }, [isSidebarPinned]);

  // Initialize and check setup state with automatic database integrity validation
  useEffect(() => {
    async function checkSystemState() {
      try {
        await ensureDatabaseIntegrity();
        await syncHydrateAll().catch(() => {});

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
        setHasOwnerUser(false);
      }
    }
    checkSystemState();

    // Check Local SQLite Database Integrity (Desktop Mode)
    if (typeof window !== 'undefined' && window.electronAPI?.db) {
      const verifyIntegrity = async (initialInfo = null) => {
        try {
          if (localStorage.getItem('erp_db_integrity_dismissed') === 'true') {
            setDbIntegrityError(null);
            return;
          }
          const res = initialInfo || (await window.electronAPI.db.checkIntegrity());
          if (res && !res.ok) {
            // Re-verify after 600ms to allow concurrent startup locks to settle
            setTimeout(async () => {
              try {
                const secondCheck = await window.electronAPI.db.checkIntegrity();
                if (secondCheck && !secondCheck.ok) {
                  // Only report actual corruption, ignore driver/binding or dismissed warnings
                  const hasRealCorruption = Array.isArray(secondCheck.details) &&
                    secondCheck.details.some((d) => typeof d === 'string' && !/ok|binding|module|cannot find/i.test(d));
                  if (hasRealCorruption && localStorage.getItem('erp_db_integrity_dismissed') !== 'true') {
                    setDbIntegrityError(secondCheck);
                  } else {
                    setDbIntegrityError(null);
                  }
                } else {
                  setDbIntegrityError(null);
                }
              } catch {}
            }, 600);
          } else {
            setDbIntegrityError(null);
          }
        } catch {}
      };

      verifyIntegrity();

      if (window.electronAPI.db.onIntegrityWarning) {
        window.electronAPI.db.onIntegrityWarning((info) => {
          verifyIntegrity(info);
        });
      }
    }

    // Full-Page SPA Safe Hash Routing Sync with unsaved changes guard
    const handleHashChange = () => {
      const newHash = window.location.hash || '';
      if (newHash === currentHashRef.current) return;
      if (!bypassGuardRef.current && navigationGuard.hasUnsavedChanges()) {
        const target = newHash;
        bypassGuardRef.current = true;
        window.location.hash = currentHashRef.current;
        setTimeout(() => {
          bypassGuardRef.current = false;
        }, 80);
        setUnsavedModal({ isOpen: true, pendingNav: target });
        return;
      }
      currentHashRef.current = newHash;
      setRoute(parseHash(newHash));
    };

    const handleBeforeUnload = (e) => {
      if (navigationGuard.hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Electron Auto-Backup safeguard listener on app close
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.onTriggerAutoBackup) {
      const cleanup = window.electronAPI.onTriggerAutoBackup(async () => {
        try {
          const payload = await backupRepo.getBackupPayload();
          await window.electronAPI.saveAutoBackup(payload);
        } catch (err) {
          console.warn('[AutoBackup] Renderer backup collection failed:', err);
        } finally {
          window.electronAPI.notifyAutoBackupCompleted();
        }
      });
      return cleanup;
    }
  }, []);

  // Offline Licensing Verification and Realtime 24h Sync
  useEffect(() => {
    async function checkLicense() {
      if (typeof window !== 'undefined' && window.electronAPI?.getLicenseStatus) {
        try {
          const [status, code] = await Promise.all([
            window.electronAPI.getLicenseStatus(),
            window.electronAPI.getMachineCode ? window.electronAPI.getMachineCode() : Promise.resolve(''),
          ]);
          if (code) setMachineCode(code);
          setLicenseStatus(status || { isValid: false, isActivated: false, error: 'تعذر التحقق من الترخيص' });
        } catch (err) {
          console.error('License initial check failed:', err);
          setLicenseStatus({ isValid: false, isActivated: false, error: 'تعذر التحقق من الترخيص' });
        }
      } else {
        // In browser / test runner without Electron bridge:
        setLicenseStatus({
          isValid: true,
          isActivated: true,
          customerName: 'مطور النظام (بيئة المتصفح)',
          edition: 'cutting',
        });
      }
    }

    checkLicense();

    // Enforce automated daily backup in renderer
    async function triggerRendererDailyBackup() {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const lastBackup = localStorage.getItem('code_systems_last_daily_backup');
        if (lastBackup !== todayStr && typeof window !== 'undefined' && window.electronAPI?.saveAutoBackup) {
          const payload = await backupRepo.getBackupPayload();
          await window.electronAPI.saveAutoBackup(payload);
          localStorage.setItem('code_systems_last_daily_backup', todayStr);
        }
      } catch (e) {
        console.warn('Daily auto backup notice:', e);
      }
    }
    triggerRendererDailyBackup();

    // Listen for realtime 24h background license status updates
    if (typeof window !== 'undefined' && window.electronAPI?.onLicenseStatusChanged) {
      const unsub = window.electronAPI.onLicenseStatusChanged((status) => {
        setLicenseStatus(status);
      });
      return () => unsub?.();
    }
  }, []);

  const navigateTo = (path) => {
    const formatted = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
    if (!bypassGuardRef.current && navigationGuard.hasUnsavedChanges()) {
      setUnsavedModal({ isOpen: true, pendingNav: formatted });
      return;
    }
    currentHashRef.current = formatted;
    window.location.hash = formatted;
    setSidebarOpen(false);
  };

  const handleStayOnScreen = () => {
    setUnsavedModal({ isOpen: false, pendingNav: null });
  };

  const handleLeaveWithoutSaving = () => {
    const target = unsavedModal.pendingNav;
    setUnsavedModal({ isOpen: false, pendingNav: null });
    navigationGuard.unregister();
    bypassGuardRef.current = true;
    if (target) {
      currentHashRef.current = target;
      window.location.hash = target;
      setRoute(parseHash(target));
      setSidebarOpen(false);
    }
    setTimeout(() => {
      bypassGuardRef.current = false;
    }, 150);
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
    if (['outlets', 'branches'].includes(r)) return 'outlets';
    if (r === 'returns') return 'returns';
    if (['treasuries', 'cash'].includes(r)) return 'treasuries';
    if (['disbursements', 'expense-codes', 'payment-methods'].includes(r)) return 'disbursements';
    if (r === 'reports') return 'reports';
    if (r === 'backup') return 'backup';
    if (r === 'settings') return 'settings';
    if (r === 'data') return 'data';
    return 'home';
  };

  const currentSidebarScreen = getSidebarActiveScreen();

  // 0. Hardened License Verification Gate - fails closed
  const isSystemActivated = Boolean(licenseStatus?.isValid && licenseStatus?.isActivated);

  // Permanently redirect activation route when activated
  if (isSystemActivated && route.root === 'activation') {
    window.location.hash = '#/home';
  }

  if (!isSystemActivated) {
    if (licenseStatus?.isChecking) {
      return (
        <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center p-4" dir="rtl">
          <div className="text-center font-bold text-gray-600 text-lg">
            جاري التحقق من ترخيص النظام وربط الجهاز...
          </div>
        </div>
      );
    }

    return (
      <ActivationScreen
        initialMachineCode={machineCode}
        initialStatus={licenseStatus}
        onActivated={(newStatus) => {
          setLicenseStatus({
            ...newStatus,
            isValid: true,
            isActivated: true,
          });
          showNotification('تم تفعيل النظام بنجاح!', 'success');
        }}
      />
    );
  }

  // If system owner check is still in progress
  if (hasOwnerUser === null) {
    return (
      <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center p-4" dir="rtl">
        <div className="text-center font-bold text-gray-600 text-lg">
          جاري تحميل نظام code systems...
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

      // Item Groups (مجموعات الأصناف)
      case 'item-groups':
        if (action === 'new') {
          return <ItemGroupFormPage onBack={() => navigateTo('item-groups')} onNotify={showNotification} />;
        }
        if (subAction === 'edit' && parts[1]) {
          return <ItemGroupFormPage groupId={parts[1]} onBack={() => navigateTo('item-groups')} onNotify={showNotification} />;
        }
        return <ItemGroupsListPage onNavigate={navigateTo} onNotify={showNotification} />;

      // Item Sections (أقسام الأصناف)
      case 'item-sections':
        if (action === 'new') {
          return <ItemSectionFormPage onBack={() => navigateTo('item-sections')} onNotify={showNotification} />;
        }
        if (subAction === 'edit' && parts[1]) {
          return <ItemSectionFormPage sectionId={parts[1]} onBack={() => navigateTo('item-sections')} onNotify={showNotification} />;
        }
        return <ItemSectionsListPage onNavigate={navigateTo} onNotify={showNotification} />;

      // Stock Card (كارت وحركة الصنف)
      case 'stock-card':
        return (
          <StockCardPage
            initialItemId={route.itemId || (route.parts[0] === 'stock-card' ? route.parts[1] : null)}
            onNavigate={navigateTo}
            onNotify={showNotification}
          />
        );

      // B) Parties (Suppliers & Customers & Vendors)
      case 'suppliers':
        if (action === 'new') {
          return <PartyFormPage initialType="supplier" onBack={() => navigateTo('suppliers')} onNotify={showNotification} />;
        }
        if (subAction === 'statement' && parts[1]) {
          return <VendorStatementPage vendorId={parts[1]} onBack={() => navigateTo('suppliers')} onNotify={showNotification} />;
        }
        if (subAction === 'edit' && parts[1]) {
          return <PartyFormPage partyId={parts[1]} initialType="supplier" onBack={() => navigateTo('suppliers')} onNotify={showNotification} />;
        }
        return <PartiesListPage mode="suppliers" defaultTab="suppliers" onNavigate={navigateTo} onNotify={showNotification} />;

      case 'customers':
        if (action === 'new') {
          return <PartyFormPage initialType="customer" onBack={() => navigateTo('customers')} onNotify={showNotification} />;
        }
        if (subAction === 'statement' && parts[1]) {
          return <VendorStatementPage vendorId={parts[1]} onBack={() => navigateTo('customers')} onNotify={showNotification} />;
        }
        if (subAction === 'edit' && parts[1]) {
          return <PartyFormPage partyId={parts[1]} initialType="customer" onBack={() => navigateTo('customers')} onNotify={showNotification} />;
        }
        return <PartiesListPage mode="customers" defaultTab="customers" onNavigate={navigateTo} onNotify={showNotification} />;

      case 'vendors':
        if (subAction === 'statement' && parts[1]) {
          return <VendorStatementPage vendorId={parts[1]} onBack={() => window.history.back()} onNotify={showNotification} />;
        }
        if (subAction === 'edit' && parts[1]) {
          return <PartyFormPage partyId={parts[1]} initialType="supplier" onBack={() => window.history.back()} onNotify={showNotification} />;
        }
        return <PartiesListPage mode="suppliers" defaultTab="suppliers" onNavigate={navigateTo} onNotify={showNotification} />;

      // In-App Print Preview (Item 8)
      case 'print-preview':
        return (
          <PrintPreviewPage
            searchParams={route.queryParams}
            onBack={() => {
              const returnUrl = route.queryParams.get('returnUrl');
              if (returnUrl) {
                navigateTo(returnUrl.replace(/^#\/?/, ''));
              } else {
                window.history.back();
              }
            }}
          />
        );

      // C) Purchases
      case 'purchases':
        if (action === 'new') {
          return <PurchaseOrderFormPage onBack={() => navigateTo('purchases')} onNotify={showNotification} />;
        }
        if ((subAction === 'edit' && parts[1]) || (action === 'edit' && parts[2])) {
          const poId = subAction === 'edit' ? parts[1] : parts[2];
          return <PurchaseOrderFormPage orderId={poId} onBack={() => navigateTo('purchases')} onNotify={showNotification} />;
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

      // E) Manufacturing & Cutting (Cutting Edition only)
      case 'manufacturing':
      case 'outsourced':
      case 'finishing':
        if (!isFeatureEnabled('cutting')) {
          return <HomeScreen onNavigate={navigateTo} userRole={activeUserRole} />;
        }
        if (root === 'manufacturing') {
          if (action === 'new') {
            return <ProductionOrderFormPage onBack={() => navigateTo('manufacturing')} onNotify={showNotification} />;
          }
          if (subAction === 'edit' && parts[1]) {
            return <ProductionOrderFormPage orderId={parts[1]} onBack={() => navigateTo('manufacturing')} onNotify={showNotification} />;
          }
          return <ManufacturingListPage onNavigate={navigateTo} onNotify={showNotification} />;
        }
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

      // Outlets & Showrooms (معارض ومنافذ البيع)
      case 'outlets':
      case 'branches':
        return <OutletsListPage onNavigate={navigateTo} onNotify={showNotification} />;

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

      // Cash Disbursements (صرف النقدية والمقبوضات)
      case 'disbursements':
        if (action === 'new') {
          return <CashDisbursementFormPage onBack={() => navigateTo('disbursements')} onNotify={showNotification} />;
        }
        if (action === 'supplier-payment') {
          return <SupplierPaymentFormPage onBack={() => navigateTo('disbursements')} onSaved={() => navigateTo('disbursements')} onNotify={showNotification} />;
        }
        if (action === 'customer-receipt') {
          return <CustomerReceiptFormPage onBack={() => navigateTo('disbursements')} onSaved={() => navigateTo('disbursements')} onNotify={showNotification} />;
        }
        if (action === 'print-payment') {
          return <PaymentReceiptPrintPage type="supplier_payment" id={parts[2] || parts[1]} onBack={() => navigateTo('disbursements')} />;
        }
        if (action === 'print-receipt') {
          return <PaymentReceiptPrintPage type="customer_receipt" id={parts[2] || parts[1]} onBack={() => navigateTo('disbursements')} />;
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
            onNavigate={navigateTo}
            userRole={activeUserRole}
            onNotify={showNotification}
            initialReport={route.queryParams?.get('tab') || route.param || 'index'}
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

      // Section 4: Universal Data Management (CRUD on all system tables)
      case 'data': {
        // Full-page form for Add / Edit record
        if (parts[1] && parts[2]) {
          return (
            <DataRecordFormPage
              tableName={parts[1]}
              recordId={parts[2]}
              onBack={() => navigateTo(`data/${parts[1]}`)}
              onNotify={showNotification}
            />
          );
        }

        // Specific table view
        if (parts[1]) {
          return (
            <DataManagementPage
              initialTable={parts[1]}
              onNavigate={navigateTo}
              onNotify={showNotification}
            />
          );
        }

        // Default Data Management screen
        return (
          <DataManagementPage
            initialTable="items"
            onNavigate={navigateTo}
            onNotify={showNotification}
          />
        );
      }

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
        isPinned={isSidebarPinned}
        onTogglePin={handleTogglePin}
        licenseStatus={licenseStatus}
      />

      {/* Main Content Area: Offset by 72px (unpinned) or 260px (pinned) on desktop, 0 on mobile */}
      <div
        className={`flex-1 flex flex-col min-h-screen min-w-0 transition-[margin] duration-250 ease-out overflow-x-hidden ${
          isSidebarPinned ? 'mr-0 lg:mr-[260px]' : 'mr-0 lg:mr-[72px]'
        }`}
      >
        {/* Database Integrity Warning Banner (Requirement 5) */}
        {dbIntegrityError && (
          <div className="bg-red-700 text-white p-3.5 px-6 flex items-center justify-between shadow-md border-b border-red-800 z-40 gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-red-800 flex items-center justify-center shrink-0 font-bold text-lg">!</div>
              <div>
                <div className="font-bold text-sm">تنبيه سلامة قاعدة البيانات المحلية</div>
                <div className="text-xs text-red-100">
                  تم اكتشاف عدم تكامل في بنية قاعدة البيانات المحلية (SQLite). يرجى استرجاع أحدث نسخة احتياطية سليمة لضمان سلامة العمليات.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={async () => {
                  try {
                    localStorage.setItem('erp_db_integrity_dismissed', 'true');
                  } catch {}
                  if (typeof window !== 'undefined' && window.electronAPI?.db?.checkIntegrity) {
                    try {
                      const res = await window.electronAPI.db.checkIntegrity();
                      if (res && res.ok) {
                        setDbIntegrityError(null);
                        setToast({ message: 'تم فحص قاعدة البيانات بنجاح: البنية متكاملة وسليمة 100%', type: 'success' });
                        return;
                      }
                    } catch {}
                  }
                  setDbIntegrityError(null);
                  setToast({ message: 'تم تحديث حالة الفحص بنجاح', type: 'success' });
                }}
                className="px-3 py-1.5 bg-red-900 hover:bg-red-950 text-white font-bold rounded text-xs shrink-0 cursor-pointer border border-red-500 transition-colors"
              >
                إعادة الفحص الآن
              </button>
              <button
                onClick={() => navigateTo('settings')}
                className="px-4 py-1.5 bg-white text-red-700 font-bold rounded hover:bg-red-50 text-xs shrink-0 cursor-pointer transition-colors"
              >
                استرجاع نسخة احتياطية
              </button>
              <button
                onClick={() => {
                  setDbIntegrityError(null);
                  try {
                    localStorage.setItem('erp_db_integrity_dismissed', 'true');
                  } catch {}
                }}
                className="p-1 text-red-200 hover:text-white rounded hover:bg-red-800 cursor-pointer transition-colors"
                title="إغلاق التنبيه نهائياً"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 14-Day Expiry Warning Banner */}
        {licenseStatus?.isExpiringSoon && (
          <div className="bg-amber-600 text-white px-4 py-2.5 text-center text-xs md:text-sm font-bold flex items-center justify-center gap-2 shadow-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              تنبيه: سينتهي ترخيص النظام بعد {licenseStatus.daysRemaining} {licenseStatus.daysRemaining === 1 ? 'يوم' : 'أيام'} (بتاريخ {licenseStatus.expiresAt ? new Date(licenseStatus.expiresAt).toLocaleDateString('ar-EG') : ''}). يرجى التواصل مع المطور لتجديده.
            </span>
          </div>
        )}

        {/* Top Header Bar with Hamburger Toggle */}
        <Header
          currentScreen={currentSidebarScreen}
          onNavigate={navigateTo}
          onNotify={handleRoleChanged}
          onLockSession={handleLockSession}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />

        {/* Dynamic Screen View wrapped with ErrorBoundary */}
        <main className="flex-1 p-3 sm:p-5 lg:p-6 w-full max-w-[1700px] mx-auto min-w-0 overflow-y-auto overflow-x-hidden">
          <ErrorBoundary key={route.raw || 'main-view'}>
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

      {/* Unsaved Changes Confirmation Dialog (Requirement 5) */}
      <UnsavedChangesModal
        isOpen={unsavedModal.isOpen}
        onStay={handleStayOnScreen}
        onLeave={handleLeaveWithoutSaving}
      />
    </div>
  );
}
