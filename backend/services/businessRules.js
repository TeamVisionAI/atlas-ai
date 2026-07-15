// Atlas Business Rules v1
// Team Vision Recruiting Process

const rules = {

    // Conversation
    AUTO_DETECT_LANGUAGE: true,
    ALWAYS_ANSWER_INTERRUPTIONS: true,
    NEVER_ASK_LANGUAGE: true,
  
    // Recruiting Flow
    REQUIRE_WORK_AUTHORIZATION: true,
    COLLECT_CITY_BEFORE_SCHEDULING: true,
    COLLECT_OCCUPATION: true,
  
    // Business
    NEVER_DISCUSS_REGISTRATION_COST_BEFORE_PRESENTATION: true,
    NEVER_PROMISE_INCOME: true,
    NEVER_GUARANTEE_LICENSE: true,
  
    // Scheduling
    ALWAYS_CREATE_CALENDAR_EVENT: true,
    ALWAYS_CONFIRM_APPOINTMENT: true,
  
    // Human Handoff
    ALLOW_HUMAN_TAKEOVER: true,
  
    // Learning
    LOG_ALL_CONVERSATIONS: true,
    LEARN_FROM_REAL_CONVERSATIONS: true
  
  };
  
  module.exports = rules;