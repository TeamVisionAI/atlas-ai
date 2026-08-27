/**
 * Seeded user display names stay first + last (BR-048).
 * Prevents first-only seed values from collapsing to "Ana Ana".
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { LC1_USERS } = require("../dev/environment/seedAtlasUsers");
const { splitDisplayName } = require("../core/syncAtlasUsersFromUsersContract");

function buildDisplayName(firstName, lastName, fallback = "") {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || fallback;
}

function usersNameFromAtlas({ firstName, lastName, displayName, email }) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || displayName || email;
}

const ANA_SEED_ID = "00000000-0000-4000-8000-000000000001";

function isDuplicatedFirstNameDisplay({ firstName, lastName, displayName }) {
  const first = String(firstName || "").trim();
  const last = String(lastName || "").trim();
  const display = String(displayName || "").trim();
  return Boolean(first) && last === first && display === `${first} ${first}`;
}

test("LC1 Ana seed uses first Ana, last Perez, display Ana Perez", () => {
  const ana = LC1_USERS.find((user) => user.id === ANA_SEED_ID);

  assert.ok(ana, "seeded Ana user is present");
  assert.equal(ana.firstName, "Ana");
  assert.equal(ana.lastName, "Perez");
  assert.equal(ana.displayName, "Ana Perez");
  assert.equal(isDuplicatedFirstNameDisplay(ana), false);
});

test("seed fixtures do not ship first-only Ana display names", () => {
  const seedSource = fs.readFileSync(
    path.join(__dirname, "../dev/environment/seedAtlasUsers.js"),
    "utf8"
  );
  const migrationSource = fs.readFileSync(
    path.join(__dirname, "../dev/environment/applyAtlasCoreMigrations.js"),
    "utf8"
  );
  const bootstrapSource = fs.readFileSync(
    path.join(__dirname, "../services/atlasUserService.js"),
    "utf8"
  );

  assert.doesNotMatch(seedSource, /lastName:\s*"Recruiter"/);
  assert.doesNotMatch(seedSource, /displayName:\s*"Ana"/);
  assert.doesNotMatch(migrationSource, /'Recruiter'/);
  assert.match(migrationSource, /'Ana Perez'/);
  assert.match(bootstrapSource, /last_name:\s*"Perez"/);
  assert.match(bootstrapSource, /"Ana Perez"/);
});

test("users.name split of Ana Perez does not invent last=Ana", () => {
  const split = splitDisplayName("Ana Perez");
  assert.deepEqual(split, {
    firstName: "Ana",
    lastName: "Perez",
    displayName: "Ana Perez"
  });
  assert.equal(isDuplicatedFirstNameDisplay(split), false);
});

test("identity write rebuilds display_name from first + last", () => {
  assert.equal(buildDisplayName("Ana", "Perez", "ana.reyes1510@gmail.com"), "Ana Perez");
  assert.notEqual(buildDisplayName("Ana", "Perez", "ana.reyes1510@gmail.com"), "Ana Ana");
});

test("users mirror uses first + last so first-only display cannot corrupt last name", () => {
  const usersName = usersNameFromAtlas({
    firstName: "Ana",
    lastName: "Perez",
    displayName: "Ana",
    email: "ana.reyes1510@gmail.com"
  });
  const syncSource = fs.readFileSync(
    path.join(__dirname, "../services/userIdentitySyncService.js"),
    "utf8"
  );

  assert.match(
    syncSource,
    /\[atlasUser\.first_name, atlasUser\.last_name\]\.filter\(Boolean\)\.join\(" "\)/
  );
  assert.equal(usersName, "Ana Perez");
  const split = splitDisplayName(usersName);
  assert.equal(split.firstName, "Ana");
  assert.equal(split.lastName, "Perez");
  assert.equal(
    isDuplicatedFirstNameDisplay({
      firstName: split.firstName,
      lastName: split.lastName,
      displayName: usersName
    }),
    false
  );
});
