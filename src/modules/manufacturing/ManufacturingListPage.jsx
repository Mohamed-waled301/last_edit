import React, { useState, useEffect } from 'react';
import { 
  Scissors, 
  Plus, 
  Download, 
  CheckCircle2, 
  Clock, 
  Image as ImageIcon, 
  Search, 
  Edit, 
  Lock, 
  Layers, 
  Building2, 
  DollarSign, 
  Filter,
  FileText,
  AlertTriangle,
  Printer,
  X
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { formatCurrency, formatNumber, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';
import { isValidEgyptianMobile } from '../../utils/phone';
import { CUT_ORDER_SIZES } from '../../logic/cutOrderMatrixCalculations';

export default function ManufacturingListPage({ onNotify }) {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'matrix_report' | 'stage_reports' | 'workshops'
  const [orders, setOrders] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [colorFilter, setColorFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all'); // 'all' | 'printing' | 'embroidery' | 'sewing'
  const [vendorFilter, setVendorFilter] = useState('all');

  // Close order modal state (Requirement 4.2)
  const [closeModalOrder, setCloseModalOrder] = useState(null);
  const [closeReason, setCloseReason] = useState('');
  const [closingOrder, setClosingOrder] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ordersRes, workshopsRes] = await Promise.all([
        api.getProductionOrders(),
        api.getWorkshopVendors ? api.getWorkshopVendors() : api.getParties()
      ]);
      const oList = Array.isArray(ordersRes.data) ? ordersRes.data : (Array.isArray(ordersRes.production_orders) ? ordersRes.production_orders : []);
      const wList = Array.isArray(workshopsRes.data) ? workshopsRes.data : (Array.isArray(workshopsRes.vendors) ? workshopsRes.vendors : []);
      setOrders(oList);
      setWorkshops(wList);
    } catch (err) {
      console.error('Failed to load cutting/production data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Close order action (Requirement 4.2)
  const handleConfirmCloseOrder = async () => {
    if (!closeModalOrder) return;
    try {
      setClosingOrder(true);
      await api.closeProductionOrder(closeModalOrder.id, closeReason.trim() || 'إقفال أمر القص');
      if (onNotify) onNotify(`تم إقفال أمر القص [${closeModalOrder.cutting_number || closeModalOrder.order_number}] بنجاح`);
      setCloseModalOrder(null);
      setCloseReason('');
      loadData();
    } catch (err) {
      alert(err.message || 'فشل إقفال أمر القص');
    } finally {
      setClosingOrder(false);
    }
  };

  // Export Cut Orders to Excel
  const handleExportOrders = () => {
    const exportData = orders.map(o => {
      const isClosed = o.status === 'closed';
      return {
        'رقم القصة': o.cutting_number || o.order_number,
        'اسم القصة': o.cutting_name || o.product_name,
        'نوع القماش': o.fabric_type || '',
        'اللون': o.color || '',
        'الكمية (قطع)': o.batch_quantity || 0,
        'تكلفة الخامات': o.total_material_cost || 0,
        'تكلفة المراحل': o.total_stages_cost || o.total_printing_cost || 0,
        'إجمالي التكلفة': o.total_product_cost || o.total_stage1_cost || 0,
        'تكلفة القطعة': o.unit_cost || 0,
        'تاريخ البدء': formatDate(o.start_date),
        'الحالة': isClosed ? 'مقفل' : (o.status === 'issued' ? 'مُصدر' : 'قيد التشغيل')
      };
    });
    exportToExcel(exportData, 'أوامر_القص_والتشغيل');
    if (onNotify) onNotify('تم تصدير أوامر القص إلى إكسيل');
  };

  // Export Stage Totals Report to Excel (Requirement 4.5)
  const handleExportStageReport = () => {
    const reportRows = [];
    for (const o of orders) {
      const stages = o.stages || {};
      for (const [stKey, stData] of Object.entries(stages)) {
        if (!stData) continue;
        const stTitle = stKey === 'printing' ? 'الطباعة' : stKey === 'embroidery' ? 'التطريز' : 'الحياكة';
        if (stageFilter !== 'all' && stageFilter !== stKey) continue;
        if (vendorFilter !== 'all' && stData.vendor_id !== vendorFilter && stData.vendor_name !== vendorFilter) continue;

        reportRows.push({
          'رقم القصة': o.cutting_number || o.order_number,
          'اسم القصة': o.cutting_name || o.product_name,
          'المرحلة': stTitle,
          'الورشة / المورد': stData.vendor_name || 'غير محدد',
          'نظام التسعير': stData.pricing_type === 'per_piece' ? 'سعر قطعة' : stData.pricing_type === 'batches' ? 'دفعات' : 'ثابت',
          'إجمالي التكلفة': stData.total_cost || 0,
          'المسدد': stData.paid || 0,
          'المتبقي': stData.remaining || 0,
          'تاريخ الأمر': formatDate(o.start_date),
          'حالة القصة': o.status === 'closed' ? 'مقفل' : 'مُصدر'
        });
      }
    }
    exportToExcel(reportRows, 'تقرير_تكاليف_ومدفوعات_مراحل_القص');
    if (onNotify) onNotify('تم تصدير تقرير مراحل القص إلى إكسيل');
  };

  // Extract unique available colors across all cut orders (Requirement 3 & 4)
  const availableColors = React.useMemo(() => {
    const set = new Set();
    orders.forEach(o => {
      if (Array.isArray(o.matrix)) {
        o.matrix.forEach(r => {
          if (r.color && r.color.trim()) set.add(r.color.trim());
        });
      }
      if (o.color && o.color.trim()) set.add(o.color.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [orders]);

  const filteredOrders = orders.filter(o => {
    // 1. Search term
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      const matchHeader = 
        (o.cutting_number || '').toLowerCase().includes(term) ||
        (o.cutting_name || '').toLowerCase().includes(term) ||
        (o.order_number || '').toLowerCase().includes(term) ||
        (o.product_name || '').toLowerCase().includes(term) ||
        (o.fabric_type || '').toLowerCase().includes(term) ||
        (o.color || '').toLowerCase().includes(term);
      const matchMatrix = Array.isArray(o.matrix) && o.matrix.some(r => (r.color || '').toLowerCase().includes(term));
      if (!matchHeader && !matchMatrix) return false;
    }

    // 2. Color filter
    if (colorFilter !== 'all') {
      const hasColor = 
        (o.color && o.color.trim() === colorFilter) ||
        (Array.isArray(o.matrix) && o.matrix.some(r => r.color && r.color.trim() === colorFilter));
      if (!hasColor) return false;
    }

    // 3. Size filter
    if (sizeFilter !== 'all') {
      let hasSize = false;
      if (Array.isArray(o.matrix) && o.matrix.length > 0) {
        hasSize = o.matrix.some(r => (Number(r.quantities?.[sizeFilter]) || 0) > 0);
      } else if (o.size_breakdown) {
        hasSize = (Number(o.size_breakdown[sizeFilter]) || 0) > 0;
      }
      if (!hasSize) return false;
    }

    return true;
  });

  // Flatten matrix rows for "إنتاج القص حسب المقاس واللون" Report (Requirement 4.5)
  const flattenedMatrixRows = React.useMemo(() => {
    const rows = [];
    filteredOrders.forEach(o => {
      const orderNum = o.cutting_number || o.order_number;
      const orderName = o.cutting_name || o.product_name;
      const startDate = o.start_date || (o.created_at ? o.created_at.split('T')[0] : '');
      const statusLabel = o.status === 'closed' ? 'مقفل' : (o.status === 'issued' ? 'مُصدر' : 'قيد التشغيل');

      if (Array.isArray(o.matrix) && o.matrix.length > 0) {
        o.matrix.forEach((r, rIdx) => {
          if (colorFilter !== 'all' && r.color && r.color.trim() !== colorFilter) return;
          if (sizeFilter !== 'all' && (Number(r.quantities?.[sizeFilter]) || 0) <= 0) return;

          const rowTotal = CUT_ORDER_SIZES.reduce((sum, sz) => sum + (Number(r.quantities?.[sz]) || 0), 0);
          if (rowTotal > 0 || r.color) {
            rows.push({
              key: `${o.id}-${r.id || rIdx}`,
              orderId: o.id,
              orderNum,
              orderName,
              fabricType: o.fabric_type || '---',
              color: r.color || 'بدون لون',
              quantities: r.quantities || {},
              rowTotal,
              startDate,
              statusLabel
            });
          }
        });
      } else if (o.batch_quantity) {
        // Legacy fallback
        if (colorFilter !== 'all' && o.color && o.color.trim() !== colorFilter) return;
        if (sizeFilter !== 'all' && (Number(o.size_breakdown?.[sizeFilter]) || 0) <= 0) return;

        rows.push({
          key: `${o.id}-legacy`,
          orderId: o.id,
          orderNum,
          orderName,
          fabricType: o.fabric_type || '---',
          color: o.color || 'غير محدد',
          quantities: o.size_breakdown || {},
          rowTotal: Number(o.batch_quantity) || 0,
          startDate,
          statusLabel
        });
      }
    });
    return rows;
  }, [filteredOrders, colorFilter, sizeFilter]);

  // Column totals for matrix report
  const matrixColTotals = React.useMemo(() => {
    const totals = {};
    CUT_ORDER_SIZES.forEach(sz => {
      totals[sz] = flattenedMatrixRows.reduce((sum, r) => sum + (Number(r.quantities?.[sz]) || 0), 0);
    });
    const grandTotal = flattenedMatrixRows.reduce((sum, r) => sum + r.rowTotal, 0);
    return { totals, grandTotal };
  }, [flattenedMatrixRows]);

  // Export Matrix Report to Excel (Requirement 4.5)
  const handleExportMatrixReport = () => {
    const exportData = flattenedMatrixRows.map(r => {
      const rowObj = {
        'رقم القصة': r.orderNum,
        'اسم القصة': r.orderName,
        'نوع القماش': r.fabricType,
        'اللون': r.color,
      };
      CUT_ORDER_SIZES.forEach(sz => {
        rowObj[sz] = Number(r.quantities?.[sz]) || 0;
      });
      rowObj['إجمالي القطع'] = r.rowTotal;
      rowObj['تاريخ البدء'] = formatDate(r.startDate);
      rowObj['الحالة'] = r.statusLabel;
      return rowObj;
    });

    if (exportData.length > 0) {
      const summaryRow = {
        'رقم القصة': 'الإجمالي الكلي',
        'اسم القصة': '',
        'نوع القماش': '',
        'اللون': '',
      };
      CUT_ORDER_SIZES.forEach(sz => {
        summaryRow[sz] = matrixColTotals.totals[sz] || 0;
      });
      summaryRow['إجمالي القطع'] = matrixColTotals.grandTotal;
      summaryRow['تاريخ البدء'] = '';
      summaryRow['الحالة'] = '';
      exportData.push(summaryRow);
    }

    exportToExcel(exportData, 'تقرير_إنتاج_القص_حسب_المقاس_واللون');
    if (onNotify) onNotify('تم تصدير تقرير إنتاج القص حسب المقاس واللون إلى إكسيل');
  };

  // Flatten stage items for Stage Reports Tab (Requirement 4.5)
  const flattenedStageItems = [];
  for (const o of orders) {
    const stages = o.stages || {};
    for (const [stKey, stData] of Object.entries(stages)) {
      if (!stData) continue;
      if (stageFilter !== 'all' && stageFilter !== stKey) continue;
      if (vendorFilter !== 'all' && stData.vendor_id !== vendorFilter && stData.vendor_name !== vendorFilter) continue;
      flattenedStageItems.push({
        orderId: o.id,
        cutting_number: o.cutting_number || o.order_number,
        cutting_name: o.cutting_name || o.product_name,
        stageKey: stKey,
        stageTitle: stKey === 'printing' ? 'الطباعة' : stKey === 'embroidery' ? 'التطريز' : 'الحياكة',
        vendor_id: stData.vendor_id,
        vendor_name: stData.vendor_name || 'غير محدد',
        pricing_type: stData.pricing_type,
        total_cost: stData.total_cost || 0,
        paid: stData.paid || 0,
        remaining: stData.remaining || 0,
        status: o.status
      });
    }
  }

  // Summary of Stage Totals Report
  const stageReportSummary = flattenedStageItems.reduce(
    (acc, row) => ({
      cost: acc.cost + (Number(row.total_cost) || 0),
      paid: acc.paid + (Number(row.paid) || 0),
      remaining: acc.remaining + (Number(row.remaining) || 0)
    }),
    { cost: 0, paid: 0, remaining: 0 }
  );

  return (
    <PageContainer
      title="شاشة القص ومراحل التشغيل"
      subtitle="إدارة ومتابعة أوامر القص، مراحل الطباعة والتطريز والحياكة، وتوزيع التكاليف لأقرب قرش"
      breadcrumbs={[{ label: 'شاشة القص' }]}
      actions={
        <div className="flex items-center gap-2">
          {activeTab === 'orders' ? (
            <button
              type="button"
              onClick={handleExportOrders}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>تصدير أوامر القص</span>
            </button>
          ) : activeTab === 'matrix_report' ? (
            <button
              type="button"
              onClick={handleExportMatrixReport}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>تصدير تقرير المقاس واللون</span>
            </button>
          ) : activeTab === 'stage_reports' ? (
            <button
              type="button"
              onClick={handleExportStageReport}
              className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>تصدير تقرير المراحل</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => { window.location.hash = '#/manufacturing/new'; }}
            className="px-4 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ أمر قص جديد (حفظ وإصدار)</span>
          </button>
        </div>
      }
    >
      {/* Navigation Tabs (Requirement 4.3 & 4.5) */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'orders'
              ? 'bg-[#1F3A5F] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Scissors className="w-4 h-4" />
          <span>أوامر القص والتشغيل ({orders.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('matrix_report')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'matrix_report'
              ? 'bg-[#1F3A5F] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>إنتاج القص حسب المقاس واللون</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stage_reports')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'stage_reports'
              ? 'bg-[#1F3A5F] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>تقرير إجماليات مراحل القص والورش</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('workshops')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'workshops'
              ? 'bg-[#1F3A5F] text-white shadow-xs'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>دليل ورش ومطابع التشغيل ({workshops.length})</span>
        </button>
      </div>

      {/* Tab 1: Cut Orders Table */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" aria-hidden="true" />
              <input
                type="text"
                value={searchTerm}
                aria-label="البحث برقم القصة أو اسم المنتج"
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-[#1F3A5F]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-bold text-slate-700">اللون:</span>
                <select
                  value={colorFilter}
                  onChange={(e) => setColorFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium focus:ring-1 focus:ring-[#1F3A5F]"
                >
                  <option value="all">جميع الألوان (الكل)</option>
                  {availableColors.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-bold text-slate-700">المقاس:</span>
                <select
                  value={sizeFilter}
                  onChange={(e) => setSizeFilter(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-mono font-medium focus:ring-1 focus:ring-[#1F3A5F]"
                >
                  <option value="all">جميع المقاسات (الكل)</option>
                  {CUT_ORDER_SIZES.map(sz => (
                    <option key={sz} value={sz}>{sz}</option>
                  ))}
                </select>
              </div>

              {(searchTerm || colorFilter !== 'all' || sizeFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setColorFilter('all');
                    setSizeFilter('all');
                  }}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  إعادة ضبط
                </button>
              )}
            </div>
          </div>

          {/* Orders Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
                  <tr>
                    <th className="p-3">رقم القصة (يدوي)</th>
                    <th className="p-3">اسم القصة / المنتج</th>
                    <th className="p-3">نوع القماش</th>
                    <th className="p-3">اللون</th>
                    <th className="p-3 text-center font-mono">إجمالي القطع</th>
                    <th className="p-3 text-left font-mono">تكلفة المراحل</th>
                    <th className="p-3 text-left font-mono">تكلفة الخامات</th>
                    <th className="p-3 text-left font-mono">إجمالي التكلفة</th>
                    <th className="p-3 text-left font-mono">تكلفة القطعة (4 أرقام)</th>
                    <th className="p-3 text-center">الحالة</th>
                    <th className="p-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan="11" className="p-10 text-center text-gray-500 font-bold">
                        جاري تحميل أوامر القص...
                      </td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan="11" className="p-10 text-center text-gray-400">
                        لا توجد أوامر قص مسجلة
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((o, idx) => {
                      const isClosed = o.status === 'closed';
                      const totalCost = o.total_product_cost !== undefined ? o.total_product_cost : (o.total_stage1_cost || 0);
                      const stagesCost = o.total_stages_cost !== undefined ? o.total_stages_cost : (o.total_printing_cost || 0);
                      const displayCutNum = o.cutting_number || o.order_number;
                      const displayCutName = o.cutting_name || o.product_name;
                      const unitCost = Number(o.unit_cost || 0);

                      return (
                        <tr key={o.id || idx} className="hover:bg-gray-50 transition-colors">
                          <td className="p-3 font-mono font-bold text-[#1F3A5F]">
                            {displayCutNum}
                          </td>
                          <td className="p-3 font-bold text-gray-900">
                            {displayCutName}
                          </td>
                          <td className="p-3 text-gray-700">
                            {o.fabric_type || '---'}
                          </td>
                          <td className="p-3 text-gray-700">
                            {(() => {
                              const colors = Array.isArray(o.matrix) && o.matrix.length > 0
                                ? [...new Set(o.matrix.map(r => r.color).filter(Boolean))]
                                : (o.color ? [o.color] : []);
                              if (colors.length === 0) return '---';
                              return (
                                <div className="flex flex-wrap gap-1 max-w-[150px]">
                                  {colors.map((c, i) => (
                                    <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-800">
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-gray-900">
                            {formatNumber(o.batch_quantity || 0)} قطعة
                          </td>
                          <td className="p-3 text-left font-mono font-bold text-blue-700">
                            {formatCurrency(stagesCost)}
                          </td>
                          <td className="p-3 text-left font-mono font-bold text-gray-800">
                            {formatCurrency(o.total_material_cost || 0)}
                          </td>
                          <td className="p-3 text-left font-mono font-bold text-emerald-700">
                            {formatCurrency(totalCost)}
                          </td>
                          <td className="p-3 text-left font-mono font-bold text-amber-700">
                            {unitCost.toFixed(4)} ج.م
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                              isClosed
                                ? 'bg-slate-200 text-slate-800'
                                : (o.status === 'issued' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800')
                            }`}>
                              {isClosed ? 'مقفل' : (o.status === 'issued' ? 'مُصدر' : 'قيد التشغيل')}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Edit Action (Requirement 4.2: reopens order at any time) */}
                              <button
                                type="button"
                                onClick={() => { window.location.hash = `#/manufacturing/${o.id}/edit`; }}
                                className="px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-50 font-bold rounded-md border border-blue-200 transition-colors cursor-pointer flex items-center gap-1"
                                title="تعديل أمر القص"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                <span>تعديل</span>
                              </button>

                              {/* Print Order Action */}
                              <button
                                type="button"
                                onClick={() => { window.location.hash = `#/print-preview?type=cut_order&id=${o.id}&returnUrl=${encodeURIComponent('#/manufacturing')}`; }}
                                className="px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 font-bold rounded-md border border-slate-300 transition-colors cursor-pointer flex items-center gap-1"
                                title="طباعة أمر القص"
                              >
                                <Printer className="w-3.5 h-3.5 text-slate-600" />
                                <span>طباعة</span>
                              </button>

                              {/* Close Order Action (Requirement 4.2) */}
                              {!isClosed && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCloseModalOrder(o);
                                    setCloseReason('');
                                  }}
                                  className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 font-bold rounded-md border border-slate-300 transition-colors cursor-pointer flex items-center gap-1"
                                  title="إقفال أمر القص"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>إقفال</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Matrix Production by Size & Color Report (Requirement 4.5) */}
      {activeTab === 'matrix_report' && (
        <div className="space-y-4">
          {/* Filters & Summary Bar */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[200px]">
                <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" aria-hidden="true" />
                <input
                  type="text"
                  value={searchTerm}
                  aria-label="البحث برقم أو اسم القصة"
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pr-9 pl-3 py-1.5 border border-gray-300 rounded-lg text-xs"
                />
              </div>

              <div>
                <select
                  value={colorFilter}
                  onChange={(e) => setColorFilter(e.target.value)}
                  aria-label="تصفية حسب اللون"
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-bold"
                >
                  <option value="all">جميع الألوان (الكل)</option>
                  {availableColors.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={sizeFilter}
                  onChange={(e) => setSizeFilter(e.target.value)}
                  aria-label="تصفية حسب المقاس"
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-mono font-bold"
                >
                  <option value="all">جميع المقاسات (الكل)</option>
                  {CUT_ORDER_SIZES.map(sz => (
                    <option key={sz} value={sz}>{sz}</option>
                  ))}
                </select>
              </div>

              {(searchTerm || colorFilter !== 'all' || sizeFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setColorFilter('all');
                    setSizeFilter('all');
                  }}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  إعادة ضبط
                </button>
              )}
            </div>

            {/* Matrix Production Summary Badges */}
            <div className="flex items-center gap-3">
              <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-xs font-mono">
                <span className="text-blue-700 font-semibold ml-1">عدد السطور:</span>
                <span className="font-bold text-blue-900 text-sm">{formatNumber(flattenedMatrixRows.length)}</span>
              </div>
              <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-mono">
                <span className="text-emerald-700 font-semibold ml-1">إجمالي القطع المقصوصة:</span>
                <span className="font-bold text-emerald-900 text-sm">{formatNumber(matrixColTotals.grandTotal)} قطعة</span>
              </div>
            </div>
          </div>

          {/* Matrix Production Table with sticky color column and horizontal scroll */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto max-w-full">
              <table className="w-full text-right border-collapse text-xs whitespace-nowrap">
                <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
                  <tr>
                    <th className="p-3 sticky right-0 bg-[#1F3A5F] z-20 shadow-xs">رقم القصة</th>
                    <th className="p-3">اسم القصة / الموديل</th>
                    <th className="p-3">نوع القماش</th>
                    <th className="p-3 sticky right-[120px] bg-[#1F3A5F] z-20 shadow-xs">اللون</th>
                    {CUT_ORDER_SIZES.map(sz => (
                      <th key={sz} className="p-2.5 text-center font-mono w-14">{sz}</th>
                    ))}
                    <th className="p-3 text-center font-mono bg-[#162a45]">إجمالي السطر</th>
                    <th className="p-3">تاريخ البدء</th>
                    <th className="p-3 text-center">الحالة</th>
                    <th className="p-3 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {flattenedMatrixRows.length === 0 ? (
                    <tr>
                      <td colSpan={6 + CUT_ORDER_SIZES.length} className="p-10 text-center text-gray-400">
                        لا توجد بيانات قص مطابقة لمحددات البحث
                      </td>
                    </tr>
                  ) : (
                    flattenedMatrixRows.map((r, idx) => (
                      <tr key={r.key || idx} className="hover:bg-gray-50 transition-colors">
                        <td className="p-3 font-mono font-bold text-[#1F3A5F] sticky right-0 bg-white group-hover:bg-gray-50 z-10 shadow-xs">
                          {r.orderNum}
                        </td>
                        <td className="p-3 font-bold text-gray-900">{r.orderName}</td>
                        <td className="p-3 text-gray-700">{r.fabricType}</td>
                        <td className="p-3 font-semibold text-slate-800 sticky right-[120px] bg-white group-hover:bg-gray-50 z-10 shadow-xs">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200">
                            {r.color}
                          </span>
                        </td>
                        {CUT_ORDER_SIZES.map(sz => {
                          const qty = Number(r.quantities?.[sz]) || 0;
                          return (
                            <td key={sz} className={`p-2.5 text-center font-mono ${qty > 0 ? 'font-bold text-slate-900 bg-blue-50/30' : 'text-slate-300'}`}>
                              {qty > 0 ? formatNumber(qty) : '-'}
                            </td>
                          );
                        })}
                        <td className="p-3 text-center font-mono font-bold text-blue-900 bg-slate-50">
                          {formatNumber(r.rowTotal)}
                        </td>
                        <td className="p-3 font-mono text-gray-600">{formatDate(r.startDate)}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                            r.statusLabel === 'مقفل' ? 'bg-slate-200 text-slate-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {r.statusLabel}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => { window.location.hash = `#/manufacturing/${r.orderId}/edit`; }}
                            className="px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-50 font-bold rounded-md border border-blue-200 transition-colors cursor-pointer"
                          >
                            عرض
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {flattenedMatrixRows.length > 0 && (
                  <tfoot className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={4} className="p-3 text-right sticky right-0 bg-slate-100 z-10">
                        الإجمالي الكلي للقطع المقصوصة:
                      </td>
                      {CUT_ORDER_SIZES.map(sz => (
                        <td key={sz} className="p-2.5 text-center font-mono font-bold text-blue-900">
                          {formatNumber(matrixColTotals.totals[sz] || 0)}
                        </td>
                      ))}
                      <td className="p-3 text-center font-mono font-bold text-emerald-800 bg-emerald-100/60 text-sm">
                        {formatNumber(matrixColTotals.grandTotal)}
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Stage Totals Report (Requirement 4.5) */}
      {activeTab === 'stage_reports' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المرحلة</label>
                <select
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value)}
                  aria-label="تصفية حسب المرحلة"
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-bold"
                >
                  <option value="all">جميع المراحل (الكل)</option>
                  <option value="printing">مرحلة الطباعة</option>
                  <option value="embroidery">مرحلة التطريز</option>
                  <option value="sewing">مرحلة الحياكة</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الورشة / المورد</label>
                <select
                  value={vendorFilter}
                  onChange={(e) => setVendorFilter(e.target.value)}
                  aria-label="تصفية حسب الورشة"
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white font-bold"
                >
                  <option value="all">جميع الورش والمطابع (الكل)</option>
                  {workshops.map(w => (
                    <option key={w.id} value={w.id}>[{w.code || '---'}] {w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stage Totals Summary Cards */}
            <div className="flex items-center gap-3">
              <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl text-xs font-mono">
                <span className="text-blue-700 font-semibold ml-1">إجمالي التكلفة:</span>
                <span className="font-bold text-blue-900 text-sm">{formatCurrency(stageReportSummary.cost)}</span>
              </div>
              <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-mono">
                <span className="text-emerald-700 font-semibold ml-1">إجمالي المسدد:</span>
                <span className="font-bold text-emerald-900 text-sm">{formatCurrency(stageReportSummary.paid)}</span>
              </div>
              <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-mono">
                <span className="text-amber-700 font-semibold ml-1">إجمالي المتبقي:</span>
                <span className="font-bold text-amber-900 text-sm">{formatCurrency(stageReportSummary.remaining)}</span>
              </div>
            </div>
          </div>

          {/* Stage Totals Table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
                  <tr>
                    <th className="p-3">رقم القصة</th>
                    <th className="p-3">اسم القصة / الموديل</th>
                    <th className="p-3">المرحلة</th>
                    <th className="p-3">الورشة / المورد</th>
                    <th className="p-3">نظام التسعير</th>
                    <th className="p-3 text-left font-mono">إجمالي التكلفة</th>
                    <th className="p-3 text-left font-mono">المسدد</th>
                    <th className="p-3 text-left font-mono">المتبقي</th>
                    <th className="p-3 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {flattenedStageItems.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="p-10 text-center text-gray-400">
                        لا توجد مراحل مسجلة وفق محددات البحث
                      </td>
                    </tr>
                  ) : (
                    flattenedStageItems.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="p-3 font-mono font-bold text-[#1F3A5F]">{row.cutting_number}</td>
                        <td className="p-3 font-bold text-slate-800">{row.cutting_name}</td>
                        <td className="p-3 font-bold text-indigo-700">{row.stageTitle}</td>
                        <td className="p-3 font-semibold text-slate-900">{row.vendor_name}</td>
                        <td className="p-3 text-slate-600">
                          {row.pricing_type === 'per_piece' ? 'سعر قطعة' : row.pricing_type === 'batches' ? 'دفعات' : 'مبلغ ثابت'}
                        </td>
                        <td className="p-3 text-left font-mono font-bold text-slate-900">{formatCurrency(row.total_cost)}</td>
                        <td className="p-3 text-left font-mono font-bold text-emerald-700">{formatCurrency(row.paid)}</td>
                        <td className="p-3 text-left font-mono font-bold text-amber-700">{formatCurrency(row.remaining)}</td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => { window.location.hash = `#/manufacturing/${row.orderId}/edit`; }}
                            className="px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-50 font-bold rounded-md border border-blue-200 transition-colors cursor-pointer"
                          >
                            عرض القصة
                          </button>
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

      {/* Tab 3: Workshops Master List (Requirement 4.3) */}
      {activeTab === 'workshops' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              دليل الورش ومطابع التشغيل (موردي خدمات معتمدين - تخضع أرصدتهم لكافة قواعد الموردين)
            </span>
            <button
              type="button"
              onClick={() => { window.location.hash = '#/suppliers/new'; }}
              className="px-3.5 py-1.5 bg-[#1F3A5F] text-white rounded-lg text-xs font-bold hover:bg-[#162a45] cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة مورد خدمات جديد</span>
            </button>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
                  <tr>
                    <th className="p-3">كود الورشة</th>
                    <th className="p-3">اسم الورشة / المطبعة</th>
                    <th className="p-3">التصنيف</th>
                    <th className="p-3">رقم الهاتف</th>
                    <th className="p-3 text-left font-mono">رصيد المديونية المستحق (له)</th>
                    <th className="p-3 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {workshops.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-10 text-center text-gray-400">
                        لا توجد ورش أو مطابع مسجلة
                      </td>
                    </tr>
                  ) : (
                    workshops.map((w, idx) => (
                      <tr key={w.id || idx} className="hover:bg-gray-50">
                        <td className="p-3 font-mono font-bold text-[#1F3A5F]">{w.code || '---'}</td>
                        <td className="p-3 font-bold text-slate-900">{w.name}</td>
                        <td className="p-3 font-semibold text-slate-700">
                          {w.service_stage === 'printing' ? 'مطبعة' : w.service_stage === 'embroidery' ? 'ورشة تطريز' : w.service_stage === 'sewing' ? 'ورشة حياكة' : 'مورد خدمات'}
                        </td>
                        <td className="p-3 font-mono text-slate-700">
                          <span className="flex items-center gap-1">
                            {w.phone || '---'}
                            {w.phone && !isValidEgyptianMobile(w.phone) && (
                              <span
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 font-sans font-bold border border-amber-300"
                                title="رقم الهاتف غير مطابق للمواصفات (يجب أن يبدأ بـ 01 ويتكون من 11 رقماً)"
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-600" />
                                <span>غير مطابق</span>
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="p-3 text-left font-mono font-bold text-emerald-700">
                          {formatCurrency(w.supplier_balance || 0)}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => { window.location.hash = `#/vendors/${w.id}/statement`; }}
                              className="px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-50 font-bold rounded-md border border-blue-200 cursor-pointer inline-flex items-center gap-1"
                              title="عرض كشف الحساب"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>كشف الحساب</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => { window.location.hash = `#/suppliers/${w.id}/edit`; }}
                              className="px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 font-bold rounded-md border border-slate-300 cursor-pointer inline-flex items-center gap-1"
                              title="تعديل بيانات الورشة أو المورد"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>
                          </div>
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

      {/* Close Cut Order Modal (Requirement 4.2) */}
      {closeModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-900">
                <Lock className="w-5 h-5 text-amber-600" />
                <span>إقفال أمر القص [{closeModalOrder.cutting_number || closeModalOrder.order_number}]</span>
              </div>
              <button
                type="button"
                onClick={() => setCloseModalOrder(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              عند إقفال أمر القص، يتم قفل الأمر نهائياً ولن يمكن تعديل بياناته لاحقاً إلا بإدخال سبب كتابي للتعديل. هل أنت متأكد من المتابعة؟
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                سبب الإقفال (اختياري)
              </label>
              <input
                type="text"
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                aria-label="سبب إقفال أمر القص"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCloseModalOrder(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmCloseOrder}
                disabled={closingOrder}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {closingOrder ? 'جاري الإقفال...' : 'تأكيد إقفال أمر القص'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
