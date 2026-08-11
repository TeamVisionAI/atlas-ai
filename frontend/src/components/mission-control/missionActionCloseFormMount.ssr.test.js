/**
 * Vite SSR mount contract — Click Close — Not Interested must not show the diagnostic.
 * Run: node src/components/mission-control/missionActionCloseFormMount.ssr.test.js
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../../..");

test("D–G SSR mount: Close — Not Interested renders ConversationOutcome, no diagnostic", async () => {
  const server = await createServer({
    root: frontendRoot,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error"
  });

  try {
    const formModule = await server.ssrLoadModule(
      "/src/components/mission-control/MissionActionInlineForm.jsx"
    );
    const languageModule = await server.ssrLoadModule("/src/i18n/LanguageContext.jsx");
    const MissionActionInlineForm = formModule.default;
    const { LanguageProvider } = languageModule;

    const html = renderToString(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(MissionActionInlineForm, {
          actionId: "close_not_interested",
          formType: null,
          phone: "+17865063586",
          prospect: { name: "Flor Flor", phone: "+17865063586" },
          mission: {
            missionType: "CompleteQualification",
            primaryAction: { id: "qualification" },
            workflowState: { canonicalMilestone: "QUALIFICATION" }
          },
          conversationOutcome: {
            outcomes: ["Not Interested", "Interested"],
            requiredInputs: [{ key: "city", label: "City" }],
            canRecordOutcome: false
          },
          translate: (key, vars = {}) => {
            if (key === "missionActionFormDiagnostic") {
              return `Unable to load the required form for action: ${vars.actionId}`;
            }
            return key;
          },
          onQualificationSaved: () => {},
          onCancel: () => {}
        })
      )
    );

    assert.equal(
      html.includes("Unable to load the required form for action"),
      false,
      html.slice(0, 400)
    );
    assert.match(html, /mission-action-inline-form--close|conversation-outcome/);
    assert.match(html, /Not Interested/);
  } finally {
    await server.close();
  }
});
