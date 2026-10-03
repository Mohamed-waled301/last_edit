import db from '../db';
import AuthSecurity from '../../logic/auth';
import auditRepo from './auditRepo';

export const usersRepo = {
  async getAll() {
    return await db.users.filter(u => u.is_active === 1).toArray();
  },

  async getById(id) {
    return await db.users.get(id);
  },

  async getByUsername(username) {
    return await db.users.where('username').equalsIgnoreCase(username).first();
  },

  async hasOwner() {
    const owner = await db.users.where('role').equals('owner').first();
    return !!owner;
  },

  async createOwner(factoryName, ownerFullName, pin) {
    const { hash, salt } = await AuthSecurity.hashPin(pin);
    const ownerId = 'usr-owner';
    const now = new Date().toISOString();

    await db.transaction('rw', [db.users, db.settings, db.treasury_accounts], async () => {
      // Create owner user
      await db.users.put({
        id: ownerId,
        username: 'owner',
        full_name: ownerFullName || 'المعلم (صاحب الورشة)',
        password_hash: hash,
        password_salt: salt,
        role: 'owner',
        is_active: 1,
        created_at: now,
      });

      // Initialize default settings
      const existingSettings = await db.settings.get(1);
      if (!existingSettings) {
        await db.settings.put({
          id: 1,
          factory_name: factoryName || 'ورشة ومصنع الأصيل',
          phone: '',
          address: '',
          vat_enabled: 0,
          vat_rate_percent: 14.0,
          currency_symbol: 'ج.م',
          last_backup_date: null,
          notice_dismissed: false,
        });
      } else {
        await db.settings.update(1, {
          factory_name: factoryName || existingSettings.factory_name,
        });
      }

      // Initialize primary treasury account if none exists
      const accountsCount = await db.treasury_accounts.count();
      if (accountsCount === 0) {
        await db.treasury_accounts.put({
          id: 'acc-1',
          name: 'خزنة الورشة النقدية (الرئيسية)',
          account_type: 'treasury',
          current_balance: 0,
          bank_account_number: '',
          bank_name: '',
          is_active: 1,
          created_at: now,
        });
      }
    });

    await auditRepo.log(ownerId, 'CREATE_OWNER', 'users', ownerId, null, { full_name: ownerFullName });
    return await db.users.get(ownerId);
  },

  async createUser({ username, fullName, role, pin, createdBy = 'usr-owner' }) {
    const existing = await this.getByUsername(username);
    if (existing) {
      throw new Error(`اسم المستخدم "${username}" مسجل بالفعل.`);
    }

    const { hash, salt } = await AuthSecurity.hashPin(pin || '1234');
    const id = `usr-${Date.now()}`;
    const user = {
      id,
      username,
      full_name: fullName,
      password_hash: hash,
      password_salt: salt,
      role,
      is_active: 1,
      created_at: new Date().toISOString(),
    };

    await db.users.add(user);
    await auditRepo.log(createdBy, 'CREATE_USER', 'users', id, null, { username, role });
    return user;
  },

  async verifyPin(userId, pin) {
    const user = await db.users.get(userId);
    if (!user || user.is_active !== 1) {
      return { success: false, error: 'المستخدم غير موجود أو معطل' };
    }

    // Default seed fallback if password_salt is absent
    if (!user.password_salt) {
      if (pin === '123' || pin === '1234' || pin === user.password_hash) {
        return { success: true, user };
      }
    }

    const isValid = await AuthSecurity.verifyPin(pin, user.password_hash, user.password_salt);
    if (isValid) {
      return { success: true, user };
    }
    return { success: false, error: 'رمز الدخول (PIN) غير صحيح' };
  }
};

export default usersRepo;
