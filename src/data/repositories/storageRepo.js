import db from '../db';
import auditRepo from './auditRepo';

export const storageRepo = {
  /**
   * 1. Storage Locations (أماكن التخزين)
   */
  async getLocations() {
    return await db.storage_locations.filter(l => l.is_active === 1).toArray();
  },

  async getLocationById(id) {
    return await db.storage_locations.get(id);
  },

  async createLocation(data, userId = 'usr-storekeeper') {
    const id = `loc-${Date.now()}`;
    const code = data.code || `LOC-${Date.now().toString().slice(-4)}`;
    const location = {
      id,
      code,
      name: data.name,
      location_type: data.location_type || 'warehouse', // 'warehouse' | 'outlet' | 'fabric' | 'accessories'
      notes: data.notes || '',
      is_active: 1,
      created_at: new Date().toISOString()
    };
    await db.storage_locations.add(location);
    await auditRepo.log(userId, 'CREATE_LOCATION', 'storage_locations', id, null, location);
    return location;
  },

  async updateLocation(id, data, userId = 'usr-storekeeper') {
    const current = await db.storage_locations.get(id);
    if (!current) throw new Error('موقع التخزين غير موجود');
    const updated = {
      ...current,
      name: data.name ?? current.name,
      code: data.code ?? current.code,
      location_type: data.location_type ?? current.location_type,
      notes: data.notes ?? current.notes,
      is_active: data.is_active !== undefined ? Number(data.is_active) : current.is_active
    };
    await db.storage_locations.put(updated);
    await auditRepo.log(userId, 'UPDATE_LOCATION', 'storage_locations', id, current, updated);
    return updated;
  },

  /**
   * 2. Stock Transfers between locations (التحويل المخزني بين المواقع)
   */
  async getTransfers() {
    const transfers = await db.stock_transfers.reverse().sortBy('created_at');
    const locations = await db.storage_locations.toArray();
    const locMap = new Map(locations.map(l => [l.id, l.name]));
    const items = await db.items.toArray();
    const itemMap = new Map(items.map(i => [i.id, i.name]));

    return transfers.map(t => ({
      ...t,
      from_location_name: locMap.get(t.from_location_id) || t.from_location_id,
      to_location_name: locMap.get(t.to_location_id) || t.to_location_id,
      item_name: itemMap.get(t.item_id) || t.item_id
    }));
  },

  async createStockTransfer(data, userId = 'usr-storekeeper') {
    const { from_location_id, to_location_id, item_id, variant_id, quantity, transfer_date, notes } = data;
    const transferQty = Math.max(0, Number(quantity) || 0);
    if (transferQty <= 0) throw new Error('كمية التحويل يجب أن تكون أكبر من صفر');
    if (from_location_id === to_location_id) throw new Error('لا يمكن التحويل لنفس موقع التخزين');

    const item = await db.items.get(item_id);
    if (!item) throw new Error('الصنف المراد تحويله غير موجود');

    const transferId = `trf-${Date.now()}`;
    const transferNumber = `TRF-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    await db.transaction('rw', [db.stock_transfers, db.stock_movements, db.items], async () => {
      // Record transfer
      await db.stock_transfers.add({
        id: transferId,
        transfer_number: transferNumber,
        from_location_id,
        to_location_id,
        item_id,
        variant_id: variant_id || null,
        quantity: transferQty,
        transfer_date: transfer_date || now.split('T')[0],
        notes: notes || '',
        created_by: userId,
        created_at: now
      });

      // Outflow movement from source
      await db.stock_movements.add({
        id: `sm-${Date.now()}-out`,
        material_id: item_id,
        location_id: from_location_id,
        movement_type: 'transfer_out',
        reference_type: 'STOCK_TRANSFER',
        reference_id: transferId,
        quantity_change: -transferQty,
        unit_cost: Number(item.cost_price) || 0,
        notes: `تحويل مخزني صادر إذن ${transferNumber}`,
        created_by: userId,
        created_at: now
      });

      // Inflow movement to destination
      await db.stock_movements.add({
        id: `sm-${Date.now()}-in`,
        material_id: item_id,
        location_id: to_location_id,
        movement_type: 'transfer_in',
        reference_type: 'STOCK_TRANSFER',
        reference_id: transferId,
        quantity_change: transferQty,
        unit_cost: Number(item.cost_price) || 0,
        notes: `تحويل مخزني وارد إذن ${transferNumber}`,
        created_by: userId,
        created_at: now
      });
    });

    await auditRepo.log(userId, 'CREATE_STOCK_TRANSFER', 'stock_transfers', transferId, null, data);
    return { success: true, transferNumber };
  },

  /**
   * 3. Stock Adjustment (التسويات الجردية: عجز هالك/عينات، أو زيادة، كميات فقط وبلا أثر مالي)
   */
  async getAdjustments() {
    const list = await db.stock_adjustments.reverse().sortBy('created_at');
    const items = await db.items.toArray();
    const itemMap = new Map(items.map(i => [i.id, i.name]));
    const locations = await db.storage_locations.toArray();
    const locMap = new Map(locations.map(l => [l.id, l.name]));

    return list.map(a => ({
      ...a,
      item_name: itemMap.get(a.item_id) || a.item_id,
      location_name: locMap.get(a.location_id) || a.location_id
    }));
  },

  async createAdjustment(data, userId = 'usr-storekeeper') {
    const { item_id, variant_id, location_id, adjustment_type, sub_type, quantity, reason, notes, adjustment_date } = data;
    const adjQty = Math.max(0, Number(quantity) || 0);
    if (adjQty <= 0) throw new Error('كمية التسوية يجب أن تكون أكبر من صفر');

    const item = await db.items.get(item_id);
    if (!item) throw new Error('الصنف غير موجود');

    const adjId = `adj-${Date.now()}`;
    const adjNumber = `ADJ-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    // Determine quantity change:
    // adjustment_type: 'shortage' (عجز) -> -adjQty (sub_type: 'waste' هالك, 'samples' عينات)
    // adjustment_type: 'addition' (زيادة) -> +adjQty
    const isShortage = adjustment_type === 'shortage';
    const quantityDelta = isShortage ? -adjQty : adjQty;

    const previousStock = Number(item.current_stock) || 0;
    const newStock = Math.max(0, Number((previousStock + quantityDelta).toFixed(3)));

    await db.transaction('rw', [db.stock_adjustments, db.stock_movements, db.items, db.materials, db.products], async () => {
      // Update item stock
      const variants = Array.isArray(item.variants) ? [...item.variants] : [];
      if (variant_id && variants.length > 0) {
        const vIndex = variants.findIndex(v => v.id === variant_id);
        if (vIndex !== -1) {
          variants[vIndex].current_stock = Math.max(0, (Number(variants[vIndex].current_stock) || 0) + quantityDelta);
        }
      }

      await db.items.update(item_id, {
        current_stock: newStock,
        variants
      });

      // Also update materials or products
      if (item.item_type === 'raw_material') {
        await db.materials.update(item_id, { current_stock: newStock }).catch(() => {});
      } else {
        await db.products.update(item_id, { current_finished_stock: newStock }).catch(() => {});
      }

      // Record adjustment document (Audit Trail)
      await db.stock_adjustments.add({
        id: adjId,
        adjustment_number: adjNumber,
        item_id,
        variant_id: variant_id || null,
        location_id: location_id || null,
        adjustment_type, // 'shortage' | 'addition'
        sub_type: isShortage ? (sub_type || 'waste') : 'surplus', // 'waste' | 'samples' | 'surplus'
        quantity: adjQty,
        quantity_delta: quantityDelta,
        previous_balance: previousStock,
        new_balance: newStock,
        reason: reason || (isShortage ? (sub_type === 'waste' ? 'هالك تشغيل وقص' : 'عينات تطوير وعرض') : 'فائض جرد'),
        notes: notes || '',
        financial_impact: 0, // NO FINANCIAL/ACCOUNTING IMPACT as requested
        adjustment_date: adjustment_date || now.split('T')[0],
        created_by: userId,
        created_at: now
      });

      // Record stock movement
      await db.stock_movements.add({
        id: `sm-${Date.now()}`,
        material_id: item_id,
        location_id: location_id || null,
        movement_type: isShortage ? `adjustment_${sub_type || 'waste'}` : 'adjustment_addition',
        reference_type: 'STOCK_ADJUSTMENT',
        reference_id: adjId,
        quantity_change: quantityDelta,
        unit_cost: 0, // Zero financial effect
        new_balance: newStock,
        notes: `تسوية جردية ${adjNumber}: ${reason || ''}`,
        created_by: userId,
        created_at: now
      });
    });

    await auditRepo.log(userId, 'CREATE_STOCK_ADJUSTMENT', 'stock_adjustments', adjId, null, {
      adjNumber,
      adjustment_type,
      sub_type,
      quantity: adjQty,
      reason
    });

    return { success: true, adjNumber, newStock };
  }
};

export default storageRepo;
