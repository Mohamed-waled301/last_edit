import db from '../db';
import auditRepo from './auditRepo';

export const materialsRepo = {
  async getAll() {
    const list = await db.materials.toArray();
    return list.map(m => ({
      ...m,
      current_stock: Number(m.current_stock) || 0,
      min_stock_alert: Number(m.min_stock_alert) || 0,
      average_cost: Number(m.average_cost) || 0,
      total_value: Number(((Number(m.current_stock) || 0) * (Number(m.average_cost) || 0)).toFixed(2)),
      is_low_stock: (Number(m.current_stock) || 0) <= (Number(m.min_stock_alert) || 0),
    }));
  },

  async getById(id) {
    return await db.materials.get(id);
  },

  async create(data, userId = 'usr-storekeeper') {
    const id = `mat-${Date.now()}`;
    const code = data.code || `RAW-${Date.now().toString().slice(-4)}`;
    const material = {
      id,
      code,
      name: data.name,
      unit: data.unit || 'قطعة',
      current_stock: Number(data.current_stock) || 0,
      min_stock_alert: Number(data.min_stock_alert) || 0,
      average_cost: Number(data.average_cost) || 0,
      location_in_warehouse: data.location_in_warehouse || '',
      notes: data.notes || '',
      is_active: 1,
      created_at: new Date().toISOString(),
    };

    await db.transaction('rw', [db.materials, db.stock_movements], async () => {
      await db.materials.add(material);
      if (material.current_stock > 0) {
        await db.stock_movements.add({
          id: `sm-${Date.now()}`,
          material_id: id,
          movement_type: 'purchase_in',
          reference_type: 'OPENING_BALANCE',
          reference_id: id,
          quantity_change: material.current_stock,
          unit_cost: material.average_cost,
          new_balance: material.current_stock,
          notes: 'رصيد افتتاحي أولي للخامة',
          created_by: userId,
          created_at: new Date().toISOString(),
        });
      }
    });

    await auditRepo.log(userId, 'CREATE_MATERIAL', 'raw_materials', id, null, material);
    return material;
  },

  async update(id, data, userId = 'usr-storekeeper') {
    const current = await db.materials.get(id);
    if (!current) throw new Error('الخامة غير موجودة');

    const updated = {
      ...current,
      name: data.name ?? current.name,
      code: data.code ?? current.code,
      unit: data.unit ?? current.unit,
      min_stock_alert: data.min_stock_alert !== undefined ? Number(data.min_stock_alert) : current.min_stock_alert,
      location_in_warehouse: data.location_in_warehouse ?? current.location_in_warehouse,
      notes: data.notes ?? current.notes,
      is_active: data.is_active !== undefined ? Number(data.is_active) : current.is_active,
    };

    await db.materials.put(updated);
    await auditRepo.log(userId, 'UPDATE_MATERIAL', 'raw_materials', id, current, updated);
    return updated;
  },

  async getMovements(materialId) {
    const movements = await db.stock_movements
      .where('material_id')
      .equals(materialId)
      .reverse()
      .sortBy('created_at');

    const users = await db.users.toArray();
    const userMap = new Map(users.map(u => [u.id, u.full_name]));

    return movements.map(m => ({
      ...m,
      created_by_name: userMap.get(m.created_by) || m.created_by,
    }));
  },

  async saveStockCount(data, userId = 'usr-storekeeper') {
    const { count_date, items, notes } = data;
    const countId = `sc-${Date.now()}`;
    const now = new Date().toISOString();

    await db.transaction('rw', [db.materials, db.stock_counts, db.stock_count_items, db.stock_movements], async () => {
      // 1. Record stock count session
      await db.stock_counts.add({
        id: countId,
        count_date: count_date || now.split('T')[0],
        status: 'posted',
        notes: notes || 'تسوية جرد دوري معتمد',
        created_by: userId,
        created_at: now,
      });

      // 2. Process each item difference
      for (const item of (items || [])) {
        const material = await db.materials.get(item.material_id);
        if (!material) continue;

        const systemQty = Number(material.current_stock) || 0;
        const actualQty = Math.max(0, Number(item.actual_quantity) || 0);
        const diffQty = actualQty - systemQty;
        const unitCost = Number(material.average_cost) || 0;
        const diffValue = Number((diffQty * unitCost).toFixed(2));

        await db.stock_count_items.add({
          id: `sci-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          count_id: countId,
          material_id: material.id,
          system_quantity: systemQty,
          actual_quantity: actualQty,
          difference_qty: diffQty,
          unit_cost: unitCost,
          difference_value: diffValue,
          reason: item.reason || 'تسوية جرد المخزن',
        });

        // Update material current stock
        await db.materials.update(material.id, { current_stock: actualQty });

        // Record stock movement if there is a difference
        if (diffQty !== 0) {
          await db.stock_movements.add({
            id: `sm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            material_id: material.id,
            movement_type: 'stock_count_adj',
            reference_type: 'STOCK_COUNT',
            reference_id: countId,
            quantity_change: diffQty,
            unit_cost: unitCost,
            new_balance: actualQty,
            notes: `تسوية جردية: ${diffQty > 0 ? 'فائض' : 'عجز'} قدره ${Math.abs(diffQty)} ${material.unit}`,
            created_by: userId,
            created_at: now,
          });
        }
      }
    });

    await auditRepo.log(userId, 'POST_STOCK_COUNT', 'stock_counts', countId, null, data);
    return { success: true, countId };
  },

  async getLowStockAlerts() {
    const materials = await this.getAll();
    return materials.filter(m => m.is_low_stock && m.is_active === 1);
  }
};

export default materialsRepo;
