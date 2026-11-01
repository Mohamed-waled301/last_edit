import React, { forwardRef, useState, useEffect, useRef } from 'react';
import { normalizeDigits } from '../utils/money';

/**
 * Shared MoneyInput / NumberInput Component for code systems ERP
 *
 * Rules:
 * - Uses type="text" and inputMode="decimal" (or "numeric")
 * - Keeps raw typed string in local state while focused to allow intermediate states ("", "0.", "12.", "-")
 * - Commits clean values without altering what the user typed
 * - No spinner arrows (up/down) anywhere
 * - Wheel and ArrowUp/ArrowDown value changes disabled
 * - Select-all on focus
 * - Supports seamless copy/paste
 * - Converts Arabic-Indic numerals (٠-٩) to Western (0-9)
 * - Enter never submits a form or issues a document
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
  // Normalize incoming value to string
  const toDisplayString = (val) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object' && val !== null && val.target && 'value' in val.target) {
      return String(val.target.value ?? '');
    }
    return String(val);
  };

  const [localValue, setLocalValue] = useState(() => toDisplayString(value));
  const isFocusedRef = useRef(false);

  // Sync from prop changes when the user is NOT actively typing inside the field
  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalValue(toDisplayString(value));
    }
  }, [value]);

  // Clean up focus lock on unmount
  useEffect(() => {
    return () => {
      isFocusedRef.current = false;
    };
  }, []);

  const sanitize = (raw) => {
    if (raw === null || raw === undefined) return '';
    let text = normalizeDigits(String(raw));

    let isNegative = false;
    if (allowNegative && text.startsWith('-')) {
      isNegative = true;
      text = text.slice(1);
    }

    if (!allowDecimal) {
      text = text.replace(/[^0-9]/g, '');
    } else {
      // Keep only digits and decimal point
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

    // Update local state immediately so intermediate typing is preserved
    setLocalValue(clean);

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

      onChange(syntheticEvent);
    }
  };

  const handleFocus = (e) => {
    isFocusedRef.current = true;
    if (selectAllOnFocus) {
      try {
        e.target.select();
      } catch {}
    }
    if (onFocus) onFocus(e);
  };

  const handleBlur = (e) => {
    isFocusedRef.current = false;
    // On blur, synchronize with current prop value if it changed externally
    if (value !== undefined) {
      setLocalValue(toDisplayString(value));
    }
    if (onBlur) onBlur(e);
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

  const handlePaste = (e) => {
    // Let browser paste, then sanitize via onChange, or handle clipboardData
    const pasted = e.clipboardData?.getData('text');
    if (pasted) {
      e.preventDefault();
      const clean = sanitize(pasted);
      const input = e.target;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const nextVal = sanitize(
        localValue.slice(0, start) + clean + localValue.slice(end)
      );
      setLocalValue(nextVal);
      if (onChange) {
        const syntheticEvent = {
          target: { name: props.name, value: nextVal },
          currentTarget: { name: props.name, value: nextVal },
          toString: () => nextVal,
        };
        onChange(syntheticEvent);
      }
    }
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      dir={dir}
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      onPaste={handlePaste}
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
