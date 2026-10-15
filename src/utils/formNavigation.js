/**
 * Form keyboard navigation utility for Apex Enterprise ERP.
 * Rule: Enter key must NEVER submit, save, or issue anything on any form.
 * - In a textarea: Enter adds a new line (native behavior).
 * - In a searchable dropdown or combobox: Enter selects the active option (native/component behavior).
 * - On standard inputs, selects, and controls: Enter shifts focus to the next field.
 */
export function handleFormKeyDown(e) {
  if (e.key !== 'Enter') return;

  // 1. Textarea: allow default newline unless Shift/Ctrl overrides are desired
  if (e.target.tagName === 'TEXTAREA') {
    return;
  }

  // 2. Searchable dropdown / combobox active selection
  if (
    e.target.getAttribute('role') === 'combobox' ||
    e.target.getAttribute('data-combobox-open') === 'true' ||
    e.target.getAttribute('aria-expanded') === 'true'
  ) {
    // Let the combobox / dropdown keyboard handler process selection
    return;
  }

  // 3. Prevent any implicit form submission
  e.preventDefault();

  // 4. Move focus to the next focusable form field
  const form = e.currentTarget;
  if (!form) return;

  const focusableSelector = [
    'input:not([type="hidden"]):not([disabled]):not([readonly])',
    'select:not([disabled]):not([readonly])',
    'textarea:not([disabled]):not([readonly])',
    'button:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const allFocusables = Array.from(form.querySelectorAll(focusableSelector))
    .filter((el) => {
      // Must be visible in layout and not have negative tabIndex
      return el.offsetParent !== null && el.tabIndex !== -1;
    });

  const currentIndex = allFocusables.indexOf(e.target);
  if (currentIndex !== -1 && currentIndex + 1 < allFocusables.length) {
    const nextEl = allFocusables[currentIndex + 1];
    nextEl.focus();
    if (typeof nextEl.select === 'function' && nextEl.tagName === 'INPUT' && nextEl.type !== 'date') {
      nextEl.select();
    }
  }
}

export default handleFormKeyDown;
