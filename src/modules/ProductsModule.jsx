import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Armchair, 
  Layers, 
  Trash2, 
  Percent, 
  DollarSign, 
  Eye, 
  Download, 
  Search,
  CheckCircle2,
  X
} from 'lucide-react';
import BackButton from '../components/BackButton';
import { api } from '../services/api';
import { formatCurrency, formatNumber } from '../utils/formatters';
import { exportToExcel } from '../utils/exportExcel';

export default function ProductsModule({ onBack, onNotify }) {
  const [products, setProducts] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProductDetails, setSelectedProductDetails] = useState(null);

  // New Product Form
  const [newProduct, setNewProduct] = useState({
    code: '',
    name: '',
    category: 'صالونات وأنتريهات',
    unit: 'قطعة',
    target_profit_margin_percent: 30,
    notes: '',
    bom_items: [{ raw_material_id: '', quantity_per_unit: '', waste_percent: 5, notes: '' }]
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [prodRes, matRes] = await Promise.all([
        api.getProducts(),
        api.getRawMaterials()
      ]);
      setProducts(prodRes.data || prodRes.products || []);
      setRawMaterials(matRes.data || matRes.materials || []);
    } catch (err) {
      console.error('Failed to load products data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.bom_items || newProduct.bom_items.length === 0) {
      alert('يجب إضافة خامة واحدة على الأقل في شجرة الخامات (BOM)');
      return;
    }
    for (let item of newProduct.bom_items) {
      if (!item.raw_material_id || !item.quantity_per_unit) {
        alert('يرجى تحديد الخامة والكمية المطلوبة لكل صنف في شجرة الخامات');
        return;
      }
    }
    try {
      const res = await api.createProduct(newProduct);
      onNotify(res.message);
      setShowAddModal(false);
      setNewProduct({
        code: '',
        name: '',
        category: 'صالونات وأنتريهات',
        unit: 'قطعة',
        target_profit_margin_percent: 30,
        notes: '',
        bom_items: [{ raw_material_id: '', quantity_per_unit: '', waste_percent: 5, notes: '' }]
      });
      loadData();
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.code && p.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.category && p.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} />
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-none">المنتجات ومكوناتها (BOM)</h2>
            <span className="text-xs text-gray-500 font-medium">المنتجات والأنظمة، شجرة المكونات (BOM)، ونسب الهالك والتسعير</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const headers = ['كود الصنف', 'اسم المنتج', 'التصنيف', 'رصيد الجاهز للبيع', 'تكلفة الخامات التقديرية', 'هامش الربح %', 'سعر البيع المقترح'];
              const rows = products.map(p => [
                p.code, p.name, p.category, p.current_finished_stock, p.estimated_material_cost, p.target_profit_margin_percent, p.suggested_selling_price
              ]);
              exportToExcel('قائمة_المنتجات_وشجرة_الخامات', headers, rows);
            }}
            className="h-10 px-3.5 bg-white hover:bg-gray-50 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4 text-gray-600" />
            <span>تصدير Excel</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="h-10 px-4 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>+ إضافة منتج / صنف جديد</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-white border border-gray-200 rounded-md p-3">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
          <input
            type="text"
            placeholder="ابحث عن منتج بالاسم، الكود، أو التصنيف..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 h-10 rounded-md border border-gray-300 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
          />
        </div>
      </div>

      {/* Products Data Table */}
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200 text-xs">
                <th className="py-3 px-4">كود الصنف</th>
                <th className="py-3 px-4">اسم المنتج</th>
                <th className="py-3 px-4">التصنيف</th>
                <th className="py-3 px-4 text-center">الجاهز للبيع</th>
                <th className="py-3 px-4 text-left">تكلفة الخامات</th>
                <th className="py-3 px-4 text-center">هامش الربح</th>
                <th className="py-3 px-4 text-left">سعر البيع المقترح</th>
                <th className="py-3 px-4 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500 font-medium">
                    لا توجد منتجات مسجلة مطابقة للبحث.
                  </td>
                </tr>
              ) : (
                filteredProducts.map(prod => (
                  <tr key={prod.id} className="hover:bg-blue-50/20 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-gray-700">{prod.code}</td>
                    <td className="py-3 px-4 font-bold text-gray-900">{prod.name}</td>
                    <td className="py-3 px-4 text-gray-600">
                      <span className="erp-badge-gray text-xs">{prod.category || 'عام'}</span>
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-green-700">
                      {formatNumber(prod.current_finished_stock)} {prod.unit}
                    </td>
                    <td className="py-3 px-4 text-left font-semibold text-gray-800">
                      {formatCurrency(prod.estimated_material_cost)}
                    </td>
                    <td className="py-3 px-4 text-center text-gray-600 font-semibold">
                      +{prod.target_profit_margin_percent}%
                    </td>
                    <td className="py-3 px-4 text-left font-bold text-gray-900">
                      {formatCurrency(prod.suggested_selling_price)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setSelectedProductDetails(prod)}
                        className="px-2.5 py-1 bg-white hover:bg-gray-50 text-gray-700 rounded border border-gray-300 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        title="عرض مكونات شجرة الخامات"
                      >
                        <Layers className="w-3.5 h-3.5 text-gray-500" />
                        <span>مكونات الخامات</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: ADD PRODUCT & BOM */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-3xl w-full border border-gray-300 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">إضافة صنف جديد وشجرة الخامات (BOM)</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 font-medium mb-4">
              سجل مواصفات القطعة والكمية الصافية ونسبة الهالك من كل خامة لحساب التكلفة بدقة
            </p>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">اسم المنتج *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: كرسي سفرة كابوتونيه زان"
                    value={newProduct.name}
                    onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">التصنيف</label>
                  <input
                    type="text"
                    placeholder="أنظمة تحكم / محطات عمل / لوحات قوى / وحدات استشعار"
                    value={newProduct.category}
                    onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">كود الصنف</label>
                  <input
                    type="text"
                    placeholder="تلقائي إن تُرِك فارغاً"
                    value={newProduct.code}
                    onChange={e => setNewProduct({ ...newProduct, code: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">وحدة البيع</label>
                  <select
                    value={newProduct.unit}
                    onChange={e => setNewProduct({ ...newProduct, unit: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  >
                    <option value="وحدة">وحدة</option>
                    <option value="قطعة">قطعة</option>
                    <option value="طقم">طقم</option>
                    <option value="لوحة">لوحة</option>
                    <option value="نظام">نظام</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">هامش الربح %</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newProduct.target_profit_margin_percent}
                    onChange={e => setNewProduct({ ...newProduct, target_profit_margin_percent: e.target.value })}
                    className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                  />
                </div>
              </div>

              {/* BOM Items Table */}
              <div className="border-t border-gray-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-bold text-gray-800">
                    شجرة الخامات (مكونات القطعة مع نسبة الهالك) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewProduct({
                      ...newProduct,
                      bom_items: [...newProduct.bom_items, { raw_material_id: '', quantity_per_unit: '', waste_percent: 5, notes: '' }]
                    })}
                    className="text-xs text-[#1F3A5F] font-bold hover:underline cursor-pointer"
                  >
                    + إضافة خامة للشجرة
                  </button>
                </div>

                <div className="space-y-2">
                  {newProduct.bom_items.map((b, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 p-2 bg-gray-50 border border-gray-200 rounded-md items-center">
                      <div className="col-span-5">
                        <select
                          required
                          value={b.raw_material_id}
                          onChange={e => {
                            const updated = [...newProduct.bom_items];
                            updated[idx].raw_material_id = e.target.value;
                            setNewProduct({ ...newProduct, bom_items: updated });
                          }}
                          className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                        >
                          <option value="">اختر الخامة المطلوبة...</option>
                          {rawMaterials.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name} ({m.unit}) - متاح: {m.current_stock}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-3">
                        <input
                          type="number"
                          min="0.001"
                          step="any"
                          required
                          placeholder="الكمية الصافية"
                          value={b.quantity_per_unit}
                          onChange={e => {
                            const updated = [...newProduct.bom_items];
                            updated[idx].quantity_per_unit = e.target.value;
                            setNewProduct({ ...newProduct, bom_items: updated });
                          }}
                          className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                        />
                      </div>

                      <div className="col-span-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="الهالك %"
                            value={b.waste_percent}
                            onChange={e => {
                              const updated = [...newProduct.bom_items];
                              updated[idx].waste_percent = e.target.value;
                              setNewProduct({ ...newProduct, bom_items: updated });
                            }}
                            className="w-full h-10 rounded border border-gray-300 px-2 text-xs font-medium"
                          />
                          <span className="text-xs text-gray-500 font-bold">%</span>
                        </div>
                      </div>

                      <div className="col-span-1 text-center">
                        {newProduct.bom_items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = newProduct.bom_items.filter((_, i) => i !== idx);
                              setNewProduct({ ...newProduct, bom_items: updated });
                            }}
                            className="p-1 text-red-600 hover:text-red-800 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">ملاحظات ومواصفات المنتج</label>
                <input
                  type="text"
                  placeholder="أي تعليمات أو مقاسات خاصة بالتجميع"
                  value={newProduct.notes}
                  onChange={e => setNewProduct({ ...newProduct, notes: e.target.value })}
                  className="w-full h-12 rounded-md border border-gray-300 px-3 text-sm font-medium focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="h-12 px-6 rounded-md font-medium text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="h-12 px-6 bg-[#1F3A5F] hover:bg-[#172c48] text-white rounded-md font-bold text-sm cursor-pointer"
                >
                  حفظ الصنف ومكوناته ✓
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: VIEW DETAILS */}
      {selectedProductDetails && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-md p-6 max-w-xl w-full border border-gray-300">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selectedProductDetails.name}</h3>
                <span className="text-xs text-gray-500 font-mono font-medium">{selectedProductDetails.code}</span>
              </div>
              <button
                onClick={() => setSelectedProductDetails(null)}
                className="h-8 px-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-semibold cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            <div className="my-4 space-y-3">
              <h4 className="text-sm font-bold text-gray-800">مكونات شجرة الخامات (BOM):</h4>
              <div className="divide-y divide-gray-200 border border-gray-200 rounded-md overflow-hidden">
                {selectedProductDetails.bom?.map(b => (
                  <div key={b.id} className="p-3 bg-white flex justify-between items-center text-xs font-medium">
                    <div>
                      <span className="text-gray-900 font-bold block">{b.material_name}</span>
                      <span className="text-gray-500">متوسط تكلفة الوحدة: {formatCurrency(b.average_cost)}</span>
                    </div>
                    <div className="text-left font-bold text-gray-800">
                      {b.quantity_per_unit} {b.material_unit} ({b.waste_percent}% هالك)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
