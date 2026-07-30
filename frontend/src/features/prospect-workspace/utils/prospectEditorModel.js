const EMPTY_PROSPECT_EDITOR_VALUES = Object.freeze({
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  preferred_language: "spanish",
  city: "",
  state: "",
  work_authorization_status: "",
  source: "",
  interview_type: "",
  internal_notes: ""
});

export function buildProspectEditorInitialValues(workspace) {
  const profile = workspace?.raw?.editorProfile;

  if (!profile) {
    return {
      ...EMPTY_PROSPECT_EDITOR_VALUES,
      phone: workspace?.phone || workspace?.identity?.phone || ""
    };
  }

  return {
    first_name: profile.first_name || "",
    last_name: profile.last_name || "",
    phone: profile.phone || workspace?.phone || "",
    email: profile.email || "",
    preferred_language: profile.preferred_language || "spanish",
    city: profile.city || "",
    state: profile.state || "",
    work_authorization_status: profile.work_authorization_status || "",
    source: profile.source || "",
    interview_type: profile.interview_type || "",
    internal_notes: profile.internal_notes || ""
  };
}

export function validateProspectEditorValues(values, translate) {
  const errors = {};

  if (!String(values.first_name || "").trim()) {
    errors.first_name = translate("prospectEditorFieldRequired");
  }

  if (!String(values.last_name || "").trim()) {
    errors.last_name = translate("prospectEditorFieldRequired");
  }

  const email = String(values.email || "").trim();

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = translate("prospectEditorInvalidEmail");
  }

  return errors;
}
