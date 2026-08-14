# Communication Modalities

## AI Summary

Atlas communication modalities (WhatsApp text, WhatsApp audio, future SMS/email/voice/live-transfer) plug into the **same** canonical prospect, tenant, conversation, ownership, qualification, routing, Mission Control, Prospect Workspace, and outcome model. WhatsApp audio is the first media modality. Do not build parallel CRMs or workflows per channel.

## Principle

```
Connector (WhatsApp / SMS / email / voice)
        ↓
Normalized inbound communication
        ↓
Canonical prospect + org + conversation_logs + ownership + qualification
        ↓
Mission Control / Conversations / Prospect Workspace / outcomes
```

Media is a **payload kind** on the existing communication, not a new product surface.

## Phase 0 — classification

| REAL COMMUNICATION | OPERATIONAL / INTERNAL |
|---|---|
| Inbound/outbound WhatsApp text | `[whatsapp_outbound:…]` |
| Inbound WhatsApp audio / media | Workflow / qualification saves |
| Future human/Atlas modalities | Diagnostics, provider failures, notes, system events |

Prefer structured fields: `direction`, `channel`, `intent`, `messageType`, `media_kind`.  
Do not classify solely by “text starts with `[`”. `[audio message]` is a compatibility placeholder, not an operational row.

## Phase 1 — WhatsApp audio (no STT)

1. Parse Meta `type=audio` (`id`, `mime_type`, `voice`, `sha256`, `file_size`, wamid).
2. Persist org-scoped `communication_media` (`fetch_status=pending`).
3. Return webhook fast; poller fetches Graph media with **server-side** credentials.
4. Store original bytes in private bucket: `organizationId/prospectId/wamid/original.<ext>`.
5. Authorized agents play via short-lived signed URL (org + prospect guards).
6. Shared UI: `CommunicationAudioBubble` in Conversations, Mission Control thread, Prospect Workspace timeline.

Pre-STT Recruit AI: persist/show/play only. BR-118 soft ack on V2-eligible path. Legacy CE must not interpret the placeholder. No TAKE OVER, no BR-080 rewrite, no qualification mutation from audio.

## Phase 1B — Safari/iOS playback transcoding (no STT)

Same poller lifecycle. After original store:

1. If mime is already browser-native (MP3/M4A/AAC) → `transcode_status=not_required`, playback = original.
2. Else transcode with `ffmpeg-static` → MP3 (`audio/mpeg`, 64 kbps mono 22.05 kHz).
3. Store derivative: `organizationId/prospectId/wamid/playback.mp3`.
4. Playback endpoint prefers `playback_path`; pending → preparing; failed derivative → unavailable in this browser (original kept).

Do not depend on system ffmpeg. Frontend does not use Safari OGG `canPlayType` on the derivative path.

## Phase 2 — Spanish-first STT + semantic replay (BR-141, staging)

```
audio → private original → MP3 derivative → OpenAI gpt-transcribe
     → durable transcript → Recruit AI V2 text path → one Atlas reply
```

- STT input is the Atlas MP3 playback derivative after `transcode_status=ready|not_required`.
- Semantic replay id is `audio-stt:{communicationMediaId}`. Original wamid is linkage only.
- Webhook does not BR-118-ack. Fast STT → one semantic reply. Slow/fail → one soft ack or type-please.
- Do not insert a second inbound conversation log. Do not enable execution gates.
- UI: player + transcript (pending / ready / unavailable). Audio remains `messageType=audio`.

## Out of scope (do not build now)

- Production STT migrate/deploy
- whisper-1 / chat/completions / realtime live transcription
- Deepgram unless OpenAI staging Spanish eval fails
- SMS / email / live voice calling / live transfer
- Public media URLs or Meta token exposure

## Related

- [BR-140](../../06-business/BUSINESS_RULES.md)
- [BR-141](../../06-business/BUSINESS_RULES.md)
- [COMMUNICATION_CONNECTORS.md](./COMMUNICATION_CONNECTORS.md)
- [BR-118](../../06-business/BUSINESS_RULES.md) non-text media dialogue guard
