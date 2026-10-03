import db from '../db';
import CostCalculator from '../../logic/costCalculator';
import auditRepo from './auditRepo';

export const productsRepo = {
  async getAll() {
    const products = await db.products.toArray();
    const bomItems = await db.bom_items.toArray();
    const materials = await db.materials.toArray();
    const matMap = new Map(materials.map(m => [m.id, m]));

    return products.map(p => {
      const pBom = bomItems.filter(b => b.product_id === p.id).map(b => {
        const mat = matMap.get(b.raw_material_id);
        const unitCost = mat ? Number(mat.average_cost) || 0 : 0;
        const waste = Number(b.waste_percent) || 0;
        const qtyPerUnit = Number(b.quantity_per_unit) || 0;
        const effectiveQty = qtyPerUnit * (1 + waste / 100);
        const itemCost = Number((effectiveQty * unitCost).toFixed(2));

        return {
          ...b,
          material_name: mat ? mat.name : b.raw_material_id,
          material_code: mat ? mat.code : '',
          material_unit: mat ? mat.unit : 'وحدة',
          unit_cost: unitCost,
          item_cost: itemCost,
        };
      });

      const bomMaterialCost = Number(pBom.reduce((sum, item) => sum + item.item_cost, 0).toFixed(2));
      const margin = Number(p.target_profit_margin_percent) || 30;
      const suggestedPrice = CostCalculator.calculateSuggestedPrice(bomMaterialCost, margin);

      return {
        ...p,
        bom_items: pBom,
        bom_materials_cost: bomMaterialCost,
        suggested_selling_price: suggestedPrice,
      };
    });
  },

  async getById(id) {
    const products = await this.getAll();
    return products.find(p => p.id === id) || null;
  },

  async create(data, userId = 'usr-production') {
    const id = `prd-${Date.now()}`;
    const code = data.code || `PRD-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const product = {
      id,
      code,
      name: data.name,
      category: data.category || 'عام',
      unit: data.unit || 'قطعة',
      target_profit_margin_percent: Number(data.target_profit_margin_percent) || 30,
      current_finished_stock: Number(data.current_finished_stock) || 0,
      notes: data.notes || '',
      is_active: 1,
      created_at: now,
    };

    const bomList = (data.bom_items || []).map((b, idx) => ({
      id: `bom-${Date.now()}-${idx}`,
      product_id: id,
      raw_material_id: b.raw_material_id,
      quantity_per_unit: Number(b.quantity_per_unit) || 1,
      waste_percent: Number(b.waste_percent) || 0,
      notes: b.notes || '',
    }));

    await db.transaction('rw', [db.products, db.bom_items], async () => {
      await db.products.add(product);
      for (const b of bomList) {
        await db.bom_items.add(b);
      }
    });

    await auditRepo.log(userId, 'CREATE_PRODUCT', 'products', id, null, product);
    return await this.getById(id);
  },

  async update(id, data, userId = 'usr-production') {
    const current = await db.products.get(id);
    if (!current) throw new Error('المنتج غير موجود');

    const updated = {
      ...current,
      name: data.name ?? current.name,
      code: data.code ?? current.code,
      category: data.category ?? current.category,
      unit: data.unit ?? current.unit,
      target_profit_margin_percent: data.target_profit_margin_percent !== undefined ? Number(data.target_profit_margin_percent) : current.target_profit_margin_percent,
      notes: data.notes ?? current.notes,
      is_active: data.is_active !== undefined ? Number(data.is_active) : current.is_active,
    };

    await db.transaction('rw', [db.products, db.bom_items], async () => {
      await db.products.put(updated);

      if (data.bom_items) {
        // Remove old BOM and add new
        await db.bom_items.where('product_id').equals(id).delete();
        for (let idx = 0; idx < data.bom_items.length; idx++) {
          const b = data.bom_items[idx];
          await db.bom_items.add({
            id: `bom-${Date.now()}-${idx}`,
            product_id: id,
            raw_material_id: b.raw_material_id,
            quantity_per_unit: Number(b.quantity_per_unit) || 1,
            waste_percent: Number(b.waste_percent) || 0,
            notes: b.notes || '',
          });
        }
      }
    });

    await auditRepo.log(userId, 'UPDATE_PRODUCT', 'products', id, current, updated);
    return await this.getById(id);
  }
};

export default productsRepo;
