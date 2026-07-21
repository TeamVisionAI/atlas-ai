/**
 * Mobile navigation validation for public website.
 * Run: npm run build --prefix frontend && npm run preview --prefix frontend &
 *      node backend/dev/verifyMobileNavigation.mjs
 * Or:  BASE_URL=https://www.teamvisionfinancial.com node backend/dev/verifyMobileNavigation.mjs
 */
import { chromium, devices } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotDir = path.join(__dirname, "screenshots/mobile-nav");
const BASE = process.env.BASE_URL || "https://127.0.0.1:4173";

const DEVICE_NAMES = ["iPhone SE", "iPhone 13", "Pixel 7"];
const SECTIONS = [
  { label: "About", href: "/#about", id: "about" },
  { label: "Contact", href: "/#contact", id: "contact" },
];

const results = [];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function validateDevice(browser, deviceName) {
  const device = devices[deviceName];
  const context = await browser.newContext({ ...device, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const deviceDir = path.join(screenshotDir, deviceName.replace(/\s+/g, "-").toLowerCase());
  ensureDir(deviceDir);

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  const row = {
    device: deviceName,
    viewport: `${device.viewport.width}x${device.viewport.height}`,
    checks: {},
    consoleErrors,
  };

  await page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });

  const toggle = page.locator(".public-navbar__menu-toggle");
  row.checks.menuToggleVisible = await toggle.isVisible();
  await toggle.click();
  row.checks.menuOpens = await page.locator(".public-navbar__mobile-nav.is-open").isVisible();
  await page.screenshot({ path: path.join(deviceDir, "menu-open-privacy.png"), fullPage: false });

  const contactLink = page.locator(".public-navbar__mobile-nav a[href='/#contact']");
  row.checks.contactHref = (await contactLink.getAttribute("href")) === "/#contact";
  await contactLink.click();
  row.checks.menuClosesAfterLink = !(await page
    .locator(".public-navbar__mobile-nav.is-open")
    .isVisible()
    .catch(() => false));
  await page.waitForURL(/\/(#contact)?$/);
  row.checks.contactSectionVisible = await page.locator("#contact-name").isVisible();
  await page.screenshot({ path: path.join(deviceDir, "contact-section.png"), fullPage: false });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
  row.checks.noHorizontalOverflow = overflow;

  await page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });
  await toggle.click();
  await page.locator(".public-navbar__mobile-nav a[href='/legal']").click();
  row.checks.legalRouteWorks = page.url().includes("/legal");
  await page.screenshot({ path: path.join(deviceDir, "legal-page.png"), fullPage: false });

  await page.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });
  await toggle.click();
  await page.keyboard.press("Escape");
  row.checks.escClosesMenu = !(await page
    .locator(".public-navbar__mobile-nav.is-open")
    .isVisible()
    .catch(() => false));

  row.passed = Object.values(row.checks).every(Boolean) && consoleErrors.length === 0;
  results.push(row);
  await context.close();
}

async function validateDesktopUnchanged(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

  const desktop = {
    navVisible: await page.locator("nav[aria-label='Primary']").isVisible(),
    menuToggleHidden: !(await page.locator(".public-navbar__menu-toggle").isVisible()),
    signInVisible: await page.getByRole("link", { name: "Atlas Sign In" }).first().isVisible(),
  };

  await context.close();
  return desktop;
}

async function main() {
  ensureDir(screenshotDir);

  const browser = await chromium.launch({ headless: true });
  const desktop = await validateDesktopUnchanged(browser);

  for (const deviceName of DEVICE_NAMES) {
    await validateDevice(browser, deviceName);
  }

  await browser.close();

  const summary = { base: BASE, desktop, devices: results };
  fs.writeFileSync(
    path.join(screenshotDir, "validation-summary.json"),
    JSON.stringify(summary, null, 2)
  );

  console.log(JSON.stringify(summary, null, 2));

  const allPassed =
    desktop.navVisible &&
    desktop.menuToggleHidden &&
    desktop.signInVisible &&
    results.every((r) => r.passed);

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
