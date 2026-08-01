import { apiRequest } from "./apiClient";

export async function fetchInterviewAssignmentCandidates() {
  const response = await apiRequest("/api/interview-assignment/candidates");

  if (!response.ok) {
    throw new Error("Unable to load interview assignment candidates.");
  }

  return response.json();
}
