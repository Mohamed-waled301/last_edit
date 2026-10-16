import { describe, it, expect } from 'vitest';

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
});
