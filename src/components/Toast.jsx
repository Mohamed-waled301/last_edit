import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, X } from 'lucide-react';

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, 4000);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  const isSuccess = type === 'success';

  return (
    <div
      className={`fixed bottom-5 left-5 z-50 flex items-center gap-3 px-4 py-3 rounded-md border text-base font-semibold transition-all duration-200 bg-white ${
        isSuccess
          ? 'border-gray-300 border-r-4 border-r-green-600 text-gray-800'
          : 'border-gray-300 border-r-4 border-r-red-600 text-gray-800'
      }`}
      style={{ minWidth: '300px' }}
    >
      {isSuccess ? (
        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
      )}
      <span className="flex-1 text-sm font-semibold">{message}</span>
      <button 
        onClick={onClose} 
        className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
        aria-label="إغلاق"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
