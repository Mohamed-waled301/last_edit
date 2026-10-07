import { describe, it, expect } from 'vitest';
import CostCalculator from '../costCalculator';

describe('CostCalculator - Unit Tests', () => {
  it('calculates weighted average cost correctly', () => {
    // Case 1: Initial stock = 0, receive 10 units @ 100 EGP => avg = 100
    const r1 = CostCalculator.calculateWeightedAverageCost(0, 0, 10, 100);
    expect(r1).toBe(100);

    // Case 2: Stock = 10 @ 100 EGP, receive 10 units @ 150 EGP => (1000 + 1500) / 20 = 125 EGP
    const r2 = CostCalculator.calculateWeightedAverageCost(10, 100, 10, 150);
    expect(r2).toBe(125);

    // Case 3: Stock = 20 @ 125 EGP, receive 5 units @ 200 EGP => (2500 + 1000) / 25 = 140 EGP
    const r3 = CostCalculator.calculateWeightedAverageCost(20, 125, 5, 200);
    expect(r3).toBe(140);

    // Case 4: Non-negative protection
    const r4 = CostCalculator.calculateWeightedAverageCost(-5, -100, 10, 50);
    expect(r4).toBe(50);
  });

  it('calculates standard BOM material usage with waste percentage', () => {
    // 10 units batch, 2 meters per unit, 10% waste => 10 * 2 * 1.10 = 22 meters
    const usage1 = CostCalculator.calculateStandardMaterialUsage(10, 2, 10);
    expect(usage1).toBe(22);

    // 5 units batch, 0.5 sheets per unit, 0% waste => 2.5 sheets
    const usage2 = CostCalculator.calculateStandardMaterialUsage(5, 0.5, 0);
    expect(usage2).toBe(2.5);
  });

  it('calculates clothing BOM cost including fabric waste percentage', () => {
    // Fabric: 1.5m @ 120 EGP with 8% waste = 1.5 * 1.08 * 120 = 194.4
    // Buttons: 6 pcs @ 2 EGP with 0% waste = 12.0
    // Thread: 0.1 spool @ 30 EGP with 0% waste = 3.0
    // Total = 194.4 + 12 + 3 = 209.4 EGP
    const bomCost = CostCalculator.calculateClothingBOMCost([
      { quantity_per_unit: 1.5, unit_cost: 120, waste_percent: 8 },
      { quantity_per_unit: 6, unit_cost: 2, waste_percent: 0 },
      { quantity_per_unit: 0.1, unit_cost: 30, waste_percent: 0 },
    ]);
    expect(bomCost).toBe(209.4);
  });

  it('calculates clothing internal stages: cutting, sewing, and ironing/packing', () => {
    // Batch of 100 pieces
    // Materials: 10,000
    // Cutting: 1,500, Sewing: 4,000, Ironing/Packing: 1,000, Overhead: 1,500
    // Total = 18,000 EGP, Unit = 180 EGP
    const internal = CostCalculator.calculateClothingInternalStagesCost(
      10000,
      { cuttingLabor: 1500, sewingLabor: 4000, ironingPackingLabor: 1000, internalOverhead: 1500 },
      100
    );
    expect(internal.totalInternalCost).toBe(18000);
    expect(internal.unitInternalCost).toBe(180);
  });

  it('calculates outsourced manufacturing cumulative cost', () => {
    // Internal stage: 100 pieces @ 180 EGP = 18,000 EGP
    // External embroidery/wash factory: 25 EGP/piece * 100 = 2,500 EGP
    // Transport: 300 EGP, Extra materials: 200 EGP
    // Outsourced stage cost = 3,000 EGP
    // Final total = 21,000 EGP, Unit = 210 EGP
    const result = CostCalculator.calculateOutsourcedAccumulation({
      internalStageCost: 18000,
      serviceRate: 25,
      batchQuantity: 100,
      transportCost: 300,
      additionalMaterialsCost: 200,
    });

    expect(result.outsourcedStageCost).toBe(3000);
    expect(result.finalTotalCost).toBe(21000);
    expect(result.finalUnitCost).toBe(210);
  });

  it('calculates labor cost for hourly and piece-rate', () => {
    const laborHourly = CostCalculator.calculateLaborCost('hourly', { hours: 40, hourlyRate: 50 });
    expect(laborHourly).toBe(2000);

    const laborPiece = CostCalculator.calculateLaborCost('piece_rate', { pieceRate: 75, batchQty: 20 });
    expect(laborPiece).toBe(1500);
  });

  it('calculates overhead rates and batch allocation', () => {
    const rate = CostCalculator.calculateHourlyOverheadRate(10000, 500);
    expect(rate).toBe(20);

    const batchOverhead = CostCalculator.calculateAllocatedOverhead(15, rate);
    expect(batchOverhead).toBe(300);
  });

  it('calculates Stage 1 manufacturing cost', () => {
    const stage1 = CostCalculator.calculateStage1Cost({
      materialsCost: 4000,
      laborCost: 1500,
      overheadCost: 500,
      externalCost: 0,
      batchQuantity: 10
    });

    expect(stage1.totalStage1Cost).toBe(6000);
    expect(stage1.unitStage1Cost).toBe(600);
  });

  it('calculates Stage 2 finishing and cumulative unit cost', () => {
    const stage2 = CostCalculator.calculateStage2Cost({
      stage1TransferredCost: 6000,
      finishingLabor: 1200,
      finishingTransport: 200,
      finishingMaterialsCost: 600,
      finishingQuantity: 10
    });

    expect(stage2.totalFinishingStageCost).toBe(2000);
    expect(stage2.finalTotalBatchCost).toBe(8000);
    expect(stage2.finalUnitCost).toBe(800);
  });

  it('calculates suggested price with profit margin and net profit', () => {
    const suggestedPrice = CostCalculator.calculateSuggestedPrice(800, 35);
    expect(suggestedPrice).toBe(1080);

    const netProfit = CostCalculator.calculateNetProfit(11000, 8000, 500);
    expect(netProfit).toBe(2500);
  });
});
