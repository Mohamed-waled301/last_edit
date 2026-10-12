import db from '../db';
import auditRepo from './auditRepo';
import {
  calculateItemActualBalance,
  buildItemStockCard,
  recomputeStockDiscrepancies
} from '../../logic/inventoryBalances';

export const itemsRepo = {
  /**
   * Get all items with calculated actual balance computed from movements:
   * Formula: opening balance + sum of all "in" movements - sum of all "out" movements
   */
  async getAll() {
    const items = await db.items.toArray();
    const movements = await db.stock_movements.toArray();

    return items.map(item => {
      const itemMovements = movements.filter(m => String(m.item_id || m.material_id) === String(item.id));
      const variants = Array.isArray(item.variants) ? item.variants : [];

      // Calculate per-variant actual stock if variants exist
      const computedVariants = variants.map(v => {
        const vMovements = itemMovements.filter(m => m.variant_id === v.id);
        const vOpening = Number(v.opening_balance) || 0;
        const vStock = calculateItemActualBalance(vOpening, vMovements, v.id);
        return {
          ...v,
          opening_balance: vOpening,
          current_stock: vStock,
          actual_balance: vStock
        };
      });

      const totalOpening = computedVariants.length > 0
        ? computedVariants.reduce((sum, v) => sum + (Number(v.opening_balance) || 0), 0)
        : Number(item.opening_balance) || 0;

      const totalActualStock = computedVariants.length > 0
        ? computedVariants.reduce((sum, v) => sum + (Number(v.current_stock) || 0), 0)
        : calculateItemActualBalance(totalOpening, itemMovements);

      const costPrice = Number(item.cost_price) || Number(item.average_cost) || 0;
      const sellingPrice = Number(item.selling_price) || 0;
      const marginPercent = costPrice > 0 ? Number((((sellingPrice - costPrice) / costPrice) * 100).toFixed(2)) : (Number(item.margin_percent) || 0);

      return {
        ...item,
        opening_balance: totalOpening,
        current_stock: totalActualStock,
        actual_balance: totalActualStock,
        cost_price: costPrice,
        average_cost: costPrice,
        selling_price: sellingPrice,
        margin_percent: marginPercent,
        min_issue_qty: Number(item.min_issue_qty) || 1,
        variants: computedVariants
      };
    });
  },

  async getById(id) {
    const item = await db.items.get(id);
    if (!item) return null;
    const movements = await db.stock_movements.where('material_id').equals(id).toArray()
      .then(async legacy => {
        const byItemId = await db.stock_movements.where('item_id').equals(id).toArray().catch(() => []);
        const map = new Map();
        [...legacy, ...byItemId].forEach(m => map.set(m.id, m));
        return Array.from(map.values());
      });

    const variants = Array.isArray(item.variants) ? item.variants : [];
    const computedVariants = variants.map(v => {
      const vMovements = movements.filter(m => m.variant_id === v.id);
      const vOpening = Number(v.opening_balance) || 0;
      const vStock = calculateItemActualBalance(vOpening, vMovements, v.id);
      return {
        ...v,
        current_stock: vStock,
        actual_balance: vStock
      };
    });

    const totalOpening = computedVariants.length > 0
      ? computedVariants.reduce((sum, v) => sum + (Number(v.opening_balance) || 0), 0)
      : Number(item.opening_balance) || 0;

    const totalStock = computedVariants.length > 0
      ? computedVariants.reduce((sum, v) => sum + (Number(v.current_stock) || 0), 0)
      : calculateItemActualBalance(totalOpening, movements);

    const costPrice = Number(item.cost_price) || Number(item.average_cost) || 0;
    const sellingPrice = Number(item.selling_price) || 0;
    const marginPercent = costPrice > 0 ? Number((((sellingPrice - costPrice) / costPrice) * 100).toFixed(2)) : (Number(item.margin_percent) || 0);

    return {
      ...item,
      opening_balance: totalOpening,
      current_stock: totalStock,
      actual_balance: totalStock,
      cost_price: costPrice,
      selling_price: sellingPrice,
      margin_percent: marginPercent,
      variants: computedVariants
    };
  },

  /**
   * Check if an item has operational movements beyond its opening balance
   */
  async hasOperationalMovements(id) {
    if (!id) return false;
    const movements = await db.stock_movements.toArray();
    const itemMovements = movements.filter(
      m => String(m.item_id || m.material_id) === String(id) && m.movement_type !== 'opening_balance'
    );
    return itemMovements.length > 0;
  },

  /**
   * Stock card / Item ledger for a single item with running balance & period breakdown
   */
  async getStockCard(id, filters = {}) {
    const item = await this.getById(id);
    if (!item) throw new Error('الصنف غير موجود');
    const allMovements = await db.stock_movements.toArray();
    return buildItemStockCard(item, allMovements, filters);
  },

  /**
   * Recompute tool: recomputes all stock balances from movements,
   * updates cached current_stock in items / materials / products, and reports differences.
   */
  async recomputeAllBalances(userId = 'usr-owner') {
    const rawItems = await db.items.toArray();
    const movements = await db.stock_movements.toArray();

    const report = recomputeStockDiscrepancies(rawItems, movements);

    // Apply updates inside a single Dexie transaction
    await db.transaction('rw', [db.items, db.materials, db.products], async () => {
      for (const item of rawItems) {
        const itemMovements = movements.filter(m => String(m.item_id || m.material_id) === String(item.id));
        const variants = Array.isArray(item.variants) ? item.variants : [];

        const updatedVariants = variants.map(v => {
          const vMovements = itemMovements.filter(m => m.variant_id === v.id);
          const vOpening = Number(v.opening_balance) || 0;
          const vStock = calculateItemActualBalance(vOpening, vMovements, v.id);
          return {
            ...v,
            current_stock: vStock
          };
        });

        const totalOpening = updatedVariants.length > 0
          ? updatedVariants.reduce((sum, v) => sum + (Number(v.opening_balance) || 0), 0)
          : Number(item.opening_balance) || 0;

        const totalStock = updatedVariants.length > 0
          ? updatedVariants.reduce((sum, v) => sum + (Number(v.current_stock) || 0), 0)
          : calculateItemActualBalance(totalOpening, itemMovements);

        await db.items.update(item.id, {
          current_stock: totalStock,
          variants: updatedVariants
        });

        if (item.item_type === 'raw_material') {
          await db.materials.update(item.id, { current_stock: totalStock }).catch(() => {});
        } else {
          await db.products.update(item.id, { current_finished_stock: totalStock }).catch(() => {});
        }
      }
    });

    await auditRepo.log(userId, 'RECOMPUTE_STOCK_BALANCES', 'items', 'all', null, {
      totalItemsChecked: report.totalItems,
      discrepanciesCount: report.discrepanciesCount
    });

    return report;
  },

  /**
   * Auto-generated serial code: finds highest numeric code and increments by 1
   */
  async getNextCode(prefix = '') {
    const items = await db.items.toArray();
    let maxNum = 0;
    let padLen = 0;

    for (const itm of items) {
      if (!itm.code) continue;
      if (prefix && !itm.code.toUpperCase().startsWith(prefix.toUpperCase())) {
        continue;
      }
      const match = String(itm.code).match(/(\d+)(?!.*\d)/);
      if (match) {
        const rawDigits = match[1];
        const num = parseInt(rawDigits, 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
          padLen = rawDigits.length;
        }
      }
    }

    if (maxNum === 0) {
      maxNum = 1000;
      padLen = 4;
    }

    const nextNum = maxNum + 1;
    const formattedNum = padLen > 0 ? String(nextNum).padStart(padLen, '0') : String(nextNum);
    return prefix ? `${prefix}-${formattedNum}` : formattedNum;
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
   * Create new item with variants, image, and opening balance
   */
  async create(data, userId = 'usr-storekeeper') {
    const id = data.id || `itm-${Date.now()}`;
    const code = (data.code && String(data.code).trim()) || (await this.getNextCode());

    const isUnique = await this.isCodeUnique(code, id);
    if (!isUnique) {
      throw new Error(`كود الصنف "${code}" مسجل بالفعل في النظام. يرجى اختيار كود آخر.`);
    }

    const costPrice = Math.max(0, Number(data.cost_price) || 0);
    const sellingPrice = Math.max(0, Number(data.selling_price) || (costPrice));
    const marginPercent = costPrice > 0 ? Number((((sellingPrice - costPrice) / costPrice) * 100).toFixed(2)) : (Number(data.margin_percent) || 0);
    const minIssueQty = Math.max(1, Number(data.min_issue_qty) || 1);
    const openingBalance = Math.max(0, Number(data.opening_balance) || 0);
    const openingCost = Math.max(0, Number(data.opening_cost ?? costPrice) || 0);
    const locationId = data.location_id || 'loc-main';

    const hasVariants = Boolean(data.has_variants);
    const rawVariants = hasVariants && Array.isArray(data.variants) ? data.variants : [];
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
      image: data.image || '',
      unit: data.unit || 'قطعة',
      cost_price: costPrice,
      selling_price: sellingPrice,
      margin_percent: marginPercent,
      min_issue_qty: minIssueQty,
      opening_balance: totalOpening,
      opening_cost: openingCost,
      current_stock: totalStock,
      has_variants: hasVariants,
      variants,
      location_id: locationId,
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
          target_profit_margin_percent: marginPercent,
          current_finished_stock: totalStock,
          cost_price: costPrice,
          selling_price: sellingPrice,
          notes: itemRecord.notes,
          is_active: 1,
          created_at: itemRecord.created_at
        });
      }

      // Record opening balance stock movements if > 0
      if (variants.length > 0) {
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i];
          if (v.opening_balance > 0) {
            await db.stock_movements.add({
              id: `sm-op-${Date.now()}-${i}`,
              item_id: id,
              material_id: id,
              variant_id: v.id,
              location_id: locationId,
              movement_type: 'opening_balance',
              direction: 'in',
              quantity: v.opening_balance,
              quantity_change: v.opening_balance,
              unit_cost: openingCost,
              document_id: id,
              reference_type: 'OPENING_BALANCE',
              reference_id: id,
              date: itemRecord.created_at.split('T')[0],
              movement_date: itemRecord.created_at.split('T')[0],
              notes: `رصيد افتتاحي للمتغير: ${v.size} / ${v.color}`,
              created_by: userId,
              created_at: itemRecord.created_at
            });
          }
        }
      } else if (totalStock > 0) {
        await db.stock_movements.add({
          id: `sm-op-${Date.now()}`,
          item_id: id,
          material_id: id,
          variant_id: null,
          location_id: locationId,
          movement_type: 'opening_balance',
          direction: 'in',
          quantity: totalStock,
          quantity_change: totalStock,
          unit_cost: openingCost,
          document_id: id,
          reference_type: 'OPENING_BALANCE',
          reference_id: id,
          date: itemRecord.created_at.split('T')[0],
          movement_date: itemRecord.created_at.split('T')[0],
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
   * Update item details and sync
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

    // Check if variants are being turned OFF while variant stock exists
    const currentlyHasVariants = Boolean(current.has_variants || (Array.isArray(current.variants) && current.variants.length > 0));
    const nextHasVariants = data.has_variants !== undefined ? Boolean(data.has_variants) : currentlyHasVariants;

    if (currentlyHasVariants && !nextHasVariants) {
      const variants = Array.isArray(current.variants) ? current.variants : [];
      const hasVariantStock = variants.some(v => (Number(v.current_stock) || 0) > 0 || (Number(v.opening_balance) || 0) > 0);
      if (hasVariantStock) {
        throw new Error('لا يمكن إيقاف المقاسات والألوان لوجود أرصدة مخزنية مسجلة على المتغيرات. يرجى تصفية أو تسوية أرصدة المتغيرات أولاً.');
      }
    }

    const costPrice = data.cost_price !== undefined ? Math.max(0, Number(data.cost_price) || 0) : current.cost_price;
    const sellingPrice = data.selling_price !== undefined ? Math.max(0, Number(data.selling_price) || 0) : current.selling_price;
    const marginPercent = costPrice > 0 ? Number((((sellingPrice - costPrice) / costPrice) * 100).toFixed(2)) : (Number(data.margin_percent) || current.margin_percent || 0);
    const minIssueQty = data.min_issue_qty !== undefined ? Math.max(1, Number(data.min_issue_qty) || 1) : current.min_issue_qty;

    const variants = nextHasVariants ? (data.variants || current.variants || []) : [];
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
      margin_percent: marginPercent,
      min_issue_qty: minIssueQty,
      has_variants: nextHasVariants,
      variants,
      location_id: data.location_id || current.location_id || 'loc-main',
      notes: data.notes ?? current.notes,
      is_active: data.is_active !== undefined ? Number(data.is_active) : current.is_active
    };

    // If opening balance updated before any operational movements
    const hasOps = await this.hasOperationalMovements(id);
    if (!hasOps && data.opening_balance !== undefined) {
      const newOpen = Math.max(0, Number(data.opening_balance) || 0);
      updated.opening_balance = newOpen;
      updated.current_stock = variants.length > 0 ? totalStock : newOpen;

      // Update the opening balance stock movement
      const opMovement = await db.stock_movements.where('item_id').equals(id).filter(m => m.movement_type === 'opening_balance').first();
      if (opMovement) {
        await db.stock_movements.update(opMovement.id, {
          quantity: newOpen,
          quantity_change: newOpen,
          unit_cost: costPrice
        });
      }
    }

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
            current_stock: updated.current_stock
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
            target_profit_margin_percent: marginPercent,
            current_finished_stock: updated.current_stock,
            cost_price: costPrice,
            selling_price: sellingPrice
          });
        }
      }
    });

    await auditRepo.log(userId, 'UPDATE_ITEM', 'items', id, current, updated);
    return updated;
  },

  async delete(id, userId = 'usr-storekeeper') {
    const current = await db.items.get(id);
    if (!current) throw new Error('الصنف غير موجود');

    const invCount = await db.sales_invoice_items.where('product_id').equals(id).count();
    if (invCount > 0) {
      throw new Error(`لا يمكن حذف الصنف "${current.name}" لوجود (${invCount}) بند في فواتير مبيعات مرتبطة به.`);
    }

    const poCount = await db.purchase_order_items.where('material_id').equals(id).count();
    if (poCount > 0) {
      throw new Error(`لا يمكن حذف الصنف "${current.name}" لوجود (${poCount}) بند في أوامر شراء مرتبطة به.`);
    }

    const bomRawCount = await db.bom_items.where('raw_material_id').equals(id).count();
    const bomProdCount = await db.bom_items.where('product_id').equals(id).count();
    if (bomRawCount > 0 || bomProdCount > 0) {
      throw new Error(`لا يمكن حذف الصنف "${current.name}" لدخوله في بطاقات مقادير خامات المنتجات (BOM).`);
    }

    const movements = await db.stock_movements.toArray();
    const operationalMovements = movements.filter(m => (m.item_id === id || m.material_id === id) && m.movement_type !== 'opening_balance');
    if (operationalMovements.length > 0) {
      throw new Error(`لا يمكن حذف الصنف "${current.name}" لوجود (${operationalMovements.length}) حركة مخزنية تشغيلية مسجلة عليه.`);
    }

    const itemMovs = movements.filter(m => m.item_id === id || m.material_id === id);

    await db.transaction('rw', [db.items, db.materials, db.products, db.stock_movements], async () => {
      await db.items.delete(id);
      await db.materials.delete(id).catch(() => {});
      await db.products.delete(id).catch(() => {});
      for (const m of itemMovs) {
        await db.stock_movements.delete(m.id);
      }
    });

    await auditRepo.log(userId, 'DELETE_ITEM', 'items', id, current, null);
    return { success: true, message: `تم حذف الصنف "${current.name}" بنجاح` };
  },

  /**
   * ITEM GROUPS CRUD
   */
  async getItemGroups() {
    return await db.item_groups.filter(g => g.is_active === 1).toArray();
  },

  async getItemGroupById(id) {
    return await db.item_groups.get(id);
  },

  async createItemGroup(data, userId = 'usr-storekeeper') {
    const id = data.id || `grp-${Date.now()}`;
    const code = data.code || `GRP-${Date.now().toString().slice(-4)}`;
    const group = {
      id,
      code,
      name: data.name.trim(),
      notes: data.notes || '',
      is_active: 1,
      created_at: new Date().toISOString()
    };
    await db.item_groups.add(group);
    await auditRepo.log(userId, 'CREATE_ITEM_GROUP', 'item_groups', id, null, group);
    return group;
  },

  async updateItemGroup(id, data, userId = 'usr-storekeeper') {
    const current = await db.item_groups.get(id);
    if (!current) throw new Error('مجموعة الصنف غير موجودة');
    const updated = {
      ...current,
      name: data.name !== undefined ? data.name.trim() : current.name,
      code: data.code !== undefined ? data.code.trim() : current.code,
      notes: data.notes !== undefined ? data.notes : current.notes,
      is_active: data.is_active !== undefined ? Number(data.is_active) : current.is_active
    };
    await db.item_groups.put(updated);
    await auditRepo.log(userId, 'UPDATE_ITEM_GROUP', 'item_groups', id, current, updated);
    return updated;
  },

  async deleteItemGroup(id, userId = 'usr-storekeeper') {
    const current = await db.item_groups.get(id);
    if (!current) throw new Error('مجموعة الصنف غير موجودة');

    // Check if any items belong to this group
    const itemsCount = await db.items.filter(i => i.item_group === current.name || i.item_group === current.id).count();
    if (itemsCount > 0) {
      throw new Error(`لا يمكن حذف المجموعة "${current.name}" لوجود (${itemsCount}) صنف مسجل عليها. يرجى نقل الأصناف لمجموعة أخرى أولاً.`);
    }

    await db.item_groups.delete(id);
    await auditRepo.log(userId, 'DELETE_ITEM_GROUP', 'item_groups', id, current, null);
    return { success: true, message: `تم حذف مجموعة الصنف "${current.name}" بنجاح` };
  },

  /**
   * ITEM SECTIONS CRUD
   */
  async getItemSections() {
    return await db.item_sections.filter(s => s.is_active === 1).toArray();
  },

  async getItemSectionById(id) {
    return await db.item_sections.get(id);
  },

  async createItemSection(data, userId = 'usr-storekeeper') {
    const id = data.id || `sec-${Date.now()}`;
    const code = data.code || `SEC-${Date.now().toString().slice(-4)}`;
    const section = {
      id,
      code,
      name: data.name.trim(),
      group_id: data.group_id || null,
      notes: data.notes || '',
      is_active: 1,
      created_at: new Date().toISOString()
    };
    await db.item_sections.add(section);
    await auditRepo.log(userId, 'CREATE_ITEM_SECTION', 'item_sections', id, null, section);
    return section;
  },

  async updateItemSection(id, data, userId = 'usr-storekeeper') {
    const current = await db.item_sections.get(id);
    if (!current) throw new Error('قسم الصنف غير موجود');
    const updated = {
      ...current,
      name: data.name !== undefined ? data.name.trim() : current.name,
      code: data.code !== undefined ? data.code.trim() : current.code,
      group_id: data.group_id !== undefined ? data.group_id : current.group_id,
      notes: data.notes !== undefined ? data.notes : current.notes,
      is_active: data.is_active !== undefined ? Number(data.is_active) : current.is_active
    };
    await db.item_sections.put(updated);
    await auditRepo.log(userId, 'UPDATE_ITEM_SECTION', 'item_sections', id, current, updated);
    return updated;
  },

  async deleteItemSection(id, userId = 'usr-storekeeper') {
    const current = await db.item_sections.get(id);
    if (!current) throw new Error('قسم الصنف غير موجود');

    const itemsCount = await db.items.filter(i => i.item_department === current.name || i.item_department === current.id).count();
    if (itemsCount > 0) {
      throw new Error(`لا يمكن حذف القسم "${current.name}" لوجود (${itemsCount}) صنف مسجل عليه.`);
    }

    await db.item_sections.delete(id);
    await auditRepo.log(userId, 'DELETE_ITEM_SECTION', 'item_sections', id, current, null);
    return { success: true, message: `تم حذف قسم الصنف "${current.name}" بنجاح` };
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
  },

  /**
   * Units Master Management
   */
  async getUnits() {
    if (!db.item_units) {
      return [
        { id: 'u-piece', name: 'قطعة', code: 'قطعة', is_active: 1 },
        { id: 'u-dozen', name: 'دستة', code: 'دستة', is_active: 1 },
        { id: 'u-meter', name: 'متر', code: 'متر', is_active: 1 },
        { id: 'u-kg', name: 'كيلوجرام', code: 'كجم', is_active: 1 },
        { id: 'u-set', name: 'طقم', code: 'طقم', is_active: 1 },
        { id: 'u-roll', name: 'ثوب', code: 'ثوب', is_active: 1 },
        { id: 'u-spool', name: 'بكرة', code: 'بكرة', is_active: 1 },
        { id: 'u-bag', name: 'كيس', code: 'كيس', is_active: 1 },
        { id: 'u-box', name: 'كرتونة', code: 'كرتونة', is_active: 1 }
      ];
    }
    const units = await db.item_units.filter(u => u.is_active === 1).toArray().catch(() => []);
    if (units.length === 0) {
      const defaults = [
        { id: 'u-piece', name: 'قطعة', code: 'قطعة', is_active: 1 },
        { id: 'u-dozen', name: 'دستة', code: 'دستة', is_active: 1 },
        { id: 'u-meter', name: 'متر', code: 'متر', is_active: 1 },
        { id: 'u-kg', name: 'كيلوجرام', code: 'كجم', is_active: 1 },
        { id: 'u-set', name: 'طقم', code: 'طقم', is_active: 1 },
        { id: 'u-roll', name: 'ثوب', code: 'ثوب', is_active: 1 },
        { id: 'u-spool', name: 'بكرة', code: 'بكرة', is_active: 1 },
        { id: 'u-bag', name: 'كيس', code: 'كيس', is_active: 1 },
        { id: 'u-box', name: 'كرتونة', code: 'كرتونة', is_active: 1 }
      ];
      try {
        await db.item_units.bulkPut(defaults);
      } catch (e) {}
      return defaults;
    }
    return units;
  },

  async createUnit(data, userId = 'usr-storekeeper') {
    const rawName = typeof data === 'string' ? data : (data?.name || '');
    const name = rawName.trim();
    if (!name) throw new Error('اسم وحدة القياس مطلوب');

    if (db.item_units) {
      const existing = await db.item_units.filter(u => u.name === name).first().catch(() => null);
      if (existing) return existing;
      const unit = {
        id: `u-${Date.now()}`,
        name,
        code: (typeof data === 'object' && data.code ? data.code : name).trim(),
        is_active: 1,
        created_at: new Date().toISOString()
      };
      await db.item_units.add(unit);
      await auditRepo.log(userId, 'CREATE_UNIT', 'item_units', unit.id, null, unit).catch(() => {});
      return unit;
    }

    return { id: `u-${Date.now()}`, name, code: name, is_active: 1 };
  }
};

export default itemsRepo;
