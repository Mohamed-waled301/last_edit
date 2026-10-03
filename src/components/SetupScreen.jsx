import React, { useState } from 'react';
import { ShieldCheck, Factory, User, Lock, Sparkles, CheckCircle2 } from 'lucide-react';
import { usersRepo, backupRepo } from '../data';
import { setActiveUser } from '../services/api';

export const SetupScreen = ({ onComplete }) => {
  const [factoryName, setFactoryName] = useState('مجموعة القمة للصناعات المتطورة والأنظمة الذكية');
  const [ownerName, setOwnerName] = useState('م. خالد المنشاوي');
  const [pin, setPin] = useState('1234');
  const [confirmPin, setConfirmPin] = useState('1234');
  const [loadDemo, setLoadDemo] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!factoryName.trim()) {
      setError('يرجى كتابة اسم الشركة أو المؤسسة');
      return;
    }
    if (!ownerName.trim()) {
      setError('يرجى كتابة اسم المدير التنفيذي أو المالك');
      return;
    }
    if (!pin || pin.length < 4 || pin.length > 6) {
      setError('رمز الدخول (PIN) يجب أن يكون من 4 إلى 6 أرقام');
      return;
    }
    if (pin !== confirmPin) {
      setError('رمز الدخول وتأكيده غير متطابقين');
      return;
    }

    setLoading(true);
    try {
      if (loadDemo) {
        await backupRepo.loadDemoData('usr-owner');
        // Update owner name and factory name
        const user = await usersRepo.createOwner(factoryName.trim(), ownerName.trim(), pin);
        setActiveUser(user.id, user.role, user.full_name);
      } else {
        const user = await usersRepo.createOwner(factoryName.trim(), ownerName.trim(), pin);
        setActiveUser(user.id, user.role, user.full_name);
      }

      onComplete();
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء إعداد النظام');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-xl bg-white border border-gray-300 rounded-md p-8 shadow-none">
        {/* Brand Header */}
        <div className="text-center pb-6 border-b border-gray-200">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-[#1F3A5F]/10 border border-[#1F3A5F]/20 rounded-md mb-3 text-[#1F3A5F]">
            <Factory className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-[#1F2937]">مرحباً بك في نظام تخطيط موارد المؤسسات المتكامل</h1>
          <p className="text-gray-600 text-sm mt-1">Enterprise Resource Planning (ERP) - جاهز للتشغيل الفوري أوفلاين</p>
        </div>

        {/* Notice Badge */}
        <div className="my-5 p-3.5 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-900 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-800 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">أمان وتخزين محلي فائق السرعة:</span> جميع بيانات المؤسسة تُحفظ محلياً داخل المتصفح بأعلى معايير الأمان وبدون الحاجة لخوادم سحابية خارجية.
          </div>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">اسم الشركة أو المؤسسة الصناعية والتجارية *</label>
            <div className="relative">
              <input
                type="text"
                value={factoryName}
                onChange={(e) => setFactoryName(e.target.value)}
                className="w-full h-12 px-3 border border-gray-300 rounded-md text-base focus:border-[#1F3A5F] focus:outline-none"
                placeholder="مثال: مجموعة القمة للصناعات المتطورة"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">اسم المدير التنفيذي / المالك (CEO) *</label>
            <div className="relative">
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full h-12 px-3 border border-gray-300 rounded-md text-base focus:border-[#1F3A5F] focus:outline-none"
                placeholder="مثال: م. خالد المنشاوي"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">رمز الدخول (PIN) *</label>
              <input
                type="password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className="w-full h-12 px-3 border border-gray-300 rounded-md text-base tracking-widest text-center font-mono focus:border-[#1F3A5F] focus:outline-none"
                placeholder="4-6 أرقام"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">تأكيد رمز الدخول *</label>
              <input
                type="password"
                maxLength={6}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                className="w-full h-12 px-3 border border-gray-300 rounded-md text-base tracking-widest text-center font-mono focus:border-[#1F3A5F] focus:outline-none"
                placeholder="أعد إدخال الرمز"
                required
              />
            </div>
          </div>

          {/* Load Demo Data Checkbox */}
          <div className="p-3.5 border border-gray-200 rounded-md bg-gray-50 flex items-center justify-between cursor-pointer" onClick={() => setLoadDemo(!loadDemo)}>
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-[#1F3A5F]" />
              <div>
                <div className="text-sm font-bold text-gray-800">تحميل البيانات التجريبية للمؤسسة (Enterprise Demo)</div>
                <div className="text-xs text-gray-500">سلاسل إمداد، خامات، شجرة منتجات BOM، أوامر تشغيل، وفواتير مبيعات نموذجية</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={loadDemo}
              onChange={(e) => setLoadDemo(e.target.checked)}
              className="w-5 h-5 text-[#1F3A5F] rounded border-gray-300 cursor-pointer"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 mt-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white font-bold rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span>جاري تهيئة النظام...</span>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>حفظ وبدء العمل على النظام</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetupScreen;
