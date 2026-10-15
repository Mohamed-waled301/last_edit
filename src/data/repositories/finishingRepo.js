import db from '../db';
import CostCalculator from '../../logic/costCalculator';
import auditRepo from './auditRepo';
import { validateNotPastDate } from '../../utils/formatters';

export const finishingRepo = {
  /**
   * Get all outsourced / finishing manufacturing orders
   */
  async getAll() {
    if (!db.finishing_orders) return [];
    const orders = await db.finishing_orders.reverse().sortBy('created_at');
    const products = await db.products.toArray();
    const prodMap = new Map(products.map(p => [p.id, p]));
    const poList = await db.production_orders.toArray();
    const poMap = new Map(poList.map(o => [o.id, o]));
    const suppliers = await db.suppliers.toArray();
    const supMap = new Map(suppliers.map(s => [s.id, s.name]));
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
        external_factory_name: o.external_factory_name || supMap.get(o.supplier_id) || 'مصنع تشغيل خارجي',
        supplier_name: supMap.get(o.supplier_id) || o.external_factory_name || 'مصنع تشغيل خارجي',
        materials_used: usedMats,
      };
    });
  },

  /**
   * Create Outsourced Manufacturing Order (أمر تشغيل وتصنيع لدى الغير)
   * External factory is a supplier of type "service"
   * Cumulative cost: internal stage + outsourced stage = final cost
   */
  async createFinishingOrder(data, userId = 'usr-production') {
    if (data.transfer_date) {
      validateNotPastDate(data.transfer_date, 'تاريخ التحويل للتشغيل الخارجي');
    }
    const id = `fo-${Date.now()}`;
    const finishingNumber = data.finishing_number || `ORD-OUT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    const now = new Date().toISOString();

    const po = await db.production_orders.get(data.production_order_id);
    if (!po) throw new Error('أمر التشغيل الأصلي لمرحلة الإنتاج الداخلي غير موجود');

    const finishingQty = Math.max(1, Number(data.finishing_quantity) || 1);
    const stage1UnitCost = Number(po.unit_stage1_cost) || 0;
    const stage1TransferredCost = Number((finishingQty * stage1UnitCost).toFixed(2));

    const externalLaborFee = Math.max(0, Number(data.finishing_labor_fee ?? data.service_fee) || 0);
    const transportCost = Math.max(0, Number(data.transport_cost) || 0);

    let finishingMaterialsCost = 0;
    const finMatRecords = [];

    await db.transaction('rw', [db.finishing_orders, db.finishing_materials, db.materials, db.stock_movements, db.suppliers], async () => {
      // Consume any materials sent to external factory
      for (const item of (data.materials || data.finishing_materials || [])) {
        const mat = await db.materials.get(item.raw_material_id);
        if (!mat) continue;

        const reqQty = Math.max(0, Number(item.quantity) || 0);
        if (reqQty <= 0) continue;

        const currentStock = Number(mat.current_stock) || 0;
        if (currentStock < reqQty) {
          throw new Error(`رصيد خامة التشغيل (${mat.name}) هو ${currentStock} وغير كافٍ للتشغيل الخارجي (${reqQty})`);
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

        const newStock = Number((currentStock - reqQty).toFixed(3));
        await db.materials.update(mat.id, { current_stock: newStock });

        await db.stock_movements.add({
          id: `sm-${Date.now()}-${item.raw_material_id}`,
          material_id: mat.id,
          movement_type: 'finishing_out',
          reference_type: 'OUTSOURCED_ORDER',
          reference_id: id,
          quantity_change: -reqQty,
          unit_cost: unitCost,
          new_balance: newStock,
          notes: `صرف مستلزمات تشغيل خارجي لدى الغير أمر ${finishingNumber}`,
          created_by: userId,
          created_at: now,
        });
      }

      for (const fmr of finMatRecords) {
        await db.finishing_materials.add(fmr);
      }

      // Costs Accumulate: internal stage + outsourced stage = final cost
      const totalOutsourcedStageCost = Number((externalLaborFee + transportCost + finishingMaterialsCost).toFixed(2));
      const finalTotalBatchCost = Number((stage1TransferredCost + totalOutsourcedStageCost).toFixed(2));
      const finalUnitCost = Number((finalTotalBatchCost / finishingQty).toFixed(4));

      // Resolve external factory name
      let externalFactoryName = data.external_factory_name || data.finishing_location || '';
      if (data.supplier_id) {
        const sup = await db.suppliers.get(data.supplier_id);
        if (sup) {
          externalFactoryName = sup.name;
        }
      }

      const order = {
        id,
        finishing_number: finishingNumber,
        production_order_id: po.id,
        product_id: po.product_id,
        finishing_quantity: finishingQty,
        transfer_date: data.transfer_date || now.split('T')[0],
        completion_date: null,
        status: 'in_outsourced', // In outsourced processing
        service_type: data.service_type || 'تطريز وطباعة وتشطيب', // نوع الخدمة
        supplier_id: data.supplier_id || null, // المورد من نوع خدمة
        external_factory_name: externalFactoryName || 'مصنع تشغيل خارجي',
        finishing_location: externalFactoryName || 'مصنع تشغيل خارجي',
        finishing_labor_fee: externalLaborFee,
        service_fee: externalLaborFee,
        transport_cost: transportCost,
        materials_cost: Number(finishingMaterialsCost.toFixed(2)),
        stage1_transferred_cost: stage1TransferredCost,
        total_finishing_stage_cost: totalOutsourcedStageCost,
        total_outsourced_stage_cost: totalOutsourcedStageCost,
        final_total_batch_cost: finalTotalBatchCost,
        final_unit_cost: finalUnitCost,
        notes: data.notes || '',
        created_by: userId,
        created_at: now,
      };

      await db.finishing_orders.add(order);
    });

    await auditRepo.log(userId, 'CREATE_OUTSOURCED_ORDER', 'finishing_orders', id, null, { finishingNumber, finishingQty });
    return await db.finishing_orders.get(id);
  },

  async markReadyForSale(id, userId = 'usr-production') {
    const order = await db.finishing_orders.get(id);
    if (!order) throw new Error('أمر التشغيل لدى الغير غير موجود');

    const now = new Date().toISOString();

    await db.transaction('rw', [db.finishing_orders, db.products, db.items, db.stock_movements], async () => {
      await db.finishing_orders.update(id, {
        status: 'ready_for_sale',
        completion_date: now.split('T')[0],
      });

      const qty = Number(order.finishing_quantity) || 0;

      // Increase finished product stock
      const product = await db.products.get(order.product_id);
      if (product) {
        const oldStock = Number(product.current_finished_stock) || 0;
        const newStock = Number((oldStock + qty).toFixed(2));
        await db.products.update(product.id, { current_finished_stock: newStock });
      }

      // Also update items table
      const itm = await db.items.get(order.product_id);
      if (itm) {
        const oldStock = Number(itm.current_stock) || 0;
        const newStock = Number((oldStock + qty).toFixed(2));
        await db.items.update(itm.id, { current_stock: newStock });
      }

      // Record stock movement for finished goods received from outsourced factory
      await db.stock_movements.add({
        id: `sm-${Date.now()}-fin`,
        material_id: order.product_id,
        movement_type: 'production_in',
        reference_type: 'OUTSOURCED_ORDER',
        reference_id: id,
        quantity_change: qty,
        unit_cost: Number(order.final_unit_cost) || 0,
        new_balance: (product ? Number(product.current_finished_stock) || 0 : 0) + qty,
        notes: `استلام منتج تام من التشغيل لدى الغير (${order.external_factory_name || ''}) إذن ${order.finishing_number}`,
        created_by: userId,
        created_at: now,
      });
    });

    await auditRepo.log(userId, 'OUTSOURCED_READY_FOR_SALE', 'finishing_orders', id, order, { status: 'ready_for_sale' });
    return await db.finishing_orders.get(id);
  }
};

export default finishingRepo;
