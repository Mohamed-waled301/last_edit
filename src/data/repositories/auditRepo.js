import db from '../db';

export const auditRepo = {
  async log(userId, action, entityType, entityId = null, oldData = null, newData = null) {
    try {
      const entry = {
        id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        user_id: userId || 'system',
        action,
        entity_type: entityType,
        entity_id: entityId,
        old_data: oldData ? JSON.stringify(oldData) : null,
        new_data: newData ? JSON.stringify(newData) : null,
        created_at: new Date().toISOString(),
      };
      await db.audit_log.add(entry);
    } catch (e) {
      console.warn('Audit log write error:', e);
    }
  },

  async getAll(limit = 100) {
    const logs = await db.audit_log.orderBy('created_at').reverse().limit(limit).toArray();
    const users = await db.users.toArray();
    const userMap = new Map(users.map(u => [u.id, u.full_name]));

    return logs.map(l => ({
      ...l,
      user_name: userMap.get(l.user_id) || l.user_id,
    }));
  }
};

export default auditRepo;
