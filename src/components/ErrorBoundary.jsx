import React from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-100 flex items-center justify-center p-6 text-stone-900" dir="rtl">
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full border-2 border-stone-200 shadow-xl text-center space-y-4">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl mx-auto flex items-center justify-center font-bold">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-stone-900">حدث خطأ أثناء تحميل الشاشة</h2>
            <p className="text-stone-600 font-semibold text-base">
              {this.state.error?.message || 'برجاء إعادة تحميل الصفحة للمتابعة'}
            </p>
            <div className="pt-2">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black text-lg shadow-md cursor-pointer"
              >
                <RotateCw className="w-5 h-5" />
                <span>إعادة تحميل الشاشة</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
