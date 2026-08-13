/**
 * Phase 1F — shared CommunicationAudioBubble in Conversations / MC / Workspace.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../../../");

test("shared audio bubble is wired into Conversations, MC, and Workspace", () => {
  const timeline = fs.readFileSync(
    path.join(
      __dirname,
      "../../features/prospect-workspace/components/CommunicationsCenterTimeline.jsx"
    ),
    "utf8"
  );
  const panel = fs.readFileSync(
    path.join(__dirname, "../ConversationPanel.jsx"),
    "utf8"
  );
  const history = fs.readFileSync(
    path.join(
      __dirname,
      "../../features/prospect-workspace/components/CommunicationHistorySection.jsx"
    ),
    "utf8"
  );
  assert.match(timeline, /CommunicationAudioBubble/);
  assert.match(timeline, /cc-audio-bubble/);
  assert.match(timeline, /cc-audio-bubble-workspace/);
  assert.match(panel, /CommunicationAudioBubble/);
  assert.match(panel, /mc-audio-bubble/);
  assert.match(history, /prospectId=\{prospectCoreId\}/);
});

test("pending, preparing, failed, and ready derivative bubbles render safely", async () => {
  const server = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error"
  });

  try {
    const bubbleModule = await server.ssrLoadModule(
      "/src/components/communication/CommunicationAudioBubble.jsx"
    );
    const languageModule = await server.ssrLoadModule("/src/i18n/LanguageContext.jsx");
    const CommunicationAudioBubble = bubbleModule.default;
    const { LanguageProvider } = languageModule;

    const pendingHtml = renderToString(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(CommunicationAudioBubble, {
          prospectId: "prospect-1",
          media: { id: "m-pending", mediaKind: "audio", fetchStatus: "pending" },
          testId: "audio-pending"
        })
      )
    );
    assert.match(pendingHtml, /communication-audio-bubble/);
    assert.match(pendingHtml, /Loading voice message|Cargando mensaje de voz|voiceMessagePending/);
    assert.doesNotMatch(pendingHtml, /Graph 190|invalid token|OAuthException|meta_media_id/i);

    const failedHtml = renderToString(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(CommunicationAudioBubble, {
          prospectId: "prospect-1",
          media: {
            id: "m-failed",
            mediaKind: "audio",
            fetchStatus: "failed",
            fetchError: "Graph 190 OAuthException invalid token"
          },
          testId: "audio-failed"
        })
      )
    );
    assert.match(failedHtml, /Voice message unavailable|Mensaje de voz no disponible|voiceMessageUnavailable/);
    assert.doesNotMatch(failedHtml, /Graph 190|OAuthException|invalid token/i);

    const preparingHtml = renderToString(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(CommunicationAudioBubble, {
          prospectId: "prospect-1",
          media: {
            id: "m-prep",
            mediaKind: "audio",
            fetchStatus: "stored",
            transcodeStatus: "processing",
            playbackPreparing: true,
            playbackAvailable: false
          },
          testId: "audio-preparing"
        })
      )
    );
    assert.match(preparingHtml, /Voice message|Mensaje de voz|voiceMessage/);
    assert.match(preparingHtml, /Preparing audio|Preparando audio|voiceMessagePreparing/);
    assert.doesNotMatch(preparingHtml, /ffmpeg|libmp3lame|opus|Graph 190/i);

    const unsupportedHtml = renderToString(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(CommunicationAudioBubble, {
          prospectId: "prospect-1",
          media: {
            id: "m-unsupported",
            mediaKind: "audio",
            fetchStatus: "stored",
            transcodeStatus: "failed",
            playbackFailed: true,
            playbackAvailable: false
          },
          testId: "audio-unsupported"
        })
      )
    );
    assert.match(
      unsupportedHtml,
      /Voice message unavailable in this browser|Mensaje de voz no disponible en este navegador|voiceMessageUnavailableInBrowser/
    );
    assert.doesNotMatch(unsupportedHtml, /ffmpeg|stderr|codec|storage_path/i);

    const readyHtml = renderToString(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(CommunicationAudioBubble, {
          prospectId: "prospect-1",
          media: {
            id: "m-ready",
            mediaKind: "audio",
            mimeType: "audio/mpeg",
            fetchStatus: "stored",
            transcodeStatus: "ready",
            playbackAvailable: true
          },
          initialPlayback: {
            url: "https://signed.example/playback.mp3",
            mimeType: "audio/mpeg"
          },
          testId: "audio-ready"
        })
      )
    );
    assert.match(readyHtml, /<audio/);
    assert.match(readyHtml, /playback\.mp3/);
    assert.match(readyHtml, /Voice message|Mensaje de voz|voiceMessage/);
    assert.doesNotMatch(readyHtml, /canPlayType|audio\/ogg/i);
  } finally {
    await server.close();
  }
});

test("upper WhatsApp panel and Communications Center share ready/pending/failed audio states", async () => {
  const server = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error"
  });

  try {
    const bubbleModule = await server.ssrLoadModule(
      "/src/components/communication/CommunicationAudioBubble.jsx"
    );
    const panelModule = await server.ssrLoadModule("/src/components/ConversationPanel.jsx");
    const languageModule = await server.ssrLoadModule("/src/i18n/LanguageContext.jsx");
    const CommunicationAudioBubble = bubbleModule.default;
    const ConversationPanel = panelModule.default;
    const { LanguageProvider } = languageModule;

    const readyMedia = {
      id: "media-ready-1",
      mediaKind: "audio",
      mimeType: "audio/mpeg",
      fetchStatus: "stored",
      transcodeStatus: "ready",
      playbackAvailable: true
    };
    const pendingMedia = {
      id: "media-pending-1",
      mediaKind: "audio",
      fetchStatus: "pending",
      playbackAvailable: false
    };
    const failedMedia = {
      id: "media-failed-1",
      mediaKind: "audio",
      fetchStatus: "failed",
      playbackAvailable: false
    };

    function wrap(node) {
      return React.createElement(LanguageProvider, null, node);
    }

    const placeholderOnly = renderToString(
      wrap(
        React.createElement(ConversationPanel, {
          prospectId: "prospect-1",
          messages: [
            {
              id: "log-audio",
              text: "[audio message]",
              direction: "incoming",
              timestamp: "2026-08-13T23:07:56.317Z"
            }
          ]
        })
      )
    );
    assert.match(placeholderOnly, /Voice message unavailable|Mensaje de voz no disponible|voiceMessageUnavailable/);
    assert.doesNotMatch(placeholderOnly, /<audio/);

    const upperReady = renderToString(
      wrap(
        React.createElement(ConversationPanel, {
          prospectId: "prospect-1",
          messages: [
            {
              id: "log-audio",
              text: "[audio message]",
              direction: "incoming",
              messageType: "audio",
              media: readyMedia,
              timestamp: "2026-08-13T23:07:56.317Z"
            }
          ]
        })
      )
    );
    const lowerReady = renderToString(
      wrap(
        React.createElement(CommunicationAudioBubble, {
          prospectId: "prospect-1",
          media: readyMedia,
          initialPlayback: { url: "https://signed.example/playback.mp3", mimeType: "audio/mpeg" },
          testId: "cc-audio-bubble"
        })
      )
    );
    assert.match(upperReady, /communication-audio-bubble/);
    assert.doesNotMatch(upperReady, /Voice message unavailable|Mensaje de voz no disponible|voiceMessageUnavailable/);
    assert.match(lowerReady, /<audio/);
    assert.match(lowerReady, /playback\.mp3/);

    const upperPending = renderToString(
      wrap(
        React.createElement(ConversationPanel, {
          prospectId: "prospect-1",
          messages: [{ id: "log-p", text: "[audio message]", direction: "incoming", media: pendingMedia }]
        })
      )
    );
    const lowerPending = renderToString(
      wrap(
        React.createElement(CommunicationAudioBubble, {
          prospectId: "prospect-1",
          media: pendingMedia,
          testId: "cc-audio-bubble"
        })
      )
    );
    assert.match(upperPending, /Loading voice message|Cargando mensaje de voz|voiceMessagePending/);
    assert.match(lowerPending, /Loading voice message|Cargando mensaje de voz|voiceMessagePending/);

    const upperFailed = renderToString(
      wrap(
        React.createElement(ConversationPanel, {
          prospectId: "prospect-1",
          messages: [{ id: "log-f", text: "[audio message]", direction: "incoming", media: failedMedia }]
        })
      )
    );
    const lowerFailed = renderToString(
      wrap(
        React.createElement(CommunicationAudioBubble, {
          prospectId: "prospect-1",
          media: failedMedia,
          testId: "cc-audio-bubble"
        })
      )
    );
    assert.match(upperFailed, /Voice message unavailable|Mensaje de voz no disponible|voiceMessageUnavailable/);
    assert.match(lowerFailed, /Voice message unavailable|Mensaje de voz no disponible|voiceMessageUnavailable/);
  } finally {
    await server.close();
  }
});
