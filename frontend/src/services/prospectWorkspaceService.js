
export class ProspectWorkspaceError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ProspectWorkspaceError";
    this.status = status;
  }
}

/**
 * @param {string} phone
 * @returns {Promise<Object | null>}
 */
export async function getProspectWorkspace(phone) {
  const response = await fetch(`/api/prospect-workspace/${encodeURIComponent(phone)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new ProspectWorkspaceError("Failed to load prospect workspace", response.status);
  }

  return response.json();
}

export async function updateProspectCommunicationLanguage(phone, communicationLanguage) {
  const response = await fetch(
    `/api/prospect-workspace/${encodeURIComponent(phone)}/communication-language`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ communication_language: communicationLanguage })
    }
  );

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ProspectWorkspaceError(
      payload.message || "Failed to update communication language",
      response.status
    );
  }

  return payload;
}
