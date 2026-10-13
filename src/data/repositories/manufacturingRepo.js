import db from '../db';
import CostCalculator from '../../logic/costCalculator';
import auditRepo from './auditRepo';
import { validateNotPastDate } from '../../utils/formatters';
import {
  calculateMaterialLineCost,
  calculateTotalMaterialsCost,
  calculateTotalAdditionalCosts,
  calculateTotalProductCost,
  calculateUnitCost
} from '../../logic/productionOrderCalculations';

export const manufacturingRepo = {
  async getAll() {
    const orders = await db.production_orders.reverse().sortBy('created_at');
    const products = await db.products.toArray();
    const items = await db.items.toArray();
    const prodMap = new Map([...products.map(p => [p.id, p]), ...items.map(i => [i.id, i])]);
    const usages = await db.production_material_usage.toArray();
    const materials = await db.materials.toArray();
    const matMap = new Map([...materials.map(m => [m.id, m]), ...items.map(i => [i.id, i])]);

    return orders.map(o => {
      const prod = prodMap.get(o.product_id);
      const orderUsages = usages.filter(u => u.production_order_id === o.id).map(u => {
        const mat = matMap.get(u.raw_material_id);
        return {
          ...u,
          material_name: mat ? mat.name : u.raw_material_id,
          material_unit: mat ? mat.unit : 'وحدة',
        };
      });

      return {
        ...o,
        product_name: prod ? prod.name : o.product_id,
        product_code: prod ? prod.code : '',
        materials_used: orderUsages,
      };
    });
  },

  async getById(id) {
    const order = await db.production_orders.get(id);
    if (!order) return null;
    const prod = (await db.items.get(order.product_id)) || (await db.products.get(order.product_id));
    const usages = await db.production_material_usage.where('production_order_id').equals(id).toArray();
    const items = await db.items.toArray();
    const materials = await db.materials.toArray();
    const matMap = new Map([...materials.map(m => [m.id, m]), ...items.map(i => [i.id, i])]);

    return {
      ...order,
      product_name: prod ? prod.name : order.product_id,
      product_code: prod ? prod.code : '',
      materials_used: usages.map(u => {
        const mat = matMap.get(u.raw_material_id);
        return {
          ...u,
          material_name: mat ? mat.name : u.raw_material_id,
          material_code: mat ? mat.code : '',
          material_unit: mat ? mat.unit : 'وحدة'
        };
      })
    };
  },

  async createProductionOrder(data, userId = 'usr-production') {
    if (data.start_date) validateNotPastDate(data.start_date, 'تاريخ أمر الإنتاج');
    const id = data.id || `po-${Date.now()}`;
    const orderNumber = data.order_number || `ORD-MFG-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();
    const today = (data.start_date || now.split('T')[0]);

    const productId = data.product_id;
    const batchQty = Math.max(1, Number(data.batch_quantity || data.produced_quantity) || 1);

    const product = (await db.items.get(productId)) || (await db.products.get(productId));
    if (!product) throw new Error('المنتج المطلوب تصنيعه غير موجود في دليل الأصناف');

    const rawLines = data.materials || data.raw_materials || data.items;
    const hasDirectLines = Array.isArray(rawLines) && rawLines.length > 0;

    if (hasDirectLines) {
      // Direct raw materials mode (Requirement C)
      const verifiedLines = [];
      for (const line of rawLines) {
        if (!line.material_id) continue;
        const itm = (await db.items.get(line.material_id)) || (await db.materials.get(line.material_id));
        if (!itm) {
          throw new Error(`خامة غير موجودة في قاعدة البيانات (${line.material_id})`);
        }
        const qty = Math.max(0, Number(line.quantity) || 0);
        if (qty <= 0) {
          throw new Error(`الكمية المطلوبة للخامة (${itm.name}) يجب أن تكون أكبر من صفر`);
        }
        const price = Math.max(0, Number(line.unit_price !== undefined ? line.unit_price : itm.cost_price) || 0);
        const currentStock = Number(itm.current_stock) || 0;

        // Block saving if raw material quantity exceeds available stock (Requirement C6)
        if (currentStock < qty) {
          throw new Error(
            `الكمية المتاحة من الخامة (${itm.name}) بالمخزن هي (${currentStock})، بينما المطلوب للتشغيل (${qty}). لا يمكن إتمام أمر الإنتاج.`
          );
        }

        const lineCost = calculateMaterialLineCost(qty, price);
        verifiedLines.push({
          material_id: itm.id,
          name: itm.name,
          code: itm.code,
          unit: itm.unit || 'وحدة',
          quantity: qty,
          unit_price: price,
          line_cost: lineCost,
          current_stock: currentStock
        });
      }

      if (verifiedLines.length === 0) {
        throw new Error('يرجى إضافة خامة واحدة على الأقل في بنود أمر الإنتاج');
      }

      const totalMaterialsCost = calculateTotalMaterialsCost(verifiedLines);
      const additionalCosts = Array.isArray(data.additional_costs) ? data.additional_costs.map(c => ({
        name: c.name || 'تكلفة إضافية',
        amount: Math.max(0, Number(c.amount) || 0)
      })) : [];
      const totalAdditionalCosts = calculateTotalAdditionalCosts(additionalCosts);
      const totalProductCost = calculateTotalProductCost(totalMaterialsCost, totalAdditionalCosts);
      const unitCost = calculateUnitCost(totalProductCost, batchQty);

      await db.transaction('rw', [
        db.production_orders,
        db.production_material_usage,
        db.materials,
        db.items,
        db.stock_movements,
        db.products
      ], async () => {
        // 1. Issue raw materials from stock (out movements)
        for (let idx = 0; idx < verifiedLines.length; idx++) {
          const line = verifiedLines[idx];
          const newStock = Number((line.current_stock - line.quantity).toFixed(3));

          // Update stock in items and materials
          const itm = await db.items.get(line.material_id);
          if (itm) {
            await db.items.update(itm.id, { current_stock: newStock });
          }
          const mat = await db.materials.get(line.material_id);
          if (mat) {
            await db.materials.update(mat.id, { current_stock: newStock });
          }

          // Create stock movement (production_out)
          await db.stock_movements.add({
            id: `sm-${Date.now()}-${idx}-${line.material_id}`,
            item_id: line.material_id,
            material_id: line.material_id,
            location_id: data.location_id || 'loc-main',
            movement_type: 'production_out',
            direction: 'out',
            quantity: line.quantity,
            quantity_change: -line.quantity,
            unit_cost: line.unit_price,
            new_balance: newStock,
            reference_type: 'PRODUCTION_ORDER',
            reference_id: id,
            document_id: id,
            date: today,
            movement_date: today,
            notes: `صرف خامات لأمر الإنتاج ${orderNumber} (${product.name})`,
            created_by: userId,
            created_at: now
          });

          // Record usage entry
          await db.production_material_usage.add({
            id: `pmu-${Date.now()}-${idx}-${line.material_id}`,
            production_order_id: id,
            raw_material_id: line.material_id,
            standard_quantity: line.quantity,
            actual_quantity: line.quantity,
            unit_cost: line.unit_price,
            total_cost: line.line_cost
          });
        }

        // 2. Receive finished product into stock (in movement)
        const finishedItm = await db.items.get(productId);
        if (finishedItm) {
          const newProdStock = Number(((Number(finishedItm.current_stock) || 0) + batchQty).toFixed(3));
          await db.items.update(finishedItm.id, { current_stock: newProdStock });
        }
        const finishedProd = await db.products.get(productId);
        if (finishedProd) {
          const newProdStock = Number(((Number(finishedProd.current_stock) || 0) + batchQty).toFixed(3));
          await db.products.update(finishedProd.id, { current_stock: newProdStock });
        }

        await db.stock_movements.add({
          id: `sm-${Date.now()}-fin-${productId}`,
          item_id: productId,
          material_id: productId,
          location_id: data.location_id || 'loc-main',
          movement_type: 'production_in',
          direction: 'in',
          quantity: batchQty,
          quantity_change: batchQty,
          unit_cost: unitCost,
          reference_type: 'PRODUCTION_ORDER',
          reference_id: id,
          document_id: id,
          date: today,
          movement_date: today,
          notes: `استلام منتج تام من أمر إنتاج ${orderNumber} (${product.name})`,
          created_by: userId,
          created_at: now
        });

        // 3. Save production order record
        const order = {
          id,
          order_number: orderNumber,
          product_id: productId,
          batch_quantity: batchQty,
          start_date: today,
          completion_date: today,
          status: 'completed',
          location_type: 'inside',
          materials_lines: verifiedLines,
          additional_costs: additionalCosts,
          total_material_cost: totalMaterialsCost,
          total_additional_cost: totalAdditionalCosts,
          total_product_cost: totalProductCost,
          unit_cost: unitCost,
          labor_cost: totalAdditionalCosts,
          total_stage1_cost: totalProductCost,
          unit_stage1_cost: unitCost,
          notes: data.notes || '',
          created_by: userId,
          created_at: now
        };

        await db.production_orders.add(order);
      });

      await auditRepo.log(userId, 'CREATE_PRODUCTION_ORDER', 'production_orders', id, null, {
        orderNumber,
        batchQty,
        totalProductCost,
        unitCost
      });

      return await db.production_orders.get(id);
    }

    // Fallback BOM mode for legacy callers
    const bom = await db.bom_items.where('product_id').equals(productId).toArray();
    if (bom.length === 0) {
      throw new Error('لا توجد شجرة منتج (BOM) محددة لهذا المنتج، يرجى إضافة بنود التكلفة أو اختيار الخامات مباشرة.');
    }

    let totalMaterialCost = 0;
    const materialUsageList = [];

    await db.transaction('rw', [
      db.production_orders,
      db.production_material_usage,
      db.materials,
      db.items,
      db.products,
      db.stock_movements,
      db.overheads
    ], async () => {
      for (const item of bom) {
        const mat = (await db.items.get(item.raw_material_id)) || (await db.materials.get(item.raw_material_id));
        if (!mat) throw new Error(`خامة غير موجودة في قاعدة البيانات (${item.raw_material_id})`);

        const standardQty = CostCalculator.calculateStandardMaterialUsage(batchQty, item.quantity_per_unit, item.waste_percent);
        const currentStock = Number(mat.current_stock) || 0;

        if (currentStock < standardQty) {
          throw new Error(`الرصيد المتاح من (${mat.name}) هو ${currentStock} ${mat.unit}، بينما المطلوب لتشغيل الدفعة هو ${standardQty} ${mat.unit}`);
        }

        const unitCost = Number(mat.cost_price ?? mat.average_cost) || 0;
        const totalCost = Number((standardQty * unitCost).toFixed(2));
        totalMaterialCost += totalCost;

        materialUsageList.push({
          id: `pmu-${Date.now()}-${item.raw_material_id}`,
          production_order_id: id,
          raw_material_id: mat.id,
          standard_quantity: standardQty,
          actual_quantity: standardQty,
          unit_cost: unitCost,
          total_cost: totalCost,
        });

        const newStock = Number((currentStock - standardQty).toFixed(3));
        const itm = await db.items.get(mat.id);
        if (itm) await db.items.update(itm.id, { current_stock: newStock });
        const m = await db.materials.get(mat.id);
        if (m) await db.materials.update(m.id, { current_stock: newStock });

        await db.stock_movements.add({
          id: `sm-${Date.now()}-${item.raw_material_id}`,
          item_id: mat.id,
          material_id: mat.id,
          movement_type: 'production_out',
          direction: 'out',
          reference_type: 'PRODUCTION_ORDER',
          reference_id: id,
          quantity_change: -standardQty,
          quantity: standardQty,
          unit_cost: unitCost,
          new_balance: newStock,
          notes: `صرف خامات تشغيل أمر إنتاج ${orderNumber}`,
          created_by: userId,
          created_at: now,
        });
      }

      for (const u of materialUsageList) {
        await db.production_material_usage.add(u);
      }

      // Receive finished product
      const finItm = await db.items.get(productId);
      if (finItm) {
        await db.items.update(finItm.id, { current_stock: Number(((Number(finItm.current_stock) || 0) + batchQty).toFixed(3)) });
      }
      const finPrd = await db.products.get(productId);
      if (finPrd) {
        await db.products.update(finPrd.id, { current_stock: Number(((Number(finPrd.current_stock) || 0) + batchQty).toFixed(3)) });
      }

      const totalProdCost = Number(totalMaterialCost.toFixed(2));
      const uCost = calculateUnitCost(totalProdCost, batchQty);

      await db.stock_movements.add({
        id: `sm-${Date.now()}-fin-${productId}`,
        item_id: productId,
        material_id: productId,
        movement_type: 'production_in',
        direction: 'in',
        reference_type: 'PRODUCTION_ORDER',
        reference_id: id,
        quantity_change: batchQty,
        quantity: batchQty,
        unit_cost: uCost,
        notes: `استلام منتج تام من أمر إنتاج ${orderNumber}`,
        created_by: userId,
        created_at: now,
      });

      const order = {
        id,
        order_number: orderNumber,
        product_id: productId,
        batch_quantity: batchQty,
        start_date: today,
        completion_date: today,
        status: 'completed',
        location_type: 'inside',
        total_material_cost: totalProdCost,
        total_additional_cost: 0,
        total_product_cost: totalProdCost,
        unit_cost: uCost,
        labor_cost: 0,
        total_stage1_cost: totalProdCost,
        unit_stage1_cost: uCost,
        notes: data.notes || '',
        created_by: userId,
        created_at: now,
      };

      await db.production_orders.add(order);
    });

    await auditRepo.log(userId, 'CREATE_PRODUCTION_ORDER', 'production_orders', id, null, { orderNumber, batchQty });
    return await db.production_orders.get(id);
  },

  async completeStage1(id, userId = 'usr-production') {
    const order = await db.production_orders.get(id);
    if (!order) throw new Error('أمر التشغيل غير موجود');

    const now = new Date().toISOString();
    await db.production_orders.update(id, {
      status: 'stage1_completed',
      completion_date: now.split('T')[0],
    });

    await auditRepo.log(userId, 'COMPLETE_STAGE1', 'production_orders', id, order, { status: 'stage1_completed' });
    return await db.production_orders.get(id);
  },

  async getOverheads() {
    return await db.overheads.reverse().sortBy('month_year');
  },

  async saveOverhead(data, userId = 'usr-accountant') {
    const monthYear = data.month_year || new Date().toISOString().slice(0, 7);
    const id = `ovh-${monthYear}`;

    const electricity = Math.max(0, Number(data.electricity_cost) || 0);
    const water = Math.max(0, Number(data.water_cost) || 0);
    const rent = Math.max(0, Number(data.rent_cost) || 0);
    const depreciation = Math.max(0, Number(data.depreciation_cost) || 0);
    const other = Math.max(0, Number(data.other_expenses) || 0);
    const totalOverhead = Number((electricity + water + rent + depreciation + other).toFixed(2));

    const machineHours = Math.max(1, Number(data.estimated_machine_hours) || 1);
    const hourlyRate = CostCalculator.calculateHourlyOverheadRate(totalOverhead, machineHours);

    const record = {
      id,
      month_year: monthYear,
      electricity_cost: electricity,
      water_cost: water,
      rent_cost: rent,
      depreciation_cost: depreciation,
      other_expenses: other,
      total_overhead: totalOverhead,
      estimated_machine_hours: machineHours,
      hourly_overhead_rate: hourlyRate,
      notes: data.notes || '',
      created_at: new Date().toISOString(),
    };

    await db.overheads.put(record);
    await auditRepo.log(userId, 'SAVE_OVERHEAD', 'monthly_overheads', id, null, record);
    return record;
  }
};

export default manufacturingRepo;
