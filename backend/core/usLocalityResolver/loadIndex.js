/**
 * BR-233 — Load the committed Census-derived index. No network. No Supabase.
 */

"use strict";

const path = require("path");

let cached = null;

function loadUsLocalityIndex() {
  if (cached) {
    return cached;
  }
  cached = require(path.join(__dirname, "data", "usLocalities.generated.json"));
  return cached;
}

function resetUsLocalityIndexForTests() {
  cached = null;
}

module.exports = {
  loadUsLocalityIndex,
  resetUsLocalityIndexForTests
};
