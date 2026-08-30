import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TEAM_VISION_FORM_CONSENT,
  TEAM_VISION_META_DISCLAIMER,
  TEAM_VISION_WHATSAPP_DISCLOSURE_PARAGRAPHS,
  TEAM_VISION_WHATSAPP_SECTION_TITLE
} from "./teamVisionMessagingCompliance.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function readSrc(relativePath) {
  return fs.readFileSync(path.join(here, relativePath), "utf8");
}

test("WhatsApp disclosure and form consent match required Meta wording", () => {
  assert.equal(TEAM_VISION_WHATSAPP_SECTION_TITLE, "WhatsApp & Messaging Communications");
  assert.match(
    TEAM_VISION_WHATSAPP_DISCLOSURE_PARAGRAPHS.join(" "),
    /do not use WhatsApp or SMS to send unsolicited messages/
  );
  assert.match(TEAM_VISION_WHATSAPP_DISCLOSURE_PARAGRAPHS.join(" "), /replying STOP/);
  assert.equal(
    TEAM_VISION_FORM_CONSENT,
    "By submitting this form, you agree that Team Vision Financial may contact you regarding your inquiry by telephone, email, SMS, or WhatsApp. Message and data rates may apply. Message frequency may vary. Consent is not a condition of purchase. You may opt out at any time by replying STOP."
  );
  assert.equal(
    TEAM_VISION_META_DISCLAIMER,
    "This website is not part of Facebook or Meta Platforms, Inc. and is not endorsed by Facebook or Meta in any way. Facebook and Meta are trademarks of Meta Platforms, Inc."
  );
});

test("Privacy, Legal, Contact, and Footer include the compliance copy", () => {
  const privacy = readSrc("../pages/Privacy.jsx");
  const legal = readSrc("../pages/Legal.jsx");
  const contact = readSrc("../components/public/Contact.jsx");
  const footer = readSrc("../components/public/Footer.jsx");
  const contactRoute = readSrc("../components/ContactRoute.jsx");

  assert.match(privacy, /TEAM_VISION_WHATSAPP_SECTION_TITLE/);
  assert.match(privacy, /TEAM_VISION_INFO_EMAIL/);
  assert.match(privacy, /TEAM_VISION_CONTACT_PHONE/);
  assert.doesNotMatch(privacy, /noindex|nofollow/);
  assert.match(legal, /TEAM_VISION_META_DISCLAIMER/);
  assert.match(legal, /usePageMeta/);
  assert.match(contact, /TEAM_VISION_FORM_CONSENT/);
  assert.doesNotMatch(contact, /type=["']checkbox["']/);
  assert.match(footer, /to="\/privacy"/);
  assert.match(footer, /to="\/terms"/);
  assert.match(footer, /to="\/legal"/);
  assert.match(footer, /to="\/contact"/);
  assert.match(footer, /to="\/data-deletion"/);
  assert.match(footer, /TEAM_VISION_META_DISCLAIMER/);
  assert.match(contactRoute, /TeamVisionContact/);
  assert.doesNotMatch(contactRoute, /Navigate to="\/#contact"/);
});
