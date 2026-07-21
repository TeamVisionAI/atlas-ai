/**
 * Final live production validation for Meta readiness.
 * Run: node backend/dev/validateProductionFinal.mjs
 */
import { chromium, devices } from "playwright";

const BASE = "https://www.teamvisionfinancial.com";
const PUBLIC_PAGES = ["/", "/privacy", "/legal", "/terms"];
const HASH_SECTIONS = ["about", "services", "careers", "contact"];

const report = {
  deployment: { commit: "0b69515", base: BASE },
  urls: [],
  desktop: {},
  mobile: {},
  contactForm: null,
  consoleErrors: [],
  passed: false,
};

function recordUrl(path, status, ok, detail = "") {
  report.urls.push({ path, status, ok, detail });
}

async function checkHttpUrls() {
  for (const path of PUBLIC_PAGES) {
    const res = await fetch(`${BASE}${path}`, { redirect: "follow" });
    recordUrl(path, res.status, res.status >= 200 && res.status < 400);
  }
  for (const section of HASH_SECTIONS) {
    const res = await fetch(`${BASE}/#${section}`, { redirect: "follow" });
    recordUrl(`/#${section}`, res.status, res.status >= 200 && res.status < 400);
  }
}

async function runBrowserValidation(browser) {
  const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const desktop = await desktopContext.newPage();
  desktop.on("console", (m) => {
    if (m.type() === "error") report.consoleErrors.push(`desktop: ${m.text()}`);
  });
  desktop.on("pageerror", (e) => report.consoleErrors.push(`desktop: ${e.message}`));

  await desktop.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  report.desktop.navVisible = await desktop.locator("nav[aria-label='Primary']").isVisible();
  report.desktop.signInVisible = await desktop.getByRole("link", { name: "Atlas Sign In" }).first().isVisible();
  report.desktop.menuToggleHidden = !(await desktop.locator(".public-navbar__menu-toggle").isVisible());

  await desktop.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });
  for (const section of HASH_SECTIONS) {
    const label = section.charAt(0).toUpperCase() + section.slice(1);
    if (section === "contact") {
      const href = await desktop.locator("nav[aria-label='Primary'] a", { hasText: "Contact" }).getAttribute("href");
      report.desktop[`contactHref`] = href;
    }
  }
  const aboutHref = await desktop.locator("nav[aria-label='Primary'] a", { hasText: "About" }).getAttribute("href");
  report.desktop.aboutHrefFromLegal = aboutHref === "/#about";

  await desktop.locator("footer a", { hasText: /privacy/i }).first().click();
  report.desktop.footerPrivacy = desktop.url().includes("/privacy");

  await desktopContext.close();

  const iphone = devices["iPhone 13"];
  const mobileContext = await browser.newContext({ ...iphone });
  const mobile = await mobileContext.newPage();
  mobile.on("console", (m) => {
    if (m.type() === "error") report.consoleErrors.push(`mobile: ${m.text()}`);
  });
  mobile.on("pageerror", (e) => report.consoleErrors.push(`mobile: ${e.message}`));

  await mobile.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });
  const toggle = mobile.locator(".public-navbar__menu-toggle");
  report.mobile.toggleVisible = await toggle.isVisible();
  report.mobile.ariaExpandedFalse = (await toggle.getAttribute("aria-expanded")) === "false";
  await toggle.click();
  report.mobile.menuOpen = await mobile.locator(".public-navbar__mobile-nav.is-open").isVisible();
  report.mobile.overlayOpen = await mobile.locator(".public-navbar__mobile-overlay.is-open").isVisible();

  const contactLink = mobile.locator(".public-navbar__mobile-nav a[href='/#contact']");
  report.mobile.contactHref = (await contactLink.getAttribute("href")) === "/#contact";
  await contactLink.click();
  report.mobile.menuClosesOnLink = !(await mobile.locator(".public-navbar__mobile-nav.is-open").isVisible());
  report.mobile.contactFormVisible = await mobile.locator("#contact-name").isVisible();

  await mobile.goto(`${BASE}/privacy`, { waitUntil: "domcontentloaded" });
  await toggle.click();
  await mobile.keyboard.press("Escape");
  report.mobile.escCloses = !(await mobile.locator(".public-navbar__mobile-nav.is-open").isVisible());

  report.mobile.toggleAriaLabel = await toggle.getAttribute("aria-label");
  report.mobile.noOverflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );

  await mobile.goto(`${BASE}/legal`, { waitUntil: "domcontentloaded" });
  await toggle.click();
  await mobile.locator(".public-navbar__mobile-nav a[href='/terms']").click();
  report.mobile.legalRouteWorks = mobile.url().includes("/terms");

  await mobile.goto(`${BASE}/#contact`, { waitUntil: "networkidle" });
  const ts = Date.now();
  await mobile.fill("#contact-name", "Meta Production Validation");
  await mobile.fill("#contact-email", `meta-prod-${ts}@example.com`);
  await mobile.fill("#contact-message", `Final Meta readiness production test ${ts}. Safe to ignore.`);

  const [apiRes] = await Promise.all([
    mobile.waitForResponse(
      (r) => r.url().includes("/api/contact") && r.request().method() === "POST",
      { timeout: 30000 }
    ),
    mobile.getByRole("button", { name: /send message/i }).click(),
  ]);
  const body = await apiRes.json().catch(() => ({}));
  report.contactForm = {
    httpStatus: apiRes.status(),
    backendOk: body.ok === true,
    successVisible: await mobile.locator("text=Thank you for your message").isVisible().catch(() => false),
  };

  await mobileContext.close();
}

async function main() {
  await checkHttpUrls();

  const browser = await chromium.launch({ headless: true });
  await runBrowserValidation(browser);
  await browser.close();

  const bundleRes = await fetch(`${BASE}/`);
  const html = await bundleRes.text();
  const bundleMatch = html.match(/src="(\/assets\/index[^"]+\.js)"/);
  report.deployment.bundle = bundleMatch?.[1] ?? "unknown";
  if (bundleMatch) {
    const js = await (await fetch(`${BASE}${bundleMatch[1]}`)).text();
    report.deployment.hasMobileMenu = js.includes("public-navbar__menu-toggle");
    report.deployment.hasNavFix = !js.includes("e.href.slice(2)");
  }

  report.passed =
    report.urls.every((u) => u.ok) &&
    report.deployment.hasMobileMenu &&
    report.deployment.hasNavFix &&
    report.desktop.navVisible &&
    report.desktop.signInVisible &&
    report.desktop.menuToggleHidden &&
    report.desktop.aboutHrefFromLegal &&
    report.mobile.toggleVisible &&
    report.mobile.menuOpen &&
    report.mobile.overlayOpen &&
    report.mobile.menuClosesOnLink &&
    report.mobile.contactFormVisible &&
    report.mobile.escCloses &&
    report.mobile.noOverflow &&
    report.mobile.legalRouteWorks &&
    report.contactForm?.httpStatus === 200 &&
    report.contactForm?.backendOk &&
    report.contactForm?.successVisible &&
    report.consoleErrors.length === 0;

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
