import React, { useState, useMemo } from 'react';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  ChevronLeft,
  Package,
  Plus
} from 'lucide-react';

export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  pageSize = 10,
  searchPlaceholder = 'بحث في الجدول...',
  searchable,
  emptyMessage = 'لا توجد بيانات مسجلة حالياً',
  emptyAction,
  title,
  subtitle,
  actions,
  onRowClick,
  rowKey = 'id',
  stickyHeader = true,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);

  // If searchable is not explicitly passed, enable search if data has more than 10 rows
  const shouldShowSearch = searchable !== undefined ? searchable : data.length > 10;

  // Filter data based on search term
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase();

    return data.filter((row) => {
      return columns.some((col) => {
        const val = row[col.key];
        if (val == null) return false;
        return String(val).toLowerCase().includes(term);
      });
    });
  }, [data, columns, searchTerm]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      // Numerical comparison
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // String comparison
      const strA = String(aVal);
      const strB = String(bVal);
      return sortConfig.direction === 'asc'
        ? strA.localeCompare(strB, 'ar')
        : strB.localeCompare(strA, 'ar');
    });
  }, [filteredData, sortConfig]);

  // Pagination
  const shouldPaginate = data.length > pageSize;
  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    if (!shouldPaginate) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize, shouldPaginate]);

  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return { key: null, direction: 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  return (
    <div className="w-full bg-white border border-gray-200 rounded-md overflow-hidden flex flex-col shadow-none">
      {/* Table Header Controls */}
      {(title || shouldShowSearch || actions) && (
        <div className="p-3 sm:p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
          {/* Title & Subtitle */}
          {title && (
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 leading-tight truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-gray-500 font-medium mt-0.5 truncate">
                  {subtitle}
                </p>
              )}
            </div>
          )}

          {/* Search Box & Custom Actions */}
          <div className="flex items-center gap-2.5 flex-1 justify-end flex-wrap">
            {shouldShowSearch && (
              <div className="relative min-w-[200px] max-w-xs w-full">
                <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full h-9 pr-9 pl-3 text-xs bg-white border border-gray-300 rounded-md focus:border-[#1F3A5F] focus:outline-none"
                />
              </div>
            )}
            {actions}
          </div>
        </div>
      )}

      {/* Overflow Table Container (Never overflows page) */}
      <div className="overflow-x-auto w-full flex-1">
        <table className="w-full text-right border-collapse text-sm">
          {/* Table Header */}
          <thead
            className={`${
              stickyHeader ? 'sticky top-0 z-10' : ''
            } bg-[#1F3A5F] text-white font-bold select-none text-xs`}
          >
            <tr>
              {columns.map((col) => {
                const isSortable = col.sortable !== false;
                const isSorted = sortConfig.key === col.key;
                const alignClass =
                  col.align === 'center'
                    ? 'text-center'
                    : col.align === 'left'
                    ? 'text-left'
                    : 'text-right';

                return (
                  <th
                    key={col.key}
                    onClick={() => isSortable && handleSort(col.key)}
                    className={`py-3 px-3.5 whitespace-nowrap ${alignClass} ${
                      isSortable ? 'cursor-pointer hover:bg-[#162a45] transition-colors' : ''
                    } ${col.width || ''}`}
                    style={col.minWidth ? { minWidth: col.minWidth } : {}}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === 'center'
                          ? 'justify-center'
                          : col.align === 'left'
                          ? 'justify-start'
                          : 'justify-end'
                      }`}
                    >
                      <span>{col.header}</span>
                      {isSortable && (
                        <span className="shrink-0 text-white/70">
                          {isSorted ? (
                            sortConfig.direction === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-white" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-white" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-gray-500 font-bold whitespace-nowrap">
                  جاري تحميل البيانات...
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center whitespace-nowrap">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                      <Package className="w-6 h-6" />
                    </div>
                    <p className="text-gray-600 font-bold text-sm">
                      {searchTerm ? 'لا توجد نتائج تطابق كلمة البحث' : emptyMessage}
                    </p>
                    {emptyAction && (
                      <button
                        type="button"
                        onClick={emptyAction.onClick}
                        className="px-4 py-2 bg-[#1F3A5F] text-white rounded-md text-xs font-bold hover:bg-[#162a45] transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{emptyAction.label}</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIdx) => {
                const keyVal = row[rowKey] || row.id || rowIdx;
                return (
                  <tr
                    key={keyVal}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`transition-colors whitespace-nowrap ${
                      rowIdx % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'
                    } ${onRowClick ? 'cursor-pointer hover:bg-blue-50/60' : 'hover:bg-gray-50'}`}
                  >
                    {columns.map((col) => {
                      const rawVal = row[col.key];
                      const alignClass =
                        col.align === 'center'
                          ? 'text-center'
                          : col.align === 'left'
                          ? 'text-left'
                          : 'text-right';

                      let content;
                      if (col.render) {
                        content = col.render(rawVal, row, rowIdx);
                      } else if (col.type === 'number' || col.type === 'currency') {
                        content = (
                          <span
                            className="font-mono tabular-nums font-semibold"
                            style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                          >
                            {rawVal != null ? rawVal : '-'}
                          </span>
                        );
                      } else if (col.type === 'date' || col.type === 'code') {
                        content = (
                          <span
                            className="font-mono font-semibold"
                            style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                          >
                            {rawVal != null ? String(rawVal) : '-'}
                          </span>
                        );
                      } else {
                        const strVal = rawVal != null ? String(rawVal) : '-';
                        content = (
                          <div
                            className={`truncate ${col.maxWidth || 'max-w-[220px]'}`}
                            title={strVal}
                          >
                            {strVal}
                          </div>
                        );
                      }

                      return (
                        <td
                          key={col.key}
                          className={`py-2.5 px-3.5 whitespace-nowrap text-gray-800 ${alignClass}`}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar (When > pageSize) */}
      {shouldPaginate && (
        <div className="p-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600 bg-gray-50/50">
          <div className="font-semibold" style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>
            {`Showing ${(currentPage - 1) * pageSize + 1} - ${Math.min(
              currentPage * pageSize,
              sortedData.length
            )} of ${sortedData.length} records`}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="الصفحة السابقة"
              aria-label="الصفحة السابقة"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="px-2 font-bold text-gray-800">
              {currentPage} / {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="الصفحة التالية"
              aria-label="الصفحة التالية"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
