import React, { useState, useEffect, useRef } from 'react';
import { Store, X, Save, AlertTriangle } from 'lucide-react';
import { api } from '../../services/api';

export default function QuickOutletModal({ isOpen, onClose, onCreated, onNotify }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [markup, setMarkup] = useState('0');
  const [initialBalance, setInitialBalance] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const nameInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setCode(`OUT-${Date.now().toString().slice(-4)}`);
      setLocation('');
      setPhone('');
      setMarkup('0');
      setInitialBalance('0');
      setNotes('');
      setError('');
      setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('يرجى إدخال اسم المعرض أو المنفذ');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const payload = {
        name: trimmedName,
        code: code.trim(),
        location: location.trim(),
        contact_phone: phone.trim(),
        price_markup_percent: Number(markup) || 0,
        initial_balance: Math.max(0, Number(initialBalance) || 0),
        notes: notes.trim(),
        is_active: 1,
      };

      const res = await api.createOutlet(payload);
      const created = res.data || res.outlet;
      if (onNotify) {
        onNotify(`تمت إضافة الفرع "${trimmedName}" بنجاح وتجهيز خزينته النقدية`);
      }
      if (onCreated) {
        onCreated(created);
      }
      onClose();
    } catch (err) {
      console.error('Failed to create outlet:', err);
      setError(err.message || 'حدث خطأ أثناء حفظ بيانات المنفذ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-outlet-title"
    >
      <div
        className="bg-white rounded-lg shadow-2xl border border-gray-200 max-w-lg w-full overflow-hidden text-right"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-[#1F3A5F] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-blue-200" />
            <h3 id="quick-outlet-title" className="font-bold text-sm">
              إضافة فرع / معرض جديد سريعاً
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="إغلاق النافذة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="quick-outlet-name" className="block font-bold text-gray-700 mb-1">
                اسم الفرع / المعرض <span className="text-red-500">*</span>
              </label>
              <input
                id="quick-outlet-name"
                ref={nameInputRef}
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1F3A5F] text-xs font-semibold"
              />
            </div>

            <div>
              <label htmlFor="quick-outlet-code" className="block font-bold text-gray-700 mb-1">
                كود الفرع
              </label>
              <input
                id="quick-outlet-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="quick-outlet-location" className="block font-bold text-gray-700 mb-1">
                الموقع / العنوان
              </label>
              <input
                id="quick-outlet-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1F3A5F] text-xs"
              />
            </div>

            <div>
              <label htmlFor="quick-outlet-phone" className="block font-bold text-gray-700 mb-1">
                هاتف التواصل
              </label>
              <input
                id="quick-outlet-phone"
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1F3A5F] text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="quick-outlet-markup" className="block font-bold text-gray-700 mb-1">
                نسبة الزيادة السعرية (%)
              </label>
              <input
                id="quick-outlet-markup"
                type="number"
                min="0"
                step="0.5"
                value={markup}
                onChange={(e) => setMarkup(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-[#1F3A5F] text-xs"
              />
              <span className="text-[10px] text-gray-400 mt-0.5 block">زيادة تلقائية فوق سعر البيع القياسي</span>
            </div>

            <div>
              <label htmlFor="quick-outlet-balance" className="block font-bold text-gray-700 mb-1">
                رصيد الخزينة الافتتاحي (ج.م)
              </label>
              <input
                id="quick-outlet-balance"
                type="number"
                min="0"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono font-bold text-green-700 focus:outline-none focus:ring-1 focus:ring-[#1F3A5F] text-xs"
              />
              <span className="text-[10px] text-gray-400 mt-0.5 block">رصيد العهدة النقدية في درج المعرض</span>
            </div>
          </div>

          <div>
            <label htmlFor="quick-outlet-notes" className="block font-bold text-gray-700 mb-1">
              ملاحظات
            </label>
            <textarea
              id="quick-outlet-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#1F3A5F] text-xs"
            />
            <p className="text-xs text-gray-500 mt-1">أي ملاحظات إضافية عن الفرع أو المسؤول</p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-bold transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white font-bold rounded-md shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'جاري الحفظ...' : 'حفظ واختيار الفرع'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
