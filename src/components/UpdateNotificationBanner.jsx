import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function UpdateNotificationBanner({ onNotify }) {
  const [updateState, setUpdateState] = useState({
    status: 'idle',
    version: '',
    percent: 0,
    installerPath: null,
    error: null,
  });
  const [countdown, setCountdown] = useState(15);
  const [isRestarting, setIsRestarting] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const countdownTimerRef = useRef(null);

  const handleRestartAndInstall = useCallback(async () => {
    if (isRestarting) return;
    setIsRestarting(true);
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    try {
      if (window.electronAPI?.updater?.quitAndInstall) {
        await window.electronAPI.updater.quitAndInstall();
      }
    } catch (err) {
      setIsRestarting(false);
      console.error('[UpdateBanner] Restart error:', err);
      if (onNotify) {
        onNotify('تعذر تنفيذ التثبيت التلقائي: ' + (err?.message || err), 'error');
      }
    }
  }, [isRestarting, onNotify]);

  useEffect(() => {
    // Only works inside Electron environment
    if (typeof window === 'undefined' || !window.electronAPI?.updater) {
      return;
    }

    // Get initial status
    window.electronAPI.updater.getStatus().then((st) => {
      if (st && st.status && st.status !== 'idle') {
        setUpdateState(st);
      }
    }).catch(() => {});

    // Subscribe to status updates from Electron main process
    const unsubscribe = window.electronAPI.updater.onStatus((data) => {
      if (!data) return;
      setUpdateState((prev) => ({
        ...prev,
        ...data,
        version: data.updateInfo?.version || data.version || prev.version,
      }));

      // When update download completes, start countdown to auto restart
      if (data.status === 'update-downloaded') {
        setIsDismissed(false);
        setCountdown(15);
        if (onNotify) {
          onNotify(`تم اكتمال تحميل تحديث إصدار القص (v${data.version || ''}) بنجاح. جاهز للتثبيت.`, 'success');
        }
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [onNotify]);

  // Handle countdown for auto restart on update-downloaded
  useEffect(() => {
    if (updateState.status === 'update-downloaded' && !isDismissed && !isRestarting) {
      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current);
            handleRestartAndInstall();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
        }
      };
    }
  }, [updateState.status, isDismissed, isRestarting, handleRestartAndInstall]);

  // If dismissed or idle or up-to-date, don't render banner
  if (isDismissed || updateState.status === 'idle' || updateState.status === 'up-to-date') {
    return null;
  }

  // 1. Downloading Progress Banner
  if (updateState.status === 'downloading') {
    return (
      <aside aria-label="شريط تحميل التحديث" className="bg-[#1F3A5F] text-white px-4 py-2.5 shadow-md border-b border-blue-900 z-50 text-xs transition-all animate-fadeIn" dir="rtl">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0">
              <Download className="w-3.5 h-3.5 animate-bounce" />
            </div>
            <div>
              <span className="font-bold text-white ml-2">
                يوجد تحديث جديد لإصدار القص {updateState.version ? `(v${updateState.version})` : ''}
              </span>
              <span className="text-blue-200">
                — جاري التحميل التلقائي في الخلفية... {updateState.percent}%
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-32 sm:w-48 bg-blue-950/80 rounded-full h-2 overflow-hidden border border-blue-400/30">
              <div
                className="bg-emerald-400 h-full transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(5, updateState.percent)}%` }}
              />
            </div>
            <span className="font-mono text-emerald-300 font-bold shrink-0">
              {updateState.percent}%
            </span>
          </div>
        </div>
      </aside>
    );
  }

  // 2. Downloaded Ready to Restart & Update Modal/Card
  if (updateState.status === 'update-downloaded') {
    return (
      <aside aria-label="نافذة تثبيت التحديث وإعادة التشغيل" className="bg-emerald-700 text-white px-4 py-3 shadow-lg border-b border-emerald-800 z-50 transition-all animate-fadeIn" dir="rtl">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white text-emerald-700 flex items-center justify-center shrink-0 shadow-xs">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm">
                تم اكتمال تحميل التحديث الجديد بنجاح {updateState.version ? `(الإصدار v${updateState.version})` : ''}
              </div>
              <div className="text-xs text-emerald-100">
                التحديث جاهز للتثبيت الفوري. سيتم إعادة تشغيل البرنامج وتحديث إصدار القص تلقائياً خلال {countdown} ثانية.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRestartAndInstall}
              disabled={isRestarting}
              className="px-4 py-2 bg-white text-emerald-800 hover:bg-emerald-50 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRestarting ? 'animate-spin' : ''}`} />
              <span>{isRestarting ? 'جاري إعادة التشغيل...' : 'إعادة التشغيل والتحديث الآن'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsDismissed(true);
                if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
              }}
              className="px-3 py-2 bg-emerald-800/80 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              title="تأجيل التحديث لبعد قليل"
            >
              تأجيل
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return null;
}
