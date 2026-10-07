import React, { useState, useEffect } from 'react';
import { User, HardDrive, Settings, LogOut, Menu } from 'lucide-react';
import { setActiveUser, getActiveUser } from '../services/api';
import { settingsRepo, usersRepo } from '../data';

export default function Header({ currentScreen, onNavigate, onNotify, onLockSession, onToggleSidebar }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(getActiveUser());
  const [factoryName, setFactoryName] = useState('مجموعة القمة للصناعات المتطورة');

  useEffect(() => {
    loadHeaderData();
  }, []);

  const loadHeaderData = async () => {
    try {
      const uList = await usersRepo.getAll();
      setUsers(uList);
      const settings = await settingsRepo.getSettings();
      if (settings?.factory_name) {
        setFactoryName(settings.factory_name);
      }
      setCurrentUser(getActiveUser());
    } catch (e) {
      console.warn('Header load error:', e);
    }
  };

  const handleRoleChange = (e) => {
    const selectedId = e.target.value;
    const user = users.find(u => u.id === selectedId);
    if (user) {
      setActiveUser(user.id, user.role, user.full_name);
      setCurrentUser({ id: user.id, role: user.role, full_name: user.full_name });
      onNotify(`تم التبديل إلى: ${user.full_name}`);
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'owner': return 'الرئيس التنفيذي (CEO)';
      case 'purchasing': return 'سلاسل الإمداد ومشتريات الأقمشة';
      case 'storekeeper': return 'أمين مستودع الخامات';
      case 'production': return 'مدير خطوط الإنتاج والتشغيل';
      case 'accountant': return 'المدير المالي (CFO)';
      case 'cashier': return 'كاشير منفذ البيع';
      default: return role;
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 h-16 sticky top-0 z-20 flex items-center justify-between px-3 sm:px-6 no-print shrink-0">
      {/* Right side: Menu button for mobile + Company Name */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          className="p-2 -mr-1 text-gray-700 hover:bg-gray-100 rounded-md lg:hidden cursor-pointer shrink-0"
          title="القائمة الرئيسية"
          type="button"
          aria-label="تبديل القائمة"
        >
          <Menu className="w-5 h-5 text-[#1F3A5F]" />
        </button>

        <div className="min-w-0">
          <h1 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 leading-tight truncate">
            {factoryName}
          </h1>
          <span className="text-xs text-gray-500 font-medium hidden md:inline truncate block">
            نظام تخطيط موارد المؤسسات المتكامل (Enterprise ERP)
          </span>
        </div>
      </div>

      {/* Left side: User Name, Role, and Actions */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Quick Backup Button */}
        <button
          onClick={() => onNavigate('backup')}
          className={`h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-md font-semibold text-xs sm:text-sm border flex items-center gap-1.5 sm:gap-2 cursor-pointer transition-colors ${
            currentScreen === 'backup'
              ? 'bg-[#1F3A5F] text-white border-[#1F3A5F]'
              : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
          }`}
          title="شاشة النسخ الاحتياطي وأمان البيانات"
          type="button"
        >
          <HardDrive className="w-4 h-4 text-gray-600" />
          <span className="hidden sm:inline">نسخة احتياطية</span>
        </button>

        {/* Settings Button (if owner) */}
        {currentUser?.role === 'owner' && (
          <button
            onClick={() => onNavigate('settings')}
            className={`h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-md font-semibold text-xs sm:text-sm border flex items-center gap-1.5 sm:gap-2 cursor-pointer transition-colors ${
              currentScreen === 'settings'
                ? 'bg-[#1F3A5F] text-white border-[#1F3A5F]'
                : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
            }`}
            title="إعدادات النظام والضرائب"
            type="button"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">الإعدادات</span>
          </button>
        )}

        {/* User Account & Role Selector */}
        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-md px-2 sm:px-3 h-9 sm:h-10 max-w-[180px] sm:max-w-none">
          <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 shrink-0" />
          <select
            value={currentUser?.id || ''}
            onChange={handleRoleChange}
            className="bg-transparent font-bold text-gray-800 text-xs sm:text-sm cursor-pointer focus:outline-none border-0 p-0 truncate max-w-[90px] sm:max-w-[150px]"
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
          <span className="text-[11px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-gray-200 text-gray-700 font-semibold border border-gray-300 hidden md:inline shrink-0">
            {getRoleLabel(currentUser?.role)}
          </span>
        </div>

        {/* Lock / Log Out Button */}
        {onLockSession && (
          <button
            onClick={onLockSession}
            className="h-9 sm:h-10 px-2 sm:px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-md font-medium text-xs flex items-center gap-1 cursor-pointer transition-colors shrink-0"
            title="قفل الشاشة أو تبديل الحساب برمز PIN"
            type="button"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden lg:inline">قفل</span>
          </button>
        )}
      </div>
    </header>
  );
}
