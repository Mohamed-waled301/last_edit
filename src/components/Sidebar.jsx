import React from 'react';
import {
  LayoutDashboard,
  Truck,
  Package,
  Layers,
  Cog,
  Sparkles,
  Receipt,
  Wallet,
  BarChart3,
  Settings,
  HardDrive,
  X
} from 'lucide-react';

export default function Sidebar({ currentScreen, onNavigate, userRole, isOpen = false, onClose }) {
  const navItems = [
    {
      id: 'home',
      label: 'الرئيسية',
      icon: LayoutDashboard,
      allowedRoles: ['owner', 'purchasing', 'storekeeper', 'production', 'accountant'],
    },
    {
      id: 'suppliers',
      label: 'الموردين والمشتريات',
      icon: Truck,
      allowedRoles: ['owner', 'purchasing', 'storekeeper', 'accountant'],
    },
    {
      id: 'inventory',
      label: 'المخزن والخامات',
      icon: Package,
      allowedRoles: ['owner', 'purchasing', 'storekeeper', 'production', 'accountant'],
    },
    {
      id: 'products',
      label: 'المنتجات',
      icon: Layers,
      allowedRoles: ['owner', 'production', 'purchasing', 'storekeeper', 'accountant'],
    },
    {
      id: 'manufacturing',
      label: 'التصنيع',
      icon: Cog,
      allowedRoles: ['owner', 'production', 'storekeeper', 'accountant'],
    },
    {
      id: 'finishing',
      label: 'التشطيب',
      icon: Sparkles,
      allowedRoles: ['owner', 'production', 'storekeeper', 'accountant'],
    },
    {
      id: 'sales',
      label: 'المبيعات',
      icon: Receipt,
      allowedRoles: ['owner', 'accountant', 'storekeeper'],
    },
    {
      id: 'cash',
      label: 'الخزينة',
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
      label: 'نسخة احتياطية',
      icon: HardDrive,
      allowedRoles: ['owner', 'accountant'],
    },
  ];

  // If user is owner, also show Settings in sidebar
  if (userRole === 'owner') {
    navItems.push({
      id: 'settings',
      label: 'الإعدادات',
      icon: Settings,
      allowedRoles: ['owner'],
    });
  }

  const visibleItems = navItems.filter(item => item.allowedRoles.includes(userRole));

  const handleItemClick = (screenId) => {
    onNavigate(screenId);
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-30 lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Aside element */}
      <aside
        className={`w-64 bg-white border-l border-gray-200 h-screen fixed right-0 top-0 flex flex-col z-40 select-none no-print shadow-xl lg:shadow-none transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Sidebar Header / Brand */}
        <div className="h-16 border-b border-gray-200 px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#1F3A5F] text-white flex items-center justify-center font-bold text-lg shrink-0">
              A
            </div>
            <div>
              <span className="font-bold text-[#1F3A5F] text-lg block leading-none">Apex ERP</span>
              <span className="text-[11px] text-gray-500 font-semibold block mt-0.5">نظام تخطيط موارد المؤسسات</span>
            </div>
          </div>

          {/* Close button for mobile screens */}
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-gray-800 lg:hidden rounded-md hover:bg-gray-100 cursor-pointer"
            title="إغلاق القائمة"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleItems.map(item => {
            const Icon = item.icon;
            const isActive = currentScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-[17px] font-semibold transition-colors cursor-pointer text-right ${
                  isActive
                    ? 'bg-[#1F3A5F] text-white shadow-xs'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer info */}
        <div className="p-3 border-t border-gray-200 text-xs text-gray-400 text-center font-medium shrink-0">
          Enterprise ERP Suite v2.5
        </div>
      </aside>
    </>
  );
}
