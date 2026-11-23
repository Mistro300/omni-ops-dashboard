import { existsSync } from 'node:fs';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { OrderDetailDto } from '@omni-ops/shared';
import { chromium, type Browser } from 'playwright-core';

function detectChromiumExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROME_PATH && existsSync(process.env.PLAYWRIGHT_CHROME_PATH)) {
    return process.env.PLAYWRIGHT_CHROME_PATH;
  }

  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ];

  return candidates.find((p) => existsSync(p));
}

function escapeHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private browser: Browser | null = null;
  private launchPromise: Promise<Browser> | null = null;

  /**
   * Reuses a single headless Chromium instance across PDF renders to minimize
   * memory spikes and launch overhead (paired with BullMQ concurrency: 2).
   */
  private async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    if (!this.launchPromise) {
      this.launchPromise = (async () => {
        const executablePath = detectChromiumExecutable();
        this.logger.log(
          `Launching reusable Playwright Chromium instance (${executablePath ?? 'bundled'})`,
        );
        const launched = await chromium.launch({
          headless: true,
          ...(executablePath ? { executablePath } : {}),
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        this.browser = launched;
        this.launchPromise = null;
        return launched;
      })().catch((err) => {
        this.launchPromise = null;
        throw err;
      });
    }

    return this.launchPromise;
  }

  private async htmlToPdf(
    html: string,
    options: { landscape?: boolean } = {},
  ): Promise<Buffer> {
    const browser = await this.getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.setContent(html, { waitUntil: 'load' });
      const pdfBytes = await page.pdf({
        format: 'A4',
        landscape: options.landscape ?? false,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate:
          '<div style="width:100%;font-size:8px;color:#71717a;padding:0 16mm;display:flex;justify-content:space-between;font-family:Segoe UI,Arial,sans-serif;"><span>OmniOps — Enterprise Inventory &amp; Order Operations</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
        margin: { top: '14mm', right: '14mm', bottom: '16mm', left: '14mm' },
      });
      return Buffer.from(pdfBytes);
    } finally {
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
    }
  }

  async renderOrderInvoicePdf(order: OrderDetailDto): Promise<Buffer> {
    const rowsHtml = order.items
      .map(
        (item, idx) => `
      <tr>
        <td class="mono">${idx + 1}</td>
        <td class="mono bold">${escapeHtml(item.productSku)}</td>
        <td>${escapeHtml(item.productName)}</td>
        <td class="mono num">${item.quantity}</td>
        <td class="mono num">$${item.unitPriceSnapshot.toFixed(2)}</td>
        <td class="mono num bold">$${item.lineTotal.toFixed(2)}</td>
      </tr>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #09090b; font-size: 10pt; margin: 0; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 18px; }
    .brand { font-size: 18pt; font-weight: 800; color: #09090b; }
    .brand-sub { font-size: 9pt; color: #52525b; margin-top: 2px; }
    .inv-meta { text-align: right; }
    .inv-num { font-family: Consolas, monospace; font-size: 13pt; font-weight: 700; color: #4f46e5; }
    .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 8.5pt; font-weight: 600; background: #eef2ff; color: #4338ca; margin-top: 4px; }
    .grid { display: flex; gap: 16px; margin-bottom: 18px; }
    .card { flex: 1; border: 1px solid #e4e4e7; border-radius: 6px; padding: 10px 12px; background: #fafafa; }
    .card-title { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; color: #52525b; font-weight: 700; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
    th { background: #f4f4f5; color: #3f3f46; font-size: 8.5pt; text-align: left; padding: 7px 8px; border: 1px solid #e4e4e7; }
    td { padding: 7px 8px; border: 1px solid #e4e4e7; font-size: 9pt; }
    .mono { font-family: Consolas, monospace; }
    .num { text-align: right; }
    .bold { font-weight: 700; }
    .totals { margin-left: auto; width: 260px; border: 1px solid #e4e4e7; border-radius: 6px; padding: 10px 12px; background: #fafafa; }
    .tot-row { display: flex; justify-content: space-between; font-size: 9pt; margin-bottom: 5px; color: #52525b; }
    .tot-final { display: flex; justify-content: space-between; font-size: 11.5pt; font-weight: 800; color: #09090b; border-top: 1px solid #d4d4d8; padding-top: 6px; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">OmniOps</div>
      <div class="brand-sub">Multi-Warehouse Inventory &amp; Order Operations</div>
    </div>
    <div class="inv-meta">
      <div class="inv-num">${escapeHtml(order.orderNumber)}</div>
      <div class="brand-sub">Issued: ${new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
      <div class="pill">${escapeHtml(order.status)}</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Billed To</div>
      <div class="bold">${escapeHtml(order.customerName)}</div>
      <div>${escapeHtml(order.customerCompany ?? '')}</div>
      <div class="mono" style="font-size:8.5pt;color:#52525b;">${escapeHtml(order.customerEmail)}</div>
      <div class="mono" style="font-size:8.5pt;color:#52525b;">${escapeHtml(order.customerPhone ?? '')}</div>
    </div>
    <div class="card">
      <div class="card-title">Fulfillment Warehouse</div>
      <div class="mono bold" style="color:#4f46e5;">${escapeHtml(order.warehouseCode)}</div>
      <div>${escapeHtml(order.warehouseName)}</div>
      <div style="font-size:8.5pt;color:#52525b;margin-top:4px;">Created by: ${escapeHtml(order.createdByName)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:6%;">#</th>
        <th style="width:18%;">SKU</th>
        <th>Product Description</th>
        <th class="num" style="width:10%;">Qty</th>
        <th class="num" style="width:16%;">Unit Price</th>
        <th class="num" style="width:18%;">Line Total</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="tot-row"><span>Subtotal</span><span class="mono">$${order.subtotal.toFixed(2)}</span></div>
    <div class="tot-row"><span>Discount</span><span class="mono">-$${order.discountAmount.toFixed(2)}</span></div>
    <div class="tot-row"><span>Tax</span><span class="mono">$${order.taxAmount.toFixed(2)}</span></div>
    <div class="tot-final"><span>Total Due</span><span class="mono" style="color:#4f46e5;">$${order.totalAmount.toFixed(2)}</span></div>
  </div>
</body>
</html>`;

    return this.htmlToPdf(html, { landscape: false });
  }

  async renderTabularReportPdf(params: {
    title: string;
    subtitle: string;
    columns: Array<{ key: string; label: string }>;
    rows: Array<Record<string, unknown>>;
    note?: string;
  }): Promise<Buffer> {
    const headersHtml = params.columns
      .map((c) => `<th>${escapeHtml(c.label)}</th>`)
      .join('');
    const bodyHtml = params.rows
      .map(
        (row) =>
          `<tr>${params.columns.map((c) => `<td>${escapeHtml(row[c.key] ?? '—')}</td>`).join('')}</tr>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; color: #09090b; font-size: 8.5pt; margin: 0; }
    .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; margin-bottom: 12px; }
    h1 { font-size: 14pt; margin: 0; color: #09090b; }
    .sub { font-size: 8.5pt; color: #52525b; margin-top: 2px; }
    .note { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 6px 10px; border-radius: 5px; font-size: 8pt; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; word-wrap: break-word; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th { background: #f4f4f5; color: #18181b; font-size: 8pt; text-align: left; padding: 5px 6px; border: 1px solid #e4e4e7; }
    td { padding: 4px 6px; border: 1px solid #e4e4e7; font-size: 8pt; }
    tbody tr:nth-child(even) { background: #fafafa; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>OmniOps — ${escapeHtml(params.title)}</h1>
      <div class="sub">${escapeHtml(params.subtitle)}</div>
    </div>
    <div class="sub">Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC • Rows: ${params.rows.length.toLocaleString()}</div>
  </div>
  ${params.note ? `<div class="note">${escapeHtml(params.note)}</div>` : ''}
  <table>
    <thead><tr>${headersHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>
</body>
</html>`;

    return this.htmlToPdf(html, { landscape: true });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }
}
