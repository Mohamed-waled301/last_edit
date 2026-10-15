import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../../data/db';
import { itemsRepo } from '../../data/repositories/itemsRepo';
import { partiesRepo } from '../../data/repositories/partiesRepo';
import { salesRepo } from '../../data/repositories/salesRepo';

describe('Sales Invoice: Finished Goods Only Restriction', () => {
  let customerId: string;
  let rawMaterialId: string;
  let finishedGoodId: string;

  beforeEach(async () => {
    await db.open();
    await db.items.clear();
    await db.parties.clear();
    await db.customers.clear();
    await db.sales_invoices.clear();
    await db.sales_invoice_items.clear();
    await db.stock_movements.clear();
    await db.treasury_accounts.clear();

    // Create a customer
    const customer = await partiesRepo.create({
      code: 'CUST-FG-01',
      name: 'عميل تجريبي للملابس',
      type: 'customer'
    });
    customerId = customer.id;

    // Create a raw material item
    const rawMaterial = await itemsRepo.create({
      code: 'RAW-FABRIC-01',
      name: 'قماش صوف إيطالي خام',
      item_type: 'raw_material',
      item_group: 'خامات',
      item_department: 'نسيج',
      unit: 'متر',
      cost_price: 250,
      opening_balance: 100,
      opening_cost: 250
    });
    rawMaterialId = rawMaterial.id;

    // Create a finished good item
    const finishedGood = await itemsRepo.create({
      code: 'FIN-SUIT-01',
      name: 'بدلة رجالي كلاسيك كاملة',
      item_type: 'finished',
      item_group: 'بدل',
      item_department: 'تفصيل رجالي',
      unit: 'قطعة',
      cost_price: 1500,
      selling_price: 2200,
      opening_balance: 10,
      opening_cost: 1500
    });
    finishedGoodId = finishedGood.id;
  });

  it('strictly rejects adding raw materials to a sales invoice with clear Arabic message', async () => {
    await expect(
      salesRepo.createSalesInvoice({
        customer_id: customerId,
        payment_terms: 'cash',
        items: [
          {
            product_id: rawMaterialId,
            quantity: 2,
            unit_selling_price: 300
          }
        ]
      })
    ).rejects.toThrow('يقتصر البيع على المنتجات التامة فقط');
  });

  it('strictly rejects adding raw materials to a sales return with clear Arabic message', async () => {
    await expect(
      salesRepo.createCustomerReturn({
        customer_id: customerId,
        product_id: rawMaterialId,
        quantity: 1,
        refund_amount: 300
      })
    ).rejects.toThrow('يقتصر المرتجع على المنتجات التامة فقط');
  });

  it('successfully creates sales invoice when using finished goods', async () => {
    const invoice = await salesRepo.createSalesInvoice({
      customer_id: customerId,
      payment_terms: 'cash',
      items: [
        {
          product_id: finishedGoodId,
          quantity: 2,
          unit_selling_price: 2200
        }
      ]
    });

    expect(invoice).toBeDefined();
    expect(invoice.id).toBeDefined();
    expect(Number(invoice.total_invoice_amount)).toBe(4400);
  });
});
