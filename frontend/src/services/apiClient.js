const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? "" : "https://atlas-ai-production-01de.up.railway.app");

export async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);

  if (!response.ok) {
    throw new Error(
      `API ${response.status}: ${response.statusText}`
    );
  }

  return response.json();
}

export async function apiRequest(path, options = {}) {
  return fetch(`${API_BASE}${path}`, options);
}

export { API_BASE };
