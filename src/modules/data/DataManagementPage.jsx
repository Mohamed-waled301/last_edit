import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  Shield,
  Search,
  Plus,
  Download,
  Trash2,
  Edit,
  History,
  AlertTriangle,
  RefreshCw,
  Check,
  X,
  Filter,
} from 'lucide-react';
import PageContainer from '../../components/PageContainer';
import DataTable from '../../components/DataTable';
import { api, getActiveUser } from '../../services/api';
import { exportToExcel } from '../../utils/exportExcel';
import { formatDate } from '../../utils/formatters';
import { TABLE_METADATA, COLUMN_LABELS } from '../../data/repositories/dataManagementRepo';

export default function DataManagementPage({ initialTable = 'items', onNavigate, onNotify }) {
  const [currentUser] = useState(() => getActiveUser());
  const [tables, setTables] = useState([]);
  const [activeTab, setActiveTab] = useState(initialTable); // table name or 'audit_log'
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // record to delete
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [refError, setRefError] = useState(null);

  // Audit Log Filter States
  const [auditFilters, setAuditFilters] = useState({
    table: '',
    operation: '',
    user: '',
    startDate: '',
    endDate: '',
  });

  // Check Authorized User
  const isAuthorized = Boolean(currentUser?.id);

  useEffect(() => {
    loadTables();
  }, []);

  useEffect(() => {
    if (activeTab) {
      loadTableData(activeTab);
    }
  }, [activeTab]);

  const loadTables = async () => {
    try {
      setLoading(true);
      const res = await api.getDataTables();
      setTables(res.tables || res.data || []);
    } catch (e) {
      console.error('Failed to load tables:', e);
      if (onNotify) onNotify(e.message || 'فشل في قراءة جداول النظام', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadTableData = async (tableName) => {
    try {
      setLoading(true);
      setRefError(null);
      if (tableName === 'audit_log') {
        const res = await api.getAuditLogsFiltered(auditFilters);
        setRecords(res.audit_logs || res.data || []);
      } else {
        const res = await api.getTableRecords(tableName);
        setRecords(res.records || res.data || []);
      }
    } catch (e) {
      console.error('Failed to load table records:', e);
      if (onNotify) onNotify(e.message || 'فشل في تحميل سجلات الجدول', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Group tables by category
  const tableGroups = useMemo(() => {
    const groups = {};
    for (const t of tables) {
      const g = t.group || 'عام';
      if (!groups[g]) groups[g] = [];
      groups[g].push(t);
    }
    return groups;
  }, [tables]);

  // Dynamic Column Generation from Records
  const columns = useMemo(() => {
    if (records.length === 0) {
      return [
        { key: 'id', header: 'المعرف', type: 'code' },
        { key: 'name', header: 'الاسم' },
      ];
    }

    // Determine keys across up to first 20 records
    const keysSet = new Set();
    keysSet.add('id');
    for (const r of records.slice(0, 20)) {
      Object.keys(r).forEach((k) => {
        // Exclude large binary/image strings from main columns
        if (k !== 'image' && k !== 'variants' && k !== 'items') {
          keysSet.add(k);
        }
      });
    }

    const keyList = Array.from(keysSet);
    const cols = keyList.map((k) => {
      const headerLabel = COLUMN_LABELS[k] || k;
      const isNumeric = records.some((r) => typeof r[k] === 'number');
      const isDate = k.includes('date') || k.includes('created_at') || k.includes('updated_at');

      return {
        key: k,
        header: headerLabel,
        align: isNumeric ? 'left' : isDate ? 'center' : 'right',
        type: isNumeric ? 'number' : isDate ? 'date' : 'text',
        render: (val) => {
          if (val == null) return <span className="text-gray-300">-</span>;
          if (typeof val === 'boolean') {
            return val ? (
              <span className="erp-badge-green text-xs font-bold">نعم</span>
            ) : (
              <span className="erp-badge-gray text-xs font-bold">لا</span>
            );
          }
          if (typeof val === 'object') {
            const json = JSON.stringify(val);
            return (
              <div className="truncate max-w-[200px] font-mono text-xs text-gray-500" title={json}>
                {json}
              </div>
            );
          }
          if (isDate) {
            return (
              <span className="font-mono tabular-nums text-xs" style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>
                {formatDate(val)}
              </span>
            );
          }
          if (isNumeric) {
            return (
              <span className="font-mono tabular-nums font-semibold" style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>
                {Number(val).toLocaleString('en-US')}
              </span>
            );
          }
          const strVal = String(val);
          return (
            <div className="truncate max-w-[200px]" title={strVal}>
              {strVal}
            </div>
          );
        },
      };
    });

    // Add Actions column if not audit_log
    if (activeTab !== 'audit_log') {
      cols.push({
        key: '__actions__',
        header: 'إجراءات مباشرة',
        align: 'center',
        sortable: false,
        render: (_, row) => (
          <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(`data/${activeTab}/${row.id}`);
              }}
              className="p-1.5 rounded-md hover:bg-blue-50 text-[#1F3A5F] transition-colors cursor-pointer"
              title="تعديل السجل (كامل الشاشة)"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteConfirm(row);
                setRefError(null);
                setDeleteReason('');
              }}
              className="p-1.5 rounded-md hover:bg-red-50 text-red-600 transition-colors cursor-pointer"
              title="حذف السجل"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ),
      });
    }

    return cols;
  }, [records, activeTab, onNavigate]);

  const handleExport = () => {
    const activeLabel = TABLE_METADATA[activeTab]?.label || activeTab;
    const cleanData = records.map((r) => {
      const rowObj = {};
      Object.keys(r).forEach((k) => {
        if (typeof r[k] === 'object' && r[k] !== null) {
          rowObj[COLUMN_LABELS[k] || k] = JSON.stringify(r[k]);
        } else {
          rowObj[COLUMN_LABELS[k] || k] = r[k];
        }
      });
      return rowObj;
    });

    exportToExcel(cleanData, `تصدير_${activeLabel}`);
    if (onNotify) onNotify(`تم تصدير جدول (${activeLabel}) إلى ملف إكسيل بنجاح`);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      setIsDeleting(true);
      setRefError(null);
      await api.deleteDataRecord(activeTab, deleteConfirm.id, deleteReason || 'حذف مباشر من إدارة البيانات');
      if (onNotify) onNotify('تم حذف السجل بنجاح وتحديث الأرصدة');
      setDeleteConfirm(null);
      setDeleteReason('');
      loadTableData(activeTab);
      loadTables();
    } catch (e) {
      console.error('Delete record error:', e);
      setRefError(e.message || 'تعذر حذف السجل');
    } finally {
      setIsDeleting(false);
    }
  };

  // If not logged in or non-CEO, reject with access denied
  if (!isAuthorized || currentUser?.role !== 'owner') {
    return (
      <PageContainer
        title="إدارة البيانات الشاملة"
        subtitle="الوصول المباشر لقاعدة بيانات النظام"
        breadcrumbs={[{ label: 'إدارة البيانات' }]}
        onBack={() => onNavigate('home')}
      >
        <div className="bg-red-50 border border-red-200 rounded-md p-8 text-center space-y-4 max-w-xl mx-auto my-12">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <Shield className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-red-900">غير مصرح لك بالوصول</h2>
          <p className="text-sm text-red-700 leading-relaxed">
            هذه الشاشة والعمليات مخصصة للإدارة العليا والرئيس التنفيذي (CEO) فقط.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="px-6 py-2.5 bg-[#1F3A5F] text-white font-bold text-sm rounded-md hover:bg-[#162a45] transition-colors cursor-pointer"
          >
            العودة للرئيسية
          </button>
        </div>
      </PageContainer>
    );
  }

  const activeMeta = TABLE_METADATA[activeTab] || { label: activeTab, group: 'عام' };

  return (
    <PageContainer
      title="إدارة البيانات الشاملة (للمدير العام)"
      subtitle="استعراض وتعديل كافة جداول قاعدة البيانات وسجل الرقابة مع فحص الارتباطات التلقائي"
      breadcrumbs={[{ label: 'إدارة البيانات', href: '#/data' }, { label: activeMeta.label }]}
      onBack={() => onNavigate('home')}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await api.recomputeStockBalances();
                if (onNotify) onNotify(res.message || 'تم إعادة احتساب أرصدة المخزون بالكامل بنجاح', 'success');
                if (activeTab) loadTableData(activeTab);
              } catch (e) {
                alert(e.message || 'فشل في إعادة احتساب الأرصدة');
              }
            }}
            className="px-3.5 py-2 rounded-md border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            title="إعادة احتساب وتدقيق أرصدة المخزون ومطابقتها مع الحركات"
          >
            <RefreshCw className="w-4 h-4 text-indigo-600" />
            <span>إعادة احتساب الأرصدة</span>
          </button>

          <button
            type="button"
            onClick={handleExport}
            className="px-3.5 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            title="تصدير السجلات الحالية إلى ملف إكسيل"
          >
            <Download className="w-4 h-4 text-gray-500" />
            <span>تصدير إكسيل</span>
          </button>

          {activeTab !== 'audit_log' && (
            <button
              type="button"
              onClick={() => onNavigate(`data/${activeTab}/new`)}
              className="px-4 py-2 rounded-md bg-[#1F3A5F] hover:bg-[#162a45] text-white text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>+ إضافة سجل جديد</span>
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Table Selector Tabs Bar */}
        <div className="bg-white border border-gray-200 rounded-md p-3">
          <div className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
            <Database className="w-4 h-4 text-[#1F3A5F]" />
            <span>اختر الجدول المطلوب إدارته:</span>
          </div>

          <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto p-1">
            {tables.map((t) => {
              const isSelected = activeTab === t.name;
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setActiveTab(t.name)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer border ${
                    isSelected
                      ? 'bg-[#1F3A5F] text-white border-[#1F3A5F]'
                      : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                  }`}
                >
                  <span>{t.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono tabular-nums ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}

            {/* Dedicated Audit Log Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('audit_log')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer border ${
                activeTab === 'audit_log'
                  ? 'bg-amber-700 text-white border-amber-700'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>سجل التعديلات والرقابة والتدقيق</span>
            </button>
          </div>
        </div>

        {/* Audit Log Filter Controls (When viewing audit_log) */}
        {activeTab === 'audit_log' && (
          <div className="bg-amber-50/70 border border-amber-200 rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Filter className="w-4 h-4" />
                تصفية سجل الرقابة والتعديلات (سجل تدقيق للقراءة فقط)
              </span>
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
                محمي تماماً ضد التعديل أو الحذف
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-gray-600 font-semibold mb-1">الجدول:</label>
                <select
                  value={auditFilters.table}
                  onChange={(e) => {
                    const f = { ...auditFilters, table: e.target.value };
                    setAuditFilters(f);
                    api.getAuditLogsFiltered(f).then((res) => setRecords(res.audit_logs || res.data || []));
                  }}
                  className="w-full h-9 bg-white border border-gray-300 rounded text-xs px-2"
                >
                  <option value="">جميع الجداول</option>
                  {tables.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">نوع العملية:</label>
                <select
                  value={auditFilters.operation}
                  onChange={(e) => {
                    const f = { ...auditFilters, operation: e.target.value };
                    setAuditFilters(f);
                    api.getAuditLogsFiltered(f).then((res) => setRecords(res.audit_logs || res.data || []));
                  }}
                  className="w-full h-9 bg-white border border-gray-300 rounded text-xs px-2"
                >
                  <option value="">جميع العمليات</option>
                  <option value="add">إضافة</option>
                  <option value="edit">تعديل</option>
                  <option value="delete">حذف</option>
                  <option value="UNAUTHORIZED_DATA_ACCESS">محاولة غير مصرحة</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">من تاريخ:</label>
                <input
                  type="date"
                  value={auditFilters.startDate}
                  onChange={(e) => {
                    const f = { ...auditFilters, startDate: e.target.value };
                    setAuditFilters(f);
                    api.getAuditLogsFiltered(f).then((res) => setRecords(res.audit_logs || res.data || []));
                  }}
                  className="w-full h-9 bg-white border border-gray-300 rounded text-xs px-2"
                />
              </div>

              <div>
                <label className="block text-gray-600 font-semibold mb-1">إلى تاريخ:</label>
                <input
                  type="date"
                  value={auditFilters.endDate}
                  onChange={(e) => {
                    const f = { ...auditFilters, endDate: e.target.value };
                    setAuditFilters(f);
                    api.getAuditLogsFiltered(f).then((res) => setRecords(res.audit_logs || res.data || []));
                  }}
                  className="w-full h-9 bg-white border border-gray-300 rounded text-xs px-2"
                />
              </div>
            </div>
          </div>
        )}

        {/* Records Table View */}
        <div className="w-full overflow-hidden">
          <DataTable
            title={`${activeMeta.label} (${activeTab})`}
            subtitle={`إجمالي ${records.length} سجل مسجل بالنظام`}
            columns={columns}
            data={records}
            loading={loading}
            pageSize={15}
            searchable={true}
            searchLabel={`بحث في ${activeMeta.label}`}
            emptyMessage={`لا توجد سجلات مسجلة في جدول (${activeMeta.label})`}
            emptyAction={
              activeTab !== 'audit_log'
                ? {
                    label: 'إضافة أول سجل الآن',
                    onClick: () => onNavigate(`data/${activeTab}/new`),
                  }
                : null
            }
          />
        </div>
      </div>

      {/* Confirmation & Dependency Blocking Dialog for Delete */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 select-none"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-md max-w-md w-full border border-gray-300 p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold">تأكيد حذف السجل المباشر</h3>
            </div>

            <p className="text-sm text-gray-700 leading-relaxed font-semibold">
              أنت بتعدل بيانات النظام مباشرة، متأكد؟
            </p>

            <div className="bg-gray-50 p-3 rounded border text-xs space-y-1 font-mono">
              <div><strong>الجدول:</strong> {activeTab}</div>
              <div><strong>معرف السجل:</strong> {deleteConfirm.id}</div>
              {deleteConfirm.name && <div><strong>الاسم:</strong> {deleteConfirm.name}</div>}
              {deleteConfirm.code && <div><strong>الكود:</strong> {deleteConfirm.code}</div>}
            </div>

            {/* Dependency block error */}
            {refError && (
              <div className="p-3 bg-red-50 border border-red-300 rounded text-xs text-red-700 leading-relaxed font-semibold">
                {refError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                سبب الحذف (للتوثيق في سجل الرقابة):
              </label>
              <input
                type="text"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full text-xs h-9 px-3 border border-gray-300 rounded focus:border-red-600 focus:outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">أدخل سبب الحذف</p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirm(null);
                  setRefError(null);
                }}
                disabled={isDeleting}
                className="px-4 py-2 border border-gray-300 rounded-md text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'جاري التحقق والحذف...' : 'نعم، احذف نهائياً'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
