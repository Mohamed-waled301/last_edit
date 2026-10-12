import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Layers, 
  Trash2, 
  Download, 
  Search, 
  CheckCircle2, 
  X, 
  Users, 
  Tag, 
  Palette, 
  MapPin, 
  CreditCard, 
  Receipt, 
  Image as ImageIcon,
  ArrowRightLeft,
  AlertCircle
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';
import { compressImageToBase64 } from '../utils/imageCompressor';
import { Validators, FieldError } from '../utils/validation';
import {
  DEFAULT_PHONE_VALUE,
  sanitizeEgyptianPhoneInput,
  normalizePhoneForSave,
  validateEgyptianMobile,
} from '../utils/phone';

export default function ProductsModule({ onBack, onNotify }) {
  const [activeTab, setActiveTab] = useState('items'); // 'items' | 'parties' | 'sizes_colors' | 'locations' | 'expenses' | 'payment_methods' | 'bom'
  const [items, setItems] = useState([]);
  const [parties, setParties] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [colors, setColors] = useState([]);
  const [locations, setLocations] = useState([]);
  const [expenseCodes, setExpenseCodes] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showAddPartyModal, setShowAddPartyModal] = useState(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [showOffsetModal, setShowOffsetModal] = useState(null); // party object
  const [showBOMModal, setShowBOMModal] = useState(null); // item object

  // New Item Form State
  const [itemForm, setItemForm] = useState({
    code: '',
    name: '',
    item_group: 'ملابس رجالي كاجوال',
    item_department: 'قسم البولو والتيشيرت',
    item_type: 'finished', // 'finished' | 'raw_material'
    image: '',
    unit: 'قطعة',
    cost_price: '',
    selling_price: '',
    min_issue_qty: '50',
    opening_balance: '0',
    variants: [],
    notes: ''
  });
  const [selectedSizes, setSelectedSizes] = useState([]);
  const [selectedColors, setSelectedColors] = useState([]);
  const [imagePreview, setImagePreview] = useState(null);

  // New Party Form State
  const [partyForm, setPartyForm] = useState({
    code: '',
    name: '',
    phone: DEFAULT_PHONE_VALUE,
    address: '',
    tax_number: '',
    is_supplier: true,
    is_customer: false,
    supplier_type: 'goods', // 'goods' | 'service'
    payment_terms: 'credit',
    credit_limit: '',
    opening_balance: '0',
    opening_balance_type: 'credit', // المورد دائن افتراضياً
    notes: ''
  });

  // Offset Form State
  const [offsetForm, setOffsetForm] = useState({
    amount: '',
    notes: ''
  });

  // Expense Code Form State
  const [expenseForm, setExpenseForm] = useState({
    code: '',
    name: '',
    default_amount: '',
    category: 'operating',
    notes: ''
  });

  // Size / Color quick form state
  const [newSizeName, setNewSizeName] = useState('');
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#1F3A5F');

  // Location Form State
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationType, setNewLocationType] = useState('warehouse');

  // Payment Method Form State
  const [newMethodName, setNewMethodName] = useState('');

  // BOM Form State
  const [bomItems, setBomItems] = useState([]);

  // Form Errors State
  const [itemErrors, setItemErrors] = useState({});
  const [partyErrors, setPartyErrors] = useState({});
  const [expenseErrors, setExpenseErrors] = useState({});

  const loadData = async () => {
    try {
      setLoading(true);
      const [itRes, ptyRes, szRes, clrRes, locRes, expRes, pmRes, matRes] = await Promise.all([
        api.getItems(),
        api.getParties(),
        api.getItemSizes(),
        api.getItemColors(),
        api.getStorageLocations(),
        api.getExpenseCodes(),
        api.getPaymentMethods(),
        api.getRawMaterials()
      ]);
      setItems(itRes.data || []);
      setParties(ptyRes.data || []);
      setSizes(szRes.data || []);
      setColors(clrRes.data || []);
      setLocations(locRes.data || []);
      setExpenseCodes(expRes.data || []);
      setPaymentMethods(pmRes.data || []);
      setRawMaterials(matRes.data || []);
    } catch (err) {
      console.error('Failed to load master data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Pre-load next code when opening Add Item Modal
  const handleOpenAddItem = async () => {
    try {
      const codeRes = await api.getNextItemCode();
      setItemForm({
        code: codeRes.data || '',
        name: '',
        item_group: 'ملابس رجالي كاجوال',
        item_department: 'قسم البولو والتيشيرت',
        item_type: 'finished',
        image: '',
        unit: 'قطعة',
        cost_price: '',
        selling_price: '',
        min_issue_qty: '50',
        opening_balance: '0',
        variants: [],
        notes: ''
      });
      setSelectedSizes([]);
      setSelectedColors([]);
      setImagePreview(null);
      setItemErrors({});
      setShowAddItemModal(true);
    } catch (e) {
      console.error(e);
      setShowAddItemModal(true);
    }
  };

  // Image Upload Handler with Compression
  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedBase64 = await compressImageToBase64(file, 500, 500, 0.7);
      setItemForm(prev => ({ ...prev, image: compressedBase64 }));
      setImagePreview(compressedBase64);
    } catch (err) {
      alert(err.message || 'فشل ضغط الصورة');
    }
  };

  // Generate Variants Matrix from selected sizes and colors
  useEffect(() => {
    if (selectedSizes.length > 0 && selectedColors.length > 0) {
      const newVars = [];
      for (const s of selectedSizes) {
        for (const c of selectedColors) {
          const existing = itemForm.variants.find(v => v.size === s && v.color === c);
          newVars.push({
            id: existing ? existing.id : `var-${Date.now()}-${s}-${c}`,
            size: s,
            color: c,
            sku: `${itemForm.code || 'ITM'}-${s}-${c}`,
            opening_balance: existing ? existing.opening_balance : '0',
            current_stock: existing ? existing.current_stock : '0'
          });
        }
      }
      setItemForm(prev => ({ ...prev, variants: newVars }));
    } else {
      setItemForm(prev => ({ ...prev, variants: [] }));
    }
  }, [selectedSizes, selectedColors]);

  // Validate Item Form
  const validateItemForm = () => {
    const errors = {};
    const reqCode = Validators.required(itemForm.code, 'كود الصنف');
    if (reqCode) errors.code = reqCode;

    const uniqueCode = Validators.uniqueCode(itemForm.code, items);
    if (uniqueCode) errors.code = uniqueCode;

    const reqName = Validators.required(itemForm.name, 'اسم الصنف أو الموديل');
    if (reqName) errors.name = reqName;

    const posCost = Validators.positiveNumber(itemForm.cost_price, 'سعر التكلفة');
    if (posCost) errors.cost_price = posCost;

    if (itemForm.item_type === 'finished') {
      const posSell = Validators.positiveNumber(itemForm.selling_price, 'سعر البيع');
      if (posSell) errors.selling_price = posSell;
    }

    const posMin = Validators.positiveNumber(itemForm.min_issue_qty, 'الحد الأدنى للصرف أو التشغيل');
    if (posMin) errors.min_issue_qty = posMin;

    setItemErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save Item
  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!validateItemForm()) return;

    try {
      const payload = {
        ...itemForm,
        cost_price: Number(itemForm.cost_price),
        selling_price: Number(itemForm.selling_price) || 0,
        min_issue_qty: Number(itemForm.min_issue_qty) || 1,
        opening_balance: Number(itemForm.opening_balance) || 0,
        variants: itemForm.variants.map(v => ({
          ...v,
          opening_balance: Number(v.opening_balance) || 0,
          current_stock: Number(v.current_stock ?? v.opening_balance) || 0
        }))
      };
      const res = await api.createItem(payload);
      onNotify(res.message);
      setShowAddItemModal(false);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Validate Party Form
  const validatePartyForm = () => {
    const errors = {};
    const reqName = Validators.required(partyForm.name, 'اسم جهة التعامل');
    if (reqName) errors.name = reqName;

    if (!partyForm.is_supplier && !partyForm.is_customer) {
      errors.type = 'يجب تحديد نوع الجهة كـ (مورد) أو (عميل) أو كلاهما';
    }

    const phoneErr = validateEgyptianMobile(partyForm.phone, { required: false });
    if (phoneErr) errors.phone = phoneErr;

    if (partyForm.is_customer && partyForm.credit_limit) {
      const posLimit = Validators.nonNegativeNumber(partyForm.credit_limit, 'الحد الائتماني');
      if (posLimit) errors.credit_limit = posLimit;
    }

    const openNum = Number(partyForm.opening_balance);
    if (partyForm.opening_balance === '' || isNaN(openNum) || openNum < 0) {
      errors.opening_balance = 'رصيد أول المدة يجب أن يكون رقماً لا يقل عن صفر';
    }

    setPartyErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Save Unified Party
  const handleSaveParty = async (e) => {
    e.preventDefault();
    if (!validatePartyForm()) return;

    try {
      const roleDefaultType = partyForm.is_customer && !partyForm.is_supplier ? 'debit' : 'credit';
      const openingType = partyForm.opening_balance_type === 'debit' ? 'debit' : (partyForm.opening_balance_type === 'credit' ? 'credit' : roleDefaultType);
      const payload = {
        ...partyForm,
        phone: normalizePhoneForSave(partyForm.phone),
        opening_balance: Math.max(0, Number(partyForm.opening_balance) || 0),
        opening_balance_type: openingType,
        supplier_opening_balance: partyForm.is_supplier ? Math.max(0, Number(partyForm.opening_balance) || 0) : 0,
        supplier_opening_type: partyForm.is_supplier ? openingType : 'credit',
        customer_opening_balance: partyForm.is_customer ? Math.max(0, Number(partyForm.opening_balance) || 0) : 0,
        customer_opening_type: partyForm.is_customer ? openingType : 'debit',
      };
      const res = await api.createParty(payload);
      onNotify(res.message);
      setShowAddPartyModal(false);
      setPartyForm({
        code: '',
        name: '',
        phone: DEFAULT_PHONE_VALUE,
        address: '',
        tax_number: '',
        is_supplier: true,
        is_customer: false,
        supplier_type: 'goods',
        payment_terms: 'credit',
        credit_limit: '',
        opening_balance: '0',
        opening_balance_type: 'credit',
        notes: ''
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Execute Offset
  const handleExecuteOffset = async (e) => {
    e.preventDefault();
    if (!showOffsetModal) return;
    const amount = Number(offsetForm.amount);
    if (isNaN(amount) || amount <= 0) {
      alert('مبلغ المقاصة يجب أن يكون رقماً أكبر من صفر');
      return;
    }
    if (amount > showOffsetModal.max_offset_amount) {
      alert(`مبلغ المقاصة لا يمكن أن يتجاوز الحد المتاح (${showOffsetModal.max_offset_amount} ج.م)`);
      return;
    }
    try {
      const res = await api.executePartyOffset(showOffsetModal.id, amount, offsetForm.notes);
      onNotify(res.message);
      setShowOffsetModal(null);
      setOffsetForm({ amount: '', notes: '' });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Save Expense Code
  const handleSaveExpenseCode = async (e) => {
    e.preventDefault();
    const reqName = Validators.required(expenseForm.name, 'اسم كود المصروف');
    if (reqName) {
      setExpenseErrors({ name: reqName });
      return;
    }
    try {
      const res = await api.createExpenseCode(expenseForm);
      onNotify(res.message);
      setShowAddExpenseModal(false);
      setExpenseForm({ code: '', name: '', default_amount: '', category: 'operating', notes: '' });
      setExpenseErrors({});
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Quick Add Size
  const handleAddSize = async () => {
    if (!newSizeName.trim()) return;
    try {
      await api.createItemSize({ name: newSizeName.trim(), code: newSizeName.trim() });
      setNewSizeName('');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Quick Add Color
  const handleAddColor = async () => {
    if (!newColorName.trim()) return;
    try {
      await api.createItemColor({ name: newColorName.trim(), hex_code: newColorHex });
      setNewColorName('');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Quick Add Location
  const handleAddLocation = async () => {
    if (!newLocationName.trim()) return;
    try {
      await api.createStorageLocation({ name: newLocationName.trim(), location_type: newLocationType });
      setNewLocationName('');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Quick Add Payment Method
  const handleAddPaymentMethod = async () => {
    if (!newMethodName.trim()) return;
    try {
      await api.createPaymentMethod({ name: newMethodName.trim() });
      setNewMethodName('');
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Open BOM Modal for Product
  const handleOpenBOM = (item) => {
    setShowBOMModal(item);
    const existingBom = (item.bom_items || []).map(b => ({
      raw_material_id: b.raw_material_id,
      quantity_per_unit: b.quantity_per_unit || '1',
      waste_percent: b.waste_percent || '8',
      notes: b.notes || ''
    }));
    setBomItems(existingBom.length > 0 ? existingBom : [{ raw_material_id: '', quantity_per_unit: '', waste_percent: '8', notes: '' }]);
  };

  const handleSaveBOM = async (e) => {
    e.preventDefault();
    if (!showBOMModal) return;
    const valid = bomItems.filter(b => b.raw_material_id && Number(b.quantity_per_unit) > 0);
    if (valid.length === 0) {
      alert('يرجى تحديد خامة واحدة على الأقل في شجرة المكونات');
      return;
    }
    try {
      await api.updateProduct(showBOMModal.id, {
        bom_items: valid.map(b => ({
          raw_material_id: b.raw_material_id,
          quantity_per_unit: Number(b.quantity_per_unit),
          waste_percent: Number(b.waste_percent) || 0,
          notes: b.notes
        }))
      });
      onNotify('تم حفظ شجرة المكونات ونسب الهالك بنجاح');
      setShowBOMModal(null);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredItems = items.filter(it =>
    (it.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (it.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (it.item_group || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredParties = parties.filter(p =>
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.phone || '').includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-none">البيانات الأساسية والأصناف</h2>
            <span className="text-xs text-gray-500 font-medium">دليل الأصناف والمقاسات والألوان، جهات التعامل الموحدة، ومستودعات التخزين</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'items' && (
            <button
              onClick={handleOpenAddItem}
              className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة صنف / موديل جديد</span>
            </button>
          )}

          {activeTab === 'parties' && (
            <button
              onClick={() => {
                setPartyForm({
                  code: `PRT-${Date.now().toString().slice(-4)}`,
                  name: '',
                  phone: DEFAULT_PHONE_VALUE,
                  address: '',
                  tax_number: '',
                  is_supplier: true,
                  is_customer: false,
                  supplier_type: 'goods',
                  payment_terms: 'credit',
                  credit_limit: '',
                  opening_balance: '0',
                  opening_balance_type: 'credit',
                  notes: ''
                });
                setPartyErrors({});
                setShowAddPartyModal(true);
              }}
              className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة جهة تعامل موحدة</span>
            </button>
          )}

          {activeTab === 'expenses' && (
            <button
              onClick={() => {
                setExpenseForm({ code: `EXP-${Date.now().toString().slice(-4)}`, name: '', default_amount: '', category: 'operating', notes: '' });
                setExpenseErrors({});
                setShowAddExpenseModal(true);
              }}
              className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>ضيف كود مصروف</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 border-b border-gray-200 overflow-x-auto pb-1 text-sm font-bold">
        {[
          { id: 'items', label: 'دليل الأصناف والموديلات', icon: Tag, count: items.length },
          { id: 'parties', label: 'جهات التعامل الموحدة', icon: Users, count: parties.length },
          { id: 'sizes_colors', label: 'المقاسات والألوان', icon: Palette, count: `${sizes.length}/${colors.length}` },
          { id: 'locations', label: 'أماكن التخزين', icon: MapPin, count: locations.length },
          { id: 'expenses', label: 'أكواد المصروفات', icon: Receipt, count: expenseCodes.length },
          { id: 'payment_methods', label: 'طرق الدفع', icon: CreditCard, count: paymentMethods.length },
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { setActiveTab(t.id); setSearchTerm(''); }}
              className={`px-4 py-2.5 rounded-t-md flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-white border-t-2 border-r border-l border-gray-200 border-t-[#1F3A5F] text-[#1F3A5F] -mb-[1px]'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
              <span className={`text-xs px-1.5 py-0.2 rounded-full ${isActive ? 'bg-[#1F3A5F]/10 text-[#1F3A5F]' : 'bg-gray-100 text-gray-500'}`}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ITEMS SCREEN */}
      {activeTab === 'items' && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between gap-3">
            <div className="relative max-w-md w-full">
              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                aria-label="ابحث بكود الصنف، الاسم، أو المجموعة"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pr-9 pl-3 h-10 rounded-md border border-gray-300 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
              />
            </div>
            <button
              onClick={() => {
                const headers = ['كود الصنف', 'اسم الصنف', 'النوع', 'المجموعة', 'الوحدة', 'الرصيد الفعلي', 'سعر التكلفة', 'سعر البيع'];
                const rows = items.map(i => [
                  i.code, i.name, i.item_type === 'finished' ? 'تام الصنع' : 'خامة أولية', i.item_group, i.unit, i.actual_balance, i.cost_price, i.selling_price
                ]);
                exportToExcel('دليل_الأصناف_مصنع_الملابس', headers, rows);
              }}
              className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4 text-gray-600" />
              <span>تصدير إكسيل</span>
            </button>
          </div>

          {/* Items Table */}
          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">الصورة</th>
                    <th className="py-3 px-4">كود الصنف</th>
                    <th className="py-3 px-4">اسم الصنف والموديل</th>
                    <th className="py-3 px-4">النوع / التصنيف</th>
                    <th className="py-3 px-4 text-center">الرصيد الفعلي</th>
                    <th className="py-3 px-4 text-left font-bold text-blue-900">سعر التكلفة</th>
                    <th className="py-3 px-4 text-left font-bold text-green-900">سعر البيع</th>
                    <th className="py-3 px-4 text-center">المتغيرات (المقاس واللون)</th>
                    <th className="py-3 px-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد أصناف مسجلة مطابقة للبحث.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map(it => (
                      <tr key={it.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-2.5 px-4">
                          {it.image ? (
                            <img src={it.image} alt={it.name} className="w-10 h-10 object-cover rounded border border-gray-200" />
                          ) : (
                            <div className="w-10 h-10 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-bold text-gray-800">{it.code}</td>
                        <td className="py-2.5 px-4 font-bold text-gray-900">
                          {it.name}
                          <span className="block text-xs font-normal text-gray-500">{it.item_department}</span>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            it.item_type === 'finished' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {it.item_type === 'finished' ? 'منتج تام' : 'خامة أولية'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center font-bold text-gray-900">
                          {formatNumber(it.actual_balance)} {it.unit}
                        </td>
                        <td className="py-2.5 px-4 text-left font-bold text-blue-900">
                          {formatCurrency(it.cost_price)}
                        </td>
                        <td className="py-2.5 px-4 text-left font-bold text-green-900">
                          {it.item_type === 'finished' ? formatCurrency(it.selling_price) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {it.variants && it.variants.length > 0 ? (
                            <div className="flex flex-wrap gap-1 justify-center max-w-[200px] mx-auto">
                              {it.variants.slice(0, 3).map((v, idx) => (
                                <span key={idx} className="text-[11px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200 font-medium">
                                  {v.size} ({v.color}): {v.current_stock}
                                </span>
                              ))}
                              {it.variants.length > 3 && (
                                <span className="text-[11px] bg-gray-200 text-gray-800 px-1.5 py-0.5 rounded font-bold">
                                  +{it.variants.length - 3}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">بدون متغيرات</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          {it.item_type === 'finished' && (
                            <button
                              onClick={() => handleOpenBOM(it)}
                              className="px-2.5 py-1 bg-white hover:bg-gray-50 text-[#1F3A5F] rounded border border-[#1F3A5F]/30 text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                              title="شجرة مكونات المنتج"
                            >
                              <Layers className="w-3.5 h-3.5" />
                              <span>شجرة المكونات</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: UNIFIED PARTIES (موردين وعملاء مع مقاصة) */}
      {activeTab === 'parties' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex items-center justify-between gap-3">
            <div className="relative max-w-md w-full">
              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                aria-label="ابحث بالاسم، التليفون، أو الكود"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pr-9 pl-3 h-10 rounded-md border border-gray-300 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
              />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                    <th className="py-3 px-4">كود الجهة</th>
                    <th className="py-3 px-4">اسم جهة التعامل</th>
                    <th className="py-3 px-4 text-center">نوع التعامل</th>
                    <th className="py-3 px-4 text-center">الحد الائتماني (عميل فقط)</th>
                    <th className="py-3 px-4 text-left font-bold text-red-600">حساب المورد (علينا)</th>
                    <th className="py-3 px-4 text-left font-bold text-green-700">حساب العميل (لنا)</th>
                    <th className="py-3 px-4 text-left font-bold text-indigo-900">الرصيد الصافي</th>
                    <th className="py-3 px-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredParties.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">
                        لا توجد جهات تعامل مسجلة مطابقة للبحث.
                      </td>
                    </tr>
                  ) : (
                    filteredParties.map(p => (
                      <tr key={p.id} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-gray-700">{p.code}</td>
                        <td className="py-3 px-4 font-bold text-gray-900">
                          {p.name}
                          {p.phone && <span className="block text-xs font-normal text-gray-500">{p.phone}</span>}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {p.is_supplier === 1 && (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                مورد {p.supplier_type === 'service' ? '(خدمة)' : ''}
                              </span>
                            )}
                            {p.is_customer === 1 && (
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                                عميل
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-gray-700">
                          {p.is_customer === 1 ? (
                            p.credit_limit > 0 ? formatCurrency(p.credit_limit) : 'غير محدد'
                          ) : (
                            <span className="text-gray-400 text-xs">لا ينطبق (مورد)</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-left font-bold text-red-600">
                          {p.is_supplier === 1 ? formatCurrency(p.supplier_balance || 0) : '-'}
                        </td>
                        <td className="py-3 px-4 text-left font-bold text-green-700">
                          {p.is_customer === 1 ? formatCurrency(p.customer_balance || 0) : '-'}
                        </td>
                        <td className="py-3 px-4 text-left font-extrabold text-indigo-900">
                          {p.is_both ? (
                            <span>
                              {p.net_balance > 0 ? `+${formatCurrency(p.net_balance)} (لنا)` : p.net_balance < 0 ? `-${formatCurrency(Math.abs(p.net_balance))} (علينا)` : '0 ج.م'}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">جهة أحادية</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {p.is_both && p.max_offset_amount > 0 ? (
                            <button
                              onClick={() => {
                                setShowOffsetModal(p);
                                setOffsetForm({ amount: String(p.max_offset_amount), notes: `تسوية مقاصة للجهة: ${p.name}` });
                              }}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 rounded border border-indigo-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                              title="إجراء مقاصة بين حساب المورد والعميل"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              <span>إجراء مقاصة</span>
                            </button>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SIZES & COLORS */}
      {activeTab === 'sizes_colors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Sizes */}
          <div className="bg-white border border-gray-200 rounded-md p-5 space-y-4">
            <h3 className="text-base font-bold text-gray-900 border-b pb-2 flex items-center justify-between">
              <span>إدارة مقاسات الملابس</span>
              <span className="text-xs text-gray-500 font-normal">{sizes.length} مقاس مسجل</span>
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                aria-label="اسم المقاس الجديد"
                value={newSizeName}
                onChange={e => setNewSizeName(e.target.value)}
                className="flex-1 h-10 border border-gray-300 rounded px-3 text-sm focus:border-[#1F3A5F] focus:outline-none"
              />
              <button
                onClick={handleAddSize}
                className="px-4 h-10 bg-[#1F3A5F] text-white text-xs font-bold rounded cursor-pointer"
              >
                + إضافة مقاس
              </button>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {sizes.map(s => (
                <span key={s.id} className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded text-sm font-bold text-gray-800">
                  {s.name}
                </span>
              ))}
            </div>
          </div>

          {/* Colors */}
          <div className="bg-white border border-gray-200 rounded-md p-5 space-y-4">
            <h3 className="text-base font-bold text-gray-900 border-b pb-2 flex items-center justify-between">
              <span>إدارة ألوان الأقمشة والملابس</span>
              <span className="text-xs text-gray-500 font-normal">{colors.length} لون مسجل</span>
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                aria-label="اسم اللون الجديد"
                value={newColorName}
                onChange={e => setNewColorName(e.target.value)}
                className="flex-1 h-10 border border-gray-300 rounded px-3 text-sm focus:border-[#1F3A5F] focus:outline-none"
              />
              <input
                type="color"
                value={newColorHex}
                onChange={e => setNewColorHex(e.target.value)}
                className="w-10 h-10 p-0 border border-gray-300 rounded cursor-pointer"
                title="اختر درجة اللون"
              />
              <button
                onClick={handleAddColor}
                className="px-4 h-10 bg-[#1F3A5F] text-white text-xs font-bold rounded cursor-pointer"
              >
                + إضافة لون
              </button>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {colors.map(c => (
                <span key={c.id} className="px-3 py-1.5 bg-gray-50 border border-gray-300 rounded text-sm font-bold text-gray-800 flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border border-gray-400" style={{ backgroundColor: c.hex_code }} />
                  <span>{c.name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: STORAGE LOCATIONS */}
      {activeTab === 'locations' && (
        <div className="bg-white border border-gray-200 rounded-md p-5 space-y-4">
          <h3 className="text-base font-bold text-gray-900 border-b pb-2 flex items-center justify-between">
            <span>مواقع ومستودعات التخزين</span>
            <span className="text-xs text-gray-500 font-normal">{locations.length} موقع مسجل</span>
          </h3>
          <div className="flex gap-2 max-w-lg">
            <input
              type="text"
              aria-label="اسم موقع التخزين أو المستودع الجديد"
              value={newLocationName}
              onChange={e => setNewLocationName(e.target.value)}
              className="flex-1 h-10 border border-gray-300 rounded px-3 text-sm focus:border-[#1F3A5F] focus:outline-none"
            />
            <select
              value={newLocationType}
              onChange={e => setNewLocationType(e.target.value)}
              className="h-10 border border-gray-300 rounded px-2 text-sm bg-white"
            >
              <option value="fabric">مستودع أقمشة</option>
              <option value="accessories">مخزن مستلزمات</option>
              <option value="warehouse">مستودع منتج تام</option>
              <option value="outlet">مخزن معرض</option>
            </select>
            <button
              onClick={handleAddLocation}
              className="px-4 h-10 bg-[#1F3A5F] text-white text-xs font-bold rounded cursor-pointer"
            >
              + إضافة موقع
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-3">
            {locations.map(loc => (
              <div key={loc.id} className="border border-gray-200 rounded p-3 bg-gray-50 flex flex-col justify-between">
                <div>
                  <span className="font-bold text-gray-900 block">{loc.name}</span>
                  <span className="text-xs text-gray-500 font-mono">{loc.code}</span>
                </div>
                <span className="text-xs mt-2 inline-block px-2 py-0.5 rounded bg-blue-100 text-blue-800 self-start font-semibold">
                  {loc.location_type === 'fabric' ? 'مستودع أقمشة' : loc.location_type === 'accessories' ? 'مخزن مستلزمات' : loc.location_type === 'outlet' ? 'مخزن معرض' : 'مستودع تام'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: EXPENSE CODES */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-4">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">أكواد المصروفات التشغيلية والنثرية</h3>
                <p className="text-xs text-gray-500 font-medium">أكواد المصروفات المحددة سلفاً مع المبلغ الافتراضي لسرعة صرف النقدية</p>
              </div>
              <button
                onClick={() => {
                  setExpenseForm({ code: `EXP-${Date.now().toString().slice(-4)}`, name: '', default_amount: '', category: 'operating', notes: '' });
                  setExpenseErrors({});
                  setShowAddExpenseModal(true);
                }}
                className="h-10 px-4 bg-[#1F3A5F] text-white rounded font-bold text-sm cursor-pointer"
              >
                + ضيف كود مصروف
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {expenseCodes.map(exp => (
                <div key={exp.id} className="p-4 border border-gray-200 rounded-md bg-gray-50 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-gray-500">{exp.code}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">{exp.category}</span>
                    </div>
                    <span className="font-bold text-gray-900 text-base block mt-1">{exp.name}</span>
                  </div>
                  <div className="mt-3 pt-2 border-t border-gray-200 flex items-center justify-between">
                    <span className="text-xs text-gray-500">المبلغ الافتراضي:</span>
                    <span className="font-bold text-[#1F3A5F] text-base">{formatCurrency(exp.default_amount || 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: PAYMENT METHODS */}
      {activeTab === 'payment_methods' && (
        <div className="bg-white border border-gray-200 rounded-md p-5 space-y-4">
          <h3 className="text-base font-bold text-gray-900 border-b pb-2 flex items-center justify-between">
            <span>طرق دفع الموردين والتحصيل</span>
            <span className="text-xs text-gray-500 font-normal">{paymentMethods.length} طريقة مسجلة</span>
          </h3>
          <div className="flex gap-2 max-w-md">
            <input
              type="text"
              aria-label="اسم طريقة الدفع الجديدة"
              value={newMethodName}
              onChange={e => setNewMethodName(e.target.value)}
              className="flex-1 h-10 border border-gray-300 rounded px-3 text-sm focus:border-[#1F3A5F] focus:outline-none"
            />
            <button
              onClick={handleAddPaymentMethod}
              className="px-4 h-10 bg-[#1F3A5F] text-white text-xs font-bold rounded cursor-pointer"
            >
              + إضافة طريقة دفع
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-3">
            {paymentMethods.map(pm => (
              <div key={pm.id} className="p-3 border border-gray-200 rounded bg-gray-50 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-gray-600" />
                <span className="font-bold text-gray-800 text-sm">{pm.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: ADD ITEM (مع دعم الملابس والمتغيرات ورفع الصورة وكود تسلسلي) */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-4xl w-full border border-gray-300 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إضافة صنف أو موديل جديد (مصنع الملابس)</h3>
              <button onClick={() => setShowAddItemModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              تسجيل بيانات الصنف، رفع الصورة بصيغة مضغوطة، تحديد سعر التكلفة والبيع، ودعم متغيرات المقاس واللون
            </p>

            <form onSubmit={handleSaveItem} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">نوع الصنف *</label>
                  <select
                    value={itemForm.item_type}
                    onChange={e => setItemForm({ ...itemForm, item_type: e.target.value })}
                    className="w-full h-11 border border-gray-300 rounded px-3 text-sm font-semibold bg-white"
                  >
                    <option value="finished">منتج تام الصنع (ملابس جاهزة)</option>
                    <option value="raw_material">خامة أولية (أقمشة / مستلزمات)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">كود الصنف (تلقائي / فريد) *</label>
                  <input
                    type="text"
                    required
                    value={itemForm.code}
                    onChange={e => setItemForm({ ...itemForm, code: e.target.value })}
                    className={`w-full h-11 border rounded px-3 text-sm font-mono font-bold ${itemErrors.code ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                  />
                  <FieldError error={itemErrors.code} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">اسم الصنف / الموديل *</label>
                  <input
                    type="text"
                    required
                    value={itemForm.name}
                    onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                    className={`w-full h-11 border rounded px-3 text-sm font-semibold ${itemErrors.name ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                  />
                  <p className="text-xs text-gray-500 mt-1">مثال: تيشيرت بولو رجالي قطن مطرز</p>
                  <FieldError error={itemErrors.name} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">مجموعة الصنف</label>
                  <input
                    type="text"
                    value={itemForm.item_group}
                    onChange={e => setItemForm({ ...itemForm, item_group: e.target.value })}
                    className="w-full h-11 border border-gray-300 rounded px-3 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">مثال: ملابس صيفية رجالي</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">قسم الصنف</label>
                  <input
                    type="text"
                    value={itemForm.item_department}
                    onChange={e => setItemForm({ ...itemForm, item_department: e.target.value })}
                    className="w-full h-11 border border-gray-300 rounded px-3 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">مثال: قسم البولو والتيشيرت</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">الوحدة</label>
                  <input
                    type="text"
                    value={itemForm.unit}
                    onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}
                    className="w-full h-11 border border-gray-300 rounded px-3 text-sm font-semibold"
                  />
                </div>
              </div>

              {/* Prices: Rename estimated price to سعر التكلفة everywhere! */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 p-3 rounded border border-gray-200">
                <div>
                  <label className="block text-sm font-bold text-blue-900 mb-1">سعر التكلفة (ج.م) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={itemForm.cost_price}
                    onChange={e => setItemForm({ ...itemForm, cost_price: e.target.value })}
                    className={`w-full h-11 border rounded px-3 text-sm font-bold text-blue-900 ${itemErrors.cost_price ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'}`}
                  />
                  <FieldError error={itemErrors.cost_price} />
                </div>
                {itemForm.item_type === 'finished' && (
                  <div>
                    <label className="block text-sm font-bold text-green-900 mb-1">سعر البيع (ج.م) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={itemForm.selling_price}
                      onChange={e => setItemForm({ ...itemForm, selling_price: e.target.value })}
                      className={`w-full h-11 border rounded px-3 text-sm font-bold text-green-900 ${itemErrors.selling_price ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'}`}
                    />
                    <FieldError error={itemErrors.selling_price} />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">الحد الأدنى للصرف أو التشغيل *</label>
                  <input
                    type="number"
                    min="1"
                    value={itemForm.min_issue_qty}
                    onChange={e => setItemForm({ ...itemForm, min_issue_qty: e.target.value })}
                    className={`w-full h-11 border rounded px-3 text-sm font-bold ${itemErrors.min_issue_qty ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'}`}
                  />
                  <FieldError error={itemErrors.min_issue_qty} />
                </div>
              </div>

              {/* Image upload stored as compressed base64 */}
              <div className="border border-gray-200 rounded p-3">
                <label className="block text-sm font-semibold text-gray-700 mb-1">صورة الصنف (تخزين مضغوط)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="text-sm file:mr-2 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-bold file:bg-[#1F3A5F] file:text-white cursor-pointer"
                  />
                  {imagePreview && (
                    <img src={imagePreview} alt="Preview" className="w-14 h-14 object-cover rounded border border-gray-300" />
                  )}
                </div>
              </div>

              {/* Clothing Variants: Sizes & Colors Matrix */}
              {itemForm.item_type === 'finished' && (
                <div className="border border-gray-200 rounded p-4 bg-blue-50/20 space-y-3">
                  <h4 className="text-sm font-bold text-gray-900 flex items-center justify-between">
                    <span>دعم مقاسات وألوان الملابس (مصفوفة المتغيرات)</span>
                    <span className="text-xs text-gray-500">اختر المقاسات والألوان المتاحة لهذا الموديل</span>
                  </h4>

                  {/* Sizes selector */}
                  <div>
                    <span className="text-xs font-bold text-gray-700 block mb-1">اختر المقاسات المتاحة:</span>
                    <div className="flex flex-wrap gap-2">
                      {sizes.map(s => {
                        const isSelected = selectedSizes.includes(s.name);
                        return (
                          <button
                            type="button"
                            key={s.id}
                            onClick={() => {
                              setSelectedSizes(prev => isSelected ? prev.filter(x => x !== s.name) : [...prev, s.name]);
                            }}
                            className={`px-3 py-1 rounded text-xs font-bold cursor-pointer transition-colors ${
                              isSelected ? 'bg-[#1F3A5F] text-white' : 'bg-white text-gray-700 border border-gray-300'
                            }`}
                          >
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Colors selector */}
                  <div>
                    <span className="text-xs font-bold text-gray-700 block mb-1">اختر الألوان المتاحة:</span>
                    <div className="flex flex-wrap gap-2">
                      {colors.map(c => {
                        const isSelected = selectedColors.includes(c.name);
                        return (
                          <button
                            type="button"
                            key={c.id}
                            onClick={() => {
                              setSelectedColors(prev => isSelected ? prev.filter(x => x !== c.name) : [...prev, c.name]);
                            }}
                            className={`px-3 py-1 rounded text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                              isSelected ? 'bg-[#1F3A5F] text-white' : 'bg-white text-gray-700 border border-gray-300'
                            }`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full border border-gray-400" style={{ backgroundColor: c.hex_code }} />
                            <span>{c.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Variants stock table */}
                  {itemForm.variants.length > 0 && (
                    <div className="mt-3 overflow-x-auto max-h-48 border border-gray-200 rounded bg-white">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-gray-100 font-bold text-gray-700">
                          <tr>
                            <th className="p-2">المقاس</th>
                            <th className="p-2">اللون</th>
                            <th className="p-2">كود الباركود</th>
                            <th className="p-2">رصيد أول المدة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {itemForm.variants.map((v, idx) => (
                            <tr key={v.id}>
                              <td className="p-2 font-bold">{v.size}</td>
                              <td className="p-2">{v.color}</td>
                              <td className="p-2 font-mono text-gray-500">{v.sku}</td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0"
                                  value={v.opening_balance}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setItemForm(prev => {
                                      const updated = [...prev.variants];
                                      updated[idx].opening_balance = val;
                                      updated[idx].current_stock = val;
                                      return { ...prev, variants: updated };
                                    });
                                  }}
                                  className="w-24 h-8 border border-gray-300 rounded px-2 text-xs font-bold text-center"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded font-semibold text-sm hover:bg-gray-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={Object.keys(itemErrors).length > 0}
                  className="px-6 py-2 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded font-bold text-sm cursor-pointer disabled:opacity-50"
                >
                  حفظ الصنف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD UNIFIED PARTY (مورد / عميل / كلاهما) */}
      {showAddPartyModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إضافة جهة تعامل موحدة (مورد / عميل)</h3>
              <button onClick={() => setShowAddPartyModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              يمكن تحديد الجهة كمورد، أو كعميل، أو كلاهما معاً عبر مربعي الاختيار
            </p>

            <form onSubmit={handleSaveParty} className="space-y-4">
              {/* Type checkboxes */}
              <div className="p-3 bg-blue-50/50 border border-blue-200 rounded flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={partyForm.is_supplier}
                    onChange={e => setPartyForm({ ...partyForm, is_supplier: e.target.checked })}
                    className="w-4 h-4 text-[#1F3A5F] rounded"
                  />
                  <span>مورد</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-gray-800">
                  <input
                    type="checkbox"
                    checked={partyForm.is_customer}
                    onChange={e => setPartyForm({ ...partyForm, is_customer: e.target.checked })}
                    className="w-4 h-4 text-[#1F3A5F] rounded"
                  />
                  <span>عميل</span>
                </label>
              </div>
              <FieldError error={partyErrors.type} />

              {partyForm.is_supplier && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">نوع نشاط المورد</label>
                  <select
                    value={partyForm.supplier_type}
                    onChange={e => setPartyForm({ ...partyForm, supplier_type: e.target.value })}
                    className="w-full h-10 border border-gray-300 rounded px-3 text-sm bg-white"
                  >
                    <option value="goods">توريد خامات ومستلزمات (أقمشة / سوست / أزرار)</option>
                    <option value="service">خدمة تشغيل لدى الغير (تطريز / مغسلة جينز / طباعة)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">اسم جهة التعامل أو الشركة *</label>
                <input
                  type="text"
                  required
                  value={partyForm.name}
                  onChange={e => setPartyForm({ ...partyForm, name: e.target.value })}
                  className={`w-full h-10 border rounded px-3 text-sm ${partyErrors.name ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                />
                <p className="text-xs text-gray-500 mt-1">مثال: مصنع النيل للغزل والنسيج</p>
                <FieldError error={partyErrors.name} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">رقم التليفون</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    dir="ltr"
                    maxLength={11}
                    value={partyForm.phone}
                    onChange={e => {
                      const digits = sanitizeEgyptianPhoneInput(e.target.value);
                      setPartyForm({ ...partyForm, phone: digits === '' ? DEFAULT_PHONE_VALUE : digits });
                    }}
                    className="w-full h-10 border border-gray-300 rounded px-3 text-sm font-mono text-left"
                  />
                  <FieldError error={partyErrors.phone} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">الرقم الضريبي</label>
                  <input
                    type="text"
                    value={partyForm.tax_number}
                    onChange={e => setPartyForm({ ...partyForm, tax_number: e.target.value })}
                    className="w-full h-10 border border-gray-300 rounded px-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">العنوان</label>
                <input
                  type="text"
                  value={partyForm.address}
                  onChange={e => setPartyForm({ ...partyForm, address: e.target.value })}
                  className="w-full h-10 border border-gray-300 rounded px-3 text-sm"
                />
              </div>

              {/* Credit Limit: CUSTOMER SIDE ONLY; NO SUPPLIER CEILING */}
              {partyForm.is_customer && (
                <div className="p-3 bg-amber-50/50 border border-amber-200 rounded">
                  <label className="block text-sm font-bold text-amber-900 mb-1">
                    الحد الائتماني للعميل (ج.م) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={partyForm.credit_limit}
                    onChange={e => setPartyForm({ ...partyForm, credit_limit: e.target.value })}
                    className="w-full h-10 border border-gray-300 rounded px-3 text-sm font-bold text-amber-900 bg-white"
                  />
                  <span className="text-xs text-gray-500 block mt-1">الحد الائتماني يمنع حفظ الفواتير الآجلة إذا تجاوز رصيد العميل هذا المبلغ (0 أو فارغ يعني لا يوجد سقف).</span>
                  <FieldError error={partyErrors.credit_limit} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 border border-gray-200 rounded">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">رصيد أول المدة (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    dir="ltr"
                    value={partyForm.opening_balance}
                    onChange={e => setPartyForm({ ...partyForm, opening_balance: e.target.value })}
                    className="w-full h-10 border border-gray-300 rounded px-3 text-sm font-mono font-bold text-left bg-white"
                  />
                  <FieldError error={partyErrors.opening_balance} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">طبيعة الحساب</label>
                  <select
                    value={partyForm.opening_balance_type}
                    onChange={e => setPartyForm({ ...partyForm, opening_balance_type: e.target.value })}
                    className="w-full h-10 border border-gray-300 rounded px-3 text-sm bg-white font-semibold"
                  >
                    {partyForm.is_customer && !partyForm.is_supplier ? (
                      <>
                        <option value="debit">مدين (مستحق عليه)</option>
                        <option value="credit">دائن (دفعة مقدمة منه)</option>
                      </>
                    ) : (
                      <>
                        <option value="credit">دائن (مستحق له)</option>
                        <option value="debit">مدين (دفعة مقدمة له)</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddPartyModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded font-semibold text-sm hover:bg-gray-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={Object.keys(partyErrors).length > 0}
                  className="px-6 py-2 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded font-bold text-sm cursor-pointer disabled:opacity-50"
                >
                  حفظ جهة التعامل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: EXECUTE OFFSET (إجراء مقاصة) */}
      {showOffsetModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-md w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إجراء مقاصة أرصدة</h3>
              <button onClick={() => setShowOffsetModal(null)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-50 p-3 rounded border text-xs space-y-1 mb-4">
              <div className="flex justify-between">
                <span className="text-gray-600">الجهة:</span>
                <span className="font-bold text-gray-900">{showOffsetModal.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">رصيد المورد المستحق (علينا):</span>
                <span className="font-bold text-red-600">{formatCurrency(showOffsetModal.supplier_balance)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">رصيد العميل المستحق (لنا):</span>
                <span className="font-bold text-green-700">{formatCurrency(showOffsetModal.customer_balance)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-bold">
                <span className="text-gray-800">أقصى مبلغ متاح للمقاصة:</span>
                <span className="text-indigo-900">{formatCurrency(showOffsetModal.max_offset_amount)}</span>
              </div>
            </div>

            <form onSubmit={handleExecuteOffset} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">مبلغ المقاصة المراد تسويته (ج.م) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={showOffsetModal.max_offset_amount}
                  required
                  value={offsetForm.amount}
                  onChange={e => setOffsetForm({ ...offsetForm, amount: e.target.value })}
                  className="w-full h-11 border border-gray-300 rounded px-3 text-base font-bold text-indigo-900"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات وسند المقاصة</label>
                <input
                  type="text"
                  value={offsetForm.notes}
                  onChange={e => setOffsetForm({ ...offsetForm, notes: e.target.value })}
                  className="w-full h-10 border border-gray-300 rounded px-3 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowOffsetModal(null)}
                  className="px-4 py-2 border border-gray-300 rounded font-semibold text-sm hover:bg-gray-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-900 hover:bg-indigo-950 text-white rounded font-bold text-sm cursor-pointer"
                >
                  تأكيد وتنفيذ المقاصة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ADD EXPENSE CODE (ضيف كود مصروف) */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-md w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">ضيف كود مصروف جديد</h3>
              <button onClick={() => setShowAddExpenseModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpenseCode} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">كود المصروف</label>
                <input
                  type="text"
                  value={expenseForm.code}
                  onChange={e => setExpenseForm({ ...expenseForm, code: e.target.value })}
                  className="w-full h-10 border border-gray-300 rounded px-3 text-sm font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">اسم المصروف *</label>
                <input
                  type="text"
                  required
                  value={expenseForm.name}
                  onChange={e => setExpenseForm({ ...expenseForm, name: e.target.value })}
                  className="w-full h-10 border border-gray-300 rounded px-3 text-sm font-bold"
                />
                <p className="text-xs text-gray-500 mt-1">مثال: صيانة ماكينات خياطة</p>
                <FieldError error={expenseErrors.name} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">المبلغ الافتراضي (ج.م)</label>
                <input
                  type="number"
                  min="0"
                  value={expenseForm.default_amount}
                  onChange={e => setExpenseForm({ ...expenseForm, default_amount: e.target.value })}
                  className="w-full h-10 border border-gray-300 rounded px-3 text-sm font-bold text-[#1F3A5F]"
                />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded font-semibold text-sm hover:bg-gray-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded font-bold text-sm cursor-pointer"
                >
                  حفظ كود المصروف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: BOM & FABRIC WASTE (شجرة المكونات وهالك القماش) */}
      {showBOMModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-2xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">
                شجرة المكونات واستهلاك الأقمشة: {showBOMModal.name}
              </h3>
              <button onClick={() => setShowBOMModal(null)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              حدد الخامات ومقدار الاستهلاك لكل قطعة مع نسبة هالك القماش لحساب تكلفة القطعة بدقة
            </p>

            <form onSubmit={handleSaveBOM} className="space-y-4">
              <div className="space-y-3">
                {bomItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-50 p-2.5 rounded border border-gray-200">
                    <select
                      value={item.raw_material_id}
                      onChange={e => {
                        const val = e.target.value;
                        setBomItems(prev => {
                          const updated = [...prev];
                          updated[idx].raw_material_id = val;
                          return updated;
                        });
                      }}
                      className="flex-1 h-9 border border-gray-300 rounded px-2 text-xs font-semibold bg-white"
                      required
                    >
                      <option value="">-- اختر الخامة / القماش --</option>
                      {rawMaterials.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.unit}) - {formatCurrency(m.average_cost || m.cost_price || 0)}
                        </option>
                      ))}
                    </select>

                    <div className="w-24">
                      <input
                        type="number"
                        step="0.001"
                        min="0.001"
                        required
                        aria-label="الكمية لكل قطعة"
                        value={item.quantity_per_unit}
                        onChange={e => {
                          const val = e.target.value;
                          setBomItems(prev => {
                            const updated = [...prev];
                            updated[idx].quantity_per_unit = val;
                            return updated;
                          });
                        }}
                        className="w-full h-9 border border-gray-300 rounded px-2 text-xs font-bold text-center bg-white"
                      />
                    </div>

                    <div className="w-24" title="نسبة هالك القماش أو مستلزمات الخياطة">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        aria-label="نسبة هالك القماش %"
                        value={item.waste_percent}
                        onChange={e => {
                          const val = e.target.value;
                          setBomItems(prev => {
                            const updated = [...prev];
                            updated[idx].waste_percent = val;
                            return updated;
                          });
                        }}
                        className="w-full h-9 border border-gray-300 rounded px-2 text-xs font-bold text-center text-red-600 bg-white"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setBomItems(prev => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-red-500 hover:text-red-700 cursor-pointer"
                      title="حذف البند"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setBomItems(prev => [...prev, { raw_material_id: '', quantity_per_unit: '', waste_percent: '8', notes: '' }])}
                className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-bold cursor-pointer transition-colors"
              >
                + إضافة بند خامة آخر
              </button>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowBOMModal(null)}
                  className="px-4 py-2 border border-gray-300 rounded font-semibold text-sm hover:bg-gray-50 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded font-bold text-sm cursor-pointer"
                >
                  حفظ شجرة التكاليف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
