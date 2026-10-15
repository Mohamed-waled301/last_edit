import React, { forwardRef } from 'react';
import { normalizeDigits, sanitizeDecimalInput } from '../utils/money';

/**
 * Shared MoneyInput / NumberInput Component for Apex Apparel ERP
 *
 * Rules:
 * - Uses type="text" and inputMode="decimal" (or "numeric")
 * - No spinner arrows (up/down) anywhere
 * - Wheel and ArrowUp/ArrowDown value changes disabled
 * - Select-all on focus
 * - Converts Arabic-Indic numerals (٠-٩) to Western (0-9)
 * - Enter never submits a form or issues a document
 * - Applied immediately and exactly as typed; never alters value on blur or scroll
 */
export const MoneyInput = forwardRef(function MoneyInput(
  {
    value,
    onChange,
    allowNegative = false,
    allowDecimal = true,
    maxDecimals = 2,
    selectAllOnFocus = true,
    onFocus,
    onBlur,
    onKeyDown,
    onWheel,
    className = '',
    dir = 'ltr',
    ...props
  },
  ref
) {
  const sanitize = (raw) => {
    let text = normalizeDigits(raw);

    let isNegative = false;
    if (allowNegative && text.startsWith('-')) {
      isNegative = true;
      text = text.slice(1);
    }

    if (!allowDecimal) {
      text = text.replace(/[^0-9]/g, '');
    } else {
      text = text.replace(/[^0-9.]/g, '');
      const parts = text.split('.');
      if (parts.length > 2) {
        text = parts[0] + '.' + parts.slice(1).join('');
      }
      if (maxDecimals !== undefined && maxDecimals !== null && parts.length === 2) {
        text = parts[0] + '.' + parts[1].slice(0, maxDecimals);
      }
    }

    return (isNegative ? '-' : '') + text;
  };

  const handleChange = (e) => {
    const rawVal = e?.target ? e.target.value : String(e ?? '');
    const clean = sanitize(rawVal);

    if (onChange) {
      // Support both React event signature and direct value signature
      const syntheticEvent = {
        ...(typeof e === 'object' && e !== null ? e : {}),
        target: {
          ...(typeof e === 'object' && e?.target ? e.target : {}),
          name: props.name,
          value: clean,
        },
        currentTarget: {
          ...(typeof e === 'object' && e?.currentTarget ? e.currentTarget : {}),
          name: props.name,
          value: clean,
        },
        toString: () => clean,
        valueOf: () => clean,
        [Symbol.toPrimitive]: () => clean,
        stopPropagation: () => e?.stopPropagation?.(),
        preventDefault: () => e?.preventDefault?.(),
      };

      // Call handler
      onChange(syntheticEvent);
    }
  };

  const handleFocus = (e) => {
    if (selectAllOnFocus) {
      e.target.select();
    }
    if (onFocus) onFocus(e);
  };

  const handleKeyDown = (e) => {
    // Disable ArrowUp and ArrowDown from modifying value or spinning
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      return;
    }

    // Enter key never submits the form or issues a document
    if (e.key === 'Enter') {
      e.preventDefault();
      if (props.onEnter) {
        props.onEnter(e);
      }
    }

    if (onKeyDown) onKeyDown(e);
  };

  const handleWheel = (e) => {
    // Prevent mouse wheel scrolling from changing value
    e.currentTarget.blur();
    if (onWheel) onWheel(e);
  };

  const displayVal =
    value === null || value === undefined
      ? ''
      : typeof value === 'object' && value !== null && value.target && 'value' in value.target
      ? String(value.target.value)
      : String(value);

  return (
    <input
      ref={ref}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      dir={dir}
      value={displayVal}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      autoComplete="off"
      className={className}
      {...props}
    />
  );
});

export const NumberInput = forwardRef(function NumberInput(props, ref) {
  return <MoneyInput ref={ref} {...props} />;
});

export default MoneyInput;
