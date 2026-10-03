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

  it('calculates labor cost for hourly and piece-rate', () => {
    // Hourly: 40 hours @ 50 EGP/hour = 2000 EGP
    const laborHourly = CostCalculator.calculateLaborCost('hourly', { hours: 40, hourlyRate: 50 });
    expect(laborHourly).toBe(2000);

    // Piece rate: 20 pieces @ 75 EGP/piece = 1500 EGP
    const laborPiece = CostCalculator.calculateLaborCost('piece_rate', { pieceRate: 75, batchQty: 20 });
    expect(laborPiece).toBe(1500);
  });

  it('calculates overhead rates and batch allocation', () => {
    // Total overhead 10,000 EGP / 500 estimated machine hours = 20 EGP/hour
    const rate = CostCalculator.calculateHourlyOverheadRate(10000, 500);
    expect(rate).toBe(20);

    // Batch uses 15 machine hours => 15 * 20 = 300 EGP
    const batchOverhead = CostCalculator.calculateAllocatedOverhead(15, rate);
    expect(batchOverhead).toBe(300);
  });

  it('calculates Stage 1 manufacturing cost', () => {
    // Batch of 10 items: Materials: 4000, Labor: 1500, Overhead: 500, External: 0
    // Total = 6000 EGP, Unit = 600 EGP
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
    // 10 items transferred from Stage 1 @ 600 EGP/unit = 6000 EGP
    // Finishing labor: 1200, Transport: 200, Finishing materials: 600
    // Finishing Stage Cost = 2000 EGP
    // Final Total Batch Cost = 8000 EGP
    // Final Unit Cost = 800 EGP/unit
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
    // Final unit cost = 800 EGP, Target profit margin = 35%
    // Suggested price = 800 * 1.35 = 1080 EGP
    const suggestedPrice = CostCalculator.calculateSuggestedPrice(800, 35);
    expect(suggestedPrice).toBe(1080);

    // Sold 10 units @ 1100 EGP = 11,000 EGP subtotal
    // Total COGS = 10 * 800 = 8,000 EGP
    // Selling expenses (shipping 300, commission 200) = 500 EGP
    // Net Profit = 11000 - 8000 - 500 = 2500 EGP
    const netProfit = CostCalculator.calculateNetProfit(11000, 8000, 500);
    expect(netProfit).toBe(2500);
  });
});
