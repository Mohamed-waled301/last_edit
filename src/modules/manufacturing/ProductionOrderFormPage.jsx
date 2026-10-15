import React, { useState, useEffect, useRef } from 'react';
import { 
  Scissors, 
  Cog, 
  Plus, 
  Trash2, 
  Image as ImageIcon, 
  AlertTriangle, 
  DollarSign, 
  Package, 
  CheckCircle2, 
  ChevronDown, 
  Search, 
  Printer, 
  Edit, 
  Save, 
  Calendar,
  Layers,
  Sparkles,
  Lock,
  ArrowRight,
  CreditCard,
  Building2,
  FileText
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { MoneyInput, NumberInput } from '../../components/MoneyInput';
import { api } from '../../services/api';
import { formatCurrency, formatNumber, getTodayDateString, formatDate } from '../../utils/formatters';
import { Validators, FieldError } from '../../utils/validation';
import { handleFormKeyDown } from '../../utils/formNavigation';
import { navigationGuard } from '../../utils/navigationGuard';
import { toPiasters, fromPiasters, distributeCostLargestRemainder } from '../../utils/money';
import {
  calculateMaterialLineCost,
  calculateTotalMaterialsCost,
  calculateTotalAdditionalCosts,
  calculateTotalProductCost,
  calculateUnitCost
} from '../../logic/productionOrderCalculations';

const ALL_SIZES = ['M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'];

const STAGE_KEYS = [
  { key: 'printing', title: 'الطباعة (Printing)', icon: Printer, color: 'blue' },
  { key: 'embroidery', title: 'التطريز (Embroidery)', icon: Sparkles, color: 'purple' },
  { key: 'sewing', title: 'الحياكة (Sewing)', icon: Cog, color: 'emerald' }
];

/**
 * Searchable Dropdown for Raw Materials
 * Lists ONLY items of type "مادة خام", shows code, name, and stock.
 */
function SearchableMaterialSelect({ items, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selectedItem = items.find((i) => String(i.id) === String(value));

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.trim().toLowerCase();
    const codeMatch = String(item.code || '').toLowerCase().includes(query);
    const nameMatch = String(item.name || '').toLowerCase().includes(query);
    return codeMatch || nameMatch;
  });

  const handleSelect = (item) => {
    onChange(item);
    setSearchQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex((prev) => (prev + 1 < filteredItems.length ? prev + 1 : prev));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      if (isOpen && filteredItems[highlightedIndex]) {
        e.preventDefault();
        handleSelect(filteredItems[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const displayValue = isOpen
    ? searchQuery
    : selectedItem
    ? `[${selectedItem.code || '---'}] ${selectedItem.name}`
    : '';

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onFocus={() => {
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onClick={() => setIsOpen(true)}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          aria-label="اختيار الخامة"
          className="w-full pr-3 pl-8 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
        />
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" aria-hidden="true" />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
          {filteredItems.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400">
              لا توجد خامات مطابقة
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const stock = Number(item.current_stock) || 0;
              const cost = Number(item.cost_price) || 0;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`p-2.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                    index === highlightedIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex flex-col text-right">
                    <span className="font-bold text-slate-900">
                      [{item.code || '---'}] {item.name}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      الوحدة: {item.unit || 'وحدة'} | الرصيد المتاح: <span className={stock > 0 ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>{stock}</span>
                    </span>
                  </div>
                  <div className="text-left font-mono font-bold text-slate-700 text-[11px]">
                    {formatCurrency(cost)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function ProductionOrderFormPage({ orderId = null, onSaved, onNotify, onBack }) {
  const isEdit = Boolean(orderId);
  const today = getTodayDateString();

  const [rawMaterials, setRawMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [workshopVendors, setWorkshopVendors] = useState([]);
  const [treasuryAccounts, setTreasuryAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [existingOrder, setExistingOrder] = useState(null);
  const [isOrderClosed, setIsOrderClosed] = useState(false);
  const [editReason, setEditReason] = useState('');
  const isSavedRef = useRef(false);

  // Core cutting order form state (Requirement 4.1: cutting_number manual, no auto-serial)
  const [form, setForm] = useState({
    cutting_number: '',
    cutting_name: '',
    product_id: '',
    batch_quantity: '1',
    start_date: today,
    fabric_type: '',
    color: '',
    cutouts_1: '',
    cutouts_2: '',
    cutting_comment: '',
    notes: ''
  });

  // Size distribution (Requirement 4.4)
  const [sizeQuantities, setSizeQuantities] = useState({
    M: '', L: '', XL: '', '2XL': '', '3XL': '', '4XL': '', '5XL': '', '6XL': ''
  });

  // Three Stages: printing, embroidery, sewing (Requirement 4.3)
  const [stages, setStages] = useState({
    printing: {
      vendor_id: '',
      vendor_name: '',
      pricing_type: 'fixed', // 'per_piece' | 'fixed' | 'batches'
      price_per_piece: '',
      fixed_total: '',
      batches: [],
      notes: '',
      total_cost: 0,
      paid: 0,
      remaining: 0
    },
    embroidery: {
      vendor_id: '',
      vendor_name: '',
      pricing_type: 'fixed',
      price_per_piece: '',
      fixed_total: '',
      batches: [],
      notes: '',
      total_cost: 0,
      paid: 0,
      remaining: 0
    },
    sewing: {
      vendor_id: '',
      vendor_name: '',
      pricing_type: 'fixed',
      price_per_piece: '',
      fixed_total: '',
      batches: [],
      notes: '',
      total_cost: 0,
      paid: 0,
      remaining: 0
    }
  });

  // Inline Quick Add Vendor State (Requirement 4.3: inline add, NOT modal)
  const [inlineVendorState, setInlineVendorState] = useState({
    activeStage: null,
    name: '',
    code: '',
    phone: '',
    submitting: false,
    error: ''
  });

  // Payments per stage (Requirement 4.3)
  const [stagePayments, setStagePayments] = useState([]);
  const [newPayment, setNewPayment] = useState({
    stage_key: 'printing',
    payment_date: today,
    amount: '',
    account_id: '',
    payment_method: 'نقداً',
    notes: ''
  });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  // Material lines
  const [materialLines, setMaterialLines] = useState([
    {
      id: `line-${Date.now()}-0`,
      material_id: '',
      code: '',
      name: '',
      unit: 'وحدة',
      quantity: 1,
      unit_price: 0,
      current_stock: 0
    }
  ]);

  // Additional costs
  const [additionalCosts, setAdditionalCosts] = useState([
    { id: 'c-1', name: 'أجور عمالة تشغيل', amount: '' },
    { id: 'c-2', name: 'كهرباء ومرافق', amount: '' }
  ]);

  const [errors, setErrors] = useState({});

  // Register unsaved changes protection
  useEffect(() => {
    const unregister = navigationGuard.register(() => {
      if (isSavedRef.current) return false;
      if (form.cutting_number.trim()) return true;
      if (form.product_id) return true;
      if (form.cutting_name.trim()) return true;
      if (form.fabric_type.trim()) return true;
      if (Object.values(sizeQuantities).some((v) => v !== '')) return true;
      if (Object.values(stages).some((s) => Number(s.total_cost) > 0 || s.vendor_id)) return true;
      return false;
    });
    return unregister;
  }, [form, sizeQuantities, stages]);

  // Load items, products, vendors, treasuries, and existing cut order
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [itemsRes, prodsRes, vendorsRes, accsRes] = await Promise.all([
          api.getItems(),
          api.getProducts(),
          api.getWorkshopVendors ? api.getWorkshopVendors() : api.getParties(),
          api.getAccounts()
        ]);

        const itemsList = Array.isArray(itemsRes.data) ? itemsRes.data : [];
        const prodsList = Array.isArray(prodsRes.data) ? prodsRes.data : [];
        const vList = Array.isArray(vendorsRes.data) ? vendorsRes.data : (Array.isArray(vendorsRes.vendors) ? vendorsRes.vendors : []);
        const aList = Array.isArray(accsRes.data) ? accsRes.data : (Array.isArray(accsRes) ? accsRes : []);

        const raw = itemsList.filter(
          (i) => i.item_type === 'raw_material' || i.item_type === 'مادة خام'
        );
        setRawMaterials(raw);

        const finishedItems = itemsList.filter(
          (i) => i.item_type === 'finished' || i.item_type === 'منتج تام'
        );
        const allProds = finishedItems.length > 0 ? finishedItems : prodsList;
        setProducts(allProds);
        setWorkshopVendors(vList);
        setTreasuryAccounts(aList);

        if (aList.length > 0) {
          const mainAcc = aList.find(a => a.is_main) || aList[0];
          setNewPayment(prev => ({ ...prev, account_id: mainAcc.id }));
        }

        // Load existing order if in edit mode
        if (orderId) {
          const orderRes = await api.getProductionOrder(orderId);
          const o = orderRes.data || orderRes.order;
          if (o) {
            setExistingOrder(o);
            setIsOrderClosed(o.status === 'closed');

            setForm({
              cutting_number: o.cutting_number || o.order_number || '',
              cutting_name: o.cutting_name || '',
              product_id: o.product_id || '',
              batch_quantity: String(o.batch_quantity || 1),
              start_date: o.start_date || today,
              fabric_type: o.fabric_type || '',
              color: o.color || '',
              cutouts_1: o.cutouts_1 || '',
              cutouts_2: o.cutouts_2 || '',
              cutting_comment: o.cutting_comment || '',
              notes: o.notes || ''
            });

            const p = allProds.find((prod) => String(prod.id) === String(o.product_id));
            if (p) setSelectedProduct(p);

            if (o.size_quantities_parsed && typeof o.size_quantities_parsed === 'object') {
              setSizeQuantities((prev) => ({
                ...prev,
                ...o.size_quantities_parsed
              }));
            }

            // Populate stages
            if (o.stages && typeof o.stages === 'object') {
              setStages((prev) => ({
                printing: {
                  ...prev.printing,
                  ...(o.stages.printing || {}),
                  price_per_piece: String(o.stages.printing?.price_per_piece ?? ''),
                  fixed_total: String(o.stages.printing?.fixed_total ?? o.stages.printing?.total_cost ?? '')
                },
                embroidery: {
                  ...prev.embroidery,
                  ...(o.stages.embroidery || {}),
                  price_per_piece: String(o.stages.embroidery?.price_per_piece ?? ''),
                  fixed_total: String(o.stages.embroidery?.fixed_total ?? o.stages.embroidery?.total_cost ?? '')
                },
                sewing: {
                  ...prev.sewing,
                  ...(o.stages.sewing || {}),
                  price_per_piece: String(o.stages.sewing?.price_per_piece ?? ''),
                  fixed_total: String(o.stages.sewing?.fixed_total ?? o.stages.sewing?.total_cost ?? '')
                }
              }));
            } else {
              // Backward compatibility
              setStages((prev) => ({
                ...prev,
                printing: {
                  ...prev.printing,
                  vendor_name: o.printing_vendor || '',
                  fixed_total: String(o.total_printing_cost || '0'),
                  notes: o.printing_notes || ''
                },
                embroidery: {
                  ...prev.embroidery,
                  vendor_name: o.embroidery_vendor || '',
                  notes: o.embroidery_notes || ''
                },
                sewing: {
                  ...prev.sewing,
                  vendor_name: o.processing_vendor || '',
                  notes: o.processing_notes || ''
                }
              }));
            }

            if (Array.isArray(o.stage_payments)) {
              setStagePayments(o.stage_payments);
            } else if (Array.isArray(o.printing_payments)) {
              setStagePayments(o.printing_payments.map(p => ({ ...p, stage_type: 'printing' })));
            }

            if (Array.isArray(o.materials_lines) && o.materials_lines.length > 0) {
              setMaterialLines(o.materials_lines.map((ml, idx) => ({
                id: `line-${idx}`,
                material_id: ml.material_id,
                code: ml.code || '',
                name: ml.name || '',
                unit: ml.unit || 'وحدة',
                quantity: ml.quantity || 1,
                unit_price: ml.unit_price || 0,
                current_stock: ml.current_stock || 0
              })));
            }

            if (Array.isArray(o.additional_costs) && o.additional_costs.length > 0) {
              setAdditionalCosts(o.additional_costs.map((c, idx) => ({
                id: `c-${idx}`,
                name: c.name || '',
                amount: String(c.amount || '')
              })));
            }
          }
        }
      } catch (err) {
        console.error('Error loading cutting form data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [orderId]);

  const handleProductSelect = (productId) => {
    const prod = products.find((p) => String(p.id) === String(productId));
    setSelectedProduct(prod || null);
    setForm((prev) => ({
      ...prev,
      product_id: productId,
      cutting_name: prev.cutting_name || (prod ? prod.name : '')
    }));
  };

  // Size quantity change
  const handleSizeQuantityChange = (size, value) => {
    const clean = String(value || '').replace(/[^0-9]/g, '');
    const updated = { ...sizeQuantities, [size]: clean };
    setSizeQuantities(updated);

    const total = Object.values(updated).reduce((acc, curr) => {
      const num = parseInt(curr, 10);
      return !isNaN(num) && num > 0 ? acc + num : acc;
    }, 0);

    if (total > 0) {
      setForm((prev) => ({ ...prev, batch_quantity: String(total) }));
      if (errors.batch_quantity) {
        setErrors((prev) => ({ ...prev, batch_quantity: null }));
      }
    }
  };

  // Material lines
  const handleMaterialSelect = (lineIndex, materialItem) => {
    setMaterialLines((prev) => {
      const updated = [...prev];
      updated[lineIndex] = {
        ...updated[lineIndex],
        material_id: materialItem.id,
        code: materialItem.code,
        name: materialItem.name,
        unit: materialItem.unit || 'وحدة',
        quantity: 1,
        unit_price: Number(materialItem.cost_price) || 0,
        current_stock: Number(materialItem.current_stock) || 0
      };
      return updated;
    });
  };

  const handleLineQuantityChange = (lineIndex, qtyVal) => {
    setMaterialLines((prev) => {
      const updated = [...prev];
      updated[lineIndex] = { ...updated[lineIndex], quantity: qtyVal };
      return updated;
    });
  };

  const handleLinePriceChange = (lineIndex, priceVal) => {
    setMaterialLines((prev) => {
      const updated = [...prev];
      updated[lineIndex] = { ...updated[lineIndex], unit_price: priceVal };
      return updated;
    });
  };

  const handleAddMaterialLine = () => {
    setMaterialLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}-${prev.length}`,
        material_id: '',
        code: '',
        name: '',
        unit: 'وحدة',
        quantity: 1,
        unit_price: 0,
        current_stock: 0
      }
    ]);
  };

  const handleRemoveMaterialLine = (lineIndex) => {
    if (materialLines.length <= 1) return;
    setMaterialLines((prev) => prev.filter((_, idx) => idx !== lineIndex));
  };

  // Additional costs
  const handleAddCostRow = () => {
    setAdditionalCosts((prev) => [
      ...prev,
      { id: `c-${Date.now()}`, name: '', amount: '' }
    ]);
  };

  const handleCostChange = (idx, field, val) => {
    setAdditionalCosts((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: val };
      return updated;
    });
  };

  const handleRemoveCostRow = (idx) => {
    setAdditionalCosts((prev) => prev.filter((_, i) => i !== idx));
  };

  // Stage changes
  const handleStageFieldChange = (stageKey, field, val) => {
    setStages((prev) => {
      const current = prev[stageKey];
      const updatedStage = { ...current, [field]: val };
      return { ...prev, [stageKey]: updatedStage };
    });
  };

  // Stage Batch Management (Requirement 4.3)
  const handleAddStageBatch = (stageKey) => {
    setStages((prev) => {
      const current = prev[stageKey];
      const newBatches = [
        ...(current.batches || []),
        {
          id: `btch-${Date.now()}`,
          date: today,
          pieces: '',
          unit_price: '',
          notes: ''
        }
      ];
      return {
        ...prev,
        [stageKey]: { ...current, batches: newBatches }
      };
    });
  };

  const handleBatchChange = (stageKey, batchIdx, field, val) => {
    setStages((prev) => {
      const current = prev[stageKey];
      const newBatches = [...(current.batches || [])];
      newBatches[batchIdx] = { ...newBatches[batchIdx], [field]: val };
      return {
        ...prev,
        [stageKey]: { ...current, batches: newBatches }
      };
    });
  };

  const handleRemoveStageBatch = (stageKey, batchIdx) => {
    setStages((prev) => {
      const current = prev[stageKey];
      const newBatches = (current.batches || []).filter((_, i) => i !== batchIdx);
      return {
        ...prev,
        [stageKey]: { ...current, batches: newBatches }
      };
    });
  };

  // Inline Quick Add Vendor (Requirement 4.3: inline add, NOT modal)
  const handleOpenInlineVendor = (stageKey) => {
    setInlineVendorState({
      activeStage: stageKey,
      name: '',
      code: `WRK-${Date.now().toString().slice(-4)}`,
      phone: '',
      submitting: false,
      error: ''
    });
  };

  const handleSaveInlineVendor = async (stageKey) => {
    if (!inlineVendorState.name.trim()) {
      setInlineVendorState(prev => ({ ...prev, error: 'اسم الورشة / المطبعة مطلوب' }));
      return;
    }

    try {
      setInlineVendorState(prev => ({ ...prev, submitting: true, error: '' }));
      const newParty = await api.createParty({
        name: inlineVendorState.name.trim(),
        code: inlineVendorState.code.trim() || `WRK-${Date.now().toString().slice(-4)}`,
        phone: inlineVendorState.phone.trim(),
        is_supplier: 1,
        supplier_type: 'service',
        service_stage: stageKey,
        notes: `ورشة تشغيل مضافة سريعة لمرحلة ${STAGE_KEYS.find(s => s.key === stageKey)?.title || stageKey}`
      });

      const pData = newParty.data || newParty.party || newParty;
      setWorkshopVendors(prev => [pData, ...prev]);

      // Set immediately into this stage
      setStages(prev => ({
        ...prev,
        [stageKey]: {
          ...prev[stageKey],
          vendor_id: pData.id,
          vendor_name: pData.name
        }
      }));

      setInlineVendorState({
        activeStage: null,
        name: '',
        code: '',
        phone: '',
        submitting: false,
        error: ''
      });

      if (onNotify) onNotify(`تم إضافة الورشة (${pData.name}) بنجاح`);
    } catch (err) {
      setInlineVendorState(prev => ({ ...prev, error: err.message || 'فشل حفظ الورشة' }));
    } finally {
      setInlineVendorState(prev => ({ ...prev, submitting: false }));
    }
  };

  // Calculations
  const batchQty = Math.max(1, Number(form.batch_quantity) || 1);

  // Compute total cost per stage
  const computedStages = {};
  let totalStagesCost = 0;

  for (const item of STAGE_KEYS) {
    const key = item.key;
    const st = stages[key];
    let cost = 0;

    if (st.pricing_type === 'per_piece') {
      cost = Number((batchQty * (Number(st.price_per_piece) || 0)).toFixed(2));
    } else if (st.pricing_type === 'batches') {
      cost = (st.batches || []).reduce((sum, b) => {
        const p = Number(b.pieces) || 0;
        const u = Number(b.unit_price) || 0;
        return sum + Number((p * u).toFixed(2));
      }, 0);
      cost = Number(cost.toFixed(2));
    } else {
      cost = Math.max(0, Number(st.fixed_total) || 0);
    }

    // Payments for this stage
    const stPayments = stagePayments.filter(p => (p.stage_type === key || (!p.stage_type && key === 'printing')) && p.status !== 'cancelled');
    const paid = stPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const remaining = Math.max(0, Number((cost - paid).toFixed(2)));

    // Batch pieces validation
    const totalBatchPieces = (st.batches || []).reduce((sum, b) => sum + (Number(b.pieces) || 0), 0);
    const isBatchOverLimit = st.pricing_type === 'batches' && totalBatchPieces > batchQty;

    computedStages[key] = {
      ...st,
      total_cost: cost,
      paid: Number(paid.toFixed(2)),
      remaining: remaining,
      payments: stPayments,
      total_batch_pieces: totalBatchPieces,
      is_batch_over_limit: isBatchOverLimit
    };
    totalStagesCost += cost;
  }

  const totalMaterialsCost = calculateTotalMaterialsCost(
    materialLines.map((l) => ({
      quantity: Number(l.quantity) || 0,
      unit_price: Number(l.unit_price) || 0
    }))
  );
  const totalAdditionalCosts = calculateTotalAdditionalCosts(additionalCosts);
  const totalProductCost = Number((totalMaterialsCost + totalAdditionalCosts + totalStagesCost).toFixed(2));

  // Unit Cost at high precision (up to 4 decimals, Requirement 4.4)
  const unitCostExact = totalProductCost / batchQty;
  const unitCost4Decimals = Number(unitCostExact.toFixed(4));

  // Largest Remainder Method for Size Cost Breakdown (Requirement 4.4)
  const sizeWeights = {};
  for (const [s, q] of Object.entries(sizeQuantities)) {
    const num = parseInt(q, 10);
    if (!isNaN(num) && num > 0) sizeWeights[s] = num;
  }
  const distributedSizePiasters = distributeCostLargestRemainder(toPiasters(totalProductCost), sizeWeights);
  const sizeCostBreakdown = Object.entries(distributedSizePiasters).map(([s, pVal]) => ({
    size: s,
    quantity: sizeWeights[s],
    total_cost: fromPiasters(pVal),
    unit_cost: Number((fromPiasters(pVal) / sizeWeights[s]).toFixed(4))
  }));

  // Reconciled check sum of sizes
  const sizeCostsSumEGP = sizeCostBreakdown.reduce((sum, item) => sum + item.total_cost, 0);

  // Stage Payment Recording (Requirement 4.3)
  const handleAddStagePayment = async (e) => {
    if (e) e.preventDefault();
    setPaymentError('');

    const targetStageKey = newPayment.stage_key;
    const stComputed = computedStages[targetStageKey];
    const amt = Number(newPayment.amount);

    if (isNaN(amt) || amt <= 0) {
      setPaymentError('مبلغ الدفعة يجب أن يكون رقماً أكبر من صفر');
      return;
    }

    if (!stComputed?.vendor_id) {
      setPaymentError(`يرجى تحديد الورشة/المورد لمرحلة (${STAGE_KEYS.find(s => s.key === targetStageKey)?.title}) قبل تسجيل الدفعة`);
      return;
    }

    if (amt > stComputed.remaining) {
      setPaymentError(`مبلغ الدفعة (${amt} ج.م) لا يمكن أن يتجاوز المبلغ المتبقي للمرحلة (${stComputed.remaining} ج.م)`);
      return;
    }

    try {
      setPaymentSubmitting(true);
      if (orderId) {
        // Direct call to API
        await api.addStagePayment(orderId, targetStageKey, {
          amount: amt,
          payment_date: newPayment.payment_date || today,
          payment_method: newPayment.payment_method || 'نقداً',
          account_id: newPayment.account_id,
          notes: newPayment.notes.trim()
        });

        // Reload order to refresh payments
        const orderRes = await api.getProductionOrder(orderId);
        const o = orderRes.data || orderRes.order;
        if (o && Array.isArray(o.stage_payments)) {
          setStagePayments(o.stage_payments);
        }
      } else {
        // Buffer locally for new order
        const pRecord = {
          id: `pay-${Date.now()}-${stagePayments.length}`,
          payment_number: `PAY-${STAGE_KEYS.find(s => s.key === targetStageKey)?.key.toUpperCase()}-${Date.now().toString().slice(-4)}`,
          payment_date: newPayment.payment_date || today,
          stage_type: targetStageKey,
          amount: amt,
          payment_method: newPayment.payment_method || 'نقداً',
          account_id: newPayment.account_id,
          notes: newPayment.notes.trim()
        };
        setStagePayments((prev) => [...prev, pRecord]);
      }

      setNewPayment((prev) => ({
        ...prev,
        amount: '',
        notes: ''
      }));

      if (onNotify) onNotify('تم تسجيل دفعة المرحلة بنجاح في السجل المشترك');
    } catch (err) {
      setPaymentError(err.message || 'حدث خطأ أثناء تسجيل الدفعة');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // Validation
  const validate = () => {
    const errs = {};
    if (!form.cutting_number.trim()) errs.cutting_number = 'رقم القصة مطلوب ويجب إدخاله يدوياً';
    if (!form.product_id) errs.product_id = 'يرجى اختيار المنتج التام أو اسم القصة';
    
    const qtyErr = Validators.positiveNumber(form.batch_quantity, 'إجمالي عدد القطع');
    if (qtyErr) errs.batch_quantity = qtyErr;

    if (isOrderClosed && !editReason.trim()) {
      errs.edit_reason = 'أمر القص مقفل، يرجى كتابة سبب التعديل للمتابعة';
    }

    // Check batch pieces limit for each stage
    for (const item of STAGE_KEYS) {
      if (computedStages[item.key]?.is_batch_over_limit) {
        errs[item.key] = `مجموع قطع دفعات مرحلة (${item.title}) يتجاوز إجمالي قطع القصة (${batchQty} قطعة)`;
      }
    }

    const validLines = materialLines.filter((l) => Boolean(l.material_id));
    if (validLines.length === 0) {
      errs.materials = 'يرجى اختيار خامة واحدة على الأقل من الخامات المتاحة للتشغيل';
    }

    const stockErrors = [];
    validLines.forEach((line) => {
      const qty = Number(line.quantity) || 0;
      if (qty <= 0) {
        errs.materials = 'كمية كل خامة يجب أن تكون أكبر من صفر';
      }
      if (!isEdit && qty > line.current_stock) {
        stockErrors.push(
          `الكمية المطلوبة من (${line.name || line.code}) هي (${qty}) وهي أكبر من الرصيد المتاح بالمخزن (${line.current_stock})`
        );
      }
    });

    if (stockErrors.length > 0) {
      errs.stock = stockErrors.join(' | ');
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validate()) {
      if (errors.stock) alert(errors.stock);
      return;
    }

    try {
      setSaving(true);
      const validLines = materialLines
        .filter((l) => Boolean(l.material_id))
        .map((l) => ({
          material_id: l.material_id,
          name: l.name,
          code: l.code,
          unit: l.unit,
          quantity: Number(l.quantity) || 1,
          unit_price: Number(l.unit_price) || 0
        }));

      const validCosts = additionalCosts
        .filter((c) => Number(c.amount) > 0)
        .map((c) => ({
          name: c.name.trim() || 'تكلفة إضافية',
          amount: Number(c.amount) || 0
        }));

      const payloadStages = {};
      for (const item of STAGE_KEYS) {
        const k = item.key;
        const st = stages[k];
        payloadStages[k] = {
          vendor_id: st.vendor_id,
          vendor_name: st.vendor_name,
          pricing_type: st.pricing_type,
          price_per_piece: Number(st.price_per_piece) || 0,
          fixed_total: Number(st.fixed_total) || 0,
          batches: (st.batches || []).map(b => ({
            id: b.id,
            date: b.date,
            pieces: Number(b.pieces) || 0,
            unit_price: Number(b.unit_price) || 0,
            notes: b.notes || ''
          })),
          notes: st.notes || '',
          total_cost: computedStages[k]?.total_cost || 0
        };
      }

      const payload = {
        status: isEdit ? (isOrderClosed ? 'closed' : 'issued') : 'issued',
        cutting_number: form.cutting_number.trim(),
        order_number: form.cutting_number.trim(),
        cutting_name: form.cutting_name.trim() || selectedProduct?.name || '',
        product_id: form.product_id,
        batch_quantity: batchQty,
        start_date: form.start_date,
        fabric_type: form.fabric_type.trim(),
        color: form.color.trim(),
        cutouts_1: form.cutouts_1.trim(),
        cutouts_2: form.cutouts_2.trim(),
        size_quantities: sizeQuantities,
        cutting_comment: form.cutting_comment.trim(),
        notes: form.notes.trim(),
        stages: payloadStages,
        materials: validLines,
        additional_costs: validCosts,
        stage_payments: stagePayments,
        edit_reason: isOrderClosed ? editReason.trim() : null
      };

      if (isEdit) {
        await api.updateProductionOrder(orderId, payload);
      } else {
        await api.createProductionOrder(payload);
      }

      isSavedRef.current = true;
      navigationGuard.unregister();

      if (onNotify) {
        onNotify(
          isEdit
            ? 'تم حفظ وتحديث أمر القص ومراحل التشغيل واحتساب الفروق المخزنية بنجاح'
            : 'تم حفظ وإصدار أمر القص بنجاح وخصم الخامات ومطابقة التكاليف لأقرب قرش'
        );
      }

      if (onSaved) onSaved();
      else if (onBack) onBack();
      else window.location.hash = '#/manufacturing';
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء حفظ أمر القص');
    } finally {
      setSaving(false);
    }
  };

  const isFormValid = Boolean(
    form.cutting_number.trim() && 
    form.product_id && 
    batchQty > 0 && 
    materialLines.some((l) => Boolean(l.material_id)) &&
    (!isOrderClosed || editReason.trim())
  );

  if (loading) {
    return (
      <PageContainer title="شاشة القص">
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500 font-bold">
          جاري تحميل بيانات أمر القص والمراحل والخامات...
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={isEdit ? `شاشة القص — تعديل أمر القص [${form.cutting_number || '---'}]` : 'شاشة القص — أمر قص جديد (حفظ وإصدار)'}
      subtitle="تسجيل بيانات القصة، توزيع المقاسات والكميات، ومراحل الطباعة والتطريز والحياكة"
      breadcrumbs={[
        { label: 'شاشة القص', href: '#/manufacturing' },
        { label: isEdit ? 'تعديل أمر قص' : 'أمر قص جديد' }
      ]}
      hasBottomBar={true}
      onSave={handleSubmit}
      onCancel={() => {
        if (onBack) onBack();
        else window.location.hash = '#/manufacturing';
      }}
      isSaving={saving}
      saveDisabled={!isFormValid || saving}
      saveText={isEdit ? 'حفظ تعديلات أمر القص' : 'حفظ وإصدار'}
      extraBottomContent={
        <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-slate-700 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
          <span>
            إجمالي قطع القصة: <span className="font-mono text-blue-700 font-bold">{batchQty} قطعة</span>
          </span>
          <span className="text-slate-300">|</span>
          <span>
            تكلفة المراحل: <span className="font-mono text-slate-900">{formatCurrency(totalStagesCost)}</span>
          </span>
          <span className="text-slate-300">|</span>
          <span>
            تكلفة الخامات: <span className="font-mono text-slate-900">{formatCurrency(totalMaterialsCost)}</span>
          </span>
          <span className="text-slate-300">|</span>
          <span>
            إجمالي تكلفة القصة: <span className="font-mono text-emerald-700 text-sm">{formatCurrency(totalProductCost)}</span>
          </span>
          <span className="text-slate-300">|</span>
          <span>
            تكلفة القطعة (4 أرقام): <span className="font-mono text-amber-700 text-sm">{unitCost4Decimals.toFixed(4)} ج.م</span>
          </span>
        </div>
      }
    >
      <form onSubmit={(e) => e.preventDefault()} onKeyDown={handleFormKeyDown} className="space-y-6">
        {/* Closed Order Warning & Edit Reason Field (Requirement 4.2) */}
        {isOrderClosed && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl shadow-xs space-y-2">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
              <Lock className="w-4 h-4 text-amber-700" />
              <span>تنبيه: هذا أمر قص مقفل (Closed). يتطلب التعديل إدخال سبب كتابي لحفظ التعديلات في سجل التدقيق.</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-amber-900 mb-1">
                سبب التعديل لأمر القص المقفل <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                aria-label="سبب التعديل لأمر القص المقفل"
                className="w-full px-3 py-2 border border-amber-400 bg-white rounded-lg text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
              <FieldError error={errors.edit_reason} />
            </div>
          </div>
        )}

        {errors.stock && (
          <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs font-bold text-red-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span>{errors.stock}</span>
          </div>
        )}

        {/* Section 1: Cutting Order Information Fields (Requirement 4.1) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Scissors className="w-5 h-5 text-[#1F3A5F]" />
              بيانات أمر القص الأساسية
            </h2>
            <span className="text-xs text-slate-500 font-semibold">
              رقم القصة يدوي وفريد، الاسم، نوع القماش، واللون
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-2 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Cutting Number: Manual typed by user, no auto serial (Requirement 4.1) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم القصة (يدوي وفريد) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.cutting_number}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, cutting_number: e.target.value }));
                      if (errors.cutting_number) setErrors((prev) => ({ ...prev, cutting_number: null }));
                    }}
                    aria-label="رقم القصة"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white text-[#1F3A5F] focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                  />
                  <FieldError error={errors.cutting_number} />
                </div>

                {/* Cutting Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم القصة (Cutting Name) *
                  </label>
                  <input
                    type="text"
                    value={form.cutting_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, cutting_name: e.target.value }))}
                    aria-label="اسم القصة"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                  />
                </div>
              </div>

              {/* Target Finished Product */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  المنتج التام المستهدف ربطه بالقصة <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.product_id}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  aria-label="المنتج التام المستهدف ربطه بالقصة"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white font-bold text-[#1F3A5F] focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                >
                  <option value="">-- اختر المنتج من دليل الأصناف --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code || '---'}] {p.name} {p.category ? `(${p.category})` : ''}
                    </option>
                  ))}
                </select>
                <FieldError error={errors.product_id} />
              </div>

              {/* Fabric Type, Color, Date */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    نوع القماش (Fabric Type)
                  </label>
                  <input
                    type="text"
                    value={form.fabric_type}
                    onChange={(e) => setForm((prev) => ({ ...prev, fabric_type: e.target.value }))}
                    aria-label="نوع القماش"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اللون (Color)
                  </label>
                  <input
                    type="text"
                    value={form.color}
                    onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
                    aria-label="اللون"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تاريخ بدء القص
                  </label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                    aria-label="تاريخ بدء القص"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                  />
                </div>
              </div>

              {/* Cutouts 1 & 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تخاريج 1 (Cutouts 1)
                  </label>
                  <input
                    type="text"
                    value={form.cutouts_1}
                    onChange={(e) => setForm((prev) => ({ ...prev, cutouts_1: e.target.value }))}
                    aria-label="تخاريج 1"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تخاريج 2 (Cutouts 2)
                  </label>
                  <input
                    type="text"
                    value={form.cutouts_2}
                    onChange={(e) => setForm((prev) => ({ ...prev, cutouts_2: e.target.value }))}
                    aria-label="تخاريج 2"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                  />
                </div>
              </div>

              {/* Notes and Cutting Comment (Requirement 4.2: plain comment, no suspend status) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تعليق أمر القص (Cutting Order Comment)
                  </label>
                  <input
                    type="text"
                    value={form.cutting_comment}
                    onChange={(e) => setForm((prev) => ({ ...prev, cutting_comment: e.target.value }))}
                    aria-label="تعليق أمر القص"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ملاحظات عامة
                  </label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    aria-label="ملاحظات عامة"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                  />
                </div>
              </div>
            </div>

            {/* Right: Item Image Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-bold text-slate-600 mb-2">صورة الموديل / القصة</span>
              {selectedProduct?.image ? (
                <div className="w-40 h-40 rounded-xl overflow-hidden border border-slate-300 shadow-xs">
                  <img
                    src={selectedProduct.image}
                    alt={selectedProduct.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-40 h-40 rounded-xl bg-white border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400">
                  <ImageIcon className="w-10 h-10 mb-1 text-slate-300" aria-hidden="true" />
                  <span className="text-[11px]">لا توجد صورة محملة</span>
                </div>
              )}
              {selectedProduct && (
                <div className="mt-2 text-center">
                  <span className="text-xs font-bold text-[#1F3A5F] block">
                    {selectedProduct.name}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    كود: {selectedProduct.code}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Size and Quantity Distribution (Requirement 4.4) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                توزيع المقاسات والكميات (M إلى 6XL) وتوزيع التكلفة
              </h2>
              <span className="text-xs text-slate-500 font-semibold">
                حدد عدد القطع لكل مقاس؛ يتم احتساب إجمالي القطع وتوزيع التكلفة لأقرب قرش بطريقة أكبر البواقي.
              </span>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 px-4 py-1.5 rounded-xl flex items-center gap-2 text-xs font-bold text-indigo-900">
              <span>إجمالي قطع القصة:</span>
              <span className="text-sm font-mono text-indigo-700 font-bold">{batchQty} قطعة</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {ALL_SIZES.map((size) => (
              <div
                key={size}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-indigo-300 transition-all text-center space-y-1.5"
              >
                <div className="inline-block px-2 py-0.5 rounded-md bg-[#1F3A5F] text-white font-mono font-bold text-xs">
                  {size}
                </div>
                <div>
                  <NumberInput
                    value={sizeQuantities[size] || ''}
                    onChange={(val) => handleSizeQuantityChange(size, val)}
                    aria-label={`كمية المقاس ${size}`}
                    className="w-full text-center px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                  <span className="block text-[10px] text-slate-400 mt-0.5">قطع</span>
                </div>
              </div>
            ))}
          </div>
          <FieldError error={errors.batch_quantity} />

          {/* Size Cost Reconciliation Card (Largest Remainder Breakdown) */}
          {sizeCostBreakdown.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>توزيع تكلفة القصة على المقاسات (طريقة أكبر البواقي - مطابقة لأقرب قرش):</span>
                <span className="font-mono text-emerald-700">
                  مجموع تكلفة المقاسات: {formatCurrency(sizeCostsSumEGP)} = إجمالي التكلفة: {formatCurrency(totalProductCost)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {sizeCostBreakdown.map((sc) => (
                  <div key={sc.size} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-mono flex items-center gap-2 shadow-2xs">
                    <span className="font-bold text-[#1F3A5F]">{sc.size}:</span>
                    <span>{sc.quantity} قطعة</span>
                    <span className="text-slate-300">|</span>
                    <span className="font-bold text-slate-800">{formatCurrency(sc.total_cost)}</span>
                    <span className="text-slate-400 text-[10px]">({sc.unit_cost.toFixed(4)}/ق)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Section 3: Three Stages (الطباعة / التطريز / الحياكة) (Requirement 4.3) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-600" />
              مراحل الإنتاج (الطباعة / التطريز / الحياكة)
            </h2>
            <span className="text-xs text-slate-500 font-semibold">
              تحديد الورش والمطابع (موردي خدمات)، واختيار التسعير (إجمالي أو دفعات)، ومتابعة المسدد والمتبقي وسندات الصرف المشتركة.
            </span>
          </div>

          <div className="space-y-6">
            {STAGE_KEYS.map((item) => {
              const k = item.key;
              const st = stages[k];
              const stComputed = computedStages[k];
              const IconComp = item.icon;
              const isInlineOpen = inlineVendorState.activeStage === k;

              return (
                <div key={k} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4">
                  {/* Stage Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                      <div className="p-1.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
                        <IconComp className="w-4 h-4 text-[#1F3A5F]" />
                      </div>
                      <span>مرحلة {item.title}</span>
                    </div>

                    {/* Stage Financial Summary Cards (Requirement 4.3) */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono">
                        <span className="text-slate-500 font-semibold ml-1">إجمالي التكلفة:</span>
                        <span className="font-bold text-slate-900">{formatCurrency(stComputed.total_cost)}</span>
                      </div>
                      <div className="px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-mono">
                        <span className="text-emerald-700 font-semibold ml-1">المسدد:</span>
                        <span className="font-bold text-emerald-800">{formatCurrency(stComputed.paid)}</span>
                      </div>
                      <div className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs font-mono">
                        <span className="text-amber-700 font-semibold ml-1">المتبقي:</span>
                        <span className="font-bold text-amber-800">{formatCurrency(stComputed.remaining)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Vendor Dropdown + Inline "+" Button (Requirement 4.3) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">
                          الورشة / المورد (مورد خدمات)
                        </label>
                        <button
                          type="button"
                          onClick={() => isInlineOpen ? setInlineVendorState(prev => ({ ...prev, activeStage: null })) : handleOpenInlineVendor(k)}
                          className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{isInlineOpen ? 'إلغاء الإضافة' : '+ إضافة ورشة سريعة'}</span>
                        </button>
                      </div>

                      <select
                        value={st.vendor_id || ''}
                        onChange={(e) => {
                          const vId = e.target.value;
                          const found = workshopVendors.find(v => String(v.id) === String(vId));
                          handleStageFieldChange(k, 'vendor_id', vId);
                          handleStageFieldChange(k, 'vendor_name', found ? found.name : '');
                        }}
                        aria-label={`اختيار ورشة لمرحلة ${item.title}`}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 font-bold focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                      >
                        <option value="">-- اختر الورشة / المطبعة --</option>
                        {workshopVendors.map((w) => (
                          <option key={w.id} value={w.id}>
                            [{w.code || '---'}] {w.name} {w.phone ? `(${w.phone})` : ''}
                          </option>
                        ))}
                      </select>

                      {/* Inline Quick Add Workshop Form (Requirement 4.3: NOT a modal) */}
                      {isInlineOpen && (
                        <div className="mt-3 p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3 shadow-xs">
                          <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-blue-700" />
                            <span>إضافة ورشة / مطبعة سريعة لمرحلة {item.title}</span>
                          </div>
                          {inlineVendorState.error && (
                            <div className="text-xs text-red-600 font-bold">{inlineVendorState.error}</div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-0.5">اسم الورشة *</label>
                              <input
                                type="text"
                                value={inlineVendorState.name}
                                onChange={(e) => setInlineVendorState(prev => ({ ...prev, name: e.target.value }))}
                                aria-label="اسم الورشة"
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-0.5">كود الورشة</label>
                              <input
                                type="text"
                                value={inlineVendorState.code}
                                onChange={(e) => setInlineVendorState(prev => ({ ...prev, code: e.target.value }))}
                                aria-label="كود الورشة"
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-0.5">رقم الهاتف</label>
                              <input
                                type="text"
                                value={inlineVendorState.phone}
                                onChange={(e) => setInlineVendorState(prev => ({ ...prev, phone: e.target.value }))}
                                aria-label="رقم الهاتف للورشة"
                                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setInlineVendorState(prev => ({ ...prev, activeStage: null }))}
                              className="px-3 py-1 border border-slate-300 bg-white rounded-lg text-xs font-semibold cursor-pointer"
                            >
                              إلغاء
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveInlineVendor(k)}
                              disabled={inlineVendorState.submitting}
                              className="px-3.5 py-1 bg-[#1F3A5F] text-white rounded-lg text-xs font-bold hover:bg-[#162a45] cursor-pointer disabled:opacity-50"
                            >
                              {inlineVendorState.submitting ? 'جاري الحفظ...' : 'حفظ الورشة وتعيينها'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Pricing Mode Selector (Requirement 4.3) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        نظام التسعير والتكلفة
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleStageFieldChange(k, 'pricing_type', 'fixed')}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer text-center ${
                            st.pricing_type === 'fixed'
                              ? 'bg-[#1F3A5F] text-white border-[#1F3A5F]'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          مبلغ ثابت
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStageFieldChange(k, 'pricing_type', 'per_piece')}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer text-center ${
                            st.pricing_type === 'per_piece'
                              ? 'bg-[#1F3A5F] text-white border-[#1F3A5F]'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          سعر القطعة × الإجمالي
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStageFieldChange(k, 'pricing_type', 'batches')}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer text-center ${
                            st.pricing_type === 'batches'
                              ? 'bg-[#1F3A5F] text-white border-[#1F3A5F]'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          على دفعات (Batches)
                        </button>
                      </div>

                      {/* Pricing Values Input */}
                      <div className="mt-2">
                        {st.pricing_type === 'fixed' && (
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-0.5">المبلغ الإجمالي الثابت (ج.م)</label>
                            <MoneyInput
                              value={st.fixed_total}
                              onChange={(val) => handleStageFieldChange(k, 'fixed_total', val)}
                              aria-label={`المبلغ الثابت لمرحلة ${item.title}`}
                              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white text-slate-900"
                            />
                          </div>
                        )}

                        {st.pricing_type === 'per_piece' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-0.5">سعر تشغيل القطعة (ج.م)</label>
                              <MoneyInput
                                value={st.price_per_piece}
                                onChange={(val) => handleStageFieldChange(k, 'price_per_piece', val)}
                                aria-label={`سعر القطعة لمرحلة ${item.title}`}
                                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white text-slate-900"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-0.5">الإجمالي المحتسب</label>
                              <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800">
                                {formatCurrency(stComputed.total_cost)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Batches Table (When pricing_type === 'batches') (Requirement 4.3) */}
                  {st.pricing_type === 'batches' && (
                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          دفعات التشغيل (مجموع القطع لا يمكن أن يتجاوز {batchQty} قطعة)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddStageBatch(k)}
                          className="px-2.5 py-1 bg-[#1F3A5F] text-white rounded-lg text-xs font-bold hover:bg-[#162a45] cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ إضافة دفعة</span>
                        </button>
                      </div>

                      {stComputed.is_batch_over_limit && (
                        <div className="p-2.5 bg-red-50 border border-red-300 rounded-lg text-xs font-bold text-red-800">
                          تحذير: مجموع قطع الدفعات ({stComputed.total_batch_pieces} قطعة) يتجاوز إجمالي قطع القصة ({batchQty} قطعة)!
                        </div>
                      )}

                      <div className="overflow-x-auto">
                        <table className="w-full text-right border-collapse text-xs">
                          <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                            <tr>
                              <th className="p-2 w-10 text-center">#</th>
                              <th className="p-2 w-32">التاريخ</th>
                              <th className="p-2 w-28 text-center">عدد القطع</th>
                              <th className="p-2 w-28 text-center">سعر القطعة (ج.م)</th>
                              <th className="p-2 w-32 text-left font-mono">الإجمالي (ج.م)</th>
                              <th className="p-2">ملاحظات</th>
                              <th className="p-2 w-12 text-center">حذف</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(st.batches || []).length === 0 ? (
                              <tr>
                                <td colSpan="7" className="p-4 text-center text-slate-400">
                                  لا توجد دفعات تشغيل مسجلة
                                </td>
                              </tr>
                            ) : (
                              (st.batches || []).map((b, bIdx) => {
                                const bPieces = Number(b.pieces) || 0;
                                const bPrice = Number(b.unit_price) || 0;
                                const bTotal = Number((bPieces * bPrice).toFixed(2));
                                return (
                                  <tr key={b.id || bIdx} className="hover:bg-slate-50">
                                    <td className="p-2 text-center text-slate-400">{bIdx + 1}</td>
                                    <td className="p-1">
                                      <input
                                        type="date"
                                        value={b.date || today}
                                        onChange={(e) => handleBatchChange(k, bIdx, 'date', e.target.value)}
                                        aria-label="تاريخ الدفعة"
                                        className="w-full px-2 py-1 border border-slate-300 rounded-md text-xs font-mono"
                                      />
                                    </td>
                                    <td className="p-1">
                                      <NumberInput
                                        value={b.pieces}
                                        onChange={(val) => handleBatchChange(k, bIdx, 'pieces', val)}
                                        aria-label="عدد القطع في الدفعة"
                                        className="w-full px-2 py-1 border border-slate-300 rounded-md text-xs font-mono text-center font-bold"
                                      />
                                    </td>
                                    <td className="p-1">
                                      <MoneyInput
                                        value={b.unit_price}
                                        onChange={(val) => handleBatchChange(k, bIdx, 'unit_price', val)}
                                        aria-label="سعر القطعة في الدفعة"
                                        className="w-full px-2 py-1 border border-slate-300 rounded-md text-xs font-mono text-center font-bold"
                                      />
                                    </td>
                                    <td className="p-2 text-left font-mono font-bold text-slate-800">
                                      {formatCurrency(bTotal)}
                                    </td>
                                    <td className="p-1">
                                      <input
                                        type="text"
                                        value={b.notes || ''}
                                        onChange={(e) => handleBatchChange(k, bIdx, 'notes', e.target.value)}
                                        aria-label="ملاحظات الدفعة"
                                        className="w-full px-2 py-1 border border-slate-300 rounded-md text-xs"
                                      />
                                    </td>
                                    <td className="p-1 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveStageBatch(k, bIdx)}
                                        className="p-1 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                                        title="حذف الدفعة"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Stage Notes */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                      ملاحظات وتعليمات مرحلة {item.title}
                    </label>
                    <input
                      type="text"
                      value={st.notes}
                      onChange={(e) => handleStageFieldChange(k, 'notes', e.target.value)}
                      aria-label={`ملاحظات مرحلة ${item.title}`}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Payments Section Across Stages (Requirement 4.3: shared supplier payment ledger) */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  سجل مدفوعات مراحل التشغيل (خصم الخزينة ورصيد الورشة بحركة واحدة)
                </h3>
                <span className="text-[11px] text-slate-500 font-semibold">
                  تسجيل دفعات للمطابع وورش التطريز والحياكة؛ تخفض رصيد الخزينة والورشة ولا يمكن أن تتجاوز المتبقي.
                </span>
              </div>
            </div>

            {paymentError && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs font-bold text-red-800">
                {paymentError}
              </div>
            )}

            {/* Add Payment Form */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
              <div className="text-xs font-bold text-slate-800">تسجيل دفعة مرحلة جديدة</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">المرحلة المستهدفة</label>
                  <select
                    value={newPayment.stage_key}
                    onChange={(e) => setNewPayment(prev => ({ ...prev, stage_key: e.target.value }))}
                    aria-label="المرحلة المستهدفة للدفعة"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold bg-white"
                  >
                    {STAGE_KEYS.map(s => (
                      <option key={s.key} value={s.key}>{s.title} (متبقي: {formatCurrency(computedStages[s.key]?.remaining || 0)})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">تاريخ الدفعة</label>
                  <input
                    type="date"
                    value={newPayment.payment_date}
                    onChange={(e) => setNewPayment(prev => ({ ...prev, payment_date: e.target.value }))}
                    aria-label="تاريخ الدفعة"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    المبلغ (ج.م) *
                  </label>
                  <MoneyInput
                    value={newPayment.amount}
                    onChange={(val) => setNewPayment(prev => ({ ...prev, amount: val }))}
                    aria-label="مبلغ الدفعة"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white text-emerald-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">الخزينة المنصرف منها</label>
                  <select
                    value={newPayment.account_id}
                    onChange={(e) => setNewPayment(prev => ({ ...prev, account_id: e.target.value }))}
                    aria-label="الخزينة المنصرف منها"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-bold"
                  >
                    {treasuryAccounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatCurrency(a.current_balance)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">ملاحظات وبيان الدفعة</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newPayment.notes}
                      onChange={(e) => setNewPayment(prev => ({ ...prev, notes: e.target.value }))}
                      aria-label="ملاحظات وبيان الدفعة"
                      className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddStagePayment}
                      disabled={paymentSubmitting}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{paymentSubmitting ? 'تسجيل...' : 'تسجيل'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Payments Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-xs">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-10 text-center">#</th>
                    <th className="p-3">رقم السند</th>
                    <th className="p-3">المرحلة</th>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3 text-left font-mono">المبلغ (ج.م)</th>
                    <th className="p-3">طريقة السداد</th>
                    <th className="p-3">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stagePayments.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-6 text-center text-slate-400 font-semibold">
                        لا توجد دفعات مراحل مسجلة حتى الآن
                      </td>
                    </tr>
                  ) : (
                    stagePayments.map((p, idx) => {
                      const stTitle = STAGE_KEYS.find(s => s.key === p.stage_type)?.title || p.stage_type || 'الطباعة';
                      return (
                        <tr key={p.id || idx} className="hover:bg-slate-50">
                          <td className="p-3 text-center text-slate-400 font-semibold">{idx + 1}</td>
                          <td className="p-3 font-mono font-bold text-slate-700">{p.payment_number || `PAY-${idx + 1}`}</td>
                          <td className="p-3 font-bold text-[#1F3A5F]">{stTitle}</td>
                          <td className="p-3 font-mono text-slate-700">{formatDate(p.payment_date)}</td>
                          <td className="p-3 text-left font-mono font-bold text-emerald-700">{formatCurrency(p.amount)}</td>
                          <td className="p-3 text-slate-600">{p.payment_method || 'نقداً'}</td>
                          <td className="p-3 text-slate-600">{p.notes || '---'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Section 4: Raw Material Lines */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-[#1F3A5F]" />
                بنود الخامات ومستلزمات الإنتاج
              </h2>
              <span className="text-xs text-slate-500 font-semibold">
                المواد الخام فقط، مع إمكانية تعديل الكميات واحتساب فروق الحركات المخزنية فقط عند التعديل.
              </span>
            </div>

            <button
              type="button"
              onClick={handleAddMaterialLine}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#1F3A5F] text-white hover:bg-[#162a45] transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة خامة للتشغيل</span>
            </button>
          </div>

          <FieldError error={errors.materials} />

          <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10 text-center">#</th>
                  <th className="p-3 w-72">الخامة (بحث بالكود والاسم)</th>
                  <th className="p-3 w-28 text-center font-mono">الرصيد المتاح</th>
                  <th className="p-3 w-32 text-center">الكمية المطلوبة</th>
                  <th className="p-3 w-32 text-center">سعر الوحدة (ج.م)</th>
                  <th className="p-3 w-36 text-left font-mono">إجمالي البند (ج.م)</th>
                  <th className="p-3 w-16 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {materialLines.map((line, idx) => {
                  const qty = Number(line.quantity) || 0;
                  const price = Number(line.unit_price) || 0;
                  const lineCost = calculateMaterialLineCost(qty, price);
                  const isStockShortage = Boolean(!isEdit && line.material_id && qty > line.current_stock);

                  return (
                    <tr key={line.id || idx} className={`hover:bg-slate-50 ${isStockShortage ? 'bg-red-50/50' : ''}`}>
                      <td className="p-3 font-semibold text-slate-400 text-center">{idx + 1}</td>
                      <td className="p-2">
                        <SearchableMaterialSelect
                          items={rawMaterials}
                          value={line.material_id}
                          onChange={(item) => handleMaterialSelect(idx, item)}
                        />
                      </td>
                      <td className="p-2 text-center font-mono font-bold">
                        {line.material_id ? (
                          <span className={line.current_stock > 0 ? 'text-emerald-700' : 'text-red-600'}>
                            {line.current_stock} {line.unit}
                          </span>
                        ) : (
                          <span className="text-slate-300">---</span>
                        )}
                      </td>
                      <td className="p-2">
                        <NumberInput
                          value={line.quantity}
                          onChange={(val) => handleLineQuantityChange(idx, val)}
                          aria-label={`الكمية المطلوبة للبند ${idx + 1}`}
                          className={`w-full px-2.5 py-1.5 border rounded-lg text-xs font-mono font-bold text-center focus:outline-hidden focus:ring-2 ${
                            isStockShortage
                              ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-500'
                              : 'border-slate-300 bg-white text-slate-800 focus:ring-[#1F3A5F]'
                          }`}
                        />
                        {isStockShortage && (
                          <span className="block text-[10px] text-red-600 font-bold mt-1 text-center">
                            أكبر من المتاح!
                          </span>
                        )}
                      </td>
                      <td className="p-2">
                        <MoneyInput
                          value={line.unit_price}
                          onChange={(val) => handleLinePriceChange(idx, val)}
                          aria-label={`سعر الوحدة للبند ${idx + 1}`}
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-center bg-white text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
                        />
                      </td>
                      <td className="p-3 text-left font-mono font-bold text-slate-900">
                        {formatCurrency(lineCost)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveMaterialLine(idx)}
                          disabled={materialLines.length === 1}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
                          title="حذف البند"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan="5" className="p-3 text-right font-bold text-slate-800 text-xs">
                    إجمالي تكلفة الخامات:
                  </td>
                  <td className="p-3 text-left font-mono font-bold text-slate-900 text-sm">
                    {formatCurrency(totalMaterialsCost)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Section 5: Additional Costs */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-600" />
                تكاليف إضافية (أجور عمالة، كهرباء، أخرى)
              </h2>
              <span className="text-xs text-slate-500 font-semibold">
                صفوف ديناميكية للمصروفات المباشرة وغير المباشرة مع إمكانية الإضافة والحذف.
              </span>
            </div>

            <button
              type="button"
              onClick={handleAddCostRow}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة بند تكلفة</span>
            </button>
          </div>

          <div className="space-y-3">
            {additionalCosts.map((cost, idx) => (
              <div key={cost.id || idx} className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="text-xs font-bold text-slate-400 w-6 text-center">{idx + 1}</span>
                <div className="flex-1">
                  <input
                    type="text"
                    value={cost.name}
                    onChange={(e) => handleCostChange(idx, 'name', e.target.value)}
                    aria-label="بيان التكلفة الإضافية"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="w-48">
                  <MoneyInput
                    value={cost.amount}
                    onChange={(val) => handleCostChange(idx, 'amount', val)}
                    aria-label="مبلغ التكلفة الإضافية"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-left"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveCostRow(idx)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                  title="حذف بند التكلفة"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            <div className="flex justify-between items-center p-3 bg-indigo-50/70 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-900">
              <span>إجمالي تكاليف إضافية:</span>
              <span className="font-mono text-sm">{formatCurrency(totalAdditionalCosts)}</span>
            </div>
          </div>
        </div>

        {/* Section 6: Comprehensive Cost Summary */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ملخص تكلفة أمر القص والقطعة بدقة عالية (4 أرقام عشرية)
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
              <span className="block text-[11px] font-bold text-slate-400 mb-1">
                إجمالي تكلفة الخامات
              </span>
              <span className="text-base font-bold font-mono text-white">
                {formatCurrency(totalMaterialsCost)}
              </span>
            </div>

            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
              <span className="block text-[11px] font-bold text-slate-400 mb-1">
                تكاليف المراحل (3 مراحل)
              </span>
              <span className="text-base font-bold font-mono text-amber-300">
                {formatCurrency(totalStagesCost)}
              </span>
            </div>

            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
              <span className="block text-[11px] font-bold text-slate-400 mb-1">
                تكاليف إضافية
              </span>
              <span className="text-base font-bold font-mono text-indigo-300">
                {formatCurrency(totalAdditionalCosts)}
              </span>
            </div>

            <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/60">
              <span className="block text-[11px] font-bold text-slate-400 mb-1">
                إجمالي تكلفة القصة
              </span>
              <span className="text-lg font-bold font-mono text-emerald-400">
                {formatCurrency(totalProductCost)}
              </span>
            </div>

            <div className="bg-emerald-950/80 p-3.5 rounded-xl border border-emerald-700/60 col-span-2 sm:col-span-1">
              <span className="block text-[11px] font-bold text-emerald-300 mb-1">
                تكلفة القطعة ({batchQty} قطعة)
              </span>
              <span className="text-lg font-bold font-mono text-emerald-300">
                {unitCost4Decimals.toFixed(4)} ج.م
              </span>
            </div>
          </div>
        </div>
      </form>
    </PageContainer>
  );
}
