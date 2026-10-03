/**
 * Workshop ERP - Core Cost Calculation Engine (محرك احتساب التكاليف النقي)
 * Pure TypeScript functions for manufacturing cost calculations with non-negative validation.
 */

export interface Stage1CostParams {
  materialsCost?: number;
  laborCost?: number;
  overheadCost?: number;
  externalCost?: number;
  batchQuantity?: number;
}

export interface Stage1CostResult {
  totalStage1Cost: number;
  unitStage1Cost: number;
}

export interface Stage2CostParams {
  stage1TransferredCost?: number;
  finishingLabor?: number;
  finishingTransport?: number;
  finishingMaterialsCost?: number;
  finishingQuantity?: number;
}

export interface Stage2CostResult {
  totalFinishingStageCost: number;
  finalTotalBatchCost: number;
  finalUnitCost: number;
}

export interface LaborCostParams {
  hours?: number;
  hourlyRate?: number;
  pieceRate?: number;
  batchQty?: number;
}

export class CostCalculator {
  /**
   * 1. Weighted Average Cost for Raw Materials (متوسط التكلفة المرجح للخامات)
   * Formula: ((oldStock * oldAvgCost) + (receivedQty * receivedUnitCost)) / (oldStock + receivedQty)
   */
  static calculateWeightedAverageCost(
    oldStock: number,
    oldAvgCost: number,
    receivedQty: number,
    receivedUnitCost: number
  ): number {
    const sOld = Math.max(0, Number(oldStock) || 0);
    const cOld = Math.max(0, Number(oldAvgCost) || 0);
    const qNew = Math.max(0, Number(receivedQty) || 0);
    const cNew = Math.max(0, Number(receivedUnitCost) || 0);

    const totalQty = sOld + qNew;
    if (totalQty <= 0) return 0;

    const totalValue = (sOld * cOld) + (qNew * cNew);
    const newAverage = totalValue / totalQty;
    return Number(newAverage.toFixed(4));
  }

  /**
   * 2. Standard Material Usage from BOM with Waste (استهلاك الخامات حسب شجرة المنتج ونسبة الهالك)
   * Formula: batchQty * bomQtyPerUnit * (1 + wastePercent / 100)
   */
  static calculateStandardMaterialUsage(
    batchQty: number,
    bomQtyPerUnit: number,
    wastePercent: number = 0
  ): number {
    const bQty = Math.max(0, Number(batchQty) || 0);
    const unitQty = Math.max(0, Number(bomQtyPerUnit) || 0);
    const waste = Math.max(0, Number(wastePercent) || 0);

    const multiplier = 1 + (waste / 100);
    const totalRequired = bQty * unitQty * multiplier;
    return Number(totalRequired.toFixed(3));
  }

  /**
   * 3. Labor Cost for Batch (أجور العمالة بالدفعة)
   * Hourly: hours * hourlyRate
   * Piece-rate: pieceRate * batchQty
   */
  static calculateLaborCost(
    laborType: 'hourly' | 'piece_rate',
    { hours = 0, hourlyRate = 0, pieceRate = 0, batchQty = 0 }: LaborCostParams
  ): number {
    if (laborType === 'hourly') {
      const h = Math.max(0, Number(hours) || 0);
      const rate = Math.max(0, Number(hourlyRate) || 0);
      return Number((h * rate).toFixed(2));
    } else {
      const pRate = Math.max(0, Number(pieceRate) || 0);
      const qty = Math.max(0, Number(batchQty) || 0);
      return Number((pRate * qty).toFixed(2));
    }
  }

  /**
   * 4. Hourly Overhead Rate from Monthly Total (معدل ساعة التشغيل الشهرية)
   * Formula: totalOverhead / estimatedMachineHours
   */
  static calculateHourlyOverheadRate(
    totalOverhead: number,
    estimatedMachineHours: number
  ): number {
    const overhead = Math.max(0, Number(totalOverhead) || 0);
    const hours = Math.max(0, Number(estimatedMachineHours) || 0);
    if (hours <= 0) return 0;
    return Number((overhead / hours).toFixed(4));
  }

