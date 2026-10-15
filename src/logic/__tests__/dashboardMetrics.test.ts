import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeTreasuryBalance,
  computeSupplierDebts,
  computeCustomerReceivables,
  computeMonthlyProfit,
  computeLowStockAlerts,
  getDashboardMetrics,
} from '../dashboardMetrics';
import { toPiasters, fromPiasters } from '../../utils/money';

describe('Part B: Dashboard Metrics & Selectors Single Source of Truth', () => {
  const currentMonth = '2026-10';

  describe('1. Scenario Event Unit Tests', () => {
    it('initial state produces exact expected KPI values', () => {
      const accounts = [{ id: 'trs-1', name: 'الخزينة', opening_balance: 5000, is_active: 1 }];
      const trs = computeTreasuryBalance(accounts, []);
      expect(trs.total).toBe(5000);

      const sup = computeSupplierDebts([], [], [], [], [], [], [], []);
      expect(sup.total).toBe(0);

      const cust = computeCustomerReceivables([], [], [], [], [], []);
      expect(cust.total).toBe(0);

      const profit = computeMonthlyProfit([], [], [], currentMonth);
      expect(profit.netProfit).toBe(0);

      const alerts = computeLowStockAlerts([], [], []);
      expect(alerts.count).toBe(0);
    });

    it('cash purchase of 500 lowers treasury by 500 and changes nothing else', () => {
      const accounts = [{ id: 'trs-1', name: 'الخزينة', opening_balance: 5000, is_active: 1 }];
      const cashTxs = [
        { id: 'tx-1', account_id: 'trs-1', tx_type: 'outflow', category: 'purchase_orders', amount: 500, status: 'posted' }
      ];
      const supplierInvoices = [
        { id: 'sinv-1', supplier_id: 'sup-1', payment_terms: 'cash', total_amount: 500, status: 'paid' }
      ];

      const trs = computeTreasuryBalance(accounts, cashTxs);
      expect(trs.total).toBe(4500);

      const sup = computeSupplierDebts([], [{ id: 'sup-1', name: 'مورد أ', is_active: 1 }], supplierInvoices, [], [], [], [], []);
      expect(sup.total).toBe(0); // Cash purchase does not create debt

      const cust = computeCustomerReceivables([], [], [], [], [], []);
      expect(cust.total).toBe(0);

      const profit = computeMonthlyProfit([], [], cashTxs, currentMonth);
      expect(profit.netProfit).toBe(0); // Purchases are not operating expenses
    });

    it('credit purchase of 500 raises supplier debts by 500 without affecting treasury or profit', () => {
      const accounts = [{ id: 'trs-1', name: 'الخزينة', opening_balance: 5000, is_active: 1 }];
      const supplierInvoices = [
        { id: 'sinv-2', supplier_id: 'sup-1', payment_terms: 'credit', total_amount: 500, status: 'unpaid' }
      ];

      const trs = computeTreasuryBalance(accounts, []);
      expect(trs.total).toBe(5000);

      const sup = computeSupplierDebts([], [{ id: 'sup-1', name: 'مورد أ', is_active: 1 }], supplierInvoices, [], [], [], [], []);
      expect(sup.total).toBe(500);

      const profit = computeMonthlyProfit([], [], [], currentMonth);
      expect(profit.netProfit).toBe(0);
    });

    it('paying 200 to supplier lowers both supplier debt and treasury by 200', () => {
      const accounts = [{ id: 'trs-1', name: 'الخزينة', opening_balance: 5000, is_active: 1 }];
      const cashTxs = [
        { id: 'tx-pay-1', account_id: 'trs-1', tx_type: 'outflow', category: 'supplier_payment', amount: 200, status: 'posted' }
      ];
      const supplierInvoices = [
        { id: 'sinv-2', supplier_id: 'sup-1', payment_terms: 'credit', total_amount: 500, status: 'partially_paid' }
      ];
      const payments = [
        { id: 'pay-1', supplier_id: 'sup-1', amount: 200, status: 'issued' }
      ];

      const trs = computeTreasuryBalance(accounts, cashTxs);
      expect(trs.total).toBe(4800);

      const sup = computeSupplierDebts([], [{ id: 'sup-1', name: 'مورد أ', is_active: 1 }], supplierInvoices, [], payments, [], [], []);
      expect(sup.total).toBe(300); // 500 - 200 = 300
    });

    it('a cash sale raises treasury and profit', () => {
      const accounts = [{ id: 'trs-1', name: 'الخزينة', opening_balance: 5000, is_active: 1 }];
      const cashTxs = [
        { id: 'tx-sale-1', account_id: 'trs-1', tx_type: 'inflow', category: 'sales_invoices', amount: 1000, status: 'posted' }
      ];
      const salesInvoices = [
        {
          id: 'sls-1',
          customer_id: 'cust-1',
          payment_terms: 'cash',
          subtotal: 1000,
          total_invoice_amount: 1000,
          total_cogs: 600,
          invoice_date: '2026-10-10',
          status: 'paid',
        }
      ];

      const trs = computeTreasuryBalance(accounts, cashTxs);
      expect(trs.total).toBe(6000);

      const profit = computeMonthlyProfit(salesInvoices, [], cashTxs, currentMonth);
      expect(profit.netSales).toBe(1000);
      expect(profit.cogs).toBe(600);
      expect(profit.netProfit).toBe(400); // 1000 - 600 = 400

      const cust = computeCustomerReceivables([], [{ id: 'cust-1', name: 'عميل أ', is_active: 1 }], salesInvoices, [], [], []);
      expect(cust.total).toBe(0); // Cash sale does not create receivables
    });

    it('a credit sale raises customer receivables and profit without touching treasury', () => {
      const accounts = [{ id: 'trs-1', name: 'الخزينة', opening_balance: 5000, is_active: 1 }];
      const salesInvoices = [
        {
          id: 'sls-2',
          customer_id: 'cust-1',
          payment_terms: 'credit',
          subtotal: 1200,
          total_invoice_amount: 1200,
          total_cogs: 700,
          invoice_date: '2026-10-12',
          status: 'unpaid',
        }
      ];

      const trs = computeTreasuryBalance(accounts, []);
      expect(trs.total).toBe(5000); // Unchanged

      const cust = computeCustomerReceivables([], [{ id: 'cust-1', name: 'عميل أ', is_active: 1 }], salesInvoices, [], [], []);
      expect(cust.total).toBe(1200);

      const profit = computeMonthlyProfit(salesInvoices, [], [], currentMonth);
      expect(profit.netProfit).toBe(500); // 1200 - 700 = 500
    });

    it('a customer receipt lowers receivables and raises treasury', () => {
      const accounts = [{ id: 'trs-1', name: 'الخزينة', opening_balance: 5000, is_active: 1 }];
      const cashTxs = [
        { id: 'tx-rec-1', account_id: 'trs-1', tx_type: 'inflow', category: 'customer_payment', amount: 500, status: 'posted' }
      ];
      const salesInvoices = [
        {
          id: 'sls-2',
          customer_id: 'cust-1',
          payment_terms: 'credit',
          subtotal: 1200,
          total_invoice_amount: 1200,
          total_cogs: 700,
          invoice_date: '2026-10-12',
          status: 'partially_paid',
        }
      ];
      const customerPayments = [
        { id: 'cpay-1', customer_id: 'cust-1', amount: 500, status: 'posted' }
      ];

      const trs = computeTreasuryBalance(accounts, cashTxs);
      expect(trs.total).toBe(5500);

      const cust = computeCustomerReceivables([], [{ id: 'cust-1', name: 'عميل أ', is_active: 1 }], salesInvoices, customerPayments, [], []);
      expect(cust.total).toBe(700); // 1200 - 500 = 700
    });

    it('cash disbursements by expense code lower treasury and lower monthly profit', () => {
      const accounts = [{ id: 'trs-1', name: 'الخزينة', opening_balance: 5000, is_active: 1 }];
      const cashTxs = [
        {
          id: 'tx-exp-1',
          account_id: 'trs-1',
          tx_type: 'outflow',
          category: 'disbursement',
          amount: 300,
          tx_date: '2026-10-15',
          status: 'posted'
        }
      ];
      const salesInvoices = [
        {
          id: 'sls-1',
          subtotal: 1000,
          total_invoice_amount: 1000,
          total_cogs: 600,
          invoice_date: '2026-10-10',
          status: 'paid',
        }
      ];

      const trs = computeTreasuryBalance(accounts, cashTxs);
      expect(trs.total).toBe(4700);

      const profit = computeMonthlyProfit(salesInvoices, [], cashTxs, currentMonth);
      expect(profit.netSales).toBe(1000);
      expect(profit.cogs).toBe(600);
      expect(profit.operatingExpenses).toBe(300);
      expect(profit.netProfit).toBe(100); // 1000 - 600 - 300 = 100
    });

    it('cut order stage costs and payments update supplier debt and treasury in cutting edition', () => {
      const accounts = [{ id: 'trs-1', name: 'الخزينة', opening_balance: 5000, is_active: 1 }];
      const cashTxs = [
        { id: 'tx-stage-1', account_id: 'trs-1', tx_type: 'outflow', category: 'stage_payment', amount: 150, status: 'posted' }
      ];
      const cutOrders = [
        {
          id: 'co-1',
          order_number: 'CUT-001',
          status: 'in_production',
          stages: {
            embroidery: {
              vendor_id: 'sup-emb-1',
              vendor_name: 'ورشة تطريز النصر',
              total_cost: 400
            }
          }
        }
      ];
      const payments = [
        { id: 'pay-st-1', supplier_id: 'sup-emb-1', amount: 150, production_order_id: 'co-1', stage_type: 'embroidery', status: 'issued' }
      ];

      const trs = computeTreasuryBalance(accounts, cashTxs);
      expect(trs.total).toBe(4850);

      const sup = computeSupplierDebts(
        [],
        [{ id: 'sup-emb-1', name: 'ورشة تطريز النصر', is_active: 1 }],
        [],
        [],
        payments,
        [],
        cutOrders,
        [],
        { includeCutting: true }
      );
      expect(sup.total).toBe(250); // 400 - 150 = 250
    });

    it('cancelling any document restores KPI values to the previous figures', () => {
      const accounts = [{ id: 'trs-1', name: 'الخزينة', opening_balance: 5000, is_active: 1 }];

      // Case 1: Cancelled invoice
      const activeInvoices = [
        { id: 'sinv-1', supplier_id: 'sup-1', payment_terms: 'credit', total_amount: 500, status: 'unpaid' }
      ];
      const cancelledInvoices = [
        { id: 'sinv-1', supplier_id: 'sup-1', payment_terms: 'credit', total_amount: 500, status: 'cancelled' }
      ];

      const activeSup = computeSupplierDebts([], [{ id: 'sup-1', name: 'مورد', is_active: 1 }], activeInvoices, [], [], [], [], []);
      expect(activeSup.total).toBe(500);

      const cancelledSup = computeSupplierDebts([], [{ id: 'sup-1', name: 'مورد', is_active: 1 }], cancelledInvoices, [], [], [], [], []);
      expect(cancelledSup.total).toBe(0);

      // Case 2: Cancelled cash transaction
      const activeCashTxs = [
        { id: 'tx-1', account_id: 'trs-1', tx_type: 'outflow', amount: 500, status: 'posted' }
      ];
      const cancelledCashTxs = [
        { id: 'tx-1', account_id: 'trs-1', tx_type: 'outflow', amount: 500, status: 'cancelled' }
      ];

      expect(computeTreasuryBalance(accounts, activeCashTxs).total).toBe(4500);
      expect(computeTreasuryBalance(accounts, cancelledCashTxs).total).toBe(5000);
    });

    it('editing an opening balance changes only the matching card', () => {
      const suppliers = [
        { id: 'sup-1', name: 'مورد', supplier_opening_balance: 1000, supplier_opening_type: 'credit', is_active: 1 }
      ];
      const customers = [
        { id: 'cust-1', name: 'عميل', customer_opening_balance: 1500, customer_opening_type: 'debit', is_active: 1 }
      ];
      const accounts = [
        { id: 'trs-1', name: 'خزينة', opening_balance: 3000, is_active: 1 }
      ];

      expect(computeSupplierDebts([], suppliers, [], [], [], [], [], []).total).toBe(1000);
      expect(computeCustomerReceivables([], customers, [], [], [], []).total).toBe(1500);
      expect(computeTreasuryBalance(accounts, []).total).toBe(3000);

      // Modify only customer opening balance
      const updatedCustomers = [
        { id: 'cust-1', name: 'عميل', customer_opening_balance: 2200, customer_opening_type: 'debit', is_active: 1 }
      ];
      expect(computeCustomerReceivables([], updatedCustomers, [], [], [], []).total).toBe(2200);
      // Other cards completely unaffected
      expect(computeSupplierDebts([], suppliers, [], [], [], [], [], []).total).toBe(1000);
      expect(computeTreasuryBalance(accounts, []).total).toBe(3000);
    });

    it('lowering an item stock under minimum increases alert count by 1', () => {
      const items = [
        { id: 'itm-1', code: 'ITM-01', name: 'قميص أكسفورد', actual_balance: 10, min_stock_alert: 5, is_active: 1 }
      ];
      expect(computeLowStockAlerts(items, [], []).count).toBe(0);

      // Drop below minimum level
      const updatedItems = [
        { id: 'itm-1', code: 'ITM-01', name: 'قميص أكسفورد', actual_balance: 4, min_stock_alert: 5, is_active: 1 }
      ];
      const res = computeLowStockAlerts(updatedItems, [], []);
      expect(res.count).toBe(1);
      expect(res.items[0].id).toBe('itm-1');
    });

    it('negative treasury balance is properly computed and reported as negative', () => {
      const accounts = [{ id: 'trs-1', name: 'الخزينة', opening_balance: 100, is_active: 1 }];
      const cashTxs = [
        { id: 'tx-out-1', account_id: 'trs-1', tx_type: 'outflow', amount: 350, status: 'posted' }
      ];
      const trs = computeTreasuryBalance(accounts, cashTxs);
      expect(trs.total).toBe(-250);
    });
  });

  describe('2. Reconciliation Tests (Card equals sum of entity statements)', () => {
    it('supplierDebts card total equals sum of individual supplier statement balances', () => {
      const suppliers = [
        { id: 'sup-1', name: 'مورد أ', opening_balance: 500, opening_balance_type: 'credit', is_active: 1 },
        { id: 'sup-2', name: 'مورد ب', opening_balance: 1200, opening_balance_type: 'credit', is_active: 1 },
        { id: 'sup-3', name: 'مورد ج', opening_balance: 0, opening_balance_type: 'credit', is_active: 1 },
      ];
      const supplierInvoices = [
        { id: 'sinv-1', supplier_id: 'sup-1', payment_terms: 'credit', total_amount: 800, status: 'unpaid' },
        { id: 'sinv-2', supplier_id: 'sup-3', payment_terms: 'credit', total_amount: 1500, status: 'unpaid' },
      ];
      const payments = [
        { id: 'pay-1', supplier_id: 'sup-1', amount: 300, status: 'issued' },
        { id: 'pay-2', supplier_id: 'sup-2', amount: 200, status: 'issued' },
      ];
      const returns = [
        { id: 'ret-1', supplier_id: 'sup-3', total_amount: 100, status: 'posted' }
      ];

      const res = computeSupplierDebts([], suppliers, supplierInvoices, [], payments, returns, [], []);
      const sumOfIndividuals = res.suppliersBreakdown.reduce((sum, s) => sum + s.balance_due, 0);

      // Card total MUST equal the sum of per-supplier statement balances down to the piaster
      expect(fromPiasters(toPiasters(res.total))).toBe(fromPiasters(toPiasters(sumOfIndividuals)));
      expect(res.total).toBe(3400); // (500+800-300) + (1200-200) + (1500-100) = 1000 + 1000 + 1400 = 3400
    });

    it('customerReceivables card total equals sum of individual customer statement balances', () => {
      const customers = [
        { id: 'c-1', name: 'عميل أ', opening_balance: 2000, opening_balance_type: 'debit', is_active: 1 },
        { id: 'c-2', name: 'عميل ب', opening_balance: 500, opening_balance_type: 'debit', is_active: 1 },
      ];
      const salesInvoices = [
        { id: 'sls-1', customer_id: 'c-1', payment_terms: 'credit', net_amount: 1500, status: 'unpaid' },
        { id: 'sls-2', customer_id: 'c-2', payment_terms: 'credit', net_amount: 3000, status: 'unpaid' },
      ];
      const receipts = [
        { id: 'rec-1', customer_id: 'c-1', amount: 1000, status: 'posted' },
      ];
      const returns = [
        { id: 'ret-1', customer_id: 'c-2', refund_amount: 400, refund_method: 'deduct_balance', status: 'posted' }
      ];

      const res = computeCustomerReceivables([], customers, salesInvoices, receipts, returns, []);
      const sumOfIndividuals = res.customersBreakdown.reduce((sum, c) => sum + c.balance_due, 0);

      expect(fromPiasters(toPiasters(res.total))).toBe(fromPiasters(toPiasters(sumOfIndividuals)));
      expect(res.total).toBe(5600); // (2000+1500-1000) + (500+3000-400) = 2500 + 3100 = 5600
    });

    it('treasuryBalance card total equals sum of individual treasury account balances', () => {
      const accounts = [
        { id: 'trs-main', name: 'الخزينة الرئيسية', opening_balance: 10000, is_active: 1 },
        { id: 'trs-outlet-1', name: 'خزينة معرض الدقي', opening_balance: 2000, is_active: 1 },
      ];
      const cashTxs = [
        { id: 'tx-1', account_id: 'trs-main', tx_type: 'outflow', amount: 1500, status: 'posted' },
        { id: 'tx-2', account_id: 'trs-outlet-1', tx_type: 'inflow', amount: 800, status: 'posted' },
      ];

      const res = computeTreasuryBalance(accounts, cashTxs);
      const sumOfIndividuals = res.accountsBreakdown.reduce((sum, a) => sum + a.computed_balance, 0);

      expect(res.total).toBe(sumOfIndividuals);
      expect(res.total).toBe(11300); // (10000 - 1500) + (2000 + 800) = 8500 + 2800 = 11300
    });

    it('lowStockCount card equals length of low stock item catalog', () => {
      const items = [
        { id: 'itm-1', code: 'A', name: 'قماش 1', actual_balance: 2, min_stock_alert: 5, is_active: 1 },
        { id: 'itm-2', code: 'B', name: 'قماش 2', actual_balance: 10, min_stock_alert: 5, is_active: 1 },
        { id: 'itm-3', code: 'C', name: 'بنطلون', actual_balance: 0, min_stock_alert: 2, is_active: 1 },
      ];
      const res = computeLowStockAlerts(items, [], []);
      expect(res.count).toBe(res.items.length);
      expect(res.count).toBe(2);
    });
  });

  describe('3. Money & Piaster Edge Cases', () => {
    it('handles exact 0.01 piasters without precision loss', () => {
      const accounts = [{ id: 'trs-1', opening_balance: 0, is_active: 1 }];
      const cashTxs = [
        { id: 'tx-1', account_id: 'trs-1', tx_type: 'inflow', amount: 0.01, status: 'posted' }
      ];
      const res = computeTreasuryBalance(accounts, cashTxs);
      expect(res.total).toBe(0.01);
    });

    it('eliminates IEEE 754 binary floating-point drift: 0.1 + 0.2 === 0.30', () => {
      const accounts = [{ id: 'trs-1', opening_balance: 0, is_active: 1 }];
      const cashTxs = [
        { id: 'tx-1', account_id: 'trs-1', tx_type: 'inflow', amount: 0.1, status: 'posted' },
        { id: 'tx-2', account_id: 'trs-1', tx_type: 'inflow', amount: 0.2, status: 'posted' },
      ];
      const res = computeTreasuryBalance(accounts, cashTxs);
      expect(res.total).toBe(0.3);
      expect(toPiasters(res.total)).toBe(30);
    });

    it('exact precision with large numbers like 1,000,000.99', () => {
      const accounts = [{ id: 'trs-1', opening_balance: 1000000.99, is_active: 1 }];
      const cashTxs = [
        { id: 'tx-1', account_id: 'trs-1', tx_type: 'outflow', amount: 0.99, status: 'posted' }
      ];
      const res = computeTreasuryBalance(accounts, cashTxs);
      expect(res.total).toBe(1000000.0);
      expect(toPiasters(res.total)).toBe(100000000);
    });
  });

  describe('4. Netting Settlements for Dual Entities', () => {
    it('dual entity gross balances are kept until formal offset settlement is posted', () => {
      const parties = [
        {
          id: 'party-dual',
          name: 'شركة النور للملابس والتوريد',
          is_supplier: 1,
          is_customer: 1,
          is_both: true,
          supplier_opening_balance: 1000,
          supplier_opening_type: 'credit',
          customer_opening_balance: 800,
          customer_opening_type: 'debit',
          is_active: 1,
        }
      ];

      // Before offset settlement:
      const supBefore = computeSupplierDebts(parties, [], [], [], [], [], [], []);
      const custBefore = computeCustomerReceivables(parties, [], [], [], [], []);
      expect(supBefore.total).toBe(1000);
      expect(custBefore.total).toBe(800);

      // Execute offset settlement of 500:
      const payments = [
        { id: 'spay-ofs-1', supplier_id: 'party-dual', payment_method: 'offset', amount: 500, status: 'posted' }
      ];
      const customerPayments = [
        { id: 'cpay-ofs-1', customer_id: 'party-dual', payment_method: 'offset', amount: 500, status: 'posted' }
      ];

      const supAfter = computeSupplierDebts(parties, [], [], [], payments, [], [], []);
      const custAfter = computeCustomerReceivables(parties, [], [], customerPayments, [], []);

      expect(supAfter.total).toBe(500); // 1000 - 500 = 500
      expect(custAfter.total).toBe(300); // 800 - 500 = 300
    });
  });

  describe('5. Edition Differences (Cutting vs Standard)', () => {
    it('in standard edition, cut orders stage costs are excluded from supplier debts', () => {
      const cutOrders = [
        {
          id: 'co-1',
          order_number: 'CUT-001',
          status: 'in_production',
          stages: {
            printing: {
              vendor_id: 'sup-print-1',
              vendor_name: 'مطبعة الأهرام',
              total_cost: 600
            }
          }
        }
      ];
      const suppliers = [
        { id: 'sup-print-1', name: 'مطبعة الأهرام', opening_balance: 0, is_active: 1 }
      ];

      // Cutting edition includes stage costs:
      const cuttingDebts = computeSupplierDebts([], suppliers, [], [], [], [], cutOrders, [], { includeCutting: true });
      expect(cuttingDebts.total).toBe(600);

      // Standard edition excludes cut orders and stage costs:
      const standardDebts = computeSupplierDebts([], suppliers, [], [], [], [], cutOrders, [], { includeCutting: false });
      expect(standardDebts.total).toBe(0);
    });
  });
});
