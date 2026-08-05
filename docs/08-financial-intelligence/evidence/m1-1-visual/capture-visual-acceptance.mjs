/**
 * Capture RC4 M1.1 visual acceptance screenshots/PDFs from the live Vite fixture.
 * Uses backend-engine evaluation snapshot values only.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = __dirname;
const base =
  process.env.FI_VISUAL_BASE || "http://localhost:5173/fi-m11-visual-acceptance.html";

mkdirSync(outDir, { recursive: true });

const views = [
  { name: "en-desktop", lang: "en", viewport: "desktop", width: 1440, height: 1100 },
  { name: "es-desktop", lang: "es", viewport: "desktop", width: 1440, height: 1100 },
  { name: "en-mobile", lang: "en", viewport: "mobile", width: 390, height: 844 },
  { name: "es-mobile", lang: "es", viewport: "mobile", width: 390, height: 844 },
  { name: "en-tablet", lang: "en", viewport: "tablet", width: 768, height: 1024 },
  { name: "es-tablet", lang: "es", viewport: "tablet", width: 768, height: 1024 }
];

const browser = await chromium.launch();
const results = [];

for (const view of views) {
  const page = await browser.newPage({
    viewport: { width: view.width, height: view.height }
  });
  const url = `${base}?lang=${view.lang}&viewport=${view.viewport}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid='fi-discussion-scenarios']");
  const meta = await page.locator("#meta").innerText();
  const evalId = await page.getAttribute("[data-fi-evaluation-id]", "data-fi-evaluation-id");
  const version = await page.getAttribute("[data-fi-evaluation-version]", "data-fi-evaluation-version");
  const language = await page.getAttribute("[data-fi-language]", "data-fi-language");
  const overflowX = await page.evaluate(() => {
    const root = document.querySelector(".fi-discussion-scenarios");
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      reportScrollWidth: root?.scrollWidth ?? null,
      reportClientWidth: root?.clientWidth ?? null
    };
  });
  const text = await page.locator(".fi-discussion-scenarios").innerText();
  const securitiesLeak = /FELAX|VAFAX|VADAX|EPGAX|ACEIX|SBLGX|SB-72|SB72|NASDAQ|NYSE/i.test(text);
  const path = join(outDir, `${view.name}.png`);
  await page.screenshot({ path, fullPage: true });
  results.push({
    view: view.name,
    url,
    evalId,
    version,
    language,
    meta,
    overflowX,
    securitiesLeak,
    artifact: path
  });
  await page.close();
}

for (const lang of ["en", "es"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${base}?lang=${lang}&viewport=desktop`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-testid='fi-discussion-scenarios']");
  const pdfPath = join(outDir, `${lang}-print.pdf`);
  await page.pdf({
    path: pdfPath,
    format: "Letter",
    printBackground: true,
    margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" }
  });
  // Print-preview style PNG of first viewport after print media emulation
  await page.emulateMedia({ media: "print" });
  await page.screenshot({
    path: join(outDir, `${lang}-print-preview.png`),
    fullPage: true
  });
  results.push({
    view: `${lang}-print`,
    artifact: pdfPath,
    preview: join(outDir, `${lang}-print-preview.png`),
    evalId: await page.getAttribute("[data-fi-evaluation-id]", "data-fi-evaluation-id"),
    version: await page.getAttribute("[data-fi-evaluation-version]", "data-fi-evaluation-version"),
    language: lang
  });
  await page.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