  /**
   * 5. Allocated Factory Overhead (نصيب الدفعة من مصاريف التشغيل الشهرية)
   * Formula: machineHours * hourlyOverheadRate
   */
  static calculateAllocatedOverhead(
    machineHours: number,
    hourlyOverheadRate: number
  ): number {
    const mHours = Math.max(0, Number(machineHours) || 0);
    const rate = Math.max(0, Number(hourlyOverheadRate) || 0);
    return Number((mHours * rate).toFixed(2));
  }

  /**
   * 6. Stage 1 Manufacturing Cost (إجمالي وتكلفة الوحدة لمرحلة التصنيع 1)
   * Total = Materials + Labor + Overhead + External
   * Unit = Total / batchQuantity
   */
  static calculateStage1Cost({
    materialsCost = 0,
    laborCost = 0,
    overheadCost = 0,
    externalCost = 0,
    batchQuantity = 1
  }: Stage1CostParams): Stage1CostResult {
    const mat = Math.max(0, Number(materialsCost) || 0);
    const lab = Math.max(0, Number(laborCost) || 0);
    const ovh = Math.max(0, Number(overheadCost) || 0);
    const ext = Math.max(0, Number(externalCost) || 0);
    const qty = Math.max(1, Number(batchQuantity) || 1);

    const totalStage1Cost = Number((mat + lab + ovh + ext).toFixed(2));
    const unitStage1Cost = Number((totalStage1Cost / qty).toFixed(4));

    return {
      totalStage1Cost,
      unitStage1Cost
    };
  }

  /**
   * 7. Stage 2 Finishing & Cumulative Cost (المرحلة 2: التشطيب والتكلفة النهائية التراكمية)
   * Stage 2 Total = Finishing Labor + Finishing Transport + Finishing Materials
   * Cumulative Total = Stage 1 Transferred + Stage 2 Total
   * Final Unit Cost = Cumulative Total / finishingQuantity
   */
  static calculateStage2Cost({
    stage1TransferredCost = 0,
    finishingLabor = 0,
    finishingTransport = 0,
    finishingMaterialsCost = 0,
    finishingQuantity = 1
  }: Stage2CostParams): Stage2CostResult {
    const s1 = Math.max(0, Number(stage1TransferredCost) || 0);
    const fl = Math.max(0, Number(finishingLabor) || 0);
    const ft = Math.max(0, Number(finishingTransport) || 0);
    const fm = Math.max(0, Number(finishingMaterialsCost) || 0);
    const qty = Math.max(1, Number(finishingQuantity) || 1);

    const totalFinishingStageCost = Number((fl + ft + fm).toFixed(2));
    const finalTotalBatchCost = Number((s1 + totalFinishingStageCost).toFixed(2));
    const finalUnitCost = Number((finalTotalBatchCost / qty).toFixed(4));

    return {
      totalFinishingStageCost,
      finalTotalBatchCost,
      finalUnitCost
    };
  }

  /**
   * 8. Suggested Selling Price (سعر البيع المقترح بهامش الربح)
   * Formula: finalUnitCost * (1 + targetProfitMarginPercent / 100)
   */
  static calculateSuggestedPrice(
    finalUnitCost: number,
    targetProfitMarginPercent: number = 30
  ): number {
    const cost = Math.max(0, Number(finalUnitCost) || 0);
    const margin = Math.max(0, Number(targetProfitMarginPercent) || 0);
    const suggestedPrice = cost * (1 + (margin / 100));
    return Number(suggestedPrice.toFixed(2));
  }

  /**
   * 9. Net Profit Calculation for Sale (صافي الربح الحقيقي للصفقة)
   * Net Profit = Selling Subtotal - COGS - Selling Expenses (Shipping + Customs + Commission)
   */
  static calculateNetProfit(
    sellingSubtotal: number,
    cogs: number,
    sellingExpenses: number = 0
  ): number {
    const rev = Number(sellingSubtotal) || 0;
    const cost = Math.max(0, Number(cogs) || 0);
    const exp = Math.max(0, Number(sellingExpenses) || 0);

    const netProfit = rev - cost - exp;
    return Number(netProfit.toFixed(2));
  }
}

export default CostCalculator;
