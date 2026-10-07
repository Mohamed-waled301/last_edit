/**
 * Workshop ERP - Core Cost Calculation Engine (محرك احتساب التكاليف النقي)
 * Pure TypeScript functions for manufacturing cost calculations with non-negative validation.
 * Optimized for Clothing Factory operations: fabric waste, clothing stages, and outsourced manufacturing.
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

export interface ClothingBOMItem {
  quantity_per_unit: number;
  unit_cost: number;
  waste_percent?: number;
}

export interface ClothingStageCosts {
  cuttingLabor?: number;
  sewingLabor?: number;
  ironingPackingLabor?: number;
  internalOverhead?: number;
}

export interface OutsourcedStageParams {
  internalStageCost: number;
  serviceRate: number; // سعر خدمة المصنع الخارجي للقطعة
  batchQuantity: number;
  transportCost?: number;
  additionalMaterialsCost?: number;
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
   * 2. Standard Material Usage from BOM with Fabric Waste Percentage
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
   * 2b. Calculate Clothing BOM Total Cost with Fabric Waste
   */
  static calculateClothingBOMCost(items: ClothingBOMItem[] = []): number {
    let total = 0;
    for (const it of items) {
      const q = Math.max(0, Number(it.quantity_per_unit) || 0);
      const c = Math.max(0, Number(it.unit_cost) || 0);
      const w = Math.max(0, Number(it.waste_percent) || 0);
      const effectiveQty = q * (1 + (w / 100));
      total += effectiveQty * c;
    }
    return Number(total.toFixed(2));
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
   * 3b. Clothing Stages Labor Cost (قص -> خياطة -> كي وتعبئة)
   */
  static calculateClothingInternalStagesCost(
    materialsCost: number,
    stages: ClothingStageCosts,
    batchQty: number = 1
  ): { totalInternalCost: number; unitInternalCost: number } {
    const mat = Math.max(0, Number(materialsCost) || 0);
    const cut = Math.max(0, Number(stages.cuttingLabor) || 0);
    const sew = Math.max(0, Number(stages.sewingLabor) || 0);
    const iron = Math.max(0, Number(stages.ironingPackingLabor) || 0);
    const ovh = Math.max(0, Number(stages.internalOverhead) || 0);
    const qty = Math.max(1, Number(batchQty) || 1);

    const totalInternalCost = Number((mat + cut + sew + iron + ovh).toFixed(2));
    const unitInternalCost = Number((totalInternalCost / qty).toFixed(4));
    return { totalInternalCost, unitInternalCost };
  }

  /**
   * 4. Hourly Overhead Rate from Monthly Total
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
   * 5. Allocated Factory Overhead
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
   * 6. Stage 1 Manufacturing Cost (مرحلة التصنيع الداخلية)
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
   * 7. Stage 2 Outsourced / Finishing Cumulative Cost (التصنيع لدى الغير - التكلفة التراكمية)
   * Formula: Internal Stage Cost + Outsourced Stage Cost = Final Cost
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
   * 7b. Outsourced Manufacturing Accumulation Helper
   */
  static calculateOutsourcedAccumulation({
    internalStageCost,
    serviceRate,
    batchQuantity,
    transportCost = 0,
    additionalMaterialsCost = 0
  }: OutsourcedStageParams): {
    outsourcedStageCost: number;
    finalTotalCost: number;
    finalUnitCost: number;
  } {
    const internal = Math.max(0, Number(internalStageCost) || 0);
    const qty = Math.max(1, Number(batchQuantity) || 1);
    const rate = Math.max(0, Number(serviceRate) || 0);
    const transport = Math.max(0, Number(transportCost) || 0);
    const materials = Math.max(0, Number(additionalMaterialsCost) || 0);

    const serviceTotal = rate * qty;
    const outsourcedStageCost = Number((serviceTotal + transport + materials).toFixed(2));
    const finalTotalCost = Number((internal + outsourcedStageCost).toFixed(2));
    const finalUnitCost = Number((finalTotalCost / qty).toFixed(4));

    return {
      outsourcedStageCost,
      finalTotalCost,
      finalUnitCost
    };
  }

  /**
   * 8. Suggested Selling Price
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
   * 9. Net Profit Calculation for Sale
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

export function calculateClothingInternalStagesCost(
  cuttingCost: number = 0,
  sewingCost: number = 0,
  ironingPackingCost: number = 0
): number {
  const cut = Math.max(0, Number(cuttingCost) || 0);
  const sew = Math.max(0, Number(sewingCost) || 0);
  const iron = Math.max(0, Number(ironingPackingCost) || 0);
  return Number((cut + sew + iron).toFixed(2));
}

export function calculateOutsourcedAccumulation(
  internalStageCost: number = 0,
  outsourcedStageCost: number = 0
): number {
  const internal = Math.max(0, Number(internalStageCost) || 0);
  const outsourced = Math.max(0, Number(outsourcedStageCost) || 0);
  return Number((internal + outsourced).toFixed(2));
}

export function calculateClothingBOMCost(
  items: ClothingBOMItem[],
  fabricWastePercent: number = 0
): number {
  return CostCalculator.calculateClothingBOMCost(items, fabricWastePercent);
}

export default CostCalculator;
