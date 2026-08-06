/**
 * Local Prospect Workspace scroll verification (no production credentials).
 * Opens the static layout fixture, probes scroll ownership, dispatches wheel/PageDown.
 */
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, "../dev/prospect-workspace-scroll-fixture.html");
const fixtureUrl = `file://${fixturePath}`;

function summarizeProbe(probe) {
  const interesting = [
    "html",
    "body",
    "#root",
    ".atlas-layout",
    ".atlas-layout__main",
    ".atlas-layout__content",
    ".prospect-workspace"
  ];
  const rows = interesting.map((key) => {
    const n = probe.nodes[key];
    if (!n) return { key, missing: true };
    return {
      key,
      overflowY: n.overflowY,
      overscrollBehavior: n.overscrollBehavior,
      clientHeight: n.clientHeight,
      scrollHeight: n.scrollHeight,
      scrollTop: n.scrollTop,
      canScrollY: n.canScrollY
    };
  });
  return {
    scrollingElement: probe.scrollingElement,
    bodyOverflowInline: probe.bodyOverflowInline,
    documentScrollTop: probe.documentScrollTop,
    documentCanScroll:
      probe.documentScrollHeight > probe.documentClientHeight + 1,
    overlayHit: probe.overlayHit,
    rows
  };
}

async function findScrollOwner(page) {
  return page.evaluate(() => {
    const candidates = [
      document.scrollingElement,
      document.querySelector(".atlas-layout__main"),
      document.querySelector(".atlas-layout__content"),
      document.querySelector(".prospect-workspace"),
      document.querySelector("#root"),
      document.body
    ].filter(Boolean);

    const before = candidates.map((el) => ({
      name:
        el === document.scrollingElement
          ? "scrollingElement"
          : el.className?.toString?.().split(/\s+/).slice(0, 2).join(".") ||
            el.tagName,
      el,
      top: el.scrollTop
    }));

    // Prefer the element that moves after a programmatic nudge attempt.
    for (const item of before) {
      const prev = item.el.scrollTop;
      item.el.scrollTop = prev + 40;
      if (item.el.scrollTop > prev) {
        item.el.scrollTop = prev;
        return {
          owner: item.name,
          programmaticScrollWorks: true
        };
      }
      item.el.scrollTop = prev;
    }

    return { owner: null, programmaticScrollWorks: false };
  });
}

