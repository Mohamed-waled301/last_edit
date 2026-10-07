import db from '../db';
import BalanceCalculator from '../../logic/balances';
import suppliersRepo from './suppliersRepo';
import salesRepo from './salesRepo';
import productsRepo from './productsRepo';
import materialsRepo from './materialsRepo';

export const reportsRepo = {
  async getDashboard(userRole = 'owner') {
    const isOwner = userRole === 'owner';

    // 1. Sales & Profit
    const salesInvoices = await db.sales_invoices.toArray();
    let totalSales = 0;
    let totalProfit = 0;
    let monthProfit = 0;
    const currentMonth = new Date().toISOString().slice(0, 7);

    for (const inv of salesInvoices) {
      if (inv.status !== 'cancelled') {
        const invTotal = Number(inv.total_invoice_amount) || 0;
        const profit = Number(inv.net_profit) || 0;
        totalSales += invTotal;
        totalProfit += profit;
        if (inv.invoice_date && inv.invoice_date.startsWith(currentMonth)) {
          monthProfit += profit;
        }
      }
    }

    // 2. Treasury Liquidity
    const accounts = await db.treasury_accounts.toArray();
    const treasuryBalance = Number(accounts.reduce((sum, a) => sum + (Number(a.current_balance) || 0), 0).toFixed(2));

    // 3. Customer Receivables ("فلوس لينا بره")
    const customers = await salesRepo.getCustomers();
    const customerBalanceDue = Number(customers.reduce((sum, c) => sum + (Number(c.balance_due) || 0), 0).toFixed(2));

    // 4. Supplier Payables ("فلوس علينا للموردين")
    const suppliers = await suppliersRepo.getAll();
    const supplierBalanceDue = Number(suppliers.reduce((sum, s) => sum + (Number(s.balance_due) || 0), 0).toFixed(2));

    // 5. Due Invoices ("فواتير مستحقة قريباً")
    const supplierInvoices = await suppliersRepo.getSupplierInvoices();
    const dueInvoices = supplierInvoices
      .filter(i => i.status !== 'paid' && i.status !== 'cancelled')
      .slice(0, 10);

    // 6. Low Stock Materials ("خامات قربت تخلص")
    const lowStockMaterials = await materialsRepo.getLowStockAlerts();

    const inProdCount = await db.production_orders.where('status').equals('in_production').count();

    return {
      totalSales: Number(totalSales.toFixed(2)),
      netProfit: isOwner ? Number(totalProfit.toFixed(2)) : null,
      monthProfit: isOwner ? Number(monthProfit.toFixed(2)) : null,
      treasuryBalance,
      cashBalance: treasuryBalance,
      customerBalanceDue,
      customerReceivables: customerBalanceDue,
      supplierBalanceDue,
      supplierDebts: supplierBalanceDue,
      dueInvoices,
      lowStockMaterials: lowStockMaterials.slice(0, 10),
      lowStockCount: lowStockMaterials.length,
      inProductionCount: inProdCount,
    };
  },

  async getCostBreakdown() {
    const products = await productsRepo.getAll();
    const stage1Orders = await db.production_orders.toArray();
    const stage2Orders = await db.finishing_orders.toArray();

    return products.map(p => {
      // Find latest completed stage 1 order for this product
      const pStage1 = stage1Orders.filter(o => o.product_id === p.id);
      const latestS1 = pStage1.length > 0 ? pStage1[pStage1.length - 1] : null;

      // Find latest completed stage 2 order for this product
      const pStage2 = stage2Orders.filter(o => o.product_id === p.id);
      const latestS2 = pStage2.length > 0 ? pStage2[pStage2.length - 1] : null;

      const unitStage1Cost = latestS1 ? Number(latestS1.unit_stage1_cost) || 0 : (Number(p.bom_materials_cost) || 0);
      const unitStage2Cost = latestS2 ? Number(latestS2.final_unit_cost) || 0 : unitStage1Cost;

      return {
        product_id: p.id,
        code: p.code,
        name: p.name,
        category: p.category,
        bom_materials_cost: p.bom_materials_cost,
        unit_stage1_cost: unitStage1Cost,
        final_unit_cost: unitStage2Cost,
        target_margin: p.target_profit_margin_percent,
        suggested_price: p.suggested_selling_price,
      };
    });
  },

  async getProfitability() {
    const invoices = await salesRepo.getSalesInvoices();
    return invoices.map(i => {
      const subtotal = Number(i.subtotal) || 0;
      const cogs = Number(i.total_cogs) || 0;
      const expenses = Number(i.total_selling_expenses) || 0;
      const profit = Number(i.net_profit) || 0;
      const margin = subtotal > 0 ? Number(((profit / subtotal) * 100).toFixed(1)) : 0;

      return {
        invoice_id: i.id,
        invoice_number: i.invoice_number,
        invoice_date: i.invoice_date,
        customer_name: i.customer_name,
        outlet_name: i.outlet_name,
        subtotal,
        cogs,
        selling_expenses: expenses,
        net_profit: profit,
        profit_margin_percent: margin,
      };
    });
  },

  async getDebtAging() {
    const now = new Date();
    const calculateDays = (dateStr) => {
      if (!dateStr) return 0;
      const diffTime = Math.abs(now.getTime() - new Date(dateStr).getTime());
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    // Suppliers Aging
    const supInvoices = await db.supplier_invoices.toArray();
    const suppliers = await db.suppliers.toArray();
    const supMap = new Map(suppliers.map(s => [s.id, s.name]));

    const supplierAging = [];
    for (const inv of supInvoices) {
      if (inv.status !== 'paid' && inv.status !== 'cancelled') {
        const remaining = Math.max(0, (Number(inv.total_amount) || 0) - (Number(inv.paid_amount) || 0));
        const days = calculateDays(inv.due_date || inv.invoice_date);

        supplierAging.push({
          type: 'supplier',
          entity_name: supMap.get(inv.supplier_id) || inv.supplier_id,
          reference: inv.invoice_number,
          date: inv.invoice_date,
          due_date: inv.due_date,
          remaining_amount: remaining,
          days_overdue: days,
          bucket: days <= 30 ? '0-30 يوم' : days <= 60 ? '31-60 يوم' : days <= 90 ? '61-90 يوم' : '+90 يوم',
        });
      }
    }

    // Customers Aging
    const custInvoices = await db.sales_invoices.toArray();
    const customers = await db.customers.toArray();
    const custMap = new Map(customers.map(c => [c.id, c.name]));

    const customerAging = [];
    for (const inv of custInvoices) {
      if (inv.status !== 'paid' && inv.status !== 'cancelled') {
        const remaining = Math.max(0, (Number(inv.total_invoice_amount) || 0) - (Number(inv.paid_amount) || 0));
        const days = calculateDays(inv.due_date || inv.invoice_date);

        customerAging.push({
          type: 'customer',
          entity_name: custMap.get(inv.customer_id) || inv.customer_id,
          reference: inv.invoice_number,
          date: inv.invoice_date,
          due_date: inv.due_date,
          remaining_amount: remaining,
          days_overdue: days,
          bucket: days <= 30 ? '0-30 يوم' : days <= 60 ? '31-60 يوم' : days <= 90 ? '61-90 يوم' : '+90 يوم',
        });
      }
    }

    return {
      supplierAging,
      customerAging,
    };
  },

  /**
   * Products Report (تقرير المنتجات وتفاصيل التسعير والتكاليف)
   * Shows: cost price, average cost price, selling price, average selling price, total stock, total cost, total sales value
   */
  async getProductsReport() {
    const items = await db.items.toArray();
    const products = await db.products.toArray();
    const salesItems = await db.sales_invoice_items.toArray();

    // Map sales items to compute average actual selling price per product
    const salesByProd = new Map();
    for (const si of salesItems) {
      const pid = si.product_id;
      if (!salesByProd.has(pid)) {
        salesByProd.set(pid, { totalRevenue: 0, totalQty: 0 });
      }
      const curr = salesByProd.get(pid);
      curr.totalRevenue += (Number(si.total_price) || 0);
      curr.totalQty += (Number(si.quantity) || 0);
    }

    // Combine from items (finished goods) and products
    const combined = [];
    const seenIds = new Set();

    for (const item of items) {
      if (item.item_type !== 'raw_material') {
        seenIds.add(item.id);
        const stock = Number(item.current_stock) || 0;
        const costPrice = Number(item.cost_price) || Number(item.average_cost) || 0;
        const sellingPrice = Number(item.selling_price) || 0;

        const salesData = salesByProd.get(item.id) || { totalRevenue: 0, totalQty: 0 };
        const avgSellingPrice = salesData.totalQty > 0
          ? Number((salesData.totalRevenue / salesData.totalQty).toFixed(2))
          : sellingPrice;

        combined.push({
          id: item.id,
          code: item.code,
          name: item.name,
          category: item.item_group || item.item_department || 'عام',
          unit: item.unit || 'قطعة',
          stock,
          cost_price: costPrice,
          average_cost_price: costPrice,
          selling_price: sellingPrice,
          average_selling_price: avgSellingPrice,
          total_cost_value: Number((stock * costPrice).toFixed(2)),
          total_sales_value: Number((stock * sellingPrice).toFixed(2)),
          margin_percent: costPrice > 0 ? Number((((sellingPrice - costPrice) / costPrice) * 100).toFixed(1)) : 0,
        });
      }
    }

    for (const prod of products) {
      if (!seenIds.has(prod.id)) {
        const stock = Number(prod.current_finished_stock) || 0;
        const costPrice = Number(prod.cost_price) || Number(prod.bom_materials_cost) || 0;
        const sellingPrice = Number(prod.selling_price) || Number(prod.suggested_selling_price) || 0;

        const salesData = salesByProd.get(prod.id) || { totalRevenue: 0, totalQty: 0 };
        const avgSellingPrice = salesData.totalQty > 0
          ? Number((salesData.totalRevenue / salesData.totalQty).toFixed(2))
          : sellingPrice;

        combined.push({
          id: prod.id,
          code: prod.code,
          name: prod.name,
          category: prod.category || 'عام',
          unit: prod.unit || 'قطعة',
          stock,
          cost_price: costPrice,
          average_cost_price: costPrice,
          selling_price: sellingPrice,
          average_selling_price: avgSellingPrice,
          total_cost_value: Number((stock * costPrice).toFixed(2)),
          total_sales_value: Number((stock * sellingPrice).toFixed(2)),
          margin_percent: costPrice > 0 ? Number((((sellingPrice - costPrice) / costPrice) * 100).toFixed(1)) : 0,
        });
      }
    }

    return combined;
  }
};

export default reportsRepo;

