import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Layers,
  Truck,
  ShoppingCart,
  Package,
  Cog,
  Factory,
  Users,
  Receipt,
  RotateCcw,
  Landmark,
  Wallet,
  BarChart3,
  HardDrive,
  Settings,
  Database,
  Store,
  Pin,
  X,
  Scissors,
  Building2,
} from 'lucide-react';
import { api } from '../services/api';
import { APP_VERSION } from '../version';

export default function Sidebar({
  currentScreen,
  onNavigate,
  userRole,
  isOpen = false,
  onClose,
  isPinned = false,
  onTogglePin,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [companySettings, setCompanySettings] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function loadCompanySettings() {
      try {
        const res = await api.getSettings();
        const data = res?.settings || res?.data || res || null;
        if (isMounted && data) {
          setCompanySettings(data);
        }
      } catch {}
    }
    loadCompanySettings();
    return () => { isMounted = false; };
  }, []);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isOpen && onClose) {
          onClose();
        }
        setIsHovered(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const navItems = [
    {
      id: 'home',
      label: 'الرئيسية',
      icon: LayoutDashboard,
      allowedRoles: ['owner', 'purchasing', 'storekeeper', 'production', 'accountant', 'cashier'],
    },
    {
      id: 'items',
      label: 'الأصناف',
      icon: Layers,
      allowedRoles: ['owner', 'production', 'purchasing', 'storekeeper', 'accountant'],
    },
    {
      id: 'suppliers',
      label: 'الموردين',
      icon: Truck,
      allowedRoles: ['owner', 'purchasing', 'storekeeper', 'accountant'],
    },
    {
      id: 'purchases',
      label: 'المشتريات (أوامر الشراء)',
      icon: ShoppingCart,
      allowedRoles: ['owner', 'purchasing', 'storekeeper', 'accountant'],
    },
    {
      id: 'inventory',
      label: 'المخزن',
      icon: Package,
      allowedRoles: ['owner', 'purchasing', 'storekeeper', 'production', 'accountant'],
    },
    {
      id: 'manufacturing',
      label: 'شاشة القص',
      icon: Scissors,
      allowedRoles: ['owner', 'production', 'storekeeper', 'accountant'],
    },
    {
      id: 'customers',
      label: 'العملاء',
      icon: Users,
      allowedRoles: ['owner', 'accountant', 'cashier'],
    },
    {
      id: 'sales',
      label: 'المبيعات',
      icon: Receipt,
      allowedRoles: ['owner', 'accountant', 'storekeeper', 'cashier'],
    },
    {
      id: 'outlets',
      label: 'الفروع والمعارض',
      icon: Store,
      allowedRoles: ['owner', 'accountant', 'cashier', 'storekeeper'],
    },
    {
      id: 'returns',
      label: 'المرتجعات',
      icon: RotateCcw,
      allowedRoles: ['owner', 'accountant', 'cashier', 'storekeeper'],
    },
    {
      id: 'treasuries',
      label: 'الخزائن',
      icon: Landmark,
      allowedRoles: ['owner', 'accountant', 'cashier'],
    },
    {
      id: 'disbursements',
      label: 'صرف النقدية',
      icon: Wallet,
      allowedRoles: ['owner', 'accountant', 'purchasing'],
    },
    {
      id: 'reports',
      label: 'التقارير',
      icon: BarChart3,
      allowedRoles: ['owner', 'accountant', 'purchasing', 'storekeeper', 'production'],
    },
    {
      id: 'backup',
      label: 'النسخ الاحتياطي',
      icon: HardDrive,
      allowedRoles: ['owner', 'accountant'],
    },
  ];

  if (userRole === 'owner') {
    navItems.push({
      id: 'settings',
      label: 'الإعدادات',
      icon: Settings,
      allowedRoles: ['owner'],
    });
  }

  const isExpanded = isPinned || isHovered || isOpen;
  const isCeo = userRole === 'owner';

  const handleItemClick = (screenId) => {
    onNavigate(screenId);
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile Backdrop for touch devices */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-30 lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Root */}
      <aside
        id="app-sidebar"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocus={() => setIsHovered(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsHovered(false);
          }
        }}
        className={`bg-white border-l border-gray-200 h-screen fixed right-0 top-0 flex flex-col z-40 select-none no-print transition-[width,box-shadow,transform] duration-250 ease-out ${
          isExpanded ? 'sidebar-expanded-shadow' : ''
        } ${
          // Desktop sizing: collapsed 72px, expands to 260px on hover/pin
          isPinned
            ? 'lg:w-[260px]'
            : isHovered
            ? 'lg:w-[260px]'
            : 'lg:w-[72px]'
        } ${
          // Mobile drawer: full 260px width, slides from right
          isOpen
            ? 'w-[260px] translate-x-0'
            : 'translate-x-full lg:translate-x-0'
        }`}
        aria-label="القائمة الجانبية للنظام"
      >
        {/* Top Header: Company Logo from Settings + Company Name */}
        <div className="h-16 border-b border-gray-200 px-3 flex items-center justify-between shrink-0 overflow-hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            {companySettings?.company_logo ? (
              <img
                src={companySettings.company_logo}
                alt=""
                className="w-10 h-10 rounded-md object-contain shrink-0"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-10 h-10 rounded-md bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-slate-600" />
              </div>
            )}
            <div
              className={`overflow-hidden transition-all duration-200 whitespace-nowrap ${
                isExpanded ? 'opacity-100 max-w-[170px]' : 'opacity-0 max-w-0 pointer-events-none'
              }`}
            >
              <span className="font-bold text-[#1F3A5F] text-sm block leading-none truncate">
                {companySettings?.company_name || 'code systems'}
              </span>
              <span className="text-[11px] text-gray-500 font-semibold block mt-1 truncate">
                code systems
              </span>
            </div>
          </div>

          {/* Desktop Pin Button */}
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              className={`p-1.5 rounded-md transition-colors hidden lg:flex items-center justify-center cursor-pointer shrink-0 ${
                isPinned
                  ? 'text-[#1F3A5F] bg-blue-50 hover:bg-blue-100'
                  : isExpanded
                  ? 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
                  : 'hidden'
              }`}
              title={isPinned ? 'إلغاء تثبيت القائمة' : 'تثبيت القائمة الجانبية'}
              aria-label={isPinned ? 'إلغاء تثبيت القائمة' : 'تثبيت القائمة الجانبية'}
            >
              <Pin className={`w-4 h-4 transition-transform ${isPinned ? 'rotate-45 text-[#1F3A5F]' : ''}`} />
            </button>
          )}

          {/* Mobile Close Button */}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-800 lg:hidden rounded-md hover:bg-gray-100 cursor-pointer shrink-0"
            title="إغلاق القائمة"
            type="button"
            aria-label="إغلاق القائمة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items List */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item.id)}
                title={item.label}
                aria-label={item.label}
                className={`w-full h-11 flex items-center rounded-md text-[15px] font-semibold transition-colors cursor-pointer text-right group relative px-2 ${
                  isActive
                    ? 'bg-[#1F3A5F] text-white shadow-xs'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {/* Fixed Icon Container: never moves during expansion */}
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-800'}`} />
                </div>

                {/* Text Label: Fades in/out smoothly */}
                <span
                  className={`whitespace-nowrap transition-all duration-200 overflow-hidden text-right leading-none ${
                    isExpanded ? 'opacity-100 mr-2.5 max-w-[180px]' : 'opacity-0 max-w-0 pointer-events-none'
                  }`}
                >
                  {item.label}
                </span>

                {/* Tooltip when collapsed on desktop */}
                {!isExpanded && (
                  <span
                    role="tooltip"
                    className="fixed right-[80px] bg-gray-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-lg opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap hidden lg:block"
                  >
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}

          {/* إدارة البيانات الشاملة - مخصصة للإدارة العليا والرئيس التنفيذي فقط */}
          {userRole === 'owner' && (
            <>
              <div className="my-2 border-t border-gray-200" />
              <button
                type="button"
                onClick={() => handleItemClick('data')}
                title="إدارة البيانات الشاملة"
                aria-label="إدارة البيانات"
                className={`w-full h-11 flex items-center rounded-md text-[15px] font-semibold transition-colors cursor-pointer text-right group relative px-2 ${
                  currentScreen === 'data'
                    ? 'bg-[#1F3A5F] text-white shadow-xs'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {/* Fixed Icon Container */}
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  <Database
                    className={`w-5 h-5 ${
                      currentScreen === 'data' ? 'text-white' : 'text-blue-600 group-hover:text-blue-700'
                    }`}
                  />
                </div>

                {/* Text Label */}
                <span
                  className={`whitespace-nowrap transition-all duration-200 overflow-hidden text-right leading-none ${
                    isExpanded ? 'opacity-100 mr-2.5 max-w-[180px]' : 'opacity-0 max-w-0 pointer-events-none'
                  }`}
                >
                  إدارة البيانات
                </span>

                {/* Tooltip when collapsed */}
                {!isExpanded && (
                  <span
                    role="tooltip"
                    className="fixed right-[80px] bg-gray-900 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md shadow-lg opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap hidden lg:block"
                  >
                    إدارة البيانات الشاملة
                  </span>
                )}
              </button>
            </>
          )}
        </nav>

        {/* Footer: the text "code systems" only (visible when expanded) */}
        {isExpanded && (
          <div className="p-3 border-t border-gray-200 shrink-0 text-center select-none bg-slate-50/50">
            <span className="text-xs font-bold text-slate-700 block tracking-wide">
              code systems
            </span>
          </div>
        )}
      </aside>
    </>
  );
}
