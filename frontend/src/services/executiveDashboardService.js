export async function getExecutiveDashboard() {
  const response = await fetch("/api/dashboard/executive");

  if (!response.ok) {
    throw new Error("Failed to load executive dashboard");
  }

  return response.json();
}

export async function getExecutiveRecommendations(limit = 5) {
  const response = await fetch(
    `/api/dashboard/recommendations?limit=${encodeURIComponent(limit)}`
  );

  if (!response.ok) {
    throw new Error("Failed to load recommendations");
  }

  return response.json();
}

export async function getExecutiveActivity(limit = 20) {
  const response = await fetch(
    `/api/dashboard/activity?limit=${encodeURIComponent(limit)}`
  );

  if (!response.ok) {
    throw new Error("Failed to load activity");
  }

  return response.json();
}
