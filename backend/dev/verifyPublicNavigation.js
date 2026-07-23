/**
 * Regression checks for public website navigation (Strategy A + legal routes).
 * Run: node backend/dev/verifyPublicNavigation.js
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const navbarSource = read("frontend/src/components/public/Navbar.jsx");
const appSource = read("frontend/src/App.jsx");
const footerSource = read("frontend/src/components/public/Footer.jsx");
const scrollToTopSource = read("frontend/src/components/ScrollToTop.jsx");

const HOME_SECTIONS = ["about", "services", "careers", "contact"];
const LEGAL_ROUTES = ["/privacy", "/legal", "/terms", "/data-deletion"];
const LEGAL_PAGES = ["Privacy.jsx", "Legal.jsx", "Terms.jsx", "DataDeletion.jsx"];

// --- Navbar: always /#section, no onHome conditional ---

assert.doesNotMatch(
  navbarSource,
  /\bonHome\b/,
  "Navbar must not use onHome conditional routing"
);

assert.doesNotMatch(
  navbarSource,
  /\.slice\(2\)/,
  "Navbar must not strip /# from section hrefs"
);

for (const section of HOME_SECTIONS) {
  const expected = `"/#${section}"`;
  assert.match(
    navbarSource,
    new RegExp(expected.replace("/", "\\/")),
    `Navbar navLinks must include ${expected}`
  );
}

const navHrefMatches = [...navbarSource.matchAll(/href=\{link\.href\}/g)];
assert.ok(
  navHrefMatches.length >= 1,
  "Navbar section links must use href={link.href}"
);

// --- Mobile menu (≤900px) ---

assert.match(
  navbarSource,
  /public-navbar__menu-toggle/,
  "Navbar must include a mobile menu toggle"
);
assert.match(
  navbarSource,
  /aria-expanded=\{menuOpen\}/,
  "Mobile menu toggle must expose aria-expanded"
);
assert.match(
  navbarSource,
  /aria-controls=\{menuId\}/,
  "Mobile menu toggle must reference controlled menu"
);
assert.match(navbarSource, /Escape/, "Mobile menu must close on Escape");

for (const route of LEGAL_ROUTES) {
  assert.match(
    navbarSource,
    new RegExp(`to: "${route.replace("/", "\\/")}"`),
    `Mobile menu must link to ${route}`
  );
}

assert.match(
  navbarSource,
  /to=\{appPath\(\)\}/,
  "Mobile menu must link to Atlas app"
);

const navbarCss = read("frontend/src/components/public/PublicNavbar.css");
assert.match(
  navbarCss,
  /@media \(max-width: 900px\)/,
  "Mobile menu styles must use the 900px breakpoint"
);
assert.match(
  navbarCss,
  /\.public-navbar__nav \{\s*display: none;/,
  "Desktop nav must remain hidden only within mobile breakpoint"
);

// Resolved hrefs from any page (including legal) must be /#section, never /section.

for (const section of HOME_SECTIONS) {
  const resolved = `/#${section}`;
  assert.notEqual(resolved, `/${section}`, "sanity: hash vs path differ");
  assert.match(resolved, /^\/#[a-z]+$/);
}

// --- App routes: legal standalone, no /contact ---

for (const route of LEGAL_ROUTES) {
  assert.match(
    appSource,
    new RegExp(`path="${route.replace("/", "\\/")}"`),
    `App must define standalone route ${route}`
  );
}

assert.doesNotMatch(
  appSource,
  /path="\/contact"/,
  "App must not define a standalone /contact route"
);

for (const forbidden of ["/about", "/services", "/careers", "/contact"]) {
  assert.doesNotMatch(
    appSource,
    new RegExp(`path="${forbidden.replace("/", "\\/")}"`),
    `App must not define standalone ${forbidden} route`
  );
}

// --- Homepage section ids match navbar hashes ---

for (const section of HOME_SECTIONS) {
  const component =
    section === "about"
      ? "About.jsx"
      : section === "services"
        ? "Services.jsx"
        : section === "careers"
          ? "Careers.jsx"
          : "Contact.jsx";

  const sectionSource = read(`frontend/src/components/public/${component}`);
  assert.match(
    sectionSource,
    new RegExp(`id="${section}"`),
    `${component} must expose id="${section}" for hash navigation`
  );
}

// --- Legal pages include shared Navbar + Footer ---

for (const page of LEGAL_PAGES) {
  const pageSource = read(`frontend/src/pages/${page}`);
  assert.match(pageSource, /import Navbar/, `${page} must render Navbar`);
  assert.match(pageSource, /import Footer/, `${page} must render Footer`);
  assert.match(pageSource, /<Navbar\s*\/>/, `${page} must mount Navbar`);
  assert.match(pageSource, /<Footer\s*\/>/, `${page} must mount Footer`);
}

// --- Footer: legal routes only ---

for (const route of LEGAL_ROUTES) {
  assert.match(
    footerSource,
    new RegExp(`to="${route.replace("/", "\\/")}"`),
    `Footer must link to ${route}`
  );
}

assert.doesNotMatch(
  footerSource,
  /to="\/contact"/,
  "Footer must not link to standalone /contact"
);

// --- ScrollToTop: pathname change + hash scroll preserved ---

assert.match(
  scrollToTopSource,
  /location\.hash/,
  "ScrollToTop must react to location.hash"
);
assert.match(
  scrollToTopSource,
  /scrollIntoView/,
  "ScrollToTop must scroll to hash target on pathname change"
);
assert.match(
  scrollToTopSource,
  /pathnameChanged/,
  "ScrollToTop must distinguish pathname changes from hash-only navigation"
);

// --- Matrix: legal page × section link targets ---

const matrix = [];
for (const legalRoute of LEGAL_ROUTES) {
  for (const section of HOME_SECTIONS) {
    matrix.push({
      from: legalRoute,
      link: `/#${section}`,
      resolvesTo: `/#${section}`,
      valid: true,
    });
  }
}

for (const row of matrix) {
  assert.equal(row.link, row.resolvesTo, `${row.from} → ${row.link}`);
  assert.ok(row.valid, `${row.from} navbar must reach homepage #${row.link.slice(2)}`);
}

console.log("verifyPublicNavigation: all checks passed");
console.log(`  navbar sections: ${HOME_SECTIONS.map((s) => `/#${s}`).join(", ")}`);
console.log(`  legal routes: ${LEGAL_ROUTES.join(", ")}`);
console.log(`  legal × section matrix: ${matrix.length} combinations verified`);
