import db from '../db';
import CostCalculator from '../../logic/costCalculator';
import auditRepo from './auditRepo';
import { validateNotPastDate } from '../../utils/formatters';

export const manufacturingRepo = {
  async getAll() {
    const orders = await db.production_orders.reverse().sortBy('created_at');
    const products = await db.products.toArray();
    const prodMap = new Map(products.map(p => [p.id, p]));
    const usages = await db.production_material_usage.toArray();
    const materials = await db.materials.toArray();
    const matMap = new Map(materials.map(m => [m.id, m]));

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

  async createProductionOrder(data, userId = 'usr-production') {
    if (data.start_date) validateNotPastDate(data.start_date, 'تاريخ أمر الإنتاج');
    const id = `po-${Date.now()}`;
    const orderNumber = data.order_number || `ORD-MFG-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const productId = data.product_id;
    const batchQty = Math.max(1, Number(data.batch_quantity) || 1);

    const product = await db.products.get(productId);
    if (!product) throw new Error('المنتج المطلوب تصنيعه غير موجود');

    const bom = await db.bom_items.where('product_id').equals(productId).toArray();
    if (bom.length === 0) {
      throw new Error('لا توجد شجرة منتج (BOM) محددة لهذا المنتج، يرجى إضافة بنود التكلفة أولاً.');
    }

    // Material usage calculation & stock deduction inside Dexie transaction
    let totalMaterialCost = 0;
    const materialUsageList = [];

    await db.transaction('rw', [db.production_orders, db.production_material_usage, db.materials, db.stock_movements], async () => {
      // Check stock and compute consumption
      for (const item of bom) {
        const mat = await db.materials.get(item.raw_material_id);
        if (!mat) throw new Error(`خامة غير موجودة في قاعدة البيانات (${item.raw_material_id})`);

        const standardQty = CostCalculator.calculateStandardMaterialUsage(batchQty, item.quantity_per_unit, item.waste_percent);
        const currentStock = Number(mat.current_stock) || 0;

        if (currentStock < standardQty) {
          throw new Error(`الرصيد المتاح من (${mat.name}) هو ${currentStock} ${mat.unit}، بينما المطلوب لتشغيل الدفعة هو ${standardQty} ${mat.unit}`);
        }

        const unitCost = Number(mat.average_cost) || 0;
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

        // Deduct material stock
        const newStock = Number((currentStock - standardQty).toFixed(3));
        await db.materials.update(mat.id, { current_stock: newStock });

        // Record stock movement
        await db.stock_movements.add({
          id: `sm-${Date.now()}-${item.raw_material_id}`,
          material_id: mat.id,
          movement_type: 'production_out',
          reference_type: 'PRODUCTION_ORDER',
          reference_id: id,
          quantity_change: -standardQty,
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

      // Labor Calculation
      const laborType = data.labor_type || 'hourly';
      const laborCost = CostCalculator.calculateLaborCost(laborType, {
        hours: data.labor_hours,
        hourlyRate: data.labor_hourly_rate,
        pieceRate: data.labor_piece_rate,
        batchQty,
      });

      // Overhead Calculation
      const latestOverhead = await db.overheads.reverse().sortBy('created_at');
      const hourlyOverheadRate = latestOverhead.length > 0 ? Number(latestOverhead[0].hourly_overhead_rate) || 0 : 50;
      const machineHours = Number(data.machine_hours) || 0;
      const allocatedOverheadCost = CostCalculator.calculateAllocatedOverhead(machineHours, hourlyOverheadRate);

      // External Outsourced Cost
      const externalCost = data.location_type === 'outsourced' ? (Number(data.external_total_cost) || 0) : 0;

      // Stage 1 Total & Unit Cost
      const { totalStage1Cost, unitStage1Cost } = CostCalculator.calculateStage1Cost({
        materialsCost: totalMaterialCost,
        laborCost,
        overheadCost: allocatedOverheadCost,
        externalCost,
        batchQuantity: batchQty,
      });

      const order = {
        id,
        order_number: orderNumber,
        product_id: productId,
        batch_quantity: batchQty,
        start_date: data.start_date || now.split('T')[0],
        completion_date: null,
        status: 'in_production',
        location_type: data.location_type || 'inside',
        external_supplier_id: data.external_supplier_id || null,
        external_pricing_type: data.external_pricing_type || 'per_piece',
        external_service_rate: Number(data.external_service_rate) || 0,
        external_transport_cost: Number(data.external_transport_cost) || 0,
        external_total_cost: externalCost,
        labor_type: laborType,
        labor_hours: Number(data.labor_hours) || 0,
        labor_hourly_rate: Number(data.labor_hourly_rate) || 0,
        labor_piece_rate: Number(data.labor_piece_rate) || 0,
        total_labor_cost: laborCost,
        machine_hours: machineHours,
        allocated_overhead_cost: allocatedOverheadCost,
        total_material_cost: Number(totalMaterialCost.toFixed(2)),
        total_stage1_cost: totalStage1Cost,
        unit_stage1_cost: unitStage1Cost,
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
