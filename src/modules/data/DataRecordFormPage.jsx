import React, { useState, useEffect } from 'react';
import {
  Save,
  ArrowRight,
  AlertTriangle,
  Database,
  Check,
  X,
  FileText
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import { api, getActiveUser } from '../../services/api';
import { TABLE_METADATA, COLUMN_LABELS } from '../../data/repositories/dataManagementRepo';

export default function DataRecordFormPage({ tableName, recordId, onBack, onNotify }) {
  const [currentUser] = useState(() => getActiveUser());
  const [formData, setFormData] = useState({});
  const [originalRecord, setOriginalRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const isEdit = Boolean(recordId && recordId !== 'new');
  const isCeo = currentUser?.role === 'owner';
  const tableMeta = TABLE_METADATA[tableName] || { label: tableName, group: 'عام' };

  useEffect(() => {
    loadRecordData();
  }, [tableName, recordId]);

  const loadRecordData = async () => {
    try {
      setLoading(true);
      setError('');

      if (isEdit) {
        const res = await api.getDataRecord(tableName, recordId);
        const rec = res.record || res.data;
        if (!rec) {
          setError(`السجل رقم "${recordId}" غير موجود في جدول "${tableName}".`);
          return;
        }
        setOriginalRecord(rec);
        setFormData({ ...rec });
      } else {
        // Create mode: prefill schema fields from existing records in table
        const sampleRes = await api.getTableRecords(tableName);
        const sampleRecords = sampleRes.records || sampleRes.data || [];
        const initialFields = {
          id: `${tableName.slice(0, 4)}-${Date.now().toString().slice(-6)}`,
          created_at: new Date().toISOString(),
        };

        if (sampleRecords.length > 0) {
          const first = sampleRecords[0];
          Object.keys(first).forEach((key) => {
            if (key !== 'id' && key !== 'created_at') {
              initialFields[key] = typeof first[key] === 'number' ? 0 : typeof first[key] === 'boolean' ? true : '';
            }
          });
        }
        setFormData(initialFields);
      }
    } catch (e) {
      console.error('Failed to load record data:', e);
      setError(e.message || 'خطأ في قراءة بيانات السجل');
    } finally {
      setLoading(false);
    }
  };

  const isClosedOrPosted = Boolean(
    originalRecord &&
      (originalRecord.status === 'posted' ||
        originalRecord.status === 'closed' ||
        originalRecord.status === 'completed' ||
        originalRecord.status === 'paid')
  );

  const handleFieldChange = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleTriggerSave = (e) => {
    e.preventDefault();
    setError('');

    // Shared validation: required fields
    if (formData.name !== undefined && String(formData.name).trim() === '') {
      setError('حقل الاسم مطلوب ولا يمكن تركه فارغاً.');
      return;
    }
    if (formData.code !== undefined && String(formData.code).trim() === '') {
      setError('حقل الكود مطلوب ولا يمكن تركه فارغاً.');
      return;
    }

    // Number validation
    for (const [k, v] of Object.entries(formData)) {
      if (typeof v === 'number' && isNaN(v)) {
        setError(`الحقل "${COLUMN_LABELS[k] || k}" يحتوي على قيمة رقمية غير صالحة.`);
        return;
      }
      if (typeof v === 'number' && (k.includes('price') || k.includes('cost') || k.includes('amount')) && v < 0) {
        setError(`المبلغ في الحقل "${COLUMN_LABELS[k] || k}" لا يمكن أن يكون سالباً.`);
        return;
      }
    }

    // Mandatory written reason if record is posted/closed
    if (isClosedOrPosted && (!reason || !reason.trim())) {
      setError('هذا السجل مقفل أو مرحل. يلزم تقديم سبب كتابي واضح لإتمام التعديل.');
      return;
    }

    // Open Arabic confirmation dialog
    setConfirmModalOpen(true);
  };

  const handleExecuteSave = async () => {
    try {
      setIsSaving(true);
      setError('');
      setConfirmModalOpen(false);

      if (isEdit) {
        await api.updateDataRecord(tableName, recordId, formData, reason || 'تعديل مباشر عبر إدارة البيانات');
        if (onNotify) onNotify('تم تحديث بيانات السجل بنجاح وإعادة احتساب الأرصدة');
      } else {
        await api.createDataRecord(tableName, formData, reason || 'إضافة مباشرة عبر إدارة البيانات');
        if (onNotify) onNotify('تمت إضافة السجل بنجاح وإعادة احتساب الأرصدة');
      }

      if (onBack) onBack();
    } catch (e) {
      console.error('Save error:', e);
      setError(e.message || 'فشل في حفظ السجل');
    } finally {
      setIsSaving(false);
    }
  };

  // If non-CEO access attempt
  if (!isCeo) {
    return (
      <PageContainer
        title="تعديل سجل - إدارة البيانات"
        breadcrumbs={[{ label: 'إدارة البيانات', href: '#/data' }]}
        onBack={onBack}
      >
        <div className="p-8 text-center bg-red-50 text-red-700 font-bold border border-red-200 rounded-md">
          غير مصرح لك بتعديل بيانات النظام. هذه الصلاحية مخصصة للإدارة العليا فقط.
        </div>
      </PageContainer>
    );
  }

  // Filter out internal non-editable keys
  const editableKeys = Object.keys(formData).filter((k) => k !== 'id' && k !== 'created_at');

  return (
    <PageContainer
      title={isEdit ? `تعديل سجل: ${tableMeta.label}` : `إضافة سجل جديد في: ${tableMeta.label}`}
      subtitle={`جدول النظام (${tableName}) - معرف السجل: ${formData.id || '-'}`}
      breadcrumbs={[
        { label: 'إدارة البيانات', href: '#/data' },
        { label: tableMeta.label, href: `#/data/${tableName}` },
        { label: isEdit ? `تعديل #${recordId}` : 'سجل جديد' },
      ]}
      onBack={onBack}
      hasBottomBar={true}
      onSave={handleTriggerSave}
      onCancel={onBack}
      isSaving={isSaving}
      saveText="حفظ وتأكيد السجل"
    >
      <form onSubmit={handleTriggerSave} className="space-y-6 max-w-4xl mx-auto">
        {error && (
          <div className="p-4 bg-red-50 border border-red-300 rounded-md text-sm text-red-800 font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {isClosedOrPosted && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-md text-xs text-amber-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              تنبيه رقابي: هذا السجل بحالة مقفلة أو مرحلة ({originalRecord.status})
            </div>
            <p>
              أي تعديل على هذا السجل سيؤثر على قيود الحسابات والأرصدة وسيتطلب تدوين سبب التعديل كتابياً في سجل الرقابة.
            </p>
          </div>
        )}

        {/* Record Identifiers Card */}
        <div className="bg-white border border-gray-200 rounded-md p-5 space-y-4 shadow-none">
          <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
            معلومات السجل والجدول
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">معرف السجل:</label>
              <input
                type="text"
                value={formData.id || ''}
                readOnly
                className="w-full bg-gray-100 font-mono text-sm text-gray-600 border border-gray-300 rounded px-3 py-2 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">اسم الجدول في قاعدة البيانات:</label>
              <input
                type="text"
                value={`${tableMeta.label} (${tableName})`}
                readOnly
                className="w-full bg-gray-100 text-sm text-gray-600 border border-gray-300 rounded px-3 py-2 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Dynamic Fields Grid */}
        <div className="bg-white border border-gray-200 rounded-md p-5 space-y-4 shadow-none">
          <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">
            بيانات وحقول السجل
          </h3>

          {loading ? (
            <div className="py-12 text-center text-gray-500 font-bold">جاري تحميل بيانات السجل...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {editableKeys.map((key) => {
                const label = COLUMN_LABELS[key] || key;
                const val = formData[key];
                const isNumeric = typeof val === 'number';
                const isBool = typeof val === 'boolean';
                const isDate = key.includes('date');

                if (isBool) {
                  return (
                    <div key={key} className="flex items-center gap-3 pt-6">
                      <input
                        type="checkbox"
                        id={`field-${key}`}
                        checked={Boolean(val)}
                        onChange={(e) => handleFieldChange(key, e.target.checked)}
                        className="w-5 h-5 text-[#1F3A5F] rounded border-gray-300 cursor-pointer"
                      />
                      <label htmlFor={`field-${key}`} className="text-sm font-semibold text-gray-800 cursor-pointer">
                        {label} ({key})
                      </label>
                    </div>
                  );
                }

                return (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      {label} <span className="text-gray-400 font-mono text-[11px]">({key})</span>:
                    </label>
                    <input
                      type={isNumeric ? 'number' : isDate ? 'date' : 'text'}
                      value={val != null ? val : ''}
                      onChange={(e) => {
                        const nextVal = isNumeric ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
                        handleFieldChange(key, nextVal);
                      }}
                      className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:border-[#1F3A5F] focus:outline-none"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mandatory Reason Input */}
        <div className="bg-white border border-gray-200 rounded-md p-5 space-y-3 shadow-none">
          <label className="block text-xs font-bold text-gray-800">
            سبب التعديل المباشر (يتم توثيقه آلياً في سجل الرقابة والتعديلات):
            {isClosedOrPosted && <span className="text-red-600 mr-1">* (إلزامي لهذا السجل)</span>}
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded p-3 focus:border-[#1F3A5F] focus:outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">اكتب سبب إجراء هذا التعديل المباشر على قاعدة البيانات</p>
        </div>
      </form>

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-md max-w-md w-full border border-gray-300 p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-gray-900">تأكيد التعديل المباشر</h3>
            </div>

            <p className="text-base font-bold text-gray-800 leading-relaxed text-center py-2">
              أنت بتعدل بيانات النظام مباشرة، متأكد؟
            </p>

            <p className="text-xs text-gray-600 leading-normal">
              سيتم تسجيل هذه العملية مع هويتك في سجل التعديلات غير القابل للحذف، وإعادة احتساب أي أرصدة معتمدة تلقائياً.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-200">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                disabled={isSaving}
                className="px-4 py-2 border border-gray-300 rounded-md text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                إلغاء وتراجع
              </button>
              <button
                type="button"
                onClick={handleExecuteSave}
                disabled={isSaving}
                className="px-5 py-2 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-md text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'جاري الحفظ...' : 'نعم، حفظ البيانات'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
