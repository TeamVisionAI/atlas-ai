const CommunicationEvent = Object.freeze({
  MESSAGE_RECEIVED: "message.received",
  MESSAGE_SENT: "message.sent",
  CONVERSATION_CREATED: "conversation.created",
  CONVERSATION_UPDATED: "conversation.updated",
  HUMAN_TAKEOVER: "human.takeover",
  HUMAN_RELEASE: "human.release",
  HUMAN_MESSAGE_WAITING: "human.message.waiting",
  AI_RESPONSE_GENERATED: "ai.response.generated",
  AI_ERROR: "ai.error"
});

module.exports = {
  CommunicationEvent
};
