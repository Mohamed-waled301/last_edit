import React from 'react';
import { ArrowRight } from 'lucide-react';

export default function BackButton({ onClick, label = 'رجوع للشاشة الرئيسية' }) {
  return (
    <button
      onClick={onClick}
      className="no-print inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700 rounded-md font-semibold text-sm border border-gray-300 transition-colors cursor-pointer select-none"
    >
      <ArrowRight className="w-4 h-4 text-gray-500" />
      <span>{label}</span>
    </button>
  );
}
