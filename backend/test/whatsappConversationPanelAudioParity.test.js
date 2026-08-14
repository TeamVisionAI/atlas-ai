/**
 * Upper WhatsApp Conversation panel must reuse Communications Center public media.
 * BR-140 — no second availability path.
 */

require("dotenv").config();

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  attachPublicMediaToConversationMessages,
  toPublicMedia
} = require("../core/communicationMedia/communicationMediaRepository");
const { FETCH_STATUS, TRANSCODE_STATUS } = require("../core/communicationMedia/constants");

const ORG = "00000000-0000-4000-8000-000000000001";
const PROSPECT = "b9999999-9999-4999-8999-999999999999";
const LOG_ID = "bef88258-88af-43dc-a2aa-8073db712490";

function readyRow() {
  return {
    id: "media-ready-1",
    organization_id: ORG,
    prospect_id: PROSPECT,
    conversation_log_id: LOG_ID,
    provider_message_id: "wamid.STAGING_AUDIO_TEST_001",
    media_kind: "audio",
    fetch_status: FETCH_STATUS.STORED,
    transcode_status: TRANSCODE_STATUS.READY,
    storage_path: `${ORG}/${PROSPECT}/wamid.STAGING_AUDIO_TEST_001/original.ogg`,
    playback_path: `${ORG}/${PROSPECT}/wamid.STAGING_AUDIO_TEST_001/playback.mp3`,
    playback_mime_type: "audio/mpeg"
  };
}

test("ready communication_media attaches playbackAvailable to the WhatsApp thread message", () => {
  const messages = [
    {
      id: LOG_ID,
      text: "[audio message]",
      direction: "incoming",
      sender: "prospect",
      timestamp: "2026-08-13T23:07:56.317Z"
    }
  ];
  const attached = attachPublicMediaToConversationMessages(messages, [readyRow()]);
  assert.equal(attached[0].messageType, "audio");
  assert.equal(attached[0].media.id, "media-ready-1");
  assert.equal(attached[0].media.fetchStatus, "stored");
  assert.equal(attached[0].media.transcodeStatus, "ready");
  assert.equal(attached[0].media.playbackAvailable, true);
  assert.equal(attached[0].media.playbackPreparing, false);
  assert.equal("storage_path" in attached[0].media, false);
  assert.deepEqual(toPublicMedia(readyRow()), attached[0].media);
});

test("pending and failed media attach the same public availability flags used by Communications Center", () => {
  const pending = attachPublicMediaToConversationMessages(
    [{ id: LOG_ID, text: "[audio message]", direction: "incoming" }],
    [
      {
        ...readyRow(),
        fetch_status: FETCH_STATUS.PENDING,
        transcode_status: TRANSCODE_STATUS.PENDING,
        playback_path: null
      }
    ]
  );
  assert.equal(pending[0].media.fetchStatus, "pending");
  assert.equal(pending[0].media.playbackAvailable, false);

  const failed = attachPublicMediaToConversationMessages(
    [{ id: LOG_ID, text: "[audio message]", direction: "incoming" }],
    [
      {
        ...readyRow(),
        fetch_status: FETCH_STATUS.FAILED,
        transcode_status: TRANSCODE_STATUS.PENDING,
        playback_path: null
      }
    ]
  );
  assert.equal(failed[0].media.fetchStatus, "failed");
  assert.equal(failed[0].media.playbackAvailable, false);
});

test("thread messages without a matching conversation_log_id stay unattached", () => {
  const messages = [{ id: "other-log", text: "[audio message]", direction: "incoming" }];
  const attached = attachPublicMediaToConversationMessages(messages, [readyRow()]);
  assert.equal(attached[0].media, undefined);
});
