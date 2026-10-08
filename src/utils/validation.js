import React from 'react';
export { Validators, validators, isLineItemComplete, validateLineItem, default } from './validation.jsx';

export function FieldError({ error }) {
  if (!error) return null;
  return React.createElement(
    'span',
    { className: 'block text-xs font-semibold text-red-600 mt-1 animate-fadeIn' },
    error
  );
}
