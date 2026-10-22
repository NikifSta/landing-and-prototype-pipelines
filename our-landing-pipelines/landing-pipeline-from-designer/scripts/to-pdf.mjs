// HTML → PDF, размер страницы берётся из CSS @page (слайды 1920×1080, документы A4): node scripts/to-pdf.mjs <page.html> <out.pdf>
import { chromium } from 'playwright';
import path from 'node:path';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: to-pdf.mjs <slides.html> <out.pdf>'); process.exit(1); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + path.resolve(src), { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`PDF: ${out}`);
