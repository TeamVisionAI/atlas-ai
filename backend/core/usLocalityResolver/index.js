/**
 * BR-233 — National U.S. locality resolver (data + parse only).
 * Not wired into Recruit V2 interpreter, decisionEngine, coverage, WhatsApp, or IUL.
 */

"use strict";

const constants = require("./constants");
const normalize = require("./normalize");
const { loadUsLocalityIndex } = require("./loadIndex");
const { resolveUsLocality } = require("./resolveUsLocality");

module.exports = {
  resolveUsLocality,
  loadUsLocalityIndex,
  ...constants,
  ...normalize
};
