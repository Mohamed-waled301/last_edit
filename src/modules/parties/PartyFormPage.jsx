import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CreditCard, 
  Phone, 
  MapPin, 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Save,
  Layers,
  FolderTree,
  Package,
  Search,
  Scale,
  Plus,
  X
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';
import MoneyInput from '../../components/MoneyInput';
import { toPiasters, fromPiasters, sanitizeDecimalInput } from '../../utils/money';
import {
  DEFAULT_PHONE_VALUE,
  sanitizeEgyptianPhoneInput,
  normalizePhoneForSave,
  validateEgyptianMobile,
  normalizePhoneForWhatsApp,
  isValidPhoneForWhatsApp,
  openWhatsAppChat,
} from '../../utils/phone';
import { handleFormKeyDown } from '../../utils/formNavigation';


export default function PartyFormPage({ partyId = null, initialRole = null, initialType = null, onSaved, onCancel, onBack, onNotify }) {
  const isEdit = Boolean(partyId);
  const effectiveRole = initialRole || initialType;

  // Single choice (supplier/customer) or both
  const [isBoth, setIsBoth] = useState(false);
  const [singleType, setSingleType] = useState(effectiveRole === 'customer' ? 'customer' : 'supplier');

  const [form, setForm] = useState({
    code: '',
    name: '',
    phone: '',
    address: '',
    tax_number: '',
    supplier_type: '', // required for suppliers
    credit_limit: '', // Blank or 0 means no limit
    supplier_opening_balance: '0',
    supplier_opening_type: 'credit',
    customer_opening_balance: '0',
    customer_opening_type: 'debit',
    // Supplier-item linking
    supplied_all_items: true,
    supplied_group_ids: [],
    supplied_section_ids: [],
    supplied_item_ids: [],
    notes: ''
  });

  // Current ledger balances for dual party netting display
  const [currentBalances, setCurrentBalances] = useState({
    supplier_balance: 0,
    customer_balance: 0,
    net_balance: 0,
    max_offset: 0
  });

  // Offset modal state
  const [showOffsetModal, setShowOffsetModal] = useState(false);
  const [offsetAmount, setOffsetAmount] = useState('');
  const [offsetNotes, setOffsetNotes] = useState('');
  const [offsetSubmitting, setOffsetSubmitting] = useState(false);

  const [itemsList, setItemsList] = useState([]);
  const [groupsList, setGroupsList] = useState([]);
  const [sectionsList, setSectionsList] = useState([]);
  const [itemSearchTerm, setItemSearchTerm] = useState('');

  const [activityTypes, setActivityTypes] = useState([]);
  const [quickAddActivityOpen, setQuickAddActivityOpen] = useState(false);
  const [newActivityName, setNewActivityName] = useState('');
  const [activityError, setActivityError] = useState('');

  const [errors, setErrors] = useState({});
  const [existingParties, setExistingParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isSupplier = isBoth || singleType === 'supplier';
  const isCustomer = isBoth || singleType === 'customer';

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (onCancel) {
      onCancel();
    } else {
      window.location.hash = isCustomer && !isSupplier ? '#/customers' : '#/suppliers';
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [partiesRes, itemsRes, groupsRes, sectionsRes, activitiesRes] = await Promise.all([
          api.getParties(),
          api.getItems(),
          api.getItemGroups(),
          api.getItemSections(),
          api.getSupplierActivityTypes()
        ]);

        const list = Array.isArray(partiesRes.data) ? partiesRes.data : (partiesRes.parties || []);
        setExistingParties(list);
        setItemsList(Array.isArray(itemsRes.data) ? itemsRes.data : (itemsRes.items || []));
        setGroupsList(Array.isArray(groupsRes.data) ? groupsRes.data : (groupsRes.groups || []));
        setSectionsList(Array.isArray(sectionsRes.data) ? sectionsRes.data : (sectionsRes.sections || []));
        setActivityTypes(Array.isArray(activitiesRes.data) ? activitiesRes.data : (activitiesRes.types || []));

        if (isEdit && partyId) {
          const res = await api.getParty(partyId);
          if (res && res.data) {
            const p = res.data;
            const dual = Boolean(p.is_supplier && p.is_customer);
            setIsBoth(dual);
            if (!dual) {
              setSingleType(p.is_customer ? 'customer' : 'supplier');
            }

            const supBal = Number(p.supplier_balance || 0);
            const custBal = Number(p.customer_balance || 0);
            const net = Number((custBal - supBal).toFixed(2));
            const maxOff = Math.min(Math.max(0, supBal), Math.max(0, custBal));

            setCurrentBalances({
              supplier_balance: supBal,
              customer_balance: custBal,
              net_balance: net,
              max_offset: maxOff
            });

            setForm({
              code: p.code || '',
              name: p.name || '',
              phone: p.phone || '',
              address: p.address || '',
              tax_number: p.tax_number || '',
              supplier_type: p.supplier_type === 'goods' ? 'توريد خامات ومستلزمات إنتاج' : (p.supplier_type || ''),
              credit_limit: p.credit_limit ? String(p.credit_limit) : '',
              supplier_opening_balance: String(p.supplier_opening_balance ?? p.opening_balance ?? 0),
              supplier_opening_type: p.supplier_opening_type || 'credit',
              customer_opening_balance: String(p.customer_opening_balance ?? p.opening_balance ?? 0),
              customer_opening_type: p.customer_opening_type || 'debit',
              supplied_all_items: p.supplied_all_items !== undefined ? Boolean(p.supplied_all_items) : true,
              supplied_group_ids: Array.isArray(p.supplied_group_ids) ? p.supplied_group_ids : [],
              supplied_section_ids: Array.isArray(p.supplied_section_ids) ? p.supplied_section_ids : [],
              supplied_item_ids: Array.isArray(p.supplied_item_ids) ? p.supplied_item_ids : [],
              notes: p.notes || ''
            });
          }
        } else {
          const nextNum = list.length + 1;
          const defaultCode = `PRT-${1000 + nextNum}`;
          setForm((prev) => ({ ...prev, code: defaultCode }));
        }
      } catch (err) {
        console.error('Failed to load party data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [partyId, isEdit, effectiveRole]);

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'اسم جهة التعامل مطلوب';
    if (!form.code.trim()) errs.code = 'كود جهة التعامل مطلوب';

    const phoneErr = validateEgyptianMobile(form.phone, { required: false });
    if (phoneErr) errs.phone = phoneErr;

    if (isSupplier) {
      if (!form.supplier_type) {
        errs.supplier_type = 'برجاء اختيار نوع نشاط المورد';
      }
      const supOpen = Number(form.supplier_opening_balance);
      if (form.supplier_opening_balance === '' || isNaN(supOpen) || supOpen < 0) {
        errs.supplier_opening_balance = 'رصيد أول المدة للمورد يجب أن يكون رقماً لا يقل عن صفر';
      }
    }
    if (isCustomer) {
      const custOpen = Number(form.customer_opening_balance);
      if (form.customer_opening_balance === '' || isNaN(custOpen) || custOpen < 0) {
        errs.customer_opening_balance = 'رصيد أول المدة للعميل يجب أن يكون رقماً لا يقل عن صفر';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleQuickAddActivity = async () => {
    const name = newActivityName.trim();
    if (!name) {
      setActivityError('اسم نوع النشاط مطلوب');
      return;
    }

    const isDuplicate = activityTypes.some(
      (t) => (t.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (isDuplicate) {
      setActivityError('نوع نشاط المورد مسجل مسبقاً');
      return;
    }

    try {
      setActivityError('');
      const res = await api.createSupplierActivityType({ name });
      const created = res.data || res.activityType || { id: `sat-${Date.now()}`, name };
      setActivityTypes((prev) => [...prev, created]);
      setForm((prev) => ({ ...prev, supplier_type: created.name }));
      if (errors.supplier_type) {
        setErrors((prev) => ({ ...prev, supplier_type: null }));
      }
      setNewActivityName('');
      setQuickAddActivityOpen(false);
      if (onNotify) onNotify(`تم إضافة نوع النشاط "${created.name}" بنجاح`);
    } catch (err) {
      setActivityError(err.message || 'تعذر إضافة نوع النشاط');
    }
  };

  const handlePhoneChange = (e) => {
    let raw = e?.target?.value ?? '';
    // Convert Arabic-Indic numerals (٠-٩) to Western (0-9)
    raw = raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
    // Keep only numeric digits, capped at 11 digits
    const digits = raw.replace(/\D/g, '').slice(0, 11);
    setForm((prev) => ({ ...prev, phone: digits }));
    if (errors.phone) {
      setErrors((prev) => ({ ...prev, phone: null }));
    }
  };

  const handleCreditLimitChange = (e) => {
    const val = e?.target?.value ?? e;
    setForm((prev) => ({ ...prev, credit_limit: val }));
  };

  const handleExecuteOffset = async () => {
    const num = Number(offsetAmount) || 0;
    if (num <= 0) {
      alert('مبلغ المقاصة يجب أن يكون أكبر من صفر');
      return;
    }
    if (num > currentBalances.max_offset) {
      alert(`مبلغ المقاصة لا يمكن أن يتجاوز الطرف الأقل (${currentBalances.max_offset} ج.م)`);
      return;
    }

    try {
      setOffsetSubmitting(true);
      const res = await api.executePartyOffset(partyId, num, offsetNotes);
      if (onNotify) onNotify(res.message || 'تم إجراء المقاصة بنجاح');
      setShowOffsetModal(false);

      // Refresh balances
      const updatedParty = await api.getParty(partyId);
      if (updatedParty?.data) {
        const p = updatedParty.data;
        const supBal = Number(p.supplier_balance || 0);
        const custBal = Number(p.customer_balance || 0);
        setCurrentBalances({
          supplier_balance: supBal,
          customer_balance: custBal,
          net_balance: Number((custBal - supBal).toFixed(2)),
          max_offset: Math.min(Math.max(0, supBal), Math.max(0, custBal))
        });
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء إجراء المقاصة');
    } finally {
      setOffsetSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      const supFlag = isBoth ? 1 : (singleType === 'supplier' ? 1 : 0);
      const custFlag = isBoth ? 1 : (singleType === 'customer' ? 1 : 0);

      const parsedLimit = form.credit_limit ? fromPiasters(toPiasters(form.credit_limit)) : 0;
      const parsedSupOpening = supFlag ? Math.max(0, fromPiasters(toPiasters(form.supplier_opening_balance))) : 0;
      const parsedCustOpening = custFlag ? Math.max(0, fromPiasters(toPiasters(form.customer_opening_balance))) : 0;

      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        phone: normalizePhoneForSave(form.phone),
        address: form.address.trim(),
        tax_number: form.tax_number.trim(),
        is_supplier: supFlag,
        is_customer: custFlag,
        supplier_type: form.supplier_type,
        credit_limit: parsedLimit,
        supplier_opening_balance: parsedSupOpening,
        supplier_opening_type: form.supplier_opening_type === 'debit' ? 'debit' : 'credit',
        customer_opening_balance: parsedCustOpening,
        customer_opening_type: form.customer_opening_type === 'credit' ? 'credit' : 'debit',
        supplied_all_items: form.supplied_all_items ? 1 : 0,
        supplied_group_ids: form.supplied_group_ids,
        supplied_section_ids: form.supplied_section_ids,
        supplied_item_ids: form.supplied_item_ids,
        notes: form.notes
      };

      let res;
      if (isEdit) {
        res = await api.updateParty(partyId, payload);
        if (onNotify) onNotify('تم تحديث بيانات جهة التعامل بنجاح');
      } else {
        res = await api.createParty(payload);
        if (onNotify) onNotify('تم إضافة جهة التعامل بنجاح');
      }

      const savedId = partyId || res?.data?.id || res?.party?.id;
      if (supFlag && savedId) {
        await api.setSupplierItems(savedId, form.supplied_item_ids || []).catch(() => {});
      }

      if (onSaved) {
        onSaved();
      } else {
        handleBack();
      }
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء حفظ جهة التعامل');
    } finally {
      setSaving(false);
    }
  };

  const filteredItemsForLink = itemsList.filter((item) => {
    const term = itemSearchTerm.trim().toLowerCase();
    if (!term) return true;
    return (
      (item.name || '').toLowerCase().includes(term) ||
      (item.code || '').toLowerCase().includes(term)
    );
  });

  const toggleLinkedItem = (itemId) => {
    setForm((prev) => {
      const exists = prev.supplied_item_ids.includes(itemId);
      const updated = exists
        ? prev.supplied_item_ids.filter((id) => id !== itemId)
        : [...prev.supplied_item_ids, itemId];
      return { ...prev, supplied_item_ids: updated };
    });
  };

  const toggleLinkedGroup = (groupId) => {
    setForm((prev) => {
      const exists = prev.supplied_group_ids.includes(groupId);
      const updated = exists
        ? prev.supplied_group_ids.filter((id) => id !== groupId)
        : [...prev.supplied_group_ids, groupId];
      return { ...prev, supplied_group_ids: updated };
    });
  };

  const toggleLinkedSection = (secId) => {
    setForm((prev) => {
      const exists = prev.supplied_section_ids.includes(secId);
      const updated = exists
        ? prev.supplied_section_ids.filter((id) => id !== secId)
        : [...prev.supplied_section_ids, secId];
      return { ...prev, supplied_section_ids: updated };
    });
  };

  const isFormValid = Boolean(form.name.trim() && form.code.trim() && (!isSupplier || Boolean(form.supplier_type)));

  if (loading) {
    return (
      <PageContainer title="بيانات جهة التعامل">
        <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500">
          جاري تحميل بيانات جهة التعامل...
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={isEdit ? `تعديل جهة التعامل: ${form.name}` : 'إضافة جهة تعامل'}
      subtitle="إدارة بيانات الموردين والعملاء، دعم صفة المورد والعميل المشتركة مع المقاصة والربط بالأصناف"
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <ArrowRight className="w-4 h-4" />
            <span>رجوع للقائمة</span>
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-xs text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'حفظ جهة التعامل'}</span>
          </button>
        </div>
      }
    >
      <form onSubmit={(e) => e.preventDefault()} onKeyDown={handleFormKeyDown} className="space-y-6">
        {/* Section 1: Party Type Selection with Single Both Checkbox */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Users className="w-5 h-5 text-blue-600" />
            تصنيف وصفة جهة التعامل
          </h2>

          <div className="space-y-4">
            {/* The single checkbox */}
            <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-lg">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isBoth}
                  onChange={(e) => setIsBoth(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded-sm focus:ring-indigo-500"
                />
                <span className="font-bold text-sm text-indigo-900">
                  عميل ومورد في نفس الوقت
                </span>
              </label>
              <p className="text-xs text-indigo-700 mt-1 mr-7">
                عند التحديد، تعتبر هذه الجهة عميلاً ومورداً معاً، ويتم فتح حسابين بدفتر الأستاذ مع تمكين المقاصة التلقائية.
              </p>
            </div>

            {/* When NOT both, choose single option */}
            {!isBoth && (
              <div className="flex items-center gap-6 pr-1">
                <span className="text-xs font-semibold text-slate-700">الصفة الفردية:</span>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-800">
                  <input
                    type="radio"
                    name="singleType"
                    value="supplier"
                    checked={singleType === 'supplier'}
                    onChange={() => setSingleType('supplier')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span>مورد (توريد خامات ومستلزمات)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-800">
                  <input
                    type="radio"
                    name="singleType"
                    value="customer"
                    checked={singleType === 'customer'}
                    onChange={() => setSingleType('customer')}
                    className="text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>عميل (شراء وتوزيع ملابس)</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Dual Party Netting & Settlement Card (When isBoth is active) */}
        {isBoth && isEdit && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Scale className="w-5 h-5 text-indigo-600" />
                <span>المركز المالي والمقاصة المشتركة (له / عليه / الصافي)</span>
              </h3>
              {currentBalances.max_offset > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setOffsetAmount(String(currentBalances.max_offset));
                    setOffsetNotes(`تسوية مقاصة متبادلة مع جهة التعامل ${form.name}`);
                    setShowOffsetModal(true);
                  }}
                  className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs"
                >
                  إجراء مقاصة تسوية
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
                <div className="text-xs font-semibold text-blue-700 mb-1">له (مستحقاته كمورد / مشتريات)</div>
                <div className="text-xl font-bold font-mono text-blue-900">
                  {formatCurrency(currentBalances.supplier_balance)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-xs font-semibold text-emerald-700 mb-1">عليه (مستحقاتنا كعميل / مبيعات)</div>
                <div className="text-xl font-bold font-mono text-emerald-900">
                  {formatCurrency(currentBalances.customer_balance)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-purple-50 border border-purple-200">
                <div className="text-xs font-semibold text-purple-700 mb-1">الصافي (مبيعات − مشتريات)</div>
                <div className={`text-xl font-bold font-mono ${currentBalances.net_balance >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                  {formatCurrency(Math.abs(currentBalances.net_balance))}
                  <span className="text-xs mr-1 font-sans">
                    ({currentBalances.net_balance >= 0 ? 'مستحق لنا' : 'مستحق له'})
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 3: Basic Identification & Contact */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            بيانات جهة التعامل ومعلومات الاتصال
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label htmlFor="party-code-input" className="block text-xs font-semibold text-slate-700 mb-1">
                كود جهة التعامل *
              </label>
              <input
                id="party-code-input"
                type="text"
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
                required
              />
              <FieldError error={errors.code} />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="party-name-input" className="block text-xs font-semibold text-slate-700 mb-1">
                الاسم / اسم الشركة أو المصنع *
              </label>
              <input
                id="party-name-input"
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
                required
              />
              <FieldError error={errors.name} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="party-phone-input" className="block text-xs font-semibold text-slate-700">
                  {isSupplier ? 'رقم التواصل مع المورد' : 'رقم الهاتف'}
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openWhatsAppChat(form.phone)}
                    disabled={!isValidPhoneForWhatsApp(form.phone)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                    title={!isValidPhoneForWhatsApp(form.phone) ? 'رقم الهاتف غير مسجل أو غير صالح للواتساب' : 'فتح محادثة واتساب'}
                  >
                    <span>واتساب</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const bal = isSupplier ? currentBalances.supplier_balance : currentBalances.customer_balance;
                      const msg = `السلام عليكم ورحمة الله، كشف حسابكم طرفنا مسجل برصيد: ${formatCurrency(bal)}.`;
                      openWhatsAppChat(form.phone, msg);
                    }}
                    disabled={!isValidPhoneForWhatsApp(form.phone)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-300 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                    title={!isValidPhoneForWhatsApp(form.phone) ? 'رقم الهاتف غير مسجل أو غير صالح للواتساب' : 'إرسال كشف الحساب الحالي عبر واتساب'}
                  >
                    <span>إرسال كشف الحساب</span>
                  </button>
                </div>
              </div>
              <input
                id="party-phone-input"
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={form.phone || ''}
                onChange={handlePhoneChange}
                className={`w-full px-3.5 py-2 border rounded-lg text-sm font-mono text-left bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 ${
                  errors.phone ? 'border-rose-500 bg-rose-50/30' : 'border-slate-300'
                }`}
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                رقم موبايل يبدأ بـ 01 ومكوّن من 11 رقماً
              </span>
              <FieldError error={errors.phone} />
            </div>

            <div>
              <label htmlFor="party-tax-input" className="block text-xs font-semibold text-slate-700 mb-1">
                الرقم الضريبي / السجل التجاري
              </label>
              <input
                id="party-tax-input"
                type="text"
                value={form.tax_number}
                onChange={(e) => setForm((prev) => ({ ...prev, tax_number: e.target.value }))}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>

            {/* Credit Limit: ALWAYS visible on customer records */}
            {isCustomer && (
              <div>
                <label htmlFor="party-credit-limit-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  الحد الائتماني للعميل (ج.م)
                </label>
                <MoneyInput
                  id="party-credit-limit-input"
                  dir="ltr"
                  value={form.credit_limit}
                  onChange={handleCreditLimitChange}
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-800 bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-left"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  اختياري؛ اتركه فارغاً أو 0 لعدم تحديد سقف ائتماني. يطبق فقط على الفواتير الآجلة.
                </span>
              </div>
            )}

            {isSupplier && (
              <div>
                <label htmlFor="party-supplier-type-select" className="block text-xs font-semibold text-slate-700 mb-1">
                  نوع نشاط المورد *
                </label>
                <div className="flex items-center gap-1.5">
                  <select
                    id="party-supplier-type-select"
                    value={form.supplier_type}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, supplier_type: e.target.value }));
                      if (errors.supplier_type) {
                        setErrors((prev) => ({ ...prev, supplier_type: null }));
                      }
                    }}
                    className={`flex-1 px-3.5 py-2 border rounded-lg text-sm bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800 ${
                      errors.supplier_type ? 'border-rose-500 bg-rose-50/30' : 'border-slate-300'
                    }`}
                  >
                    <option value="">-- اختر نوع نشاط المورد --</option>
                    {activityTypes.map((act) => (
                      <option key={act.id || act.name} value={act.name}>
                        {act.name}
                      </option>
                    ))}
                    {form.supplier_type && !activityTypes.some((act) => act.name === form.supplier_type) && (
                      <option value={form.supplier_type}>
                        {form.supplier_type === 'service'
                          ? 'خدمات تشغيل لدى الغير (سابق)'
                          : form.supplier_type === 'goods'
                            ? 'توريد خامات ومستلزمات إنتاج'
                            : form.supplier_type}
                      </option>
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickAddActivityOpen((prev) => !prev);
                      setActivityError('');
                    }}
                    className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-blue-600 transition-colors shrink-0 cursor-pointer"
                    title="إضافة نوع نشاط جديد"
                    aria-label="إضافة نوع نشاط جديد"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <FieldError error={errors.supplier_type} />

                {quickAddActivityOpen && (
                  <div className="mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                    <label htmlFor="quick-activity-name-input" className="block text-[11px] font-semibold text-blue-900">
                      اسم نوع النشاط الجديد *
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id="quick-activity-name-input"
                        type="text"
                        value={newActivityName}
                        onChange={(e) => {
                          setNewActivityName(e.target.value);
                          if (activityError) setActivityError('');
                        }}
                        className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-blue-300 rounded-md focus:outline-hidden focus:ring-1 focus:ring-blue-500 text-slate-800"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleQuickAddActivity}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold cursor-pointer"
                      >
                        حفظ
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickAddActivityOpen(false);
                          setNewActivityName('');
                          setActivityError('');
                        }}
                        className="px-2.5 py-1.5 text-xs bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                    {activityError && (
                      <div className="text-[11px] text-rose-600 font-semibold">{activityError}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="md:col-span-3">
              <label htmlFor="party-address-input" className="block text-xs font-semibold text-slate-700 mb-1">
                العنوان
              </label>
              <input
                id="party-address-input"
                type="text"
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Supplier-Item Linking ("الأصناف التي يوردها") */}
        {isSupplier && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-blue-600" />
                  الأصناف والخامات التي يوردها هذا المورد
                </h2>
                <span className="text-xs text-slate-500">
                  ربط المورد بالأصناف المحددة لفلترة منتقي الأصناف في أوامر الشراء افتراضياً
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs font-semibold text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="suppliedAll"
                    checked={form.supplied_all_items}
                    onChange={() => setForm((prev) => ({ ...prev, supplied_all_items: true }))}
                    className="text-blue-600"
                  />
                  <span>جميع الأصناف والخامات</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="suppliedAll"
                    checked={!form.supplied_all_items}
                    onChange={() => setForm((prev) => ({ ...prev, supplied_all_items: false }))}
                    className="text-blue-600"
                  />
                  <span>أصناف ومجموعات محددة</span>
                </label>
              </div>
            </div>

            {!form.supplied_all_items && (
              <div className="space-y-4 pt-2">
                {/* Groups & Sections multi-check */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <span className="block text-xs font-bold text-slate-800">
                      مجموعات الأصناف الموردة:
                    </span>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 text-xs">
                      {groupsList.map((g) => (
                        <label key={g.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded-sm">
                          <input
                            type="checkbox"
                            checked={form.supplied_group_ids.includes(g.id)}
                            onChange={() => toggleLinkedGroup(g.id)}
                            className="rounded-xs text-blue-600"
                          />
                          <span className="font-medium text-slate-800">{g.name}</span>
                          <span className="text-slate-400 font-mono">({g.code})</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <span className="block text-xs font-bold text-slate-800">
                      أقسام الأصناف الموردة:
                    </span>
                    <div className="max-h-36 overflow-y-auto space-y-1.5 text-xs">
                      {sectionsList.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded-sm">
                          <input
                            type="checkbox"
                            checked={form.supplied_section_ids.includes(s.id)}
                            onChange={() => toggleLinkedSection(s.id)}
                            className="rounded-xs text-blue-600"
                          />
                          <span className="font-medium text-slate-800">{s.name}</span>
                          <span className="text-slate-400 font-mono">({s.code})</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Individual Items multi-select with search */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-800">
                      أصناف فردية محددة ({form.supplied_item_ids.length} صنف محدد):
                    </span>
                    <div className="w-64">
                      <label htmlFor="search-supplier-items" className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                        بحث في الأصناف لربطها
                      </label>
                      <input
                        id="search-supplier-items"
                        type="text"
                        value={itemSearchTerm}
                        onChange={(e) => setItemSearchTerm(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                  </div>

                  <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                    {filteredItemsForLink.map((itm) => {
                      const isChecked = form.supplied_item_ids.includes(itm.id);
                      return (
                        <label
                          key={itm.id}
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-blue-50 border-blue-300 text-blue-900'
                              : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-800'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleLinkedItem(itm.id)}
                            className="rounded-xs text-blue-600"
                          />
                          <div className="truncate">
                            <span className="font-bold block truncate">{itm.name}</span>
                            <span className="text-[10px] text-slate-500 font-mono">{itm.code}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section 5: Opening Balances */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            رصيد أول المدة وطبيعة الحساب
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {isSupplier && (
              <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-xl space-y-3">
                <div className="text-xs font-bold text-blue-900">رصيد أول المدة للمورد (ج.م)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="sup-opening-bal" className="block text-xs font-semibold text-slate-700 mb-1">
                      المبلغ
                    </label>
                    <MoneyInput
                      id="sup-opening-bal"
                      dir="ltr"
                      value={form.supplier_opening_balance}
                      onChange={(e) => setForm((prev) => ({ ...prev, supplier_opening_balance: e.target.value }))}
                      className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm font-mono font-bold text-left bg-white text-slate-800"
                    />
                    <FieldError error={errors.supplier_opening_balance} />
                  </div>
                  <div>
                    <label htmlFor="sup-opening-type" className="block text-xs font-semibold text-slate-700 mb-1">
                      طبيعة الحساب
                    </label>
                    <select
                      id="sup-opening-type"
                      value={form.supplier_opening_type}
                      onChange={(e) => setForm((prev) => ({ ...prev, supplier_opening_type: e.target.value }))}
                      className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm bg-white font-semibold text-slate-800"
                    >
                      <option value="credit">دائن (مستحق له)</option>
                      <option value="debit">مدين (دفعة مقدمة له)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {isCustomer && (
              <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-3">
                <div className="text-xs font-bold text-emerald-900">رصيد أول المدة للعميل (ج.م)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="cust-opening-bal" className="block text-xs font-semibold text-slate-700 mb-1">
                      المبلغ
                    </label>
                    <MoneyInput
                      id="cust-opening-bal"
                      dir="ltr"
                      value={form.customer_opening_balance}
                      onChange={(e) => setForm((prev) => ({ ...prev, customer_opening_balance: e.target.value }))}
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm font-mono font-bold text-left bg-white text-slate-800"
                    />
                    <FieldError error={errors.customer_opening_balance} />
                  </div>
                  <div>
                    <label htmlFor="cust-opening-type" className="block text-xs font-semibold text-slate-700 mb-1">
                      طبيعة الحساب
                    </label>
                    <select
                      id="cust-opening-type"
                      value={form.customer_opening_type}
                      onChange={(e) => setForm((prev) => ({ ...prev, customer_opening_type: e.target.value }))}
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm bg-white font-semibold text-slate-800"
                    >
                      <option value="debit">مدين (مستحق عليه)</option>
                      <option value="credit">دائن (دفعة مقدمة منه)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section 6: Notes */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            ملاحظات وتفاصيل إضافية
          </h2>
          <div>
            <label htmlFor="party-notes-input" className="block text-xs font-semibold text-slate-700 mb-1">
              ملاحظات عامة حول جهة التعامل
            </label>
            <textarea
              id="party-notes-input"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={handleBack}
            className="px-5 py-2.5 text-sm text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-xs text-sm font-medium disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'حفظ جهة التعامل'}</span>
          </button>
        </div>
      </form>

      {/* Offset Settlement Modal */}
      {showOffsetModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 text-right space-y-5" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-base text-slate-900">إجراء مستند مقاصة وتسوية الأرصدة</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOffsetModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">رصيد المورد (مستحق له):</span>
                <span className="font-bold font-mono text-blue-900">{formatCurrency(currentBalances.supplier_balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">رصيد العميل (مستحق عليه):</span>
                <span className="font-bold font-mono text-emerald-900">{formatCurrency(currentBalances.customer_balance)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="font-bold text-slate-800">الحد الأقصى المتاح للتسوية:</span>
                <span className="font-bold font-mono text-indigo-700">{formatCurrency(currentBalances.max_offset)}</span>
              </div>
            </div>

            <div>
              <label htmlFor="offset-amount-input" className="block text-xs font-semibold text-slate-700 mb-1">
                مبلغ المقاصة المراد تسويته (ج.م) *
              </label>
              <MoneyInput
                id="offset-amount-input"
                value={offsetAmount}
                onChange={(val) => setOffsetAmount(val)}
                aria-label="مبلغ المقاصة المراد تسويته"
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                سيتم قيد سند صرف لمورد وسند قبض من عميل بنفس القيمة وتوليد إذن مقاصة رسمي في سجل التدقيق.
              </span>
            </div>

            <div>
              <label htmlFor="offset-notes-input" className="block text-xs font-semibold text-slate-700 mb-1">
                ملاحظات وبيان التسوية
              </label>
              <textarea
                id="offset-notes-input"
                rows={2}
                value={offsetNotes}
                onChange={(e) => setOffsetNotes(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowOffsetModal(false)}
                disabled={offsetSubmitting}
                className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleExecuteOffset}
                disabled={offsetSubmitting || !Number(offsetAmount)}
                className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {offsetSubmitting ? 'جاري الاعتماد...' : 'اعتماد المقاصة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
