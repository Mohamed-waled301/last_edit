import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CreditCard, 
  Phone, 
  MapPin, 
  FileText, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';

/**
 * Format string/number with thousand separators using Western digits (0-9)
 */
function formatNumberWithSeparators(val) {
  if (val === null || val === undefined || val === '') return '';
  const clean = String(val).replace(/[^0-9]/g, '');
  if (!clean) return '';
  return Number(clean).toLocaleString('en-US');
}

export default function PartyFormPage({ partyId = null, initialRole = null, initialType = null, onSaved, onCancel, onBack, onNotify }) {
  const isEdit = Boolean(partyId);
  const effectiveRole = initialRole || initialType;

  const [form, setForm] = useState({
    code: '',
    name: '',
    phone: '',
    address: '',
    tax_number: '',
    is_supplier: effectiveRole === 'supplier' || (effectiveRole !== 'customer' && effectiveRole === null),
    is_customer: effectiveRole === 'customer',
    supplier_type: 'goods', // 'goods' | 'service' (تشغيل وتصنيع خارجي)
    customer_deal_type: 'cash', // 'cash' (نقدي) | 'credit' (آجل) - default: نقدي
    credit_limit: '50000', // Stored in form state so switching back restores it
    payment_terms: 'cash',
    notes: ''
  });

  const [errors, setErrors] = useState({});
  const [existingParties, setExistingParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const partiesRes = await api.getParties();
        const list = Array.isArray(partiesRes.data) ? partiesRes.data : [];
        setExistingParties(list);

        if (isEdit && partyId) {
          const res = await api.getParty(partyId);
          if (res && res.data) {
            const p = res.data;
            const dealType = p.customer_deal_type || (p.credit_limit && Number(p.credit_limit) > 0 ? 'credit' : (p.payment_terms === 'credit' ? 'credit' : 'cash'));
            setForm({
              code: p.code || '',
              name: p.name || '',
              phone: p.phone || '',
              address: p.address || '',
              tax_number: p.tax_number || '',
              is_supplier: Boolean(p.is_supplier),
              is_customer: Boolean(p.is_customer),
              supplier_type: p.supplier_type || 'goods',
              customer_deal_type: dealType,
              credit_limit: p.credit_limit && Number(p.credit_limit) > 0 ? String(p.credit_limit) : '50000',
              payment_terms: p.payment_terms || 'cash',
              notes: p.notes || ''
            });
          }
        } else {
          const nextNum = list.length + 1;
          const defaultCode = `PRT-${1000 + nextNum}`;
          setForm(prev => ({ ...prev, code: defaultCode }));
        }
      } catch (err) {
        console.error('Failed to load party data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [partyId, isEdit, initialRole, initialType]);

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'اسم جهة التعامل مطلوب';
    if (!form.code.trim()) errs.code = 'كود جهة التعامل مطلوب';
    if (!form.is_supplier && !form.is_customer) {
      errs.role = 'يرجى تحديد صفة جهة التعامل على الأقل (مورد أو عميل أو كلاهما)';
    }

    // Validation: credit limit is required and must be greater than 0 ONLY when "آجل" is selected
    if (form.is_customer && form.customer_deal_type === 'credit') {
      const num = Number(form.credit_limit);
      if (!form.credit_limit || isNaN(num) || num <= 0) {
        errs.credit_limit = 'الحد الائتماني مطلوب ويجب أن يكون أكبر من 0 للتعامل الآجل';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreditLimitChange = (e) => {
    const rawDigits = e.target.value.replace(/[^0-9]/g, '');
    setForm(prev => ({ ...prev, credit_limit: rawDigits }));
    if (errors.credit_limit) {
      setErrors(prev => ({ ...prev, credit_limit: null }));
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      const isCreditCustomer = form.is_customer && form.customer_deal_type === 'credit';
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        tax_number: form.tax_number.trim(),
        is_supplier: form.is_supplier ? 1 : 0,
        is_customer: form.is_customer ? 1 : 0,
        supplier_type: form.supplier_type,
        customer_deal_type: form.is_customer ? form.customer_deal_type : 'cash',
        credit_limit: isCreditCustomer ? (Number(form.credit_limit) || 0) : 0, // Stored only when type is 'credit', otherwise 0
        payment_terms: form.payment_terms,
        notes: form.notes
      };

      if (isEdit) {
        await api.updateParty(partyId, payload);
        if (onNotify) onNotify('تم تحديث بيانات جهة التعامل بنجاح');
      } else {
        await api.createParty(payload);
        if (onNotify) onNotify('تم إضافة جهة التعامل بنجاح');
      }

      if (onSaved) {
        onSaved();
      } else if (onBack) {
        onBack();
      } else {
        const dest = form.is_customer && !form.is_supplier ? '#/customers' : '#/suppliers';
        window.location.hash = dest;
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء حفظ جهة التعامل');
    } finally {
      setSaving(false);
    }
  };

  const isCreditValid = !form.is_customer || form.customer_deal_type !== 'credit' || (Number(form.credit_limit) > 0);
  const isFormValid = Boolean(
    form.name.trim() && 
    form.code.trim() && 
    (form.is_supplier || form.is_customer) &&
    isCreditValid
  );

  return (
    <PageContainer
      title={isEdit ? `تعديل جهة التعامل: ${form.name}` : 'إضافة جهة تعامل (مورد / عميل)'}
      subtitle="شاشة موحدة لإدارة الموردين والعملاء، دعم صفة المورد والعميل معاً، والحد الائتماني للعميل"
      breadcrumbs={[
        { label: form.is_customer && !form.is_supplier ? 'العملاء' : 'الموردين', href: form.is_customer && !form.is_supplier ? '#/customers' : '#/suppliers' },
        { label: isEdit ? 'تعديل جهة التعامل' : 'إضافة جديد' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => { window.history.back(); }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText={isEdit ? 'حفظ التعديلات' : 'حفظ جهة التعامل'}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Checkbox Roles Selector (مورد / عميل) */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-3">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-2">
            <Users className="w-5 h-5 text-[#1F3A5F]" />
            صفة جهة التعامل (مورد / عميل / كلاهما)
          </h2>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="flex items-center gap-2.5 cursor-pointer bg-blue-50/60 hover:bg-blue-50 px-4 py-2.5 rounded-md border border-blue-200 transition-colors">
              <input
                type="checkbox"
                checked={form.is_supplier}
                onChange={(e) => setForm(prev => ({ ...prev, is_supplier: e.target.checked }))}
                className="w-4 h-4 text-[#1F3A5F] rounded-xs cursor-pointer"
              />
              <span className="font-bold text-sm text-gray-800">مورد (توريد خامات أو تشغيل خارجي)</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer bg-emerald-50/60 hover:bg-emerald-50 px-4 py-2.5 rounded-md border border-emerald-200 transition-colors">
              <input
                type="checkbox"
                checked={form.is_customer}
                onChange={(e) => setForm(prev => ({ ...prev, is_customer: e.target.checked }))}
                className="w-4 h-4 text-emerald-600 rounded-xs cursor-pointer"
              />
              <span className="font-bold text-sm text-gray-800">عميل (مبيعات وفواتير)</span>
            </label>
          </div>
          <FieldError error={errors.role} />
          {form.is_supplier && form.is_customer && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs font-semibold text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                جهة التعامل هذه مسجلة كـ (مورد وعميل في آن واحد). سيتم احتساب صافي الرصيد تلقائياً وإتاحة إجراء المقاصة بين رصيد التوريد ورصيد البيع.
              </span>
            </div>
          )}
        </div>

        {/* Section 2: Contact & Identification */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
            البيانات الأساسية ومعلومات الاتصال
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                كود جهة التعامل <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm(prev => ({ ...prev, code: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
              <FieldError error={errors.code} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                الاسم / اسم الشركة أو المصنع <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="مثال: شركة النيل للغزل والنسيج أو محلات الأناقة"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                required
              />
              <FieldError error={errors.name} />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                رقم الهاتف
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="01012345678"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                الرقم الضريبي / السجل
              </label>
              <input
                type="text"
                value={form.tax_number}
                onChange={(e) => setForm(prev => ({ ...prev, tax_number: e.target.value }))}
                placeholder="9 أرقام ضريبية"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                شروط السداد الافتراضية
              </label>
              <select
                value={form.payment_terms}
                onChange={(e) => setForm(prev => ({ ...prev, payment_terms: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              >
                <option value="cash">نقدي</option>
                <option value="credit">آجل</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-gray-700 mb-1">
                العنوان
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
                placeholder="المدينة، المنطقة، الشارع..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Conditional Financial Rules */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-green-700" />
            الضوابط المالية والتشغيلية
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer Side Controls */}
            {form.is_customer && (
              <div className={`p-4 bg-emerald-50/50 border border-emerald-200 rounded-md space-y-3 ${!form.is_supplier ? 'md:col-span-2' : ''}`}>
                <div>
                  <label htmlFor="customer-deal-type-select" className="block text-xs font-bold text-emerald-900 mb-1">
                    نوع التعامل
                  </label>
                  <select
                    id="customer-deal-type-select"
                    value={form.customer_deal_type}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setForm(prev => ({ ...prev, customer_deal_type: newType }));
                      if (errors.credit_limit) {
                        setErrors(prev => ({ ...prev, credit_limit: null }));
                      }
                    }}
                    className="w-full px-3 py-2 border border-emerald-300 rounded-md text-sm bg-white font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-emerald-600 cursor-pointer"
                  >
                    <option value="cash">نقدي</option>
                    <option value="credit">آجل</option>
                  </select>
                </div>

                {/* Show credit limit ONLY when deal type is credit */}
                {form.customer_deal_type === 'credit' && (
                  <div id="credit-limit-container" className="space-y-1">
                    <label htmlFor="party-credit-limit-input" className="block text-xs font-bold text-emerald-900 mb-1">
                      الحد الائتماني للعميل (ج.م) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        id="party-credit-limit-input"
                        name="credit_limit"
                        value={formatNumberWithSeparators(form.credit_limit)}
                        onChange={handleCreditLimitChange}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-emerald-300 rounded-md text-sm font-mono font-bold text-emerald-800 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600 text-left"
                        style={{ direction: 'ltr', fontVariantNumeric: 'tabular-nums' }}
                        required={true}
                      />
                    </div>
                    <span className="text-[11px] text-emerald-700 mt-1 block">
                      يطبق على فواتير المبيعات الآجلة فقط، ويمنع حفظ الفاتورة عند تجاوز المديونية لهذا الحد.
                    </span>
                    <FieldError error={errors.credit_limit} />
                  </div>
                )}
              </div>
            )}

            {/* Supplier Side Controls */}
            {form.is_supplier && (
              <div className={`p-4 bg-blue-50/50 border border-blue-200 rounded-md space-y-1 ${!form.is_customer ? 'md:col-span-2' : ''}`}>
                <label htmlFor="supplier-type-select" className="block text-xs font-bold text-blue-900 mb-1">
                  نوع نشاط المورد
                </label>
                <select
                  id="supplier-type-select"
                  value={form.supplier_type}
                  onChange={(e) => setForm(prev => ({ ...prev, supplier_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-blue-300 rounded-md text-sm bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
                >
                  <option value="goods">توريد خامات ومستلزمات إنتاج</option>
                  <option value="service">مصنع تشغيل خارجي لدى الغير (خدمات تطريز / غسيل / حياكة)</option>
                </select>
                <span className="text-[11px] text-blue-700 mt-1 block">
                  مورد الخدمة يُستخدم في شاشة التصنيع لدى الغير واحتساب التكاليف التراكمية.
                </span>
              </div>
            )}

            {!form.is_customer && !form.is_supplier && (
              <div className="md:col-span-2 p-4 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-500">
                يرجى تحديد صفة جهة التعامل (مورد أو عميل) أعلاه لتفعيل الضوابط الخاصة بها.
              </div>
            )}
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
