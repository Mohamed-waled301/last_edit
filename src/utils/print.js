/**
 * Shared Printing Utility for code systems ERP
 * Handles native printing in Electron without Chromium preview errors,
 * with graceful fallback to browser window.print().
 */

export async function triggerPrint(options = {}) {
  if (typeof window !== 'undefined' && window.electronAPI?.print) {
    try {
      const res = await window.electronAPI.print(options);
      return res;
    } catch (err) {
      console.warn('Native Electron print error, falling back to window.print:', err);
      window.print();
      return { success: true };
    }
  }

  if (typeof window !== 'undefined') {
    window.print();
    return { success: true };
  }

  return { success: false, error: 'Window not available' };
}

export default triggerPrint;
