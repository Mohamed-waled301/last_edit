import React from 'react';
import { AlertTriangle, Home, RotateCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.hash = '#home';
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center p-6 text-gray-900" dir="rtl">
          <div className="bg-white rounded-2xl p-8 max-w-lg w-full border border-gray-200 shadow-xl text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full mx-auto flex items-center justify-center font-bold">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-gray-900">حصلت مشكلة في الشاشة دي</h2>
            <p className="text-gray-600 font-medium text-sm leading-relaxed">
              حدث خطأ غير متوقع أثناء معالجة البيانات، تم حفظ سجل الخطأ للتدقيق الفني. يمكنك الرجوع إلى الشاشة الرئيسية أو إعادة المحاولة.
            </p>
            {this.state.error?.message && (
              <div className="p-3 bg-red-50 text-red-800 rounded-md text-xs font-mono text-left max-h-28 overflow-y-auto border border-red-200">
                {this.state.error.message}
              </div>
            )}
            <div className="pt-3 flex items-center justify-center gap-3 flex-wrap">
              <button
                onClick={this.handleGoHome}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded-md font-bold text-sm shadow-sm cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>رجوع للرئيسية</span>
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-md font-bold text-sm shadow-xs cursor-pointer"
              >
                <RotateCw className="w-4 h-4 text-gray-500" />
                <span>إعادة المحاولة</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
