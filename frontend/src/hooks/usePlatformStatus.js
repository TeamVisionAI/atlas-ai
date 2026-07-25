import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchPlatformStatus,
  PlatformStatusError
} from "../services/platformStatusService";
import { getFreshnessState } from "../utils/platformStatusDisplay";

export function usePlatformStatus({ enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const [lastSuccessfulRefreshAt, setLastSuccessfulRefreshAt] = useState(null);
  const hasDataRef = useRef(false);

  const refresh = useCallback(
    async ({ force = false } = {}) => {
      if (!enabled) {
        return;
      }

      setLoading(true);

      if (force) {
        setRefreshError(null);
      }

      try {
        const payload = await fetchPlatformStatus({ forceRefresh: force });

        if (!payload.ok || !payload.data) {
          throw new PlatformStatusError("Platform status payload was incomplete.");
        }

        setData(payload.data);
        setWarnings(Array.isArray(payload.warnings) ? payload.warnings : []);
        setGeneratedAt(payload.generatedAt || payload.data.generatedAt || null);
        setCached(Boolean(payload.cached));
        setLastSuccessfulRefreshAt(new Date().toISOString());
        hasDataRef.current = true;
        setError(null);
        setRefreshError(null);
      } catch (loadError) {
        console.error("[usePlatformStatus] refresh failed", loadError);

        if (hasDataRef.current) {
          setRefreshError(loadError);
        } else {
          setError(loadError);
        }
      } finally {
        setLoading(false);
      }
    },
    [enabled]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const freshness = getFreshnessState({
    generatedAt,
    cached,
    hasData: Boolean(data),
    error: refreshError || error
  });

  return {
    data,
    warnings,
    generatedAt,
    cached,
    loading,
    error,
    refreshError,
    lastSuccessfulRefreshAt,
    freshness,
    refresh
  };
}
