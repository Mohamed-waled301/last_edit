import React, { useState, useEffect } from 'react';
import { AlertTriangle, HardDrive, X, Download } from 'lucide-react';
import { settingsRepo, backupRepo } from '../data';

export const BackupReminderBanner = ({ onOpenBackup }) => {
  const [show7DayWarning, setShow7DayWarning] = useState(false);
  const [showDeviceNotice, setShowDeviceNotice] = useState(false);
  const [isPersisted, setIsPersisted] = useState(true);

  useEffect(() => {
    checkBackupStatus();
    checkStoragePersistence();
  }, []);

  const checkBackupStatus = async () => {
    try {
      const settings = await settingsRepo.getSettings();

      // 1. One-time advisory notice
      if (!settings.notice_dismissed) {
        setShowDeviceNotice(true);
      }

      // 2. 7-day backup reminder
      const lastBackup = settings.last_backup_date;
      if (!lastBackup) {
        setShow7DayWarning(true);
      } else {
        const diffDays = (new Date().getTime() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays >= 7) {
          setShow7DayWarning(true);
        }
      }
    } catch (e) {
      console.warn('Backup status check error:', e);
    }
  };

  const checkStoragePersistence = async () => {
    try {
      const persisted = await backupRepo.checkStoragePersistence();
      setIsPersisted(persisted);
    } catch (e) {
      console.warn('Persistence check error:', e);
    }
  };

  const dismissOneTimeNotice = async () => {
    setShowDeviceNotice(false);
    try {
      await settingsRepo.dismissNotice();
    } catch (e) {
      console.warn('Dismiss error:', e);
    }
  };

  return (
    <div className="space-y-2 mb-4">
      {/* 1. One-time initial notice explaining local storage */}
      {showDeviceNotice && (
        <div className="p-3.5 bg-blue-50 border-r-4 border-r-blue-600 border border-blue-200 rounded-md text-sm text-blue-900 flex items-center justify-between shadow-none">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-blue-700 shrink-0" />
            <div>
              <span className="font-bold">تنبيه هام لطبيعة النظام: </span>
              البيانات محفوظة على هذا الجهاز فقط، اعمل نسخة احتياطية باستمرار لتفادي فقدانها في حال تغيير المتصفح أو مسح بيانات الجهاز.
            </div>
          </div>
          <button
            onClick={dismissOneTimeNotice}
            className="text-blue-700 hover:text-blue-900 p-1 hover:bg-blue-100 rounded transition-colors cursor-pointer text-xs flex items-center gap-1 font-semibold"
          >
            <X className="w-4 h-4" />
            <span>فهمت ذلك</span>
          </button>
        </div>
      )}

      {/* 2. Persistent 7-Day Backup Reminder Warning */}
      {show7DayWarning && (
        <div className="p-3.5 bg-amber-50 border-r-4 border-r-amber-500 border border-amber-300 rounded-md text-sm text-amber-950 flex items-center justify-between shadow-none">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold">تذكير أمان البيانات: </span>
              لم يتم حفظ نسخة احتياطية منذ أكثر من 7 أيام! يُرجى تنزيل نسخة احتياطية من بياناتك الآن لضمان حفظ كل الحسابات.
            </div>
          </div>
          <button
            onClick={onOpenBackup}
            className="px-3 py-1.5 bg-[#1F3A5F] hover:bg-[#162a45] text-white rounded text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>حفظ نسخة احتياطية الآن</span>
          </button>
        </div>
      )}

      {/* 3. Persistence Refused Warning (only if browser explicitly denied persistence) */}
      {!isPersisted && (
        <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0" />
          <span>تنبيه: المتصفح يعمل في وضع التخزين العادي (غير الدائم). احرص على حفظ نسخة احتياطية أسبوعياً.</span>
        </div>
      )}
    </div>
  );
};

export default BackupReminderBanner;
