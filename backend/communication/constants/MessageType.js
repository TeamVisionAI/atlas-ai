const MessageType = Object.freeze({
  TEXT: "text",
  IMAGE: "image",
  AUDIO: "audio",
  VIDEO: "video",
  FILE: "file",
  LOCATION: "location",
  QUICK_REPLY: "quick_reply",
  POSTBACK: "postback",
  UNKNOWN: "unknown"
});

module.exports = {
  MessageType
};
