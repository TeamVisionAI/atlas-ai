/**
 * @typedef {Object} MissionControlProspect
 * @property {string | null} name
 * @property {string} phone
 * @property {string | null} city
 * @property {string | null} state
 * @property {string | null} [occupation]
 */

/**
 * @typedef {Object} MissionControlBrain
 * @property {"en" | "es" | string} language
 * @property {string} intent
 * @property {string} currentStep
 * @property {string | null} interviewType
 * @property {string[]} missingFields
 */

/**
 * @typedef {Object} MissionControlBusinessRules
 * @property {boolean} localProspect
 * @property {string | null} interviewType
 * @property {boolean | null} workAuthorization
 * @property {boolean} emailRequired
 */

/**
 * @typedef {Object} MissionControlResponse
 * @property {MissionControlProspect} prospect
 * @property {MissionControlBrain} brain
 * @property {MissionControlBusinessRules} businessRules
 * @property {{ summary: string | string[] }} atlasBrief
 * @property {string} [suggestedReply]
 * @property {string[]} [importantNotes]
 * @property {string[]} [objections]
 * @property {string} [aiRecommendation]
 */

/**
 * @typedef {Object} AgentWorkspaceProspect
 * @property {string} name
 * @property {string} phone
 * @property {string} location
 * @property {string} language
 * @property {string} milestone
 * @property {string | null} interviewType
 */

/**
 * @typedef {Object} AgentWorkspaceConversation
 * @property {string | null} lastMessage
 * @property {string | null} interviewTime
 * @property {string | null} appointmentDate
 */

/**
 * @typedef {Object} AgentWorkspaceAiBriefExpanded
 * @property {string[]} summary
 * @property {string | null} suggestedReply
 * @property {string[]} importantNotes
 * @property {string[]} objections
 * @property {string | null} aiRecommendation
 */

/**
 * @typedef {Object} AgentWorkspaceModel
 * @property {string} phone
 * @property {AgentWorkspaceProspect} prospect
 * @property {MissionControlBrain} brain
 * @property {MissionControlBusinessRules} businessRules
 * @property {string[]} aiBriefLines
 * @property {AgentWorkspaceAiBriefExpanded} expandedBrief
 * @property {AgentWorkspaceConversation} conversation
 * @property {MissionControlResponse} raw
 * @property {boolean} isLive
 */

export {};
