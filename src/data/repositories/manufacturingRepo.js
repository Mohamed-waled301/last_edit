import db from '../db';
import CostCalculator from '../../logic/costCalculator';
import auditRepo from './auditRepo';
import { cashRepo } from './cashRepo';
import { validateNotPastDate } from '../../utils/formatters';
import { toPiasters, fromPiasters, distributeCostLargestRemainder } from '../../utils/money';
import {
  calculateMaterialLineCost,
  calculateTotalMaterialsCost,
  calculateTotalAdditionalCosts,
  calculateTotalProductCost,
  calculateUnitCost
} from '../../logic/productionOrderCalculations';
import {
  CUT_ORDER_SIZES,
  validateAndCleanMatrix,
  distributeMatrixCostLargestRemainder,
  computeColumnTotals,
  computeGrandTotal
} from '../../logic/cutOrderMatrixCalculations';

export const STAGE_CONFIGS = {
  printing: { key: 'printing', title: 'الطباعة', workshopType: 'print_shop' },
  embroidery: { key: 'embroidery', title: 'التطريز', workshopType: 'embroidery_workshop' },
  sewing: { key: 'sewing', title: 'الحياكة', workshopType: 'sewing_workshop' }
};

export const manufacturingRepo = {
  /**
   * Validate that cutting number is non-empty, manual, and unique
   */
  async checkCuttingNumberUnique(cuttingNumber, excludeId = null) {
    const clean = String(cuttingNumber || '').trim();
    if (!clean) {
      throw new Error('رقم القصة مطلوب ويجب إدخاله يدوياً');
    }
    const orders = await db.production_orders.toArray();
    const existing = orders.find(o => 
      o.id !== excludeId && 
      (String(o.cutting_number || '').trim().toLowerCase() === clean.toLowerCase() ||
       String(o.order_number || '').trim().toLowerCase() === clean.toLowerCase())
    );
    if (existing) {
      throw new Error('رقم القصة مسجل مسبقاً، يرجى إدخال رقم فريد');
    }
    return true;
  },

  /**
   * Get all service workshop vendors for stages
   */
  async getWorkshopVendors(stageKey = null) {
    const parties = await db.parties.filter(p => p.is_active === 1 && p.is_supplier === 1).toArray();
    const stageActivityMap = {
      printing: ['طباعة', 'الطباعة', 'printing', 'service_printing'],
      embroidery: ['تطريز', 'التطريز', 'embroidery', 'service_embroidery'],
      sewing: ['حياكة', 'الحياكة', 'sewing', 'service_sewing']
    };
    const allWorkshopActivities = ['طباعة', 'الطباعة', 'تطريز', 'التطريز', 'حياكة', 'الحياكة', 'printing', 'embroidery', 'sewing', 'service_printing', 'service_embroidery', 'service_sewing'];

    const serviceSuppliers = parties.filter(p => 
      p.supplier_type === 'service' || 
      p.supplier_type === 'خدمات' || 
      p.service_stage || 
      allWorkshopActivities.includes(p.supplier_type) ||
      (p.supplier_type && p.supplier_type !== 'goods' && p.supplier_type !== 'توريد خامات ومستلزمات إنتاج')
    );

    if (!stageKey) return serviceSuppliers;

    const validActivities = stageActivityMap[stageKey] || [];

    return serviceSuppliers.filter(p => {
      if (p.service_stage && p.service_stage === stageKey) return true;
      if (p.supplier_type === `service_${stageKey}`) return true;
      if (validActivities.includes(p.supplier_type)) return true;
      // If general service supplier, available for all stages
      return p.supplier_type === 'service' || p.supplier_type === 'خدمات';
    });
  },

  async getAll() {
    if (!db.production_orders) return [];
    let orders = [];
    try {
      orders = await db.production_orders.reverse().sortBy('created_at');
    } catch {
      orders = await db.production_orders.toArray();
      orders.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }
    const products = await db.products.toArray();
    const items = await db.items.toArray();
    const prodMap = new Map([...products.map(p => [p.id, p]), ...items.map(i => [i.id, i])]);
    const usages = await db.production_material_usage.toArray();
    const materials = await db.materials.toArray();
    const matMap = new Map([...materials.map(m => [m.id, m]), ...items.map(i => [i.id, i])]);
    const allPayments = await db.payments.toArray().catch(() => []);

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

      // Payments for this order across all stages
      const orderPayments = allPayments.filter(p => p.production_order_id === o.id && p.status !== 'cancelled');
      const totalStagesPaid = orderPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      const printingCost = Number(o.stages?.printing?.total_cost ?? o.total_printing_cost ?? 0);
      const embroideryCost = Number(o.stages?.embroidery?.total_cost ?? 0);
      const sewingCost = Number(o.stages?.sewing?.total_cost ?? 0);
      const totalStagesCost = Number((printingCost + embroideryCost + sewingCost).toFixed(2));
      const remainingStagesBalance = Math.max(0, Number((totalStagesCost - totalStagesPaid).toFixed(2)));

      return {
        ...o,
        cutting_number: o.cutting_number || o.order_number,
        cutting_name: o.cutting_name || (prod ? prod.name : o.product_id),
        product_name: prod ? prod.name : o.product_id,
        product_code: prod ? prod.code : '',
        materials_used: orderUsages,
        total_stages_cost: totalStagesCost,
        total_stages_paid: totalStagesPaid,
        remaining_stages_balance: remainingStagesBalance
      };
    });
  },

  async getById(id) {
    if (!id) return null;
    let order = null;
    if (db.production_orders) {
      order = await db.production_orders.get(id);
      if (!order && !isNaN(Number(id))) {
        order = await db.production_orders.get(Number(id));
      }
      if (!order) {
        order = await db.production_orders.where('cutting_number').equals(String(id)).first();
      }
      if (!order) {
        order = await db.production_orders.where('order_number').equals(String(id)).first();
      }
      if (!order) {
        const all = await db.production_orders.toArray().catch(() => []);
        order = all.find(o => String(o.id) === String(id) || String(o.cutting_number) === String(id) || String(o.order_number) === String(id)) || null;
      }
    }
    if (!order) return null;
    const targetId = order.id;
    const prod = order.product_id ? ((await db.items.get(order.product_id)) || (await db.products.get(order.product_id))) : null;
    const usages = await db.production_material_usage.where('production_order_id').equals(targetId).toArray();
    const items = await db.items.toArray();
    const materials = await db.materials.toArray();
    const matMap = new Map([...materials.map(m => [m.id, m]), ...items.map(i => [i.id, i])]);

    // Load payments from shared ledger (db.payments)
    const ledgerPayments = await db.payments.filter(p => p.production_order_id === targetId).toArray().catch(() => []);
    // Also include any legacy cutting_printing_payments if not already in payments
    const legacyPayments = await db.cutting_printing_payments.where('production_order_id').equals(targetId).toArray().catch(() => []);
    
    // Merge payments avoiding duplicates
    const seenIds = new Set(ledgerPayments.map(p => p.id));
    const combinedPayments = [...ledgerPayments];
    for (const leg of legacyPayments) {
      if (!seenIds.has(leg.id)) {
        combinedPayments.push({
          ...leg,
          stage_type: 'printing',
          supplier_id: order.printing_vendor || null
        });
      }
    }
    combinedPayments.sort((a, b) => new Date(a.payment_date) - new Date(b.payment_date));

    // Calculate stage-by-stage totals
    const stages = order.stages || {
      printing: {
        vendor_id: order.printing_vendor_id || '',
        vendor_name: order.printing_vendor || '',
        pricing_type: 'fixed',
        price_per_piece: 0,
        fixed_total: Number(order.total_printing_cost) || 0,
        batches: [],
        notes: order.printing_notes || '',
        total_cost: Number(order.total_printing_cost) || 0
      },
      embroidery: {
        vendor_id: order.embroidery_vendor_id || '',
        vendor_name: order.embroidery_vendor || '',
        pricing_type: 'fixed',
        price_per_piece: 0,
        fixed_total: 0,
        batches: [],
        notes: order.embroidery_notes || '',
        total_cost: 0
      },
      sewing: {
        vendor_id: order.processing_vendor_id || '',
        vendor_name: order.processing_vendor || '',
        pricing_type: 'fixed',
        price_per_piece: 0,
        fixed_total: 0,
        batches: [],
        notes: order.processing_notes || '',
        total_cost: 0
      }
    };

    // Calculate paid and remaining per stage
    const enrichedStages = {};
    for (const key of ['printing', 'embroidery', 'sewing']) {
      const st = stages[key] || { pricing_type: 'fixed', total_cost: 0, batches: [] };
      const stPayments = combinedPayments.filter(p => (p.stage_type === key || (!p.stage_type && key === 'printing')) && p.status !== 'cancelled');
      const paidPiasters = stPayments.reduce((sum, p) => sum + toPiasters(p.amount), 0);
      const costPiasters = toPiasters(st.total_cost || 0);
      const remPiasters = Math.max(0, costPiasters - paidPiasters);

      enrichedStages[key] = {
        ...st,
        paid: fromPiasters(paidPiasters),
        remaining: fromPiasters(remPiasters),
        payments: stPayments
      };
    }

    let parsedSizeQuantities = {};
    if (order.size_quantities) {
      try {
        parsedSizeQuantities = typeof order.size_quantities === 'string'
          ? JSON.parse(order.size_quantities)
          : order.size_quantities;
      } catch (e) {
        parsedSizeQuantities = {};
      }
    }

    return {
      ...order,
      cutting_number: order.cutting_number || order.order_number,
      cutting_name: order.cutting_name || (prod ? prod.name : ''),
      size_quantities_parsed: parsedSizeQuantities,
      stages: enrichedStages,
      stage_payments: combinedPayments,
      printing_payments: combinedPayments.filter(p => p.stage_type === 'printing' || !p.stage_type),
      total_printing_cost: enrichedStages.printing.total_cost,
      total_printing_paid: enrichedStages.printing.paid,
      remaining_printing_balance: enrichedStages.printing.remaining,
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

  /**
   * Helper to normalize stages input and calculate costs
   */
  _computeStages(stagesInput, batchQty, fallbackOrder = {}) {
    const batchPieces = Math.max(1, Number(batchQty) || 1);
    const result = {};
    let totalStagesCost = 0;

    for (const key of ['printing', 'embroidery', 'sewing']) {
      const src = stagesInput?.[key] || fallbackOrder.stages?.[key] || {};
      const pricingType = src.pricing_type || (src.batches?.length > 0 ? 'batches' : 'fixed');
      const vendorId = src.vendor_id || (key === 'printing' ? fallbackOrder.printing_vendor_id : key === 'embroidery' ? fallbackOrder.embroidery_vendor_id : fallbackOrder.processing_vendor_id) || '';
      const vendorName = src.vendor_name || (key === 'printing' ? fallbackOrder.printing_vendor : key === 'embroidery' ? fallbackOrder.embroidery_vendor : fallbackOrder.processing_vendor) || '';
      const notes = src.notes || (key === 'printing' ? fallbackOrder.printing_notes : key === 'embroidery' ? fallbackOrder.embroidery_notes : fallbackOrder.processing_notes) || '';

      let stageCost = 0;
      let batches = Array.isArray(src.batches) ? src.batches : [];

      if (pricingType === 'per_piece') {
        const ppp = Math.max(0, Number(src.price_per_piece) || 0);
        stageCost = Number((batchPieces * ppp).toFixed(2));
      } else if (pricingType === 'batches') {
        // Validate batch pieces limit
        const totalBatchPieces = batches.reduce((sum, b) => sum + (Number(b.pieces) || 0), 0);
        if (totalBatchPieces > batchPieces) {
          const stageTitle = STAGE_CONFIGS[key]?.title || key;
          throw new Error(`مجموع قطع دفعات مرحلة (${stageTitle}) هو ${totalBatchPieces} قطعة، ولا يمكن أن يتجاوز إجمالي قطع القصة (${batchPieces} قطعة)`);
        }
        stageCost = batches.reduce((sum, b) => {
          const bP = Math.max(0, Number(b.pieces) || 0);
          const bPrice = Math.max(0, Number(b.unit_price) || 0);
          return sum + Number((bP * bPrice).toFixed(2));
        }, 0);
        stageCost = Number(stageCost.toFixed(2));
      } else {
        // fixed total
        if (key === 'printing' && fallbackOrder.total_printing_cost !== undefined && !stagesInput?.printing) {
          stageCost = Math.max(0, Number(fallbackOrder.total_printing_cost) || 0);
        } else {
          stageCost = Math.max(0, Number(src.fixed_total !== undefined ? src.fixed_total : (src.total_cost !== undefined ? src.total_cost : 0)) || 0);
        }
      }

      totalStagesCost += stageCost;
      result[key] = {
        vendor_id: vendorId,
        vendor_name: vendorName,
        pricing_type: pricingType,
        price_per_piece: Number(src.price_per_piece) || 0,
        fixed_total: Number(src.fixed_total) || 0,
        batches: batches.map((b, idx) => ({
          id: b.id || `btch-${key}-${idx}-${Date.now()}`,
          date: b.date || new Date().toISOString().split('T')[0],
          pieces: Math.max(0, Number(b.pieces) || 0),
          unit_price: Math.max(0, Number(b.unit_price) || 0),
          total: Number(((Math.max(0, Number(b.pieces) || 0)) * (Math.max(0, Number(b.unit_price) || 0))).toFixed(2)),
          notes: b.notes || ''
        })),
        notes,
        total_cost: stageCost
      };
    }

    return {
      stages: result,
      totalStagesCost: Number(totalStagesCost.toFixed(2))
    };
  },

  /**
   * Calculate unit cost at high precision (up to 4 decimals) and distribute
   * remainder across sizes using largest remainder method to reconcile exact piasters.
   */
  _computeCostBreakdown(totalCutCost, batchQty, sizeQuantities) {
    const qty = Math.max(1, Number(batchQty) || 1);
    // Unit cost with 4 decimals precision
    const unitCostExact = totalCutCost / qty;
    const unitCost4Decimals = Number(unitCostExact.toFixed(4));

    // Parse size quantities map
    let sizesMap = {};
    if (typeof sizeQuantities === 'string') {
      try { sizesMap = JSON.parse(sizeQuantities); } catch (e) { sizesMap = {}; }
    } else if (sizeQuantities && typeof sizeQuantities === 'object') {
      sizesMap = sizeQuantities;
    }

    const sizeWeights = {};
    for (const [s, q] of Object.entries(sizesMap)) {
      const n = Number(q) || 0;
      if (n > 0) sizeWeights[s] = n;
    }

    // Distribute total cut cost to the piaster using largest remainder method
    const totalPiasters = toPiasters(totalCutCost);
    const distributedPiasters = distributeCostLargestRemainder(totalPiasters, sizeWeights);
    const sizeCosts = {};
    for (const [s, pVal] of Object.entries(distributedPiasters)) {
      sizeCosts[s] = {
        quantity: sizeWeights[s],
        total_cost: fromPiasters(pVal),
        unit_cost: Number((fromPiasters(pVal) / sizeWeights[s]).toFixed(4))
      };
    }

    return {
      unitCostExact,
      unitCost4Decimals,
      sizeCosts
    };
  },

  async createProductionOrder(data, userId = 'usr-production') {
    if (data.start_date) validateNotPastDate(data.start_date, 'تاريخ أمر الإنتاج');
    
    // 1. Validate cutting number uniqueness (Requirement 4.1)
    let cuttingNumber = String(data.cutting_number || data.order_number || '').trim();
    if (!cuttingNumber) {
      cuttingNumber = `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    } else {
      await this.checkCuttingNumberUnique(cuttingNumber);
    }

    const id = data.id || `po-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const orderNumber = cuttingNumber;
    const now = new Date().toISOString();
    const today = (data.start_date || now.split('T')[0]);

    const productId = data.product_id;
    let cleanMatrix = [];
    let matrixCellCosts = [];
    let sizeCosts = {};
    let colorCosts = {};
    let batchQty = 1;

    if (Array.isArray(data.matrix) && data.matrix.length > 0) {
      const valResult = validateAndCleanMatrix(data.matrix);
      if (!valResult.valid) {
        throw new Error(valResult.error || 'يرجى مراجعة مصفوفة المقاسات والألوان');
      }
      cleanMatrix = valResult.cleanRows;
      batchQty = valResult.grandTotal;
    } else {
      batchQty = Math.max(1, Number(data.batch_quantity || data.produced_quantity) || 1);
    }

    const product = (await db.items.get(productId)) || (await db.products.get(productId));
    if (!product) throw new Error('المنتج المطلوب تصنيعه غير موجود في دليل الأصناف');

    const rawLines = data.materials || data.raw_materials || data.items || [];
    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      throw new Error('يرجى إضافة خامة واحدة على الأقل في بنود أمر الإنتاج');
    }

    // Direct raw materials mode
    const verifiedLines = [];
    for (const line of rawLines) {
      const matId = line.material_id || line.item_id || line.raw_material_id;
      if (!matId) continue;
      const itm = (await db.items.get(matId)) || (await db.materials.get(matId));
      if (!itm) throw new Error(`خامة غير موجودة في قاعدة البيانات (${matId})`);
      
      const qty = Math.max(0, Number(line.quantity) || 0);
      if (qty <= 0) throw new Error(`الكمية المطلوبة للخامة (${itm.name}) يجب أن تكون أكبر من صفر`);
      
      const price = Math.max(0, Number(line.unit_price !== undefined ? line.unit_price : itm.cost_price) || 0);
      const currentStock = Number(itm.current_stock) || 0;

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

    // Compute stages (Requirement 4.3)
    const { stages, totalStagesCost } = this._computeStages(data.stages, batchQty, data);

    // Total cut cost = fabric and trims + additional costs + all stage costs (Requirement 4.4)
    const totalProductCost = Number((totalMaterialsCost + totalAdditionalCosts + totalStagesCost).toFixed(2));
    
    let unitCostExact, unitCost4Decimals;
    if (cleanMatrix.length > 0) {
      const matrixDist = distributeMatrixCostLargestRemainder(totalProductCost, cleanMatrix);
      unitCostExact = matrixDist.unitCostExact;
      unitCost4Decimals = matrixDist.unitCost4Decimals;
      matrixCellCosts = matrixDist.cellCosts;
      sizeCosts = matrixDist.sizeSummaries;
      colorCosts = matrixDist.colorSummaries;
    } else {
      const breakdown = this._computeCostBreakdown(
        totalProductCost, 
        batchQty, 
        data.size_quantities
      );
      unitCostExact = breakdown.unitCostExact;
      unitCost4Decimals = breakdown.unitCost4Decimals;
      sizeCosts = breakdown.sizeCosts;
    }

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

        const itm = await db.items.get(line.material_id);
        if (itm) await db.items.update(itm.id, { current_stock: newStock });
        const mat = await db.materials.get(line.material_id);
        if (mat) await db.materials.update(mat.id, { current_stock: newStock });

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
          notes: `صرف خامات لأمر القص ${cuttingNumber} (${product.name})`,
          created_by: userId,
          created_at: now
        });

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

      // 2. Receive finished product into stock
      const hasVariants = Boolean(product.has_variants || (Array.isArray(product.variants) && product.variants.length > 0));

      if (hasVariants && cleanMatrix.length > 0) {
        // Product has variants ON: receive by size and color
        const liveItm = (await db.items.get(productId)) || product;
        const currentVariants = Array.isArray(liveItm.variants) ? [...liveItm.variants] : [];
        const variantMap = new Map();
        currentVariants.forEach((v, idx) => {
          const key = `${v.size}:::${v.color}`;
          variantMap.set(key, idx);
        });

        for (const cell of matrixCellCosts) {
          if (cell.quantity <= 0) continue;
          const key = `${cell.size}:::${cell.color}`;
          let varId;
          if (variantMap.has(key)) {
            const idx = variantMap.get(key);
            const v = currentVariants[idx];
            v.current_stock = Number(((Number(v.current_stock) || 0) + cell.quantity).toFixed(3));
            varId = v.id;
          } else {
            // Auto-create missing size/color variant
            varId = `var-${liveItm.code || liveItm.id}-${cell.size}-${cell.color}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const newVar = {
              id: varId,
              size: cell.size,
              color: cell.color,
              sku: `${liveItm.code || 'PRD'}-${cell.size}-${cell.color}`,
              opening_balance: 0,
              current_stock: cell.quantity
            };
            currentVariants.push(newVar);
            variantMap.set(key, currentVariants.length - 1);
          }

          await db.stock_movements.add({
            id: `sm-${Date.now()}-fin-${productId}-${cell.size}-${cell.color}-${Math.floor(Math.random() * 1000)}`,
            item_id: productId,
            material_id: productId,
            variant_id: varId,
            location_id: data.location_id || 'loc-main',
            movement_type: 'production_in',
            direction: 'in',
            quantity: cell.quantity,
            quantity_change: cell.quantity,
            unit_cost: cell.unit_cost,
            reference_type: 'PRODUCTION_ORDER',
            reference_id: id,
            document_id: id,
            date: today,
            movement_date: today,
            notes: `استلام منتج تام [${cell.size} / ${cell.color}] من أمر القص ${cuttingNumber} (${product.name})`,
            created_by: userId,
            created_at: now
          });
        }

        const newTotalStock = currentVariants.reduce((sum, v) => sum + (Number(v.current_stock) || 0), 0);
        await db.items.update(productId, { variants: currentVariants, current_stock: newTotalStock, has_variants: 1 });
        const liveProd = await db.products.get(productId);
        if (liveProd) {
          await db.products.update(productId, { variants: currentVariants, current_stock: newTotalStock, has_variants: 1 });
        }
      } else {
        // Product has variants OFF: receive grand total into single product stock
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
          variant_id: null,
          location_id: data.location_id || 'loc-main',
          movement_type: 'production_in',
          direction: 'in',
          quantity: batchQty,
          quantity_change: batchQty,
          unit_cost: unitCost4Decimals,
          reference_type: 'PRODUCTION_ORDER',
          reference_id: id,
          document_id: id,
          date: today,
          movement_date: today,
          notes: `استلام منتج تام من أمر القص ${cuttingNumber} (${product.name})`,
          created_by: userId,
          created_at: now
        });
      }

      const cuttingName = data.cutting_name || product.name || '';
      const legacyColor = cleanMatrix.length > 0
        ? cleanMatrix.map(r => r.color).join(' / ')
        : (data.color || '');

      let legacySizesMap = {};
      if (cleanMatrix.length > 0) {
        legacySizesMap = computeColumnTotals(cleanMatrix);
      } else {
        const rawSizes = data.size_quantities !== undefined ? data.size_quantities : (data.quantity_per_size !== undefined ? data.quantity_per_size : data.size_breakdown);
        if (typeof rawSizes === 'string') {
          try {
            legacySizesMap = JSON.parse(rawSizes);
          } catch (e) {
            legacySizesMap = {};
          }
        } else if (typeof rawSizes === 'object' && rawSizes !== null) {
          legacySizesMap = rawSizes;
        }
      }

      const sizeQuantities = JSON.stringify(legacySizesMap);

      // 3. Save cutting order record (Status: issued)
      const order = {
        id,
        order_number: cuttingNumber,
        cutting_number: cuttingNumber,
        cutting_name: cuttingName,
        fabric_type: data.fabric_type || '',
        color: legacyColor,
        cutouts_1: data.cutouts_1 || '',
        cutouts_2: data.cutouts_2 || '',
        sizes: data.sizes || '',
        quantity_per_size: sizeQuantities,
        size_quantities: sizeQuantities,
        matrix: cleanMatrix,
        matrix_cell_costs: matrixCellCosts,
        size_costs: sizeCosts,
        color_costs: colorCosts,
        cutting_comment: data.cutting_comment || '',
        stages,
        total_stages_cost: totalStagesCost,
        // Legacy fields for backward compatibility
        printing_vendor: stages.printing.vendor_name,
        printing_vendor_id: stages.printing.vendor_id,
        printing_notes: stages.printing.notes,
        total_printing_cost: stages.printing.total_cost,
        embroidery_vendor: stages.embroidery.vendor_name,
        embroidery_vendor_id: stages.embroidery.vendor_id,
        embroidery_notes: stages.embroidery.notes,
        processing_vendor: stages.sewing.vendor_name,
        processing_vendor_id: stages.sewing.vendor_id,
        processing_notes: stages.sewing.notes,
        product_id: productId,
        batch_quantity: batchQty,
        start_date: today,
        completion_date: today,
        status: data.status || 'completed', // Defaults to completed for legacy, 'issued' from UI
        location_type: 'inside',
        materials_lines: verifiedLines,
        additional_costs: additionalCosts,
        total_material_cost: totalMaterialsCost,
        total_additional_cost: totalAdditionalCosts,
        total_product_cost: totalProductCost,
        unit_cost: unitCost4Decimals,
        unit_cost_exact: unitCostExact,
        labor_cost: totalAdditionalCosts,
        total_stage1_cost: totalProductCost,
        unit_stage1_cost: unitCost4Decimals,
        notes: data.notes || '',
        created_by: userId,
        created_at: now
      };

      await db.production_orders.add(order);
    });

    // 4. Save any initial stage payments through shared supplier payment ledger (Requirement 4.3)
    const initialPayments = data.stage_payments || data.printing_payments || [];
    if (Array.isArray(initialPayments) && initialPayments.length > 0) {
      for (const p of initialPayments) {
        const pAmt = Number(p.amount) || 0;
        const stageKey = p.stage_type || 'printing';
        const vendorId = stages[stageKey]?.vendor_id;
        if (pAmt > 0 && vendorId) {
          await cashRepo.recordSupplierPayment({
            supplier_id: vendorId,
            amount: pAmt,
            payment_date: p.payment_date || today,
            payment_method: p.payment_method || 'نقداً',
            account_id: p.account_id,
            notes: p.notes || `دفعة مرحلة ${STAGE_CONFIGS[stageKey]?.title} لأمر القص ${cuttingNumber}`,
            production_order_id: id,
            stage_type: stageKey,
            max_allowed: stages[stageKey]?.total_cost
          }, userId);
        }
      }
    }

    await auditRepo.log(userId, 'CREATE_PRODUCTION_ORDER', 'production_orders', id, null, {
      cuttingNumber,
      batchQty,
      totalProductCost,
      unitCost: unitCost4Decimals
    });

    return await this.getById(id);
  },

  /**
   * Update Production/Cut Order (Requirement 4.2):
   * - Issued orders remain editable.
   * - Editing closed orders requires written reason.
   * - Adjusting stock movements for differences ONLY (never double issue or receive).
   * - Audit log stores old and new values.
   */
  async updateProductionOrder(id, data, userId = 'usr-production') {
    const existing = await db.production_orders.get(id);
    if (!existing) throw new Error('أمر القص المطلوب تعديله غير موجود');

    // Closed order edit guard
    if (existing.status === 'closed') {
      const editReason = String(data.edit_reason || '').trim();
      if (!editReason) {
        throw new Error('أمر القص مقفل، يرجى كتابة سبب التعديل للمتابعة');
      }
    }

    // Validate cutting number uniqueness (excluding this order)
    const newCuttingNumber = String(data.cutting_number !== undefined ? data.cutting_number : (existing.cutting_number || existing.order_number)).trim();
    await this.checkCuttingNumberUnique(newCuttingNumber, id);

    const now = new Date().toISOString();
    const today = (data.start_date || existing.start_date || now.split('T')[0]);
    const productId = data.product_id || existing.product_id;
    let cleanMatrix = null;
    let matrixCellCosts = [];
    let sizeCosts = existing.size_costs || {};
    let colorCosts = existing.color_costs || {};
    let newBatchQty = Number(existing.batch_quantity) || 1;

    if (Array.isArray(data.matrix)) {
      const valResult = validateAndCleanMatrix(data.matrix);
      if (!valResult.valid) {
        throw new Error(valResult.error || 'يرجى مراجعة مصفوفة المقاسات والألوان');
      }
      cleanMatrix = valResult.cleanRows;
      newBatchQty = valResult.grandTotal;
    } else if (data.batch_quantity !== undefined) {
      newBatchQty = Math.max(1, Number(data.batch_quantity) || 1);
    }
    const oldBatchQty = Math.max(1, Number(existing.batch_quantity) || 1);

    const product = (await db.items.get(productId)) || (await db.products.get(productId));
    if (!product) throw new Error('المنتج المطلوب تصنيعه غير موجود في دليل الأصناف');

    // Process material lines and delta differences
    const rawLines = data.materials || data.raw_materials || data.items || data.materials_lines || existing.materials_lines || [];
    const verifiedLines = [];
    const oldLinesMap = new Map((existing.materials_lines || []).map(l => [l.material_id, l]));

    for (const line of rawLines) {
      const matId = line.material_id || line.item_id || line.raw_material_id;
      if (!matId) continue;
      const itm = (await db.items.get(matId)) || (await db.materials.get(matId));
      if (!itm) throw new Error(`خامة غير موجودة في قاعدة البيانات (${matId})`);

      const qty = Math.max(0, Number(line.quantity) || 0);
      if (qty <= 0) throw new Error(`الكمية المطلوبة للخامة (${itm.name}) يجب أن تكون أكبر من صفر`);

      const price = Math.max(0, Number(line.unit_price !== undefined ? line.unit_price : itm.cost_price) || 0);
      const currentStock = Number(itm.current_stock) || 0;

      // Delta difference check
      const oldLine = oldLinesMap.get(matId);
      const oldQty = oldLine ? Number(oldLine.quantity) || 0 : 0;
      const diffQty = qty - oldQty;

      if (diffQty > 0 && currentStock < diffQty) {
        throw new Error(
          `الرصيد المتاح من (${itm.name}) هو (${currentStock})، بينما الزيادة المطلوبة بالتعديل (${diffQty}). لا يمكن إتمام التعديل.`
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
        current_stock: currentStock,
        diff_qty: diffQty
      });
    }

    if (verifiedLines.length === 0) {
      throw new Error('يرجى إضافة خامة واحدة على الأقل في بنود أمر الإنتاج');
    }

    const totalMaterialsCost = calculateTotalMaterialsCost(verifiedLines);
    const additionalCosts = Array.isArray(data.additional_costs) ? data.additional_costs.map(c => ({
      name: c.name || 'تكلفة إضافية',
      amount: Math.max(0, Number(c.amount) || 0)
    })) : (existing.additional_costs || []);
    const totalAdditionalCosts = calculateTotalAdditionalCosts(additionalCosts);

    // Compute stages
    const { stages, totalStagesCost } = this._computeStages(data.stages, newBatchQty, {
      ...existing,
      ...data
    });

    const totalProductCost = Number((totalMaterialsCost + totalAdditionalCosts + totalStagesCost).toFixed(2));
    
    let unitCostExact, unitCost4Decimals;
    if (cleanMatrix) {
      const matrixDist = distributeMatrixCostLargestRemainder(totalProductCost, cleanMatrix);
      unitCostExact = matrixDist.unitCostExact;
      unitCost4Decimals = matrixDist.unitCost4Decimals;
      matrixCellCosts = matrixDist.cellCosts;
      sizeCosts = matrixDist.sizeSummaries;
      colorCosts = matrixDist.colorSummaries;
    } else {
      const breakdown = this._computeCostBreakdown(
        totalProductCost,
        newBatchQty,
        data.size_quantities !== undefined ? data.size_quantities : existing.size_quantities
      );
      unitCostExact = breakdown.unitCostExact;
      unitCost4Decimals = breakdown.unitCost4Decimals;
      sizeCosts = breakdown.sizeCosts;
    }

    const finalMatrix = cleanMatrix || existing.matrix;

    // Apply stock differences ONLY
    await db.transaction('rw', [
      db.production_orders,
      db.production_material_usage,
      db.materials,
      db.items,
      db.stock_movements,
      db.products
    ], async () => {
      // 1. Raw materials delta movements
      const newMatIds = new Set(verifiedLines.map(l => l.material_id));
      for (const line of verifiedLines) {
        const diff = line.diff_qty;
        if (diff !== 0) {
          const itm = await db.items.get(line.material_id);
          const curBal = Number(itm?.current_stock) || 0;
          const newBal = Number((curBal - diff).toFixed(3));

          if (itm) await db.items.update(itm.id, { current_stock: newBal });
          const mat = await db.materials.get(line.material_id);
          if (mat) await db.materials.update(mat.id, { current_stock: newBal });

          // Difference movement
          await db.stock_movements.add({
            id: `sm-adj-${Date.now()}-${line.material_id}`,
            item_id: line.material_id,
            material_id: line.material_id,
            location_id: data.location_id || 'loc-main',
            movement_type: diff > 0 ? 'production_out' : 'production_in',
            direction: diff > 0 ? 'out' : 'in',
            quantity: Math.abs(diff),
            quantity_change: -diff,
            unit_cost: line.unit_price,
            new_balance: newBal,
            reference_type: 'PRODUCTION_ORDER',
            reference_id: id,
            document_id: id,
            date: today,
            movement_date: today,
            notes: diff > 0 
              ? `صرف خامات إضافية لتعديل أمر القص ${newCuttingNumber}`
              : `إرجاع فائض خامات لتعديل أمر القص ${newCuttingNumber}`,
            created_by: userId,
            created_at: now
          });
        }
      }

      // Handle raw materials that were removed completely
      for (const oldLine of (existing.materials_lines || [])) {
        if (!newMatIds.has(oldLine.material_id)) {
          const oldQ = Number(oldLine.quantity) || 0;
          if (oldQ > 0) {
            const itm = await db.items.get(oldLine.material_id);
            const curBal = Number(itm?.current_stock) || 0;
            const newBal = Number((curBal + oldQ).toFixed(3));

            if (itm) await db.items.update(itm.id, { current_stock: newBal });
            const mat = await db.materials.get(oldLine.material_id);
            if (mat) await db.materials.update(mat.id, { current_stock: newBal });

            await db.stock_movements.add({
              id: `sm-adj-rem-${Date.now()}-${oldLine.material_id}`,
              item_id: oldLine.material_id,
              material_id: oldLine.material_id,
              location_id: data.location_id || 'loc-main',
              movement_type: 'production_in',
              direction: 'in',
              quantity: oldQ,
              quantity_change: oldQ,
              unit_cost: oldLine.unit_price,
              new_balance: newBal,
              reference_type: 'PRODUCTION_ORDER',
              reference_id: id,
              document_id: id,
              date: today,
              movement_date: today,
              notes: `إرجاع خامات ملغاة من بنود أمر القص ${newCuttingNumber}`,
              created_by: userId,
              created_at: now
            });
          }
        }
      }

      // Update material usages
      await db.production_material_usage.where('production_order_id').equals(id).delete();
      for (let idx = 0; idx < verifiedLines.length; idx++) {
        const line = verifiedLines[idx];
        await db.production_material_usage.add({
          id: `pmu-upd-${Date.now()}-${idx}-${line.material_id}`,
          production_order_id: id,
          raw_material_id: line.material_id,
          standard_quantity: line.quantity,
          actual_quantity: line.quantity,
          unit_cost: line.unit_price,
          total_cost: line.line_cost
        });
      }

      // 2. Finished product delta movement
      const hasVariants = Boolean(product.has_variants || (Array.isArray(product.variants) && product.variants.length > 0));

      if (hasVariants && cleanMatrix) {
        const liveItm = (await db.items.get(productId)) || product;
        const currentVariants = Array.isArray(liveItm.variants) ? [...liveItm.variants] : [];
        const variantMap = new Map();
        currentVariants.forEach((v, idx) => {
          const key = `${v.size}:::${v.color}`;
          variantMap.set(key, idx);
        });

        // Compute old quantities per cell
        const oldMatrix = Array.isArray(existing.matrix) ? existing.matrix : [];
        const oldCellMap = new Map();
        for (const row of oldMatrix) {
          const clr = (row.color || '').trim();
          for (const sz of CUT_ORDER_SIZES) {
            const q = Math.floor(Number(row.quantities?.[sz]) || 0);
            if (q > 0) {
              oldCellMap.set(`${sz}:::${clr}`, q);
            }
          }
        }

        // Compute new quantities per cell
        const newCellMap = new Map();
        for (const row of cleanMatrix) {
          const clr = (row.color || '').trim();
          for (const sz of CUT_ORDER_SIZES) {
            const q = Math.floor(Number(row.quantities?.[sz]) || 0);
            if (q > 0) {
              newCellMap.set(`${sz}:::${clr}`, q);
            }
          }
        }

        const allKeys = new Set([...oldCellMap.keys(), ...newCellMap.keys()]);
        for (const key of allKeys) {
          const [sz, clr] = key.split(':::');
          const oldQ = oldCellMap.get(key) || 0;
          const newQ = newCellMap.get(key) || 0;
          const diff = newQ - oldQ;
          if (diff === 0) continue;

          let vIdx = variantMap.get(key);
          let varId;
          let currentVarStock = 0;
          if (vIdx !== undefined) {
            varId = currentVariants[vIdx].id;
            currentVarStock = Number(currentVariants[vIdx].current_stock) || 0;
          }

          // Requirement 4.5: Block matrix change if stock would become negative
          if (diff < 0 && (currentVarStock + diff < 0)) {
            throw new Error(`لا يمكن تخفيض كمية المقاس (${sz}) واللون (${clr}) بمقدار (${Math.abs(diff)}) قطعة، لأن الرصيد المتوفر بالمخزن حالياً هو (${currentVarStock}) قطعة فقط (تم بيع أو صرف قطع منها).`);
          }

          if (vIdx === undefined) {
            varId = `var-${liveItm.code || liveItm.id}-${sz}-${clr}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const newVar = {
              id: varId,
              size: sz,
              color: clr,
              sku: `${liveItm.code || 'PRD'}-${sz}-${clr}`,
              opening_balance: 0,
              current_stock: Math.max(0, diff)
            };
            currentVariants.push(newVar);
            variantMap.set(key, currentVariants.length - 1);
          } else {
            currentVariants[vIdx].current_stock = Number((currentVarStock + diff).toFixed(3));
          }

          await db.stock_movements.add({
            id: `sm-fin-adj-${Date.now()}-${productId}-${sz}-${clr}-${Math.floor(Math.random() * 1000)}`,
            item_id: productId,
            material_id: productId,
            variant_id: varId,
            location_id: data.location_id || 'loc-main',
            movement_type: diff > 0 ? 'production_in' : 'production_out',
            direction: diff > 0 ? 'in' : 'out',
            quantity: Math.abs(diff),
            quantity_change: diff,
            unit_cost: unitCost4Decimals,
            reference_type: 'PRODUCTION_ORDER',
            reference_id: id,
            document_id: id,
            date: today,
            movement_date: today,
            notes: diff > 0
              ? `استلام منتج تام إضافي [${sz} / ${clr}] لتعديل أمر القص ${newCuttingNumber}`
              : `تخفيض كمية استلام منتج تام [${sz} / ${clr}] لتعديل أمر القص ${newCuttingNumber}`,
            created_by: userId,
            created_at: now
          });
        }

        const newTotalStock = currentVariants.reduce((sum, v) => sum + (Number(v.current_stock) || 0), 0);
        await db.items.update(productId, { variants: currentVariants, current_stock: newTotalStock });
        const liveProd = await db.products.get(productId);
        if (liveProd) {
          await db.products.update(productId, { variants: currentVariants, current_stock: newTotalStock });
        }
      } else {
        // Product has variants OFF: simple batch quantity delta
        const diffBatchQty = newBatchQty - oldBatchQty;
        if (diffBatchQty !== 0) {
          const finishedItm = await db.items.get(productId);
          const curBal = Number(finishedItm?.current_stock) || 0;
          if (diffBatchQty < 0 && curBal + diffBatchQty < 0) {
            throw new Error(`لا يمكن تخفيض كمية أمر القص بمقدار (${Math.abs(diffBatchQty)}) قطعة لأن الرصيد المتوفر بالمخزن (${curBal}) غير كافٍ.`);
          }
          if (finishedItm) {
            const newProdStock = Number((curBal + diffBatchQty).toFixed(3));
            await db.items.update(finishedItm.id, { current_stock: newProdStock });
          }
          const finishedProd = await db.products.get(productId);
          if (finishedProd) {
            const newProdStock = Number(((Number(finishedProd.current_stock) || 0) + diffBatchQty).toFixed(3));
            await db.products.update(finishedProd.id, { current_stock: newProdStock });
          }

          await db.stock_movements.add({
            id: `sm-fin-adj-${Date.now()}-${productId}`,
            item_id: productId,
            material_id: productId,
            variant_id: null,
            location_id: data.location_id || 'loc-main',
            movement_type: diffBatchQty > 0 ? 'production_in' : 'production_out',
            direction: diffBatchQty > 0 ? 'in' : 'out',
            quantity: Math.abs(diffBatchQty),
            quantity_change: diffBatchQty,
            unit_cost: unitCost4Decimals,
            reference_type: 'PRODUCTION_ORDER',
            reference_id: id,
            document_id: id,
            date: today,
            movement_date: today,
            notes: diffBatchQty > 0
              ? `استلام منتج تام إضافي لتعديل أمر القص ${newCuttingNumber}`
              : `تخفيض كمية استلام منتج تام لتعديل أمر القص ${newCuttingNumber}`,
            created_by: userId,
            created_at: now
          });
        }
      }

      // 3. Update Order Record
      const legacyColor = finalMatrix && finalMatrix.length > 0
        ? finalMatrix.map(r => r.color).join(' / ')
        : (data.color !== undefined ? data.color : existing.color);

      const legacySizesMap = finalMatrix && finalMatrix.length > 0
        ? computeColumnTotals(finalMatrix)
        : (data.size_quantities !== undefined 
            ? (typeof data.size_quantities === 'object' ? data.size_quantities : JSON.parse(data.size_quantities || '{}'))
            : (typeof existing.size_quantities === 'object' ? existing.size_quantities : JSON.parse(existing.size_quantities || '{}')));

      const sizeQuantities = JSON.stringify(legacySizesMap);

      const updatedRecord = {
        ...existing,
        cutting_number: newCuttingNumber,
        order_number: newCuttingNumber,
        cutting_name: data.cutting_name !== undefined ? data.cutting_name : existing.cutting_name,
        fabric_type: data.fabric_type !== undefined ? data.fabric_type : existing.fabric_type,
        color: legacyColor,
        cutouts_1: data.cutouts_1 !== undefined ? data.cutouts_1 : existing.cutouts_1,
        cutouts_2: data.cutouts_2 !== undefined ? data.cutouts_2 : existing.cutouts_2,
        sizes: data.sizes !== undefined ? data.sizes : existing.sizes,
        quantity_per_size: sizeQuantities,
        size_quantities: sizeQuantities,
        matrix: finalMatrix,
        matrix_cell_costs: matrixCellCosts.length > 0 ? matrixCellCosts : (existing.matrix_cell_costs || []),
        size_costs: sizeCosts,
        color_costs: colorCosts,
        cutting_comment: data.cutting_comment !== undefined ? data.cutting_comment : existing.cutting_comment,
        stages,
        total_stages_cost: totalStagesCost,
        // Legacy fields for backward compatibility
        printing_vendor: stages.printing.vendor_name,
        printing_vendor_id: stages.printing.vendor_id,
        printing_notes: stages.printing.notes,
        total_printing_cost: stages.printing.total_cost,
        embroidery_vendor: stages.embroidery.vendor_name,
        embroidery_vendor_id: stages.embroidery.vendor_id,
        embroidery_notes: stages.embroidery.notes,
        processing_vendor: stages.sewing.vendor_name,
        processing_vendor_id: stages.sewing.vendor_id,
        processing_notes: stages.sewing.notes,
        batch_quantity: newBatchQty,
        materials_lines: verifiedLines.map(l => ({
          material_id: l.material_id,
          name: l.name,
          code: l.code,
          unit: l.unit,
          quantity: l.quantity,
          unit_price: l.unit_price,
          line_cost: l.line_cost,
          current_stock: l.current_stock
        })),
        additional_costs: additionalCosts,
        total_material_cost: totalMaterialsCost,
        total_additional_cost: totalAdditionalCosts,
        total_product_cost: totalProductCost,
        unit_cost: unitCost4Decimals,
        unit_cost_exact: unitCostExact,
        total_stage1_cost: totalProductCost,
        unit_stage1_cost: unitCost4Decimals,
        notes: data.notes !== undefined ? data.notes : existing.notes,
        updated_at: now
      };

      if (existing.status === 'closed' && data.edit_reason) {
        updatedRecord.last_edit_closed_reason = data.edit_reason;
        updatedRecord.last_edit_closed_at = now;
      }

      await db.production_orders.update(id, updatedRecord);
    });

    // Save audit log with old and new values (Requirement 4.2)
    await auditRepo.log(userId, 'UPDATE_PRODUCTION_ORDER', 'production_orders', id, existing, {
      cutting_number: newCuttingNumber,
      batch_quantity: newBatchQty,
      total_product_cost: totalProductCost,
      unit_cost: unitCost4Decimals,
      edit_reason: data.edit_reason || null
    });

    return await this.getById(id);
  },

  /**
   * Close Cut Order (Requirement 4.2)
   */
  async closeProductionOrder(id, reason = '', userId = 'usr-production') {
    const existing = await db.production_orders.get(id);
    if (!existing) throw new Error('أمر القص غير موجود');
    if (existing.status === 'closed') throw new Error('أمر القص مقفل بالفعل');

    const now = new Date().toISOString();
    const update = {
      status: 'closed',
      close_reason: reason || 'إقفال نهائي لأمر القص',
      closed_reason: reason || 'إقفال نهائي لأمر القص',
      closed_at: now,
      closed_by: userId
    };

    await db.production_orders.update(id, update);
    await auditRepo.log(userId, 'CLOSE_PRODUCTION_ORDER', 'production_orders', id, existing, update);
    return await this.getById(id);
  },

  /**
   * Add a payment to a stage using the shared supplier payment ledger (Requirement 4.3)
   */
  async addStagePayment(orderId, stageKey, paymentData, userId = 'usr-production') {
    const order = await this.getById(orderId);
    if (!order) throw new Error('أمر القص المطلوب غير موجود');

    const stage = order.stages?.[stageKey];
    if (!stage) throw new Error(`المرحلة المحددة (${stageKey}) غير موجودة`);
    
    let vendorId = stage.vendor_id || paymentData.supplier_id || paymentData.vendor_id;
    if (!vendorId) {
      const stageActivityDefault = {
        printing: 'طباعة',
        embroidery: 'تطريز',
        sewing: 'حياكة'
      };
      const existingVendor = await db.parties.filter(p => p.is_supplier === 1 && (p.service_stage === stageKey || p.supplier_type === 'service' || p.supplier_type === (stageActivityDefault[stageKey] || stageKey))).first();
      if (existingVendor) {
        vendorId = existingVendor.id;
      } else {
        vendorId = `party-ws-${stageKey}-auto`;
        await db.parties.add({
          id: vendorId,
          code: `WS-${stageKey.toUpperCase()}`,
          name: `ورشة ${STAGE_CONFIGS[stageKey]?.title || stageKey} الافتراضية`,
          is_supplier: 1,
          is_customer: 0,
          supplier_type: stageActivityDefault[stageKey] || 'service',
          service_stage: stageKey,
          is_active: 1,
          created_at: new Date().toISOString()
        });
      }
      const curOrder = await db.production_orders.get(orderId);
      if (curOrder && curOrder.stages?.[stageKey]) {
        curOrder.stages[stageKey].vendor_id = vendorId;
        await db.production_orders.update(orderId, { stages: curOrder.stages });
      }
    }

    const amount = Number(paymentData.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('مبلغ الدفعة يجب أن يكون رقماً أكبر من صفر');
    }

    const remaining = Number(stage.remaining) || 0;
    if (amount > remaining) {
      throw new Error(`مبلغ الدفعة (${amount} ج.م) لا يمكن أن يتجاوز المبلغ المتبقي لمرحلة ${STAGE_CONFIGS[stageKey]?.title} (${remaining} ج.م)`);
    }

    // Call cashRepo.recordSupplierPayment to reduce treasury and supplier balance in shared ledger
    const res = await cashRepo.recordSupplierPayment({
      supplier_id: vendorId,
      amount,
      payment_date: paymentData.payment_date || new Date().toISOString().split('T')[0],
      payment_method: paymentData.payment_method || 'نقداً',
      account_id: paymentData.account_id,
      notes: paymentData.notes || `دفعة مرحلة ${STAGE_CONFIGS[stageKey]?.title} لأمر القص ${order.cutting_number}`,
      production_order_id: orderId,
      stage_type: stageKey,
      max_allowed: remaining
    }, userId);

    return res;
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
    if (!db.overheads) return [];
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
  },

  // Legacy printing payments helpers for backward compatibility
  async getPrintingPayments(productionOrderId) {
    if (!productionOrderId) return { payments: [], totalPaid: 0, totalPrintingCost: 0, remainingBalance: 0 };
    const order = await this.getById(productionOrderId);
    if (!order) return { payments: [], totalPaid: 0, totalPrintingCost: 0, remainingBalance: 0 };

    const printingStage = order.stages?.printing;
    return {
      payments: printingStage?.payments || [],
      totalPrintingCost: printingStage?.total_cost || 0,
      totalPaid: printingStage?.paid || 0,
      remainingBalance: printingStage?.remaining || 0
    };
  },

  async addPrintingPayment(data, userId = 'usr-production') {
    return await this.addStagePayment(data.production_order_id, 'printing', data, userId);
  },

  async updatePrintingPayment(id, data, userId = 'usr-production') {
    const existing = await db.payments.get(id);
    if (existing) {
      const updateFields = {};
      if (data.notes !== undefined) updateFields.notes = data.notes;
      if (data.amount !== undefined) updateFields.amount = Number(data.amount);
      await db.payments.update(id, updateFields);
      return { ...existing, ...data };
    }
    const leg = await db.cutting_printing_payments.get(id);
    if (!leg) throw new Error('دفعة المطبعة غير موجودة');
    await db.cutting_printing_payments.update(id, data);
    return { ...leg, ...data };
  },

  async deletePrintingPayment(id, userId = 'usr-production') {
    const p = await db.payments.get(id);
    if (p) {
      await cashRepo.cancelSupplierPayment(id, 'إلغاء دفعة مرحلة من أمر القص', userId).catch(() => {});
      await db.payments.delete(id).catch(() => {});
      return { success: true, id };
    }
    const leg = await db.cutting_printing_payments.get(id);
    if (!leg) throw new Error('دفعة المطبعة غير موجودة');
    await db.cutting_printing_payments.delete(id);
    return { success: true, id };
  }
};

export default manufacturingRepo;