async function dispatchWheelAndMeasure(page, deltaY = 900) {
  return page.evaluate(async (dy) => {
    const track = [
      ["scrollingElement", document.scrollingElement],
      ["main", document.querySelector(".atlas-layout__main")],
      ["content", document.querySelector(".atlas-layout__content")],
      ["workspace", document.querySelector(".prospect-workspace")],
      ["root", document.querySelector("#root")],
      ["body", document.body]
    ];

    const before = Object.fromEntries(
      track.map(([name, el]) => [name, el ? el.scrollTop : null])
    );

    const target =
      document.querySelector(".prospect-workspace") ||
      document.querySelector(".atlas-layout__main") ||
      document.body;

    const rect = target.getBoundingClientRect();
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: dy,
      clientX: rect.left + Math.min(40, rect.width / 2),
      clientY: rect.top + Math.min(80, rect.height / 2)
    });
    target.dispatchEvent(event);

    // Also nudge via scrollBy on scrollingElement as browser-like fallback signal.
    // WheelEvent alone does not always move scroll in headless Chromium without a compositor.
    // Real input is sent by Playwright mouse.wheel below; this evaluate path records listeners.
    await new Promise((r) => setTimeout(r, 50));

    const after = Object.fromEntries(
      track.map(([name, el]) => [name, el ? el.scrollTop : null])
    );

    const movers = Object.keys(before).filter(
      (k) => before[k] != null && after[k] != null && after[k] > before[k]
    );

    return { before, after, movers, defaultPrevented: event.defaultPrevented };
  }, deltaY);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(fixtureUrl);

  const initialProbe = summarizeProbe(await page.evaluate(() => window.__atlasScrollProbe()));
  const ownerInfo = await findScrollOwner(page);

  // Real wheel input via CDP/Playwright
  const workspace = page.locator('[data-testid="prospect-workspace"]');
  await workspace.click({ position: { x: 40, y: 80 } });

  const beforeWheel = await page.evaluate(() => ({
    doc: document.scrollingElement.scrollTop,
    main: document.querySelector(".atlas-layout__main")?.scrollTop ?? null,
    content: document.querySelector(".atlas-layout__content")?.scrollTop ?? null
  }));

  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(100);

  const afterWheel = await page.evaluate(() => ({
    doc: document.scrollingElement.scrollTop,
    main: document.querySelector(".atlas-layout__main")?.scrollTop ?? null,
    content: document.querySelector(".atlas-layout__content")?.scrollTop ?? null
  }));

  const wheelMoved = ["doc", "main", "content"].some(
    (k) => (afterWheel[k] ?? 0) > (beforeWheel[k] ?? 0) + 1
  );

  // Keyboard PageDown
  const beforePage = { ...afterWheel };
  await page.keyboard.press("PageDown");
  await page.waitForTimeout(80);
  const afterPage = await page.evaluate(() => ({
    doc: document.scrollingElement.scrollTop,
    main: document.querySelector(".atlas-layout__main")?.scrollTop ?? null,
    content: document.querySelector(".atlas-layout__content")?.scrollTop ?? null
  }));
  const pageMoved = ["doc", "main", "content"].some(
    (k) => (afterPage[k] ?? 0) > (beforePage[k] ?? 0) + 1
  );

  // Deep sections — scroll the active owner and assert section geometry becomes reachable.
  const deep = await page.evaluate(() => {
    const main = document.querySelector(".atlas-layout__main");
    const se = document.scrollingElement;
    const owner =
      main && main.scrollHeight > main.clientHeight + 1
        ? main
        : se.scrollHeight > se.clientHeight + 1
          ? se
          : null;

    function visible(sel) {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }

    function reach(sel) {
      const el = document.querySelector(sel);
      if (!el || !owner) return false;
      el.scrollIntoView({ block: "start" });
      return visible(sel);
    }

    if (!owner) {
      return {
        owner: null,
        interview: false,
        history: false,
        communications: false,
        bottom: false,
        backToTop: false
      };
    }

    const interview = reach("#operational-interview");
    const history = reach("#communication-history");
    const communications = reach("#communications-center");
    const bottom = reach('[data-testid="bottom-block"]');
    owner.scrollTop = 0;
    return {
      owner:
        owner === main
          ? "main"
          : owner === se
            ? "scrollingElement"
            : "unknown",
      interview,
      history,
      communications,
      bottom,
      backToTop: owner.scrollTop === 0,
      maxScrollTop: Math.max(0, owner.scrollHeight - owner.clientHeight)
    };
  });

  const syntheticWheel = await dispatchWheelAndMeasure(page, 900);

  // Dialog/body-lock simulation (MainLayout phone-nav pattern): lock then unlock.
  const dialogLock = await page.evaluate(() => {
    const before = document.body.style.overflow || "";
    document.body.style.overflow = "hidden";
    const lockedDocTop = document.scrollingElement.scrollTop;
    document.scrollingElement.scrollTop = lockedDocTop + 20;
    const movedWhileLocked =
      document.scrollingElement.scrollTop !== lockedDocTop;
    document.body.style.overflow = "";
    const after = document.body.style.overflow || "";
    document.scrollingElement.scrollTop = 0;
    const unlockedWheelTarget = document.querySelector(".prospect-workspace");
    unlockedWheelTarget?.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 })
    );
    return {
      before,
      after,
      restored: after === "",
      programmaticMoveWhileLocked: movedWhileLocked
    };
  });

  const postProbe = summarizeProbe(await page.evaluate(() => window.__atlasScrollProbe()));

  await browser.close();

  const report = {
    fixtureUrl,
    ownerInfo,
    initialProbe,
    wheel: { beforeWheel, afterWheel, wheelMoved },
    keyboardPageDown: { beforePage, afterPage, pageMoved },
    deep,
    syntheticWheel,
    dialogLock,
    postProbe,
    // Pre-PR #26 ownership: document scrollingElement, not a nested :has() scrollport.
    originalScrollContainer: "document.scrollingElement",
    nestedHasScrollOwnership: Boolean(
      initialProbe.rows.find(
        (r) =>
          r.key === ".atlas-layout__main" &&
          r.overflowY === "auto" &&
          r.overscrollBehavior?.includes("contain")
      )
    )
  };

  console.log(JSON.stringify(report, null, 2));

  const ok =
    wheelMoved &&
    pageMoved &&
    deep.owner === "scrollingElement" &&
    deep.history &&
    deep.communications &&
    deep.bottom &&
    deep.backToTop &&
    dialogLock.restored &&
    !report.nestedHasScrollOwnership;

  if (!ok) {
    console.error("\nSCROLL VERIFICATION FAILED");
    process.exit(1);
  }

  console.error("\nSCROLL VERIFICATION PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
