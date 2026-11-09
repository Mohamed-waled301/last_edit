import React, { useState, useEffect } from 'react';
import { RotateCcw, Plus, Search, Download, Printer, ShoppingCart, Users, CheckCircle2, FileText } from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api } from '../../services/api';
import { db } from '../../data/db';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';

export default function SalesReturnsListPage({ onNotify, defaultTab = 'purchases' }) {
  const [activeTab, setActiveTab] = useState(defaultTab); // 'purchases' | 'sales'
  const [salesReturns, setSalesReturns] = useState([]);
  const [supplierReturns, setSupplierReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);

      // 1. Load Sales Returns
      const customerReturnsList = db.customer_returns ? await db.customer_returns.reverse().sortBy('created_at') : [];
      const custs = db.customers ? await db.customers.toArray() : [];
      const custMap = new Map(custs.map(c => [c.id, c.name]));
      const prods = db.items ? await db.items.toArray() : [];
      const prodMap = new Map(prods.map(p => [p.id, p.name]));

      const formattedSales = (Array.isArray(customerReturnsList) ? customerReturnsList : []).map(r => ({
        ...r,
        customer_name: custMap.get(r.customer_id) || r.customer_id,
        product_name: prodMap.get(r.product_id) || r.product_id
      }));
      setSalesReturns(formattedSales);

      // 2. Load Supplier Returns
      const supReturnsList = db.supplier_returns ? await db.supplier_returns.reverse().sortBy('created_at') : [];
      const sups = db.suppliers ? await db.suppliers.toArray() : [];
      const supMap = new Map(sups.map(s => [s.id, s.name]));
      const parties = db.parties ? await db.parties.toArray() : [];
      const partyMap = new Map(parties.map(p => [p.id, p.name]));

      const formattedSupplier = (Array.isArray(supReturnsList) ? supReturnsList : []).map(r => {
        const sName = supMap.get(r.supplier_id) || partyMap.get(r.supplier_id) || r.supplier_id;
        const itemCount = Array.isArray(r.items) && r.items.length > 0 ? r.items.length : 1;
        const totalQty = Array.isArray(r.items) && r.items.length > 0
          ? r.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0)
          : (Number(r.quantity) || 0);

        return {
          ...r,
          supplier_name: sName,
          items_count: itemCount,
          total_qty: totalQty,
          return_amount: Number(r.refund_amount ?? r.total_amount ?? 0)
        };
      });
      setSupplierReturns(formattedSupplier);

    } catch (err) {
      console.error('Failed to load returns list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered lists
  const filteredSales = (Array.isArray(salesReturns) ? salesReturns : []).filter(r => 
    (r.return_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.customer_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.product_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredSupplier = (Array.isArray(supplierReturns) ? supplierReturns : []).filter(r => 
    (r.return_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.supplier_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.invoice_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.reason || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportExcel = () => {
    if (activeTab === 'purchases') {
      const exportRows = filteredSupplier.map(r => ({
        'رقم الإذن': r.return_number || r.id,
        'المورد': r.supplier_name,
        'الفاتورة المرجعية': r.invoice_id || 'مرتجع حر',
        'عدد البنود': r.items_count,
        'إجمالي الكمية': r.total_qty,
        'إجمالي القيمة': r.return_amount,
        'طريقة التسوية': r.refund_method === 'cash_refund' ? 'استرداد نقدي فوري' : 'خصم من الرصيد',
        'التاريخ': formatDate(r.return_date),
        'سبب الإرجاع': r.reason || '-'
      }));
      exportToExcel(exportRows, 'مرتجعات_المشتريات_للموردين');
    } else {
      const exportRows = filteredSales.map(r => ({
        'رقم المرتجع': r.return_number,
        'النوع': r.return_mode === 'against_invoice' ? 'مرتبط بفاتورة' : 'مرتجع حر',
        'العميل': r.customer_name,
        'الصنف': r.product_name,
        'الكمية': r.quantity,
        'مبلغ الرد': r.refund_amount || 0,
        'طريقة الرد': r.refund_method === 'cash_refund' ? 'صرف نقدي' : 'خصم من الرصيد',
        'التاريخ': formatDate(r.return_date),
        'السبب': r.reason || '-'
      }));
      exportToExcel(exportRows, 'مرتجعات_المبيعات_للعملاء');
    }
  };

  const totalSupplierAmount = (Array.isArray(supplierReturns) ? supplierReturns : []).reduce(
    (sum, r) => sum + (Number(r.return_amount) || 0),
    0
  );

  const totalSalesAmount = (Array.isArray(salesReturns) ? salesReturns : []).reduce(
    (sum, r) => sum + (Number(r.refund_amount) || 0),
    0
  );

  return (
    <PageContainer
      title="سجل المرتجعات العامة"
      subtitle="إدارة ومتابعة أذونات مرتجعات المشتريات للموردين ومرتجعات المبيعات للعملاء"
      breadcrumbs={[{ label: 'المرتجعات' }]}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>تصدير إكسيل</span>
          </button>

          <button
            type="button"
            onClick={() => { window.location.hash = '#/returns/purchase-new'; }}
            className="px-3.5 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>+ تسجيل مرتجع مشتريات (مورد)</span>
          </button>

          <button
            type="button"
            onClick={() => { window.location.hash = '#/returns/new'; }}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>+ تسجيل مرتجع مبيعات (عميل)</span>
          </button>
        </div>
      }
    >
      {/* Interactive Mode Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Card 1: Supplier Purchase Returns */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('purchases')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('purchases');
            }
          }}
          className={`p-4 rounded-xl border-2 transition-all cursor-pointer text-right flex flex-col justify-between ${
            activeTab === 'purchases'
              ? 'border-[#1F3A5F] bg-blue-50/50 shadow-md ring-2 ring-[#1F3A5F]/20'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 shadow-xs'
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-lg ${
                  activeTab === 'purchases' ? 'bg-[#1F3A5F] text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">سجل مرتجعات المشتريات (للموردين والورش)</h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  رد خامات أو أقمشة لمورد مع الخصم الفوري من كشف الحساب واسترجاع المخزون
                </p>
              </div>
            </div>
            {activeTab === 'purchases' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1F3A5F] text-white shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>القسم المعروض</span>
              </span>
            )}
          </div>
          <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/70 text-xs">
            <span className="text-slate-600 font-semibold">
              إجمالي الأذونات: <strong className="font-mono text-slate-900 font-bold">{supplierReturns.length}</strong> إذن
            </span>
            <span className="text-slate-600 font-semibold">
              إجمالي المسترد: <strong className="font-mono text-[#1F3A5F] font-bold">{formatCurrency(totalSupplierAmount)}</strong>
            </span>
          </div>
        </div>

        {/* Card 2: Customer Sales Returns */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('sales')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('sales');
            }
          }}
          className={`p-4 rounded-xl border-2 transition-all cursor-pointer text-right flex flex-col justify-between ${
            activeTab === 'sales'
              ? 'border-emerald-600 bg-emerald-50/50 shadow-md ring-2 ring-emerald-600/20'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 shadow-xs'
          }`}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-lg ${
                  activeTab === 'sales' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">سجل مرتجعات المبيعات (للعملاء)</h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  استرجاع منتجات تامة من العملاء مع رد النقدية أو تسوية حساب العميل
                </p>
              </div>
            </div>
            {activeTab === 'sales' && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-700 text-white shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>القسم المعروض</span>
              </span>
            )}
          </div>
          <div className="flex items-center justify-between pt-2.5 border-t border-slate-200/70 text-xs">
            <span className="text-slate-600 font-semibold">
              إجمالي الأذونات: <strong className="font-mono text-slate-900 font-bold">{salesReturns.length}</strong> إذن
            </span>
            <span className="text-slate-600 font-semibold">
              إجمالي المردود: <strong className="font-mono text-emerald-700 font-bold">{formatCurrency(totalSalesAmount)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-xs mb-4">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5 pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            value={searchTerm}
            aria-label="البحث برقم المرتجع أو اسم الطرف"
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-[#1F3A5F]"
          />
        </div>
      </div>

      {/* Table: Purchases Returns */}
      {activeTab === 'purchases' && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-3">رقم الإذن</th>
                  <th className="p-3">المورد / الجهة</th>
                  <th className="p-3">الفاتورة المرجعية</th>
                  <th className="p-3 text-center">عدد البنود</th>
                  <th className="p-3 text-center font-mono">إجمالي الكمية</th>
                  <th className="p-3 text-left font-mono">قيمة المرتجع</th>
                  <th className="p-3">طريقة التسوية</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">سبب الإرجاع</th>
                  <th className="p-3 text-center">طباعة الإذن</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan="10" className="p-10 text-center text-gray-500 font-bold">
                      جاري تحميل أذونات مرتجعات المشتريات...
                    </td>
                  </tr>
                ) : filteredSupplier.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="p-10 text-center text-gray-400">
                      لا توجد أذونات مرتجعات مشتريات مسجلة
                    </td>
                  </tr>
                ) : (
                  filteredSupplier.map((r, idx) => (
                    <tr key={r.id || idx} className="hover:bg-gray-50">
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">
                        {r.return_number || r.id}
                      </td>
                      <td className="p-3 font-bold text-gray-900">
                        {r.supplier_name}
                      </td>
                      <td className="p-3 font-mono text-gray-600">
                        {r.invoice_id || 'مرتجع حر'}
                      </td>
                      <td className="p-3 text-center font-mono font-semibold text-gray-700">
                        {r.items_count} بنود
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-gray-900">
                        {r.total_qty}
                      </td>
                      <td className="p-3 text-left font-mono font-bold text-rose-700">
                        {formatCurrency(r.return_amount)}
                      </td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          r.refund_method === 'cash_refund'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {r.refund_method === 'cash_refund' ? 'استرداد نقدي فوري' : 'خصم من الرصيد'}
                        </span>
                      </td>
                      <td className="p-3 text-gray-600 font-mono">
                        {formatDate(r.return_date)}
                      </td>
                      <td className="p-3 text-gray-500 max-w-[200px] truncate">
                        {r.reason || '-'}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => { window.location.hash = `#/print-preview?type=purchase_return&id=${r.id || r.return_number}&returnUrl=returns`; }}
                          className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-[#1F3A5F] hover:text-white rounded border border-gray-200 transition-colors inline-flex items-center gap-1 cursor-pointer font-bold"
                          aria-label={`طباعة إذن مرتجع رقم ${r.return_number || r.id}`}
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>طباعة</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table: Sales Returns */}
      {activeTab === 'sales' && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-[#1F3A5F] text-white font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-3">رقم المرتجع</th>
                  <th className="p-3">نوع المرتجع</th>
                  <th className="p-3">العميل</th>
                  <th className="p-3">الصنف المسترجع</th>
                  <th className="p-3 text-center font-mono">الكمية</th>
                  <th className="p-3 text-left font-mono">مبلغ الرد</th>
                  <th className="p-3">طريقة الرد</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">السبب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan="9" className="p-10 text-center text-gray-500 font-bold">
                      جاري تحميل مرتجعات المبيعات...
                    </td>
                  </tr>
                ) : filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="p-10 text-center text-gray-400">
                      لا توجد مرتجعات مبيعات مسجلة
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((r, idx) => (
                    <tr key={r.id || idx} className="hover:bg-gray-50">
                      <td className="p-3 font-mono font-bold text-[#1F3A5F]">{r.return_number}</td>
                      <td className="p-3 font-semibold">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          r.return_mode === 'against_invoice' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {r.return_mode === 'against_invoice' ? 'مرتبط بفاتورة' : 'مرتجع حر'}
                        </span>
                      </td>
                      <td className="p-3 font-bold text-gray-900">{r.customer_name}</td>
                      <td className="p-3 text-gray-800 font-semibold">{r.product_name}</td>
                      <td className="p-3 text-center font-mono font-bold text-gray-900">{r.quantity} قطعة</td>
                      <td className="p-3 text-left font-mono font-bold text-emerald-700">{formatCurrency(r.refund_amount || 0)}</td>
                      <td className="p-3 text-gray-600">
                        {r.refund_method === 'cash_refund' ? 'صرف نقدي من الخزينة' : 'خصم من رصيد العميل'}
                      </td>
                      <td className="p-3 text-gray-600 font-mono">{formatDate(r.return_date)}</td>
                      <td className="p-3 text-gray-500">{r.reason || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
