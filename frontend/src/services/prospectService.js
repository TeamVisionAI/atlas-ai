import { getDashboard } from "./api";

export async function getProspect(id) {
  const dashboard = await getDashboard();

  return dashboard.prospects.find(
    p => p.id === id
  );
}