import {
  PUBLIC_SITE_BRAND,
  ATLAS_MARKETING_ORIGIN,
  resolvePublicSiteBrand
} from "./publicSiteHost.js";
import { ATLAS_BRAND_ASSETS, TEAM_VISION_BRAND_ASSETS } from "./publicBrandAssets.js";

function upsertLink({ rel, href, type, sizes, id }) {
  const selector = id ? `link#${id}` : `link[data-atlas-brand="${rel}"]`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("link");
    if (id) {
      el.id = id;
    }
    el.setAttribute("data-atlas-brand", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("rel", rel);
  el.setAttribute("href", href);
  if (type) {
    el.setAttribute("type", type);
  } else {
    el.removeAttribute("type");
  }
  if (sizes) {
    el.setAttribute("sizes", sizes);
  } else {
    el.removeAttribute("sizes");
  }
  return el;
}

function upsertMeta({ attr, key, content }) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return el;
}

function removeAtlasManagedLinks() {
  document.head.querySelectorAll("link[data-atlas-brand]").forEach((el) => el.remove());
}

function absoluteAssetUrl(path, hostname) {
  if (typeof window === "undefined") {
    return `${ATLAS_MARKETING_ORIGIN}${path}`;
  }
  const host = String(hostname || window.location.hostname || "").toLowerCase();
  if (host.includes("useatlas-ai.com")) {
    return `${window.location.origin}${path}`;
  }
  return `${ATLAS_MARKETING_ORIGIN}${path}`;
}

/**
 * Apply host-aware favicon / apple-touch / manifest / default social meta.
 * Atlas + app hosts → Atlas assets. Team Vision → preserve existing SVG favicon.
 */
export function applyPublicBrandHead(hostname) {
  if (typeof document === "undefined") {
    return resolvePublicSiteBrand(hostname);
  }

  const brand = resolvePublicSiteBrand(hostname);
  const isAtlasPlatform =
    brand === PUBLIC_SITE_BRAND.ATLAS || brand === PUBLIC_SITE_BRAND.APP;

  removeAtlasManagedLinks();

  if (!isAtlasPlatform) {
    // Restore / keep Team Vision default favicon from index.html
    const existing = document.head.querySelector('link[rel="icon"]');
    if (existing && !existing.getAttribute("data-atlas-brand")) {
      existing.setAttribute("href", TEAM_VISION_BRAND_ASSETS.faviconSvg);
      existing.setAttribute("type", "image/svg+xml");
    }
    return brand;
  }

  // Clear generic index.html icon so Atlas icons win
  document.head.querySelectorAll('link[rel="icon"]').forEach((el) => {
    if (!el.getAttribute("data-atlas-brand")) {
      el.remove();
    }
  });

  upsertLink({
    id: "atlas-favicon-ico",
    rel: "icon",
    href: ATLAS_BRAND_ASSETS.faviconIco,
    type: "image/x-icon"
  });
  upsertLink({
    id: "atlas-favicon-32",
    rel: "icon",
    href: ATLAS_BRAND_ASSETS.favicon32,
    type: "image/png",
    sizes: "32x32"
  });
  upsertLink({
    id: "atlas-favicon-16",
    rel: "icon",
    href: ATLAS_BRAND_ASSETS.favicon16,
    type: "image/png",
    sizes: "16x16"
  });
  upsertLink({
    id: "atlas-apple-touch",
    rel: "apple-touch-icon",
    href: ATLAS_BRAND_ASSETS.appleTouchIcon,
    sizes: "180x180"
  });
  upsertLink({
    id: "atlas-manifest",
    rel: "manifest",
    href: ATLAS_BRAND_ASSETS.manifest
  });

  const ogImage = absoluteAssetUrl(ATLAS_BRAND_ASSETS.ogImage, hostname);

  if (brand === PUBLIC_SITE_BRAND.ATLAS) {
    upsertMeta({ attr: "property", key: "og:title", content: "Atlas AI" });
    upsertMeta({
      attr: "property",
      key: "og:description",
      content:
        "Connect • Automate • Grow — recruiting, follow-up, scheduling, and team execution."
    });
    upsertMeta({ attr: "property", key: "og:image", content: ogImage });
    upsertMeta({ attr: "property", key: "og:type", content: "website" });
    upsertMeta({ attr: "property", key: "og:site_name", content: "Atlas AI" });
    upsertMeta({ attr: "name", key: "twitter:card", content: "summary_large_image" });
    upsertMeta({ attr: "name", key: "twitter:title", content: "Atlas AI" });
    upsertMeta({ attr: "name", key: "twitter:image", content: ogImage });
  }

  if (!document.title || document.title === "Team Vision Financial") {
    document.title = brand === PUBLIC_SITE_BRAND.APP ? "Atlas AI" : "Atlas AI";
  }

  return brand;
}

export function usesAtlasPlatformAssets(hostname) {
  const brand = resolvePublicSiteBrand(hostname);
  return brand === PUBLIC_SITE_BRAND.ATLAS || brand === PUBLIC_SITE_BRAND.APP;
}
