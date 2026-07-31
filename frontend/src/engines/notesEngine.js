/**
 * Universal Notes Engine — one modal, one save flow, context-driven attachment.
 */

import { postMissionControlAction } from "../services/missionControlService";
import {
  buildProspectNoteContext,
  resolveNoteContextFromWorkspace
} from "./notesContextEngine";

export {
  NOTE_ENTITY_TYPES,
  buildProspectNoteContext,
  buildAppointmentNoteContext,
  buildFollowUpNoteContext,
  buildMissionNoteContext,
  buildClientNoteContext,
  resolveNoteContextFromWorkspace,
  resolveNoteContextFromMissionControl
} from "./notesContextEngine";

/**
 * Saves a note through the universal Mission Control notes action.
 */
export async function saveNote({ phone, text, context }) {
  const resolvedPhone = context?.prospectPhone || phone;

  if (!resolvedPhone) {
    return {
      success: false,
      error: "PROSPECT_PHONE_REQUIRED",
      message: "Prospect phone is required to save a note."
    };
  }

  const trimmed = String(text || "").trim();

  if (!trimmed) {
    return {
      success: false,
      error: "NOTE_REQUIRED",
      message: "Note text is required."
    };
  }

  return postMissionControlAction(resolvedPhone, "notes", {
    text: trimmed,
    context: context || buildProspectNoteContext(resolvedPhone)
  });
}
