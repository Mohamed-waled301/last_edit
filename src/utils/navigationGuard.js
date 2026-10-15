/**
 * Navigation Guard Utility
 * Manages tracking unsaved changes across data entry forms and prevents accidental navigation.
 */

let activeGuard = null;

export const navigationGuard = {
  /**
   * Register a dirty-check function that returns true when there are unsaved changes.
   * Accepts either register(checkFn) or register(name, checkFn).
   * Returns an unregister cleanup function.
   */
  register(nameOrFn, maybeFn) {
    const checkFn = typeof maybeFn === 'function' ? maybeFn : (typeof nameOrFn === 'function' ? nameOrFn : null);
    activeGuard = checkFn;
    return () => {
      if (activeGuard === checkFn) {
        activeGuard = null;
      }
    };
  },

  /**
   * Manually unregister the current guard.
   */
  unregister() {
    activeGuard = null;
  },

  /**
   * Check if any active form currently has unsaved changes.
   */
  hasUnsavedChanges() {
    if (typeof activeGuard === 'function') {
      try {
        return Boolean(activeGuard());
      } catch (err) {
        console.error('Error evaluating navigation guard:', err);
        return false;
      }
    }
    return false;
  }
};

export default navigationGuard;
