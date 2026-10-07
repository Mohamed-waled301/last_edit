import db from '../db';
import auditRepo from './auditRepo';

export const itemsRepo = {
  /**
   * Get all items with calculated actual balance, variants, and clothing info
   */
  async getAll() {
    const items = await db.items.toArray();
    return items.map(item => {
      const variants = Array.isArray(item.variants) ? item.variants : [];
      const totalStock = variants.length > 0
        ? variants.reduce((sum, v) => sum + (Number(v.current_stock) || 0), 0)
        : Number(item.current_stock) || 0;

      const totalOpening = variants.length > 0
        ? variants.reduce((sum, v) => sum + (Number(v.opening_balance) || 0), 0)
        : Number(item.opening_balance) || 0;

      return {
        ...item,
        opening_balance: totalOpening,
        current_stock: totalStock,
        actual_balance: totalStock,
        cost_price: Number(item.cost_price) || Number(item.average_cost) || 0,
        average_cost: Number(item.cost_price) || Number(item.average_cost) || 0,
        selling_price: Number(item.selling_price) || 0,
        min_issue_qty: Number(item.min_issue_qty) || 1,
        variants
      };
    });
  },

  async getById(id) {
    const item = await db.items.get(id);
    if (!item) return null;
    const variants = Array.isArray(item.variants) ? item.variants : [];
    const totalStock = variants.length > 0
      ? variants.reduce((sum, v) => sum + (Number(v.current_stock) || 0), 0)
      : Number(item.current_stock) || 0;

    return {
      ...item,
      current_stock: totalStock,
      actual_balance: totalStock,
      cost_price: Number(item.cost_price) || Number(item.average_cost) || 0,
      variants
    };
  },

  /**
   * Auto-generated serial code: finds highest numeric code and increments by 1
   */
  async getNextCode(prefix = '') {
    const items = await db.items.toArray();
    let maxNum = 1000;

    for (const itm of items) {
      if (!itm.code) continue;
      const match = String(itm.code).match(/\d+/g);
      if (match) {
        const num = parseInt(match[match.length - 1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }

    const nextNum = maxNum + 1;
    return prefix ? `${prefix}-${nextNum}` : String(nextNum);
  },

  /**
   * Validate code uniqueness
   */
  async isCodeUnique(code, excludeId = null) {
    if (!code) return false;
    const existing = await db.items.where('code').equalsIgnoreCase(code.trim()).first();
    if (!existing) return true;
    return excludeId && existing.id === excludeId;
  },

  /**
   * Create new item with variants, image, and sync with materials/products
   */
  async create(data, userId = 'usr-storekeeper') {
    const id = `itm-${Date.now()}`;
    const code = (data.code && String(data.code).trim()) || (await this.getNextCode());

    const isUnique = await this.isCodeUnique(code);
    if (!isUnique) {
      throw new Error(`كود الصنف "${code}" مسجل بالفعل في النظام. يرجى اختيار كود آخر.`);
    }

    const costPrice = Math.max(0, Number(data.cost_price) || 0);
    const sellingPrice = Math.max(0, Number(data.selling_price) || 0);
    const minIssueQty = Math.max(1, Number(data.min_issue_qty) || 1);
    const openingBalance = Math.max(0, Number(data.opening_balance) || 0);

    // Variants handling for clothing
    const rawVariants = Array.isArray(data.variants) ? data.variants : [];
    const variants = rawVariants.map((v, idx) => ({
      id: v.id || `var-${Date.now()}-${idx}`,
      size: v.size || 'عادي',
      color: v.color || 'افتراضي',
      sku: v.sku || `${code}-${v.size || 'STD'}-${v.color || 'STD'}`,
      opening_balance: Math.max(0, Number(v.opening_balance) || 0),
      current_stock: Math.max(0, Number(v.current_stock ?? v.opening_balance) || 0),
    }));

    const totalStock = variants.length > 0
      ? variants.reduce((sum, v) => sum + v.current_stock, 0)
      : openingBalance;

    const totalOpening = variants.length > 0
      ? variants.reduce((sum, v) => sum + v.opening_balance, 0)
      : openingBalance;

    const itemRecord = {
      id,
      code,
      name: data.name,
      item_group: data.item_group || 'عام',
      item_department: data.item_department || 'عام',
      item_type: data.item_type || 'finished', // 'finished' | 'raw_material'
      image: data.image || '', // Compressed base64
      unit: data.unit || 'قطعة',
      cost_price: costPrice,
      selling_price: sellingPrice,
      min_issue_qty: minIssueQty,
      opening_balance: totalOpening,
      current_stock: totalStock,
      variants,
      location_id: data.location_id || 'loc-main',
      notes: data.notes || '',
      is_active: 1,
      created_at: new Date().toISOString()
    };

    await db.transaction('rw', [db.items, db.materials, db.products, db.stock_movements], async () => {
      await db.items.add(itemRecord);

      // Sync with materials table if raw_material
      if (itemRecord.item_type === 'raw_material') {
        await db.materials.put({
          id,
          code,
          name: itemRecord.name,
          unit: itemRecord.unit,
          current_stock: totalStock,
          min_stock_alert: minIssueQty,
          average_cost: costPrice,
          last_purchase_price: costPrice,
          location_in_warehouse: itemRecord.item_department,
          notes: itemRecord.notes,
          is_active: 1,
          created_at: itemRecord.created_at
        });
      }

      // Sync with products table if finished
      if (itemRecord.item_type === 'finished') {
        await db.products.put({
          id,
          code,
          name: itemRecord.name,
          category: itemRecord.item_group,
          unit: itemRecord.unit,
          target_profit_margin_percent: costPrice > 0 ? Number((((sellingPrice - costPrice) / costPrice) * 100).toFixed(1)) : 30,
          current_finished_stock: totalStock,
          cost_price: costPrice,
          selling_price: sellingPrice,
          notes: itemRecord.notes,
          is_active: 1,
          created_at: itemRecord.created_at
        });
      }

      // Record opening balance stock movement if > 0
      if (totalStock > 0) {
        await db.stock_movements.add({
          id: `sm-${Date.now()}`,
          material_id: id,
          movement_type: 'opening_balance',
          reference_type: 'OPENING_BALANCE',
          reference_id: id,
          quantity_change: totalStock,
          unit_cost: costPrice,
          new_balance: totalStock,
          notes: `رصيد افتتاحي للصنف: ${itemRecord.name}`,
          created_by: userId,
          created_at: itemRecord.created_at
        });
      }
    });

    await auditRepo.log(userId, 'CREATE_ITEM', 'items', id, null, itemRecord);
    return itemRecord;
  },

  /**
   * Update item details, prices, and sync
   */
  async update(id, data, userId = 'usr-storekeeper') {
    const current = await db.items.get(id);
    if (!current) throw new Error('الصنف غير موجود');

    if (data.code && data.code.trim() !== current.code) {
      const isUnique = await this.isCodeUnique(data.code.trim(), id);
      if (!isUnique) {
        throw new Error(`كود الصنف "${data.code}" مستخدم بالفعل.`);
      }
    }

    const costPrice = data.cost_price !== undefined ? Math.max(0, Number(data.cost_price) || 0) : current.cost_price;
    const sellingPrice = data.selling_price !== undefined ? Math.max(0, Number(data.selling_price) || 0) : current.selling_price;
    const minIssueQty = data.min_issue_qty !== undefined ? Math.max(1, Number(data.min_issue_qty) || 1) : current.min_issue_qty;

    const variants = data.variants || current.variants || [];
    const totalStock = variants.length > 0
      ? variants.reduce((sum, v) => sum + (Number(v.current_stock) || 0), 0)
      : (data.current_stock !== undefined ? Number(data.current_stock) : current.current_stock);

    const updated = {
      ...current,
      code: data.code !== undefined ? String(data.code).trim() : current.code,
      name: data.name ?? current.name,
      item_group: data.item_group ?? current.item_group,
      item_department: data.item_department ?? current.item_department,
      item_type: data.item_type ?? current.item_type,
      image: data.image !== undefined ? data.image : current.image,
      unit: data.unit ?? current.unit,
      cost_price: costPrice,
      selling_price: sellingPrice,
      min_issue_qty: minIssueQty,
      current_stock: totalStock,
      variants,
      notes: data.notes ?? current.notes,
      is_active: data.is_active !== undefined ? Number(data.is_active) : current.is_active
    };

    await db.transaction('rw', [db.items, db.materials, db.products], async () => {
      await db.items.put(updated);

      if (updated.item_type === 'raw_material') {
        const mat = await db.materials.get(id);
        if (mat) {
          await db.materials.update(id, {
            name: updated.name,
            code: updated.code,
            unit: updated.unit,
            average_cost: costPrice,
            min_stock_alert: minIssueQty,
            current_stock: totalStock
          });
        }
      }

      if (updated.item_type === 'finished') {
        const prod = await db.products.get(id);
        if (prod) {
          await db.products.update(id, {
            name: updated.name,
            code: updated.code,
            unit: updated.unit,
            category: updated.item_group,
            current_finished_stock: totalStock,
            cost_price: costPrice,
            selling_price: sellingPrice
          });
        }
      }
    });

    await auditRepo.log(userId, 'UPDATE_ITEM', 'items', id, current, updated);
    return updated;
  },

  /**
   * Sizes & Colors Master Management
   */
  async getSizes() {
    return await db.item_sizes.filter(s => s.is_active === 1).toArray();
  },
  async createSize(data) {
    const id = `sz-${Date.now()}`;
    const size = {
      id,
      name: data.name,
      code: data.code || data.name,
      is_active: 1
    };
    await db.item_sizes.add(size);
    return size;
  },

  async getColors() {
    return await db.item_colors.filter(c => c.is_active === 1).toArray();
  },
  async createColor(data) {
    const id = `clr-${Date.now()}`;
    const color = {
      id,
      name: data.name,
      hex_code: data.hex_code || '#000000',
      is_active: 1
    };
    await db.item_colors.add(color);
    return color;
  }
};

export default itemsRepo;
