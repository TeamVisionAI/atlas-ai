import { useEffect } from "react";
import {
  TRANSCRIPT_REFRESH_INTERVAL_MS,
  startTranscriptRefreshPoll
} from "../engines/communicationTranscriptRefresh.js";

/**
 * Poll `refresh` while `shouldPoll` is true. Stops on unmount, prospect change,
 * or when shouldPoll becomes false (all visible transcripts terminal).
 */
export function useTranscriptRefreshPoll({
  prospectId,
  shouldPoll,
  refresh,
  intervalMs = TRANSCRIPT_REFRESH_INTERVAL_MS
}) {
  useEffect(() => {
    if (!prospectId || !shouldPoll || typeof refresh !== "function") {
      return undefined;
    }
    let cancelled = false;
    const stop = startTranscriptRefreshPoll({
      shouldPoll: true,
      intervalMs,
      refresh: async () => {
        if (cancelled) {
          return;
        }
        await refresh();
      }
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [prospectId, shouldPoll, refresh, intervalMs]);
}
