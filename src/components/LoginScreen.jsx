import React, { useState, useEffect } from 'react';
import { Lock, UserCheck, Shield, ChevronLeft, ArrowRight, Delete } from 'lucide-react';
import { usersRepo } from '../data';
import { setActiveUser } from '../services/api';

const roleLabels = {
  owner: 'الرئيس التنفيذي / المدير العام',
  purchasing: 'مدير المشتريات وسلاسل الإمداد',
  storekeeper: 'مدير المستودعات واللوجستيات',
  production: 'مدير العمليات والتصنيع الهندسي',
  accountant: 'المدير المالي والمراقب المالي',
};

export const LoginScreen = ({ onLoginSuccess }) => {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const list = await usersRepo.getAll();
      setUsers(list);
      if (list.length > 0) {
        // Default select owner if present
        const owner = list.find(u => u.role === 'owner') || list[0];
        setSelectedUser(owner);
      }
    } catch (e) {
      console.error('Failed to load users:', e);
    }
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    if (!selectedUser) return;
    setError('');

    if (!pin) {
      setError('يرجى إدخال رمز الدخول');
      return;
    }

    setLoading(true);
    try {
      const res = await usersRepo.verifyPin(selectedUser.id, pin);
      if (res.success) {
        setActiveUser(selectedUser.id, selectedUser.role, selectedUser.full_name);
        onLoginSuccess(selectedUser);
      } else {
        setError(res.error || 'رمز الدخول غير صحيح');
      }
    } catch (err) {
      setError(err.message || 'فشل التحقق من الرمز');
    } finally {
      setLoading(false);
    }
  };

  const handlePinDigit = (digit) => {
    if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length >= 4) {
        setError('');
      }
    }
  };

  const handleBackspace = () => {
    setPin(prev => prev.slice(0, -1));
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-white border border-gray-300 rounded-md p-6 shadow-none">
        {/* Top Header */}
        <div className="text-center pb-5 border-b border-gray-200">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#1F3A5F]/10 border border-[#1F3A5F]/20 rounded-md mb-2 text-[#1F3A5F]">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-[#1F2937]">تسجيل الدخول للنظام</h1>
          <p className="text-gray-500 text-xs mt-0.5">أدخل الرمز السري المخصص لحسابك</p>
        </div>

        {/* User Selection */}
        <div className="my-4">
          <label className="block text-xs font-semibold text-gray-700 mb-2">اختر المستخدم:</label>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
            {users.map(u => (
              <div
                key={u.id}
                onClick={() => {
                  setSelectedUser(u);
                  setPin('');
                  setError('');
                }}
                className={`p-2.5 rounded-md border text-sm flex items-center justify-between cursor-pointer transition-colors ${
                  selectedUser?.id === u.id
                    ? 'border-[#1F3A5F] bg-[#1F3A5F]/5 font-semibold text-[#1F3A5F]'
                    : 'border-gray-200 hover:bg-gray-50 text-gray-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <UserCheck className={`w-4 h-4 ${selectedUser?.id === u.id ? 'text-[#1F3A5F]' : 'text-gray-400'}`} />
                  <span>{u.full_name}</span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-gray-600">
                  {roleLabels[u.role] || u.role}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* PIN Input & Keypad */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">رمز الدخول السري:</label>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="w-full h-12 text-center text-2xl font-mono tracking-widest border border-gray-300 rounded-md focus:border-[#1F3A5F] focus:outline-none"
              autoFocus
            />
          </div>

          {error && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 text-center font-medium">
              {error}
            </div>
          )}

          {/* Quick Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button
                key={num}
                type="button"
                onClick={() => handlePinDigit(num.toString())}
                className="h-11 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 border border-gray-200 rounded-md text-lg font-bold text-gray-800 transition-colors cursor-pointer"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin('')}
              className="h-11 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md text-xs font-bold text-gray-500 cursor-pointer"
            >
              مسح
            </button>
            <button
              type="button"
              onClick={() => handlePinDigit('0')}
              className="h-11 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md text-lg font-bold text-gray-800 cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-11 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md text-xs font-bold text-gray-600 cursor-pointer"
            >
              <Delete className="w-4 h-4 mx-auto" />
            </button>
          </div>

          <button
            type="submit"
            disabled={loading || !pin}
            className="w-full h-12 bg-[#1F3A5F] hover:bg-[#162a45] text-white font-bold rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? 'جاري التحقق...' : 'دخول النظام'}
          </button>
        </form>

        <div className="mt-4 pt-3 border-t border-gray-100 text-center text-xs text-gray-400">
          الرمز الافتراضي للبيانات التجريبية: <span className="font-mono text-gray-600 font-bold">1234</span>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
