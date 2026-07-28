/**
 * Build a query string while omitting undefined, null, empty, and literal "undefined" values.
 */
export function buildQueryString(params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    const text = String(value).trim();

    if (!text || text === "undefined") {
      continue;
    }

    search.set(key, text);
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}
