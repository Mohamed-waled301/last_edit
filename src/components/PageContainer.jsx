import React from 'react';
import { ArrowRight, Save, X, ChevronLeft } from 'lucide-react';

/**
 * Standard PageContainer for Apex Enterprise ERP
 * Provides consistent layout, breadcrumbs, back button, responsive padding,
 * and optional sticky bottom action bar for full-page forms.
 */
export default function PageContainer({
  title,
  subtitle,
  breadcrumbs = [],
  onBack,
  actions,
  hasBottomBar = false,
  onSave,
  onCancel,
  isSaving = false,
  saveDisabled = false,
  saveText = 'حفظ البيانات',
  cancelText = 'إلغاء',
  extraBottomContent,
  children
}) {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      window.location.hash = '#home';
    }
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)] relative pb-24">
      {/* Top Header & Breadcrumbs Bar */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 shadow-xs">
        {/* Breadcrumb Trail */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-2 font-medium overflow-x-auto whitespace-nowrap">
            <button
              onClick={() => { window.location.hash = '#home'; }}
              className="hover:text-[#1F3A5F] transition-colors cursor-pointer"
            >
              الرئيسية
            </button>
            {breadcrumbs.map((bc, idx) => (
              <React.Fragment key={idx}>
                <ChevronLeft className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                {bc.href ? (
                  <button
                    onClick={() => { window.location.hash = bc.href; }}
                    className="hover:text-[#1F3A5F] transition-colors cursor-pointer"
                  >
                    {bc.label}
                  </button>
                ) : (
                  <span className={idx === breadcrumbs.length - 1 ? 'font-bold text-gray-900' : ''}>
                    {bc.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}

        {/* Title, Subtitle, and Primary Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md border border-gray-200 transition-colors cursor-pointer shrink-0"
              title="رجوع"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {actions && (
            <div className="flex items-center gap-2 flex-wrap">
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Body */}
      <main className="flex-1 p-4 sm:p-6 w-full max-w-7xl mx-auto space-y-6">
        {children}
      </main>

      {/* Sticky Bottom Action Bar for Full-Page Forms */}
      {hasBottomBar && (
        <aside
          aria-label="شريط الإجراءات"
          className="fixed bottom-0 right-0 left-0 lg:left-0 lg:right-64 bg-white/95 backdrop-blur-md border-t border-gray-200 px-4 sm:px-6 py-3.5 shadow-lg z-30 flex items-center justify-between gap-4 select-none"
        >
          <div className="flex items-center gap-4">
            {extraBottomContent}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onCancel || handleBack}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-md border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 font-bold text-sm transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              <span>{cancelText}</span>
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={saveDisabled || isSaving}
              className={`px-6 py-2.5 rounded-md font-bold text-sm transition-all shadow-sm flex items-center gap-2 cursor-pointer ${
                saveDisabled || isSaving
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                  : 'bg-[#1F3A5F] hover:bg-[#162a45] text-white hover:shadow-md'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'جاري الحفظ...' : saveText}</span>
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
