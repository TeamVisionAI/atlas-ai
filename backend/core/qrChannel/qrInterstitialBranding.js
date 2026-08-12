/**
 * Public QR phone-bind interstitial branding tokens.
 *
 * Phase A: Team Vision / Atlas defaults (navy + gold).
 * Structure is intentionally tenant-ready — values can later come from
 * organization branding config without changing HTML structure.
 *
 * Do not hardcode WhatsApp green as a page-dominant color.
 */

const DEFAULT_QR_INTERSTITIAL_BRANDING = Object.freeze({
  organizationDisplayName: "Team Vision",
  productName: "Atlas",
  logoUrl: null,
  colors: Object.freeze({
    background: "#0b1220",
    backgroundGlow: "#1e3a5f",
    surface: "#111827",
    text: "#f8fafc",
    textMuted: "#94a3b8",
    border: "#334155",
    inputBackground: "#0f172a",
    accent: "#e0b84c",
    accentPress: "#c9a227",
    accentContrast: "#0b1220",
    focusRing: "rgba(224, 184, 76, 0.55)",
    error: "#f0a5a0",
    /** Optional small accent only — never use as full-page / CTA fill. */
    whatsappAccent: "#25d366"
  })
});

/**
 * @param {Partial<typeof DEFAULT_QR_INTERSTITIAL_BRANDING>} [overrides]
 */
function resolveQrInterstitialBranding(overrides = {}) {
  const colors = {
    ...DEFAULT_QR_INTERSTITIAL_BRANDING.colors,
    ...(overrides.colors || {})
  };
  return {
    organizationDisplayName:
      overrides.organizationDisplayName ||
      DEFAULT_QR_INTERSTITIAL_BRANDING.organizationDisplayName,
    productName:
      overrides.productName || DEFAULT_QR_INTERSTITIAL_BRANDING.productName,
    logoUrl:
      overrides.logoUrl === undefined
        ? DEFAULT_QR_INTERSTITIAL_BRANDING.logoUrl
        : overrides.logoUrl,
    colors
  };
}

function brandingCssVariables(branding = DEFAULT_QR_INTERSTITIAL_BRANDING) {
  const c = branding.colors;
  return `
    --qi-bg: ${c.background};
    --qi-bg-glow: ${c.backgroundGlow};
    --qi-surface: ${c.surface};
    --qi-text: ${c.text};
    --qi-muted: ${c.textMuted};
    --qi-border: ${c.border};
    --qi-input-bg: ${c.inputBackground};
    --qi-accent: ${c.accent};
    --qi-accent-press: ${c.accentPress};
    --qi-accent-contrast: ${c.accentContrast};
    --qi-focus: ${c.focusRing};
    --qi-err: ${c.error};
  `.trim();
}

module.exports = {
  DEFAULT_QR_INTERSTITIAL_BRANDING,
  resolveQrInterstitialBranding,
  brandingCssVariables
};
