import { useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { getAuthHeaders } from "../../services/atlasAuthService";
import { apiRequest } from "../../services/apiClient";
import "./CommunicationAudioBubble.css";

function isOggLikeMime(mimeType) {
  const base = String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return base === "audio/ogg" || base === "audio/opus";
}

function canPlayMime(mimeType) {
  if (typeof document === "undefined") {
    return true;
  }
  try {
    const audio = document.createElement("audio");
    if (!mimeType) {
      return false;
    }
    return (
      audio.canPlayType(mimeType) !== "" ||
      audio.canPlayType(String(mimeType).split(";")[0]) !== ""
    );
  } catch {
    return false;
  }
}

async function fetchPlaybackUrl(prospectId, mediaId) {
  const headers = await getAuthHeaders();
  const response = await apiRequest(
    `/api/prospects/${encodeURIComponent(prospectId)}/communications/media/${encodeURIComponent(mediaId)}/playback`,
    { headers }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.message || "Voice message unavailable");
    error.status = response.status;
    error.code = payload.error || "MEDIA_PLAYBACK_FAILED";
    throw error;
  }
  return response.json();
}

export default function CommunicationAudioBubble({
  prospectId,
  media = null,
  testId = "communication-audio-bubble",
  initialPlayback = null
}) {
  const { translate } = useLanguage();
  const fetchStatus = String(media?.fetchStatus || "missing").toLowerCase();
  const transcodeStatus = String(media?.transcodeStatus || "").toLowerCase();
  const mediaId = media?.id || null;
  const [playback, setPlayback] = useState(initialPlayback);
  const [loadError, setLoadError] = useState(null);

  const pending = fetchStatus === "pending" || fetchStatus === "fetching";
  const fetchFailed = fetchStatus === "failed" || fetchStatus === "missing" || (!mediaId && !pending);
  const stored = fetchStatus === "stored" && Boolean(mediaId);
  const playbackPreparing =
    Boolean(media?.playbackPreparing) ||
    (stored && (transcodeStatus === "pending" || transcodeStatus === "processing"));
  const playbackFailed =
    Boolean(media?.playbackFailed) || (stored && transcodeStatus === "failed");
  const playbackAvailable = Boolean(media?.playbackAvailable);

  useEffect(() => {
    if (!stored || !prospectId || !mediaId || playbackPreparing || playbackFailed) {
      return undefined;
    }
    if (!playbackAvailable && transcodeStatus && transcodeStatus !== "ready" && transcodeStatus !== "not_required") {
      return undefined;
    }
    let cancelled = false;
    setLoadError(null);
    fetchPlaybackUrl(prospectId, mediaId)
      .then((payload) => {
        if (!cancelled) {
          setPlayback(payload);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(error.code || "MEDIA_PLAYBACK_FAILED");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stored, prospectId, mediaId, playbackPreparing, playbackFailed, playbackAvailable, transcodeStatus]);

  const derivativeReady = Boolean(
    playback?.url &&
      !isOggLikeMime(playback?.mimeType || media?.mimeType)
  );
  const fallbackPlayable = useMemo(() => {
    if (derivativeReady) {
      return true;
    }
    const mime = playback?.mimeType || media?.mimeType || "";
    if (!mime) {
      return false;
    }
    return canPlayMime(mime);
  }, [derivativeReady, playback?.mimeType, media?.mimeType]);

  if (pending) {
    return (
      <div className="communication-audio-bubble is-pending" data-testid={testId}>
        <p className="communication-audio-bubble__label">{translate("voiceMessagePending")}</p>
      </div>
    );
  }

  if (playbackPreparing || loadError === "MEDIA_PREPARING") {
    return (
      <div className="communication-audio-bubble is-preparing" data-testid={testId}>
        <p className="communication-audio-bubble__label">{translate("voiceMessage")}</p>
        <p className="communication-audio-bubble__hint">{translate("voiceMessagePreparing")}</p>
      </div>
    );
  }

  if (playbackFailed || loadError === "MEDIA_UNSUPPORTED_BROWSER") {
    return (
      <div className="communication-audio-bubble is-unsupported" data-testid={testId}>
        <p className="communication-audio-bubble__label">{translate("voiceMessage")}</p>
        <p className="communication-audio-bubble__hint">{translate("voiceMessageUnavailableInBrowser")}</p>
      </div>
    );
  }

  if (fetchFailed || loadError) {
    return (
      <div className="communication-audio-bubble is-failed" data-testid={testId}>
        <p className="communication-audio-bubble__label">{translate("voiceMessageUnavailable")}</p>
      </div>
    );
  }

  if (playback?.url && !fallbackPlayable) {
    return (
      <div className="communication-audio-bubble is-unsupported" data-testid={testId}>
        <p className="communication-audio-bubble__label">{translate("voiceMessage")}</p>
        <p className="communication-audio-bubble__hint">{translate("voiceMessageUnavailableInBrowser")}</p>
      </div>
    );
  }

  return (
    <div className="communication-audio-bubble is-ready" data-testid={testId}>
      <p className="communication-audio-bubble__label">{translate("voiceMessage")}</p>
      {playback?.url ? (
        <audio
          className="communication-audio-bubble__player"
          controls
          preload="none"
          src={playback.url}
        >
          {translate("voiceMessageUnavailableInBrowser")}
        </audio>
      ) : (
        <p className="communication-audio-bubble__hint">{translate("voiceMessagePreparing")}</p>
      )}
      {media?.durationMs ? (
        <p className="communication-audio-bubble__meta">
          {Math.max(1, Math.round(Number(media.durationMs) / 1000))}s
        </p>
      ) : null}
    </div>
  );
}
