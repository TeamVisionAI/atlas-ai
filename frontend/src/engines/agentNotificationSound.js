/**
 * BR-176 — one-shot notification chime. Respects autoplay; never loops.
 */

export function playAgentNotificationChime({ audioContextFactory = null } = {}) {
  const Ctx = audioContextFactory || globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) {
    return { played: false, reason: "NO_AUDIO_CONTEXT" };
  }

  try {
    const context = new Ctx();
    if (context.state === "suspended" && typeof context.resume !== "function") {
      return { played: false, reason: "AUTOPLAY_BLOCKED" };
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.05;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    oscillator.onended = () => {
      context.close?.();
    };
    return { played: true, reason: null };
  } catch {
    return { played: false, reason: "AUTOPLAY_BLOCKED" };
  }
}

export function shouldPlayIncomingChime({
  soundEnabled,
  previousIds,
  incoming,
  isInitialLoad
}) {
  if (isInitialLoad || !soundEnabled) {
    return false;
  }
  const known = new Set(previousIds || []);
  return (incoming || []).some(
    (item) => item && !item.readAt && item.id && !known.has(item.id)
  );
}
