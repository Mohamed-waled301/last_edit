import { describe, it, expect } from 'vitest';
import { generateCutOrderHtml } from '../../modules/print/invoicePrintTemplates';

describe('Print Preview Formatting & Paper Sizing Verification', () => {
  it('correctly maps default paper size based on document type', () => {
    const getInitialPaperSize = (type: string) => (type === 'sales_invoice_thermal' ? '80mm' : 'A4');
    expect(getInitialPaperSize('sales_invoice_thermal')).toBe('80mm');
    expect(getInitialPaperSize('sales_invoice')).toBe('A4');
    expect(getInitialPaperSize('invoice')).toBe('A4');
    expect(getInitialPaperSize('customer_receipt')).toBe('A4');
    expect(getInitialPaperSize('supplier_payment')).toBe('A4');
    expect(getInitialPaperSize('cut_order')).toBe('A4');
  });

  it('generates exact 80mm auto page dimensions for thermal receipts', () => {
    const isThermal = (size: string) => size === '80mm';
    const generatePageCss = (size: string, orientation: string, margins: string) => {
      if (size === '80mm') {
        return `@page { size: 80mm auto; margin: 0; } html, body { width: 80mm !important; max-width: 80mm !important; margin: 0 auto !important; padding: 2mm 3mm !important; }`;
      }
      return `@page { size: ${size} ${orientation}; margin: ${margins === 'none' ? '0' : margins === 'minimal' ? '5mm' : '10mm'}; }`;
    };

    const thermalCss = generatePageCss('80mm', 'portrait', 'none');
    expect(thermalCss).toContain('size: 80mm auto');
    expect(thermalCss).toContain('width: 80mm !important');
    expect(thermalCss).toContain('margin: 0;');

    const a4Css = generatePageCss('A4', 'portrait', 'default');
    expect(a4Css).toContain('size: A4 portrait');
    expect(a4Css).toContain('margin: 10mm');
  });

  it('correctly toggles orientation between portrait and landscape', () => {
    const getFrameWidth = (paperSize: string, orientation: string) => {
      if (paperSize === '80mm') return 'w-[320px] max-w-[320px]';
      if (paperSize === 'A5') return orientation === 'landscape' ? 'w-[793px]' : 'w-[559px]';
      return orientation === 'landscape' ? 'w-[1123px]' : 'w-[794px]';
    };

    expect(getFrameWidth('80mm', 'portrait')).toBe('w-[320px] max-w-[320px]');
    expect(getFrameWidth('A4', 'portrait')).toBe('w-[794px]');
    expect(getFrameWidth('A4', 'landscape')).toBe('w-[1123px]');
  });

  describe('Cut Order Print Template (generateCutOrderHtml)', () => {
    const mockOrder = {
      id: 'po-test-101',
      cutting_number: 'PO-2026-7777',
      cutting_name: 'تيشيرت بولو رجالي فاخر',
      product_code: 'TSH-POLO-01',
      fabric_type: 'قماش بيكيه قطن 100%',
      color: 'كحلي / أبيض',
      batch_quantity: 350,
      total_material_cost: 12500,
      total_stages_cost: 4200,
      total_additional_cost: 800,
      total_product_cost: 17500,
      unit_cost_exact: 50.00,
      matrix: [
        {
          color: 'كحلي',
          quantities: { M: 30, L: 50, XL: 60, '2XL': 40, '3XL': 20, '4XL': 0, '5XL': 0, '6XL': 0, '7XL': 0, '8XL': 0 }
        },
        {
          color: 'أبيض',
          quantities: { M: 20, L: 40, XL: 50, '2XL': 30, '3XL': 10, '4XL': 0, '5XL': 0, '6XL': 0, '7XL': 0, '8XL': 0 }
        }
      ],
      materials_lines: [
        { material_name: 'قماش بيكيه قطن تركي', quantity: 180, unit: 'متر', unit_price: 65, line_cost: 11700 },
        { material_name: 'ياقة بولو جاهزة', quantity: 350, unit: 'قطعة', unit_price: 2, line_cost: 700 }
      ],
      stages: {
        printing: { vendor_name: 'مطبعة الأهرام الحديثة', pricing_type: 'per_piece', total_cost: 2100, paid: 1000 },
        embroidery: { vendor_name: 'تطريز النور', pricing_type: 'per_piece', total_cost: 2100, paid: 2100 }
      },
      cutting_comment: 'يرجى مراجعة تناسق خطوط الخياطة وجودة تطريز الشعار على الصدر'
    };

    const mockSettings = {
      factory_name: 'مصنع الأناقة والقص المتطور',
      phone: '01012345678',
      address: 'المنطقة الصناعية، العاشر من رمضان',
      company_logo: '/logo.png'
    };

    it('generates rich enterprise A4 Cut Order print layout matching invoice styling', () => {
      const html = generateCutOrderHtml(mockOrder, mockSettings, 'A4');

      expect(html).toContain('dir="rtl"');
      expect(html).toContain('PO-2026-7777');
      expect(html).toContain('أمر تشغيل وتفصيل وقص ملابس');
      expect(html).toContain('مصنع الأناقة والقص المتطور');
      expect(html).toContain('تيشيرت بولو رجالي فاخر');
      expect(html).toContain('TSH-POLO-01');
      expect(html).toContain('قماش بيكيه قطن 100%');
      expect(html).toContain('كحلي');
      expect(html).toContain('أبيض');
      expect(html).toContain('قماش بيكيه قطن تركي');
      expect(html).toContain('مطبعة الأهرام الحديثة');
      expect(html).toContain('تطريز النور');
      expect(html).toContain('مسؤول مقصدار (القص)');
      expect(html).toContain('مراقب الجودة الفنية');
      expect(html).toContain('المحاسب المسؤول');
      expect(html).toContain('الاعتماد الإداري / إدارة الإنتاج');
      expect(html).toContain('أمر تشغيل وقص رسمي صادر عن نظام كود سيستمز المتكامل');
    });

    it('generates compact 80mm thermal Cut Order print layout for production clipboards', () => {
      const html = generateCutOrderHtml(mockOrder, mockSettings, '80mm');

      expect(html).toContain('dir="rtl"');
      expect(html).toContain('PO-2026-7777');
      expect(html).toContain('أمر تشغيل وقص ملابس');
      expect(html).toContain('تيشيرت بولو رجالي فاخر');
      expect(html).toContain('مسؤول المقصدار');
      expect(html).toContain('مشرف الإنتاج والجودة');
    });

    it('gracefully handles missing order or empty matrix', () => {
      expect(generateCutOrderHtml(null)).toBe('');
      const minimalHtml = generateCutOrderHtml({ cutting_number: 'PO-MIN-01' });
      expect(minimalHtml).toContain('PO-MIN-01');
      expect(minimalHtml).toContain('أمر تشغيل وقص ملابس');
    });
  });
});

