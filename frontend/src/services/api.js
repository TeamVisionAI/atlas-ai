export async function getDashboard() {
  const response = await fetch("/api/dashboard");

  if (!response.ok) {
    throw new Error("Failed to load dashboard");
  }

  return response.json();
}