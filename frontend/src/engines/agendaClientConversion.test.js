import test from "node:test";
import assert from "node:assert/strict";
import {
  isAgendaClientConversionIncomplete,
  isAgendaClientConversionComplete
} from "./agendaClientConversion.js";

test("incomplete CLIENT conversion is visible, not hidden pending", () => {
  const appointment = {
    outcome: "client",
    metadata: {
      standaloneAgenda: true,
      clientConversionStatus: "incomplete",
      clientConversionIncomplete: true
    }
  };
  assert.equal(isAgendaClientConversionIncomplete(appointment), true);
  assert.equal(isAgendaClientConversionComplete(appointment), false);
});

test("completed conversion hides resume and is available as a client", () => {
  const appointment = {
    outcome: "client",
    metadata: {
      standaloneAgenda: true,
      promotedToClient: true,
      clientConversionStatus: "complete"
    }
  };
  assert.equal(isAgendaClientConversionIncomplete(appointment), false);
  assert.equal(isAgendaClientConversionComplete(appointment), true);
});
