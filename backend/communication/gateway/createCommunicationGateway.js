/**
 * Sprint 13.0 — Bootstrap Communication Gateway with Mission Control, Executive Dashboard, and Workflow Engine.
 */

const { CommunicationGateway } = require("./CommunicationGateway");
const { ConnectorRegistry } = require("./ConnectorRegistry");
const { ConversationManager } = require("./ConversationManager");
const { MessageRouter } = require("./MessageRouter");
const { EventBus } = require("../events/EventBus");
const { AIAdapter } = require("../ai/AIAdapter");
const { MessengerConnector } = require("../connectors/messenger/MessengerConnector");
const { CHANNEL } = require("../models/Channel");
const { createProspectService } = require("../../prospects");
const { createOperatorService } = require("../../operators");
const {
  createMissionControlService,
  resetMissionControlService
} = require("../../mission-control");
const {
  createExecutiveDashboardService,
  resetExecutiveDashboardService
} = require("../../executive-dashboard");
const { createWorkflowEngine, resetWorkflowEngine } = require("../../workflows");

/**
 * @param {Object} [options]
 */
function createCommunicationGateway(options = {}) {
  const eventBus = new EventBus();
  const connectorRegistry = new ConnectorRegistry();
  const conversationManager = new ConversationManager();
  const prospectService =
    options.prospectService ||
    createProspectService({ eventBus });
  const operatorService =
    options.operatorService ||
    createOperatorService({ eventBus, conversationManager });
  const workflowEngine =
    options.workflowEngine ||
    createWorkflowEngine({ eventBus, operatorService });
  const missionControlService =
    options.missionControlService ||
    createMissionControlService({ eventBus });
  const executiveDashboardService =
    options.executiveDashboardService ||
    createExecutiveDashboardService({ eventBus });
  const aiAdapter = options.aiAdapter || new AIAdapter();
  const messageRouter = new MessageRouter({
    connectorRegistry,
    conversationManager,
    eventBus,
    aiAdapter
  });

  const gateway = new CommunicationGateway({
    eventBus,
    connectorRegistry,
    conversationManager,
    messageRouter,
    prospectService,
    operatorService,
    workflowEngine
  });

  const messengerConnector = new MessengerConnector();
  gateway.registerConnector(messengerConnector);

  return {
    gateway,
    eventBus,
    messengerConnector,
    aiAdapter,
    conversationManager,
    prospectService,
    operatorService,
    missionControlService,
    executiveDashboardService,
    workflowEngine
  };
}

let singleton = null;

function getCommunicationGateway() {
  if (!singleton) {
    singleton = createCommunicationGateway();
  }

  return singleton;
}

function resetCommunicationGateway() {
  resetMissionControlService();
  resetExecutiveDashboardService();
  resetWorkflowEngine();
  singleton = null;
}

module.exports = {
  createCommunicationGateway,
  getCommunicationGateway,
  resetCommunicationGateway,
  CHANNEL
};
