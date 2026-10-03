import db from '../db';
import CostCalculator from '../../logic/costCalculator';
import auditRepo from './auditRepo';
import { validateNotPastDate } from '../../utils/formatters';

export const finishingRepo = {
  async getAll() {
    const orders = await db.finishing_orders.reverse().sortBy('created_at');
    const products = await db.products.toArray();
    const prodMap = new Map(products.map(p => [p.id, p]));
    const poList = await db.production_orders.toArray();
    const poMap = new Map(poList.map(o => [o.id, o]));
    const materials = await db.materials.toArray();
    const matMap = new Map(materials.map(m => [m.id, m]));
    const finMaterials = await db.finishing_materials.toArray();

    return orders.map(o => {
      const prod = prodMap.get(o.product_id);
      const po = poMap.get(o.production_order_id);
      const usedMats = finMaterials.filter(m => m.finishing_order_id === o.id).map(m => {
        const mat = matMap.get(m.raw_material_id);
        return {
          ...m,
          material_name: mat ? mat.name : m.raw_material_id,
          material_unit: mat ? mat.unit : 'وحدة',
        };
      });

      return {
        ...o,
        product_name: prod ? prod.name : o.product_id,
        production_order_number: po ? po.order_number : o.production_order_id,
        materials_used: usedMats,
      };
    });
  },

  async createFinishingOrder(data, userId = 'usr-production') {
    if (data.transfer_date) {
      validateNotPastDate(data.transfer_date, 'تاريخ التحويل للتشطيب');
    }
    const id = `fo-${Date.now()}`;
    const finishingNumber = data.finishing_number || `ORD-FIN-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const po = await db.production_orders.get(data.production_order_id);
    if (!po) throw new Error('أمر التشغيل الأصلي لمرحلة 1 غير موجود');

    const finishingQty = Math.max(1, Number(data.finishing_quantity) || 1);
    const stage1UnitCost = Number(po.unit_stage1_cost) || 0;
    const stage1TransferredCost = Number((finishingQty * stage1UnitCost).toFixed(2));

    const finishingLabor = Math.max(0, Number(data.finishing_labor_fee) || 0);
    const finishingTransport = Math.max(0, Number(data.transport_cost) || 0);

    let finishingMaterialsCost = 0;
    const finMatRecords = [];

    await db.transaction('rw', [db.finishing_orders, db.finishing_materials, db.materials, db.stock_movements], async () => {
      // Consume any finishing materials
      for (const item of (data.materials || [])) {
        const mat = await db.materials.get(item.raw_material_id);
        if (!mat) continue;

        const reqQty = Math.max(0, Number(item.quantity) || 0);
        const currentStock = Number(mat.current_stock) || 0;
        if (currentStock < reqQty) {
          throw new Error(`رصيد خامة التشطيب (${mat.name}) هو ${currentStock} وغير كافٍ للتشطيب (${reqQty})`);
        }

        const unitCost = Number(mat.average_cost) || 0;
        const totalCost = Number((reqQty * unitCost).toFixed(2));
        finishingMaterialsCost += totalCost;

        finMatRecords.push({
          id: `fm-${Date.now()}-${item.raw_material_id}`,
          finishing_order_id: id,
          raw_material_id: mat.id,
          quantity: reqQty,
          unit_cost: unitCost,
          total_cost: totalCost,
        });

        // Deduct material
        const newStock = Number((currentStock - reqQty).toFixed(3));
        await db.materials.update(mat.id, { current_stock: newStock });

        await db.stock_movements.add({
          id: `sm-${Date.now()}-${item.raw_material_id}`,
          material_id: mat.id,
          movement_type: 'finishing_out',
          reference_type: 'FINISHING_ORDER',
          reference_id: id,
          quantity_change: -reqQty,
          unit_cost: unitCost,
          new_balance: newStock,
          notes: `صرف خامات تشطيب أمر ${finishingNumber}`,
          created_by: userId,
          created_at: now,
        });
      }

      for (const fmr of finMatRecords) {
        await db.finishing_materials.add(fmr);
      }

      // Stage 2 Cumulative Cost
      const { totalFinishingStageCost, finalTotalBatchCost, finalUnitCost } = CostCalculator.calculateStage2Cost({
        stage1TransferredCost,
        finishingLabor,
        finishingTransport,
        finishingMaterialsCost,
        finishingQuantity: finishingQty,
      });

      const order = {
        id,
        finishing_number: finishingNumber,
        production_order_id: po.id,
        product_id: po.product_id,
        finishing_quantity: finishingQty,
        transfer_date: data.transfer_date || now.split('T')[0],
        completion_date: null,
        status: 'in_finishing',
        finishing_location: data.finishing_location || 'عنبر التشطيب والدهانات',
        finishing_labor_fee: finishingLabor,
        transport_cost: finishingTransport,
        materials_cost: Number(finishingMaterialsCost.toFixed(2)),
        stage1_transferred_cost: stage1TransferredCost,
        total_finishing_stage_cost: totalFinishingStageCost,
        final_total_batch_cost: finalTotalBatchCost,
        final_unit_cost: finalUnitCost,
        notes: data.notes || '',
        created_by: userId,
        created_at: now,
      };

      await db.finishing_orders.add(order);
    });

    await auditRepo.log(userId, 'CREATE_FINISHING_ORDER', 'finishing_orders', id, null, { finishingNumber, finishingQty });
    return await db.finishing_orders.get(id);
  },

  async markReadyForSale(id, userId = 'usr-production') {
    const order = await db.finishing_orders.get(id);
    if (!order) throw new Error('أمر التشطيب غير موجود');

    const now = new Date().toISOString();

    await db.transaction('rw', [db.finishing_orders, db.products], async () => {
      await db.finishing_orders.update(id, {
        status: 'ready_for_sale',
        completion_date: now.split('T')[0],
      });

      // Increase finished product stock
      const product = await db.products.get(order.product_id);
      if (product) {
        const oldFinishedStock = Number(product.current_finished_stock) || 0;
        const newFinishedStock = Number((oldFinishedStock + (Number(order.finishing_quantity) || 0)).toFixed(2));
        await db.products.update(product.id, { current_finished_stock: newFinishedStock });
      }
    });

    await auditRepo.log(userId, 'FINISHING_READY_FOR_SALE', 'finishing_orders', id, order, { status: 'ready_for_sale' });
    return await db.finishing_orders.get(id);
  }
};

export default finishingRepo;
