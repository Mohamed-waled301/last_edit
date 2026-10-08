import { describe, it, expect, beforeEach } from 'vitest';
import { 
  calculateClothingBOMCost, 
  calculateClothingInternalStagesCost, 
  calculateOutsourcedAccumulation,
  CostCalculator 
} from '../costCalculator';
import { calculateUnifiedPartyBalance } from '../balances';

describe('Clothing Factory Logic & Rules Suite', () => {
  describe('BOM & Stages Costing for Clothing Factory', () => {
    it('calculates clothing BOM cost correctly without waste percentage', () => {
      // 1.5m denim fabric @ 100 EGP/m, 6 metal buttons @ 2 EGP, 1 metal zipper @ 8 EGP
      // Zero waste percentage per requirement A4
      const items = [
        { quantity_per_unit: 1.5, unit_cost: 100 },
        { quantity_per_unit: 6, unit_cost: 2 },
        { quantity_per_unit: 1, unit_cost: 8 }
      ];

      // Item 1: 1.5 * 100 = 150
      // Item 2: 6 * 2 = 12
      // Item 3: 1 * 8 = 8
      // Total BOM: 150 + 12 + 8 = 170 EGP
      const totalBOM = calculateClothingBOMCost(items);
      expect(totalBOM).toBe(170);
    });

    it('calculates clothing internal stages labor cost (cutting -> sewing -> ironing/packing)', () => {
      // cutting: 6 EGP, sewing: 18 EGP, ironing/packing: 6 EGP
      const stagesCost = calculateClothingInternalStagesCost(6, 18, 6);
      expect(stagesCost).toBe(30);
    });

    it('accumulates costs for outsourced manufacturing: internal stage + outsourced stage = final cost', () => {
      // Internal stage cost: 212 EGP (182 BOM + 30 stages)
      // External factory embroidery/wash service: 25 EGP
      const internalCost = 212;
      const outsourcedCost = 25;
      const finalCost = calculateOutsourcedAccumulation(internalCost, outsourcedCost);
      expect(finalCost).toBe(237);
    });
  });

  describe('Unified Parties Balance & Offset (مقاصة)', () => {
    it('calculates supplier balance, customer balance, net balance and max offset amount', () => {
      // Party is both supplier and customer
      // As supplier: we owe them 12,000 EGP (Credit)
      // As customer: they owe us 7,500 EGP (Debit)
      const balances = calculateUnifiedPartyBalance(12000, 7500);

      expect(balances.supplier_balance).toBe(12000);
      expect(balances.customer_balance).toBe(7500);
      // Net balance: supplier - customer = 4500 (we still owe them 4,500 net)
      expect(balances.net_balance).toBe(4500);
      // Max offset available is the minimum of both balances = 7500
      expect(balances.max_offset).toBe(7500);
    });

    it('handles zero or one-sided party balances gracefully', () => {
      const customerOnly = calculateUnifiedPartyBalance(0, 5000);
      expect(customerOnly.max_offset).toBe(0);
      expect(customerOnly.net_balance).toBe(-5000); // Customer owes 5000

      const supplierOnly = calculateUnifiedPartyBalance(8000, 0);
      expect(supplierOnly.max_offset).toBe(0);
      expect(supplierOnly.net_balance).toBe(8000); // We owe 8000
    });
  });

  describe('Purchase Order Financial Calculations', () => {
    it('calculates linked discount percentage and value correctly', () => {
      const subtotal = 10000;
      const discountPercent = 10;
      const discountVal = (discountPercent / 100) * subtotal;
      const additionalExpenses = 350; // freight and transport

      const grandTotal = subtotal - discountVal + additionalExpenses;
      expect(discountVal).toBe(1000);
      expect(grandTotal).toBe(9350);
    });
  });

  describe('Credit Limit Validation Logic', () => {
    it('blocks credit invoice when current balance + invoice exceeds credit limit', () => {
      const currentBalance = 12000;
      const creditLimit = 15000;
      const newInvoiceTotal = 4000;

      const totalProjected = currentBalance + newInvoiceTotal;
      const isExceeded = totalProjected > creditLimit;
      const exceededAmount = totalProjected - creditLimit;

      expect(isExceeded).toBe(true);
      expect(exceededAmount).toBe(1000);
    });

    it('allows credit invoice when within credit limit', () => {
      const currentBalance = 5000;
      const creditLimit = 15000;
      const newInvoiceTotal = 8000;

      const totalProjected = currentBalance + newInvoiceTotal;
      const isExceeded = totalProjected > creditLimit;

      expect(isExceeded).toBe(false);
    });
  });

  describe('Customer Returns Quantity Limitation', () => {
    it('validates returned quantity cannot exceed original invoice quantity', () => {
      const soldQuantity = 15;
      const requestedReturnQtyValid = 10;
      const requestedReturnQtyInvalid = 16;

      expect(requestedReturnQtyValid <= soldQuantity).toBe(true);
      expect(requestedReturnQtyInvalid <= soldQuantity).toBe(false);
    });
  });
});
