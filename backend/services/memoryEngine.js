function buildMemory(prospect) {

    return {
      name: prospect.name || null,
  
      language: prospect.language || "unknown",
  
      city: prospect.city || null,
  
      state: prospect.state || null,
  
      occupation: prospect.occupation || null,
  
      workAuthorized: prospect.work_authorized,
  
      interviewType: prospect.interview_type || null,
  
      interviewTime: prospect.interview_time || null,
  
      pipeline: prospect.current_step,
  
      lastIntent: prospect.last_intent || null,
  
      lastQuestion: prospect.last_question || null,
  
      lastObjection: prospect.last_objection || null,
  
      notes: prospect.notes || "",
  
      conversationCount:
        prospect.conversation_count || 0
    };
  
  }
  
  module.exports = {
    buildMemory
  };