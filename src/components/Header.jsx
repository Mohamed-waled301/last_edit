import React, { useState, useEffect } from 'react';
import { User, HardDrive, Settings, LogOut, Shield } from 'lucide-react';
import { api, setActiveUser, getActiveUser } from '../services/api';
import { settingsRepo, usersRepo } from '../data';

export default function Header({ currentScreen, onNavigate, onNotify, onLockSession }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(getActiveUser());
  const [factoryName, setFactoryName] = useState('ورشة ومصنع الأصيل');

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
      case 'owner': return 'صاحب العمل (المدير العام)';
      case 'purchasing': return 'مسؤول المشتريات';
      case 'storekeeper': return 'أمين المخزن';
      case 'production': return 'مدير الإنتاج والورشة';
      case 'accountant': return 'المحاسب المالي';
      default: return role;
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 h-16 sticky top-0 z-20 flex items-center justify-between px-6 no-print">
      {/* Right side: Company Name */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900 leading-tight">
          {factoryName}
        </h1>
        <span className="text-sm text-gray-400 font-medium hidden sm:inline">|</span>
        <span className="text-sm text-gray-500 font-medium hidden sm:inline">
          نظام الإدارة المالية والتصنيع (محلي 100%)
        </span>
      </div>

      {/* Left side: User Name, Role, and Actions */}
      <div className="flex items-center gap-3">
        {/* Quick Backup Button */}
        <button
          onClick={() => onNavigate('backup')}
          className={`h-10 px-3.5 rounded-md font-semibold text-sm border flex items-center gap-2 cursor-pointer transition-colors ${
            currentScreen === 'backup'
              ? 'bg-[#1F3A5F] text-white border-[#1F3A5F]'
              : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
          }`}
          title="شاشة النسخ الاحتياطي وأمان البيانات"
        >
          <HardDrive className="w-4 h-4 text-gray-600" />
          <span className="hidden md:inline">نسخة احتياطية</span>
        </button>

        {/* Settings Button (if owner) */}
        {currentUser.role === 'owner' && (
          <button
            onClick={() => onNavigate('settings')}
            className={`h-10 px-3.5 rounded-md font-semibold text-sm border flex items-center gap-2 cursor-pointer transition-colors ${
              currentScreen === 'settings'
                ? 'bg-[#1F3A5F] text-white border-[#1F3A5F]'
                : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'
            }`}
            title="إعدادات النظام والضرائب"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden md:inline">الإعدادات</span>
          </button>
        )}

        {/* User Account & Role Selector */}
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md px-3 h-10">
          <User className="w-4 h-4 text-gray-500" />
          <select
            value={currentUser.id}
            onChange={handleRoleChange}
            className="bg-transparent font-bold text-gray-800 text-sm cursor-pointer focus:outline-none border-0 p-0"
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
          <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-700 font-semibold border border-gray-300">
            {getRoleLabel(currentUser.role)}
          </span>
        </div>

        {/* Lock / Log Out Button */}
        {onLockSession && (
          <button
            onClick={onLockSession}
            className="h-10 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 rounded-md font-medium text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
            title="قفل الشاشة أو تبديل الحساب برمز PIN"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden lg:inline">قفل</span>
          </button>
        )}
      </div>
    </header>
  );
}
