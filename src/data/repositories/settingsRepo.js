import db from '../db';
import auditRepo from './auditRepo';

export const settingsRepo = {
  async getSettings() {
    let settings = await db.settings.get(1);
    if (!settings) {
      settings = {
        id: 1,
        factory_name: 'مجموعة القمة للصناعات المتطورة والأنظمة الذكية (Apex Enterprise)',
        phone: '+20 2 2450 8899',
        address: 'المنطقة الصناعية الثالثة - مجمع الأنظمة المتقدمة - مدينة العاشر من رمضان',
        vat_enabled: 1,
        vat_rate_percent: 14.0,
        currency_symbol: 'ج.م',
        last_backup_date: null,
        notice_dismissed: false,
      };
      await db.settings.put(settings);
    }
    return settings;
  },

  async updateSettings(data, userId = 'usr-owner') {
    const current = await this.getSettings();
    const updated = {
      ...current,
      ...data,
      id: 1,
    };
    await db.settings.put(updated);
    await auditRepo.log(userId, 'UPDATE_SETTINGS', 'settings', 1, current, updated);
    return updated;
  },

  async recordBackupTime() {
    const current = await this.getSettings();
    const now = new Date().toISOString();
    await db.settings.update(1, { last_backup_date: now });
    return now;
  },

  async dismissNotice() {
    await db.settings.update(1, { notice_dismissed: true });
  }
};

export default settingsRepo;
