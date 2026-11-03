import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  RotateCcw, 
  Download, 
  X, 
  FileText, 
  Building2,
  RefreshCw
} from 'lucide-react';
import { api } from '../services/api';
import { formatCurrency } from '../utils/formatters';

export default function AccountAuditModal({ isOpen, onClose, onNotify, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [repairSummary, setRepairSummary] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    if (isOpen) {
      runAudit();
    } else {
      setAuditResult(null);
      setRepairSummary(null);
      setSelectedIds([]);
      setShowConfirmModal(false);
    }
  }, [isOpen]);

  const runAudit = async () => {
    try {
      setLoading(true);
      setRepairSummary(null);
      const res = await api.auditAccountingAnomalies();
      setAuditResult(res);
      if (Array.isArray(res?.anomalies)) {
        setSelectedIds(res.anomalies.map(a => a.id));
      }
    } catch (err) {
      console.error('Failed to run account audit:', err);
      if (onNotify) onNotify(err.message || 'فشل تشغيل فحص الحسابات', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (!auditResult?.anomalies) return;
    if (selectedIds.length === auditResult.anomalies.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(auditResult.anomalies.map(a => a.id));
    }
  };

  const executeRepair = async () => {
    try {
      setRepairing(true);
      setShowConfirmModal(false);
      const res = await api.repairAccountingAnomalies(selectedIds);
      setRepairSummary(res);
      if (onNotify) onNotify(res.message || 'تم اكتمال تصحيح الحسابات بنجاح', 'success');
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to apply repair:', err);
      if (onNotify) onNotify(err.message || 'حدث خطأ أثناء تنفيذ الإصلاح المحاسبي', 'error');
    } finally {
      setRepairing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-[#1F3A5F] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold">أداة فحص وتدقيق الحسابات ودفاتر الأستاذ</h2>
              <p className="text-xs text-slate-300 font-medium">اكتشاف القيود المزدوجة، مدفوعات الأرصدة الافتتاحية الوهمية، وتصحيحها بأمان</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={repairing}
            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-[#1F3A5F] animate-spin mx-auto" />
              <p className="text-sm font-bold text-slate-700">جاري فحص جميع القيود المحاسبية، فواتير المبيعات والتوريد، وحسابات الخزائن...</p>
            </div>
          ) : repairSummary ? (
            /* Post-Repair Detailed Report */
            <div className="space-y-6">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-emerald-900">تم اكتمال التصحيح المحاسبي وتأكيد البيانات بنجاح</h3>
                  <p className="text-xs text-emerald-700">{repairSummary.message}</p>
                </div>
              </div>

              {/* Balances Before and After Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <span className="text-xs font-bold text-slate-500 block mb-1">رصيد الخزينة الرئيسية المركزية</span>
                  <div className="flex items-center gap-3 mt-2">
                    <div>
                      <span className="text-[11px] text-slate-400 block">قبل التصحيح:</span>
                      <span className="text-sm font-mono font-bold text-slate-700">{formatCurrency(repairSummary.treasury_balance_before)}</span>
                    </div>
                    <span className="text-slate-400 font-bold">&larr;</span>
                    <div>
                      <span className="text-[11px] text-emerald-600 block">بعد التصحيح:</span>
                      <span className="text-base font-mono font-bold text-emerald-700">{formatCurrency(repairSummary.treasury_balance_after)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <span className="text-xs font-bold text-slate-500 block mb-1">النسخة الاحتياطية الاستباقية</span>
                  <p className="text-xs text-slate-600 mt-1">تم حفظ لقطة أمان تلقائية للبيانات بالكامل قبل تطبيق التصحيح.</p>
                  <span className="text-[11px] font-mono text-slate-400 block mt-1">تاريخ الحفظ: {repairSummary.backup_timestamp}</span>
                </div>
              </div>

              {/* Affected Parties Report */}
              {Array.isArray(repairSummary.affected_parties) && repairSummary.affected_parties.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-700">تقرير الجهات المحاسبية التي تم تصحيح أرصدتها:</h4>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                        <tr>
                          <th className="p-3">اسم الجهة</th>
                          <th className="p-3">الصفة</th>
                          <th className="p-3 text-left">الرصيد الدفتري قبل</th>
                          <th className="p-3 text-left">الرصيد الدفتري المعتمد بعد</th>
                          <th className="p-3 text-left">إجمالي المسدد الحقيقي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {repairSummary.affected_parties.map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60">
                            <td className="p-3 font-bold text-slate-900">{p.name}</td>
                            <td className="p-3 text-slate-600">{p.role}</td>
                            <td className="p-3 text-left font-mono text-slate-500">{formatCurrency(p.balance_before)}</td>
                            <td className="p-3 text-left font-mono font-bold text-[#1F3A5F]">{formatCurrency(p.balance_after)}</td>
                            <td className="p-3 text-left font-mono text-emerald-700 font-bold">{formatCurrency(p.total_paid_after)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : auditResult ? (
            /* Audit Preview Screen */
            <div className="space-y-6">
              {auditResult.anomalies.length === 0 ? (
                <div className="py-12 text-center space-y-3 bg-emerald-50/50 border border-emerald-200 rounded-xl p-8">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                  <h3 className="text-base font-bold text-emerald-900">الحسابات سليمة ومتطابقة 100%</h3>
                  <p className="text-xs text-emerald-700 max-w-md mx-auto">
                    لم يتم العثور على أي قيود سداد افتتاحية وهمية، أو حركات خزينة مكررة، أو اختلافات في إجمالي المسدد. دفاتر الأستاذ متوافقة تماماً مع الأرصدة الفعلية.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <h3 className="text-sm font-bold text-amber-900">
                          تم اكتشاف ({auditResult.anomalies.length}) خطأ محاسبي بحاجة إلى تصحيح
                        </h3>
                        <p className="text-xs text-amber-700 mt-0.5">
                          راجع بنود المعاينة أدناه بدقة. يمكنك تحديد البنود المراد اعتمادها، وسيتم أخذ نسخة احتياطية تلقائياً قبل التطبيق دون المساس بأي مدفوعات حقيقية.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors shrink-0 cursor-pointer"
                    >
                      {selectedIds.length === auditResult.anomalies.length ? 'إلغاء تحديد الكل' : 'تحديد كل البنود'}
                    </button>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-[#1F3A5F] text-white font-bold">
                          <tr>
                            <th className="p-3 w-10 text-center">اختيار</th>
                            <th className="p-3 w-40">الطرف / الحساب</th>
                            <th className="p-3 w-28">نوع الحركة</th>
                            <th className="p-3 w-36 font-mono">رقم المستند</th>
                            <th className="p-3 min-w-[120px] text-left font-mono whitespace-nowrap">المبلغ</th>
                            <th className="p-3">وصف الخلل والإجراء التصحيحي</th>
                            <th className="p-3 min-w-[130px] text-left font-mono whitespace-nowrap">الرصيد قبل</th>
                            <th className="p-3 min-w-[130px] text-left font-mono whitespace-nowrap">الرصيد بعد</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {auditResult.anomalies.map((anom) => {
                            const isSelected = selectedIds.includes(anom.id);
                            return (
                              <tr 
                                key={anom.id} 
                                className={`transition-colors ${isSelected ? 'bg-blue-50/40' : 'bg-white opacity-60'}`}
                              >
                                <td className="p-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleToggleSelect(anom.id)}
                                    className="w-4 h-4 rounded text-[#1F3A5F] focus:ring-[#1F3A5F] cursor-pointer"
                                  />
                                </td>
                                <td className="p-3 font-bold text-slate-800">{anom.entity_name}</td>
                                <td className="p-3 text-slate-600">{anom.doc_type}</td>
                                <td className="p-3 font-mono font-bold text-slate-700">{anom.doc_number}</td>
                                <td className="p-3 text-left font-mono font-bold text-rose-700 whitespace-nowrap min-w-[120px]">{formatCurrency(anom.amount)}</td>
                                <td className="p-3">
                                  <span className="text-slate-700 block font-medium">{anom.issue_description}</span>
                                  <span className="text-[11px] text-blue-700 font-bold block mt-0.5">{anom.repair_action}</span>
                                </td>
                                <td className="p-3 text-left font-mono text-slate-500 whitespace-nowrap min-w-[130px]">{formatCurrency(anom.balance_before)}</td>
                                <td className="p-3 text-left font-mono font-bold text-emerald-700 whitespace-nowrap min-w-[130px]">{formatCurrency(anom.balance_after)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runAudit}
              disabled={loading || repairing}
              className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>إعادة الفحص الآن</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={repairing}
              className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              {repairSummary ? 'إغلاق' : 'إلغاء'}
            </button>

            {!repairSummary && auditResult?.anomalies?.length > 0 && (
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={selectedIds.length === 0 || repairing}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تأكيد واعتماد التصحيح ({selectedIds.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Safeguard Dialog */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-start gap-3 text-amber-700">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="text-base font-bold text-slate-900">تأكيد تنفيذ الإصلاح المحاسبي</h3>
                <p className="text-xs text-slate-600 mt-1">
                  أنت على وشك تصحيح ({selectedIds.length}) قيد محاسبي. سيتم أخذ نسخة احتياطية تلقائياً قبل البدء. لن يتم المساس بأي مدفوعات حقيقية.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={executeRepair}
                disabled={repairing}
                className="px-4 py-2 text-xs font-bold text-white bg-[#1F3A5F] hover:bg-[#162a45] rounded-lg shadow-xs cursor-pointer"
              >
                {repairing ? 'جاري المعالجة...' : 'نعم، نفذ الإصلاح الآن'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
