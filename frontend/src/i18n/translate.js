/**
 * Interpolate {placeholders} in translation strings.
 */
export function interpolate(template, params = {}) {
  if (!template) {
    return "";
  }

  return Object.entries(params).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template
  );
}
