import { useCallback, useEffect, useRef, useState } from "react";
import {
  acknowledgeUrgentAppointmentHandoff,
  fetchUrgentAppointmentHandoffs
} from "../services/urgentAppointmentHandoffService";

const POLL_INTERVAL_MS = 30_000;

function playUrgentAlertSound() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const context = new window.AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.35);
    oscillator.onended = () => {
      context.close().catch(() => {});
    };
  } catch {
    // Non-blocking — UI banner still renders without audio.
  }
}

export function useUrgentAppointmentHandoffs(enabled = true) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const seenIdsRef = useRef(new Set());

  const reload = useCallback(async () => {
    if (!enabled) {
      return;
    }

    try {
      const result = await fetchUrgentAppointmentHandoffs();
      const nextItems = Array.isArray(result?.items) ? result.items : [];
      const nextIds = new Set(nextItems.map((item) => item.id));

      for (const item of nextItems) {
        if (!seenIdsRef.current.has(item.id)) {
          playUrgentAlertSound();
          break;
        }
      }

      seenIdsRef.current = nextIds;
      setItems(nextItems);
      setError(null);
    } catch (loadError) {
      setError(loadError.message || "urgentHandoffLoadError");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setLoading(false);
      return undefined;
    }

    reload();
    const timer = setInterval(reload, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, reload]);

  const acknowledge = useCallback(
    async (handoffId) => {
      await acknowledgeUrgentAppointmentHandoff(handoffId);
      seenIdsRef.current.delete(handoffId);
      setItems((current) => current.filter((item) => item.id !== handoffId));
    },
    []
  );

  return {
    items,
    loading,
    error,
    reload,
    acknowledge
  };
}
