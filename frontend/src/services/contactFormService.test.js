import test from "node:test";
import assert from "node:assert/strict";
import {
  ATLAS_CONTACT_TOPICS,
  validateAtlasContactFormFields,
  validateContactFormFields
} from "./contactFormValidation.js";

test("Team Vision field validation unchanged", () => {
  assert.deepEqual(
    validateContactFormFields({ name: "", email: "", message: "" }),
    {
      name: "Full name is required.",
      email: "Email is required.",
      message: "Message is required."
    }
  );
  assert.equal(
    Object.keys(
      validateContactFormFields({
        name: "Jane",
        email: "jane@example.com",
        message: "Hello"
      })
    ).length,
    0
  );
});

test("Atlas validation requires topic and rejects bad email", () => {
  const errors = validateAtlasContactFormFields({
    name: "Alex",
    email: "bad",
    topic: "",
    message: "Help"
  });
  assert.ok(errors.email);
  assert.ok(errors.topic);
});

test("Atlas validation accepts catalog topics", () => {
  for (const topic of ATLAS_CONTACT_TOPICS) {
    const errors = validateAtlasContactFormFields({
      name: "Alex",
      email: "alex@example.com",
      topic,
      message: "Help please"
    });
    assert.equal(Object.keys(errors).length, 0, topic);
  }
});
