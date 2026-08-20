import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveGoogleCalendarListUiFailure,
  shouldFetchGoogleCalendarList
} from "./googleCalendarListUi.js";

describe("googleCalendarListUi", () => {
  it("fetches calendars only when connected and not reconnect-required", () => {
    assert.equal(shouldFetchGoogleCalendarList({ connected: true }), true);
    assert.equal(
      shouldFetchGoogleCalendarList({ connected: true, reconnectRequired: true }),
      false
    );
    assert.equal(shouldFetchGoogleCalendarList({ connected: false }), false);
  });

  it("keeps Settings usable during upstream calendar-list failure", () => {
    const ui = resolveGoogleCalendarListUiFailure(
      { reconnectRequired: true },
      { connected: true, calendarId: "niovelpm@gmail.com" }
    );

    assert.deepEqual(ui.calendars, []);
    assert.equal(ui.reconnectRequired, true);
    assert.equal(ui.pageBlocked, false);
    assert.equal(ui.keepIntegrationsVisible, true);
    assert.equal(ui.suppressGoogleError, false);
  });
});
