/**
 * Read-only TikTok LIVE engagements (BR-230).
 */

import { apiFetch } from "./apiClient";

export class TiktokLiveEngagementsError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "TiktokLiveEngagementsError";
    this.status = status;
  }
}

export async function getTiktokLiveEngagements() {
  try {
    return await apiFetch("/api/tiktok-live-engagements");
  } catch (error) {
    const match = String(error.message || "").match(/^API (\d+):/);
    throw new TiktokLiveEngagementsError(
      "Failed to load TikTok LIVE engagements",
      match ? Number(match[1]) : error.status
    );
  }
}
