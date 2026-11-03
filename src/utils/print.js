/**
 * Shared Printing Utility for code systems ERP
 * Handles safe asynchronous printing in Electron without Chromium UI freezes or crashes,
 * with graceful fallback to browser window.print().
 */

export async function triggerPrint(options = {}) {
  if (typeof window === 'undefined') {
    return { success: false, error: 'النافذة غير متاحة للطباعة' };
  }

  // 1. Direct HTML printing if html content is provided
  if (options.html && window.electronAPI?.printHtml) {
    try {
      const res = await window.electronAPI.printHtml(options);
      return res || { success: true };
    } catch (err) {
      console.warn('Native Electron printHtml error:', err);
      return { success: false, error: err?.message || 'فشلت عملية الطباعة' };
    }
  }

  // 2. Electron native window printing
  if (window.electronAPI?.print) {
    try {
      const res = await window.electronAPI.print(options);
      return res || { success: true };
    } catch (err) {
      console.warn('Native Electron print error, falling back safely:', err);
      try {
        window.print();
        return { success: true };
      } catch (fallbackErr) {
        return { success: false, error: fallbackErr?.message || 'تعذر استدعاء أمر الطباعة' };
      }
    }
  }

  // 3. Browser window.print() fallback
  try {
    window.print();
    return { success: true };
  } catch (err) {
    console.warn('Browser window.print error:', err);
    return { success: false, error: err?.message || 'تعذر فتح أمر الطباعة' };
  }
}

export default triggerPrint;
