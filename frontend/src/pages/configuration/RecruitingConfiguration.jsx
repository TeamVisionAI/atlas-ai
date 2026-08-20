import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { useWorkspace } from "../../contexts/WorkspaceContext";
import { SETTINGS_SECTIONS } from "../../config/settingsProductNames";
import {
  RECRUITING_CONFIG_SOURCES,
  RECRUITING_INDUSTRIES,
  RECRUITING_INTERVIEW_MODES,
  RECRUITING_LANGUAGES,
  RECRUITING_TONES,
  QUALIFICATION_FIELD_IDS,
  DISQUALIFIER_ACTIONS,
  KNOWN_OBJECTION_KEYS
} from "../../config/recruitingConfigConstants";
import { canEditRecruitingConfig } from "../../security/recruitingConfigAccess";
import ConfigurationSection from "../../components/settings/ConfigurationSection";
import ConfigurationLoading from "../../components/settings/ConfigurationLoading";
import AtlasButton from "../../components/ui/AtlasButton";
import {
  fetchRecruitingConfig,
  updateRecruitingConfig
} from "../../services/recruitingConfigService";
import {
  addFaqEntry,
  addLocalCity,
  buildRecruitingConfigPatch,
  formatRecruitingConfigError,
  getQuestionForField,
  isFieldEnabled,
  isRecruitingConfigDirty,
  moveFieldInOrder,
  removeFaqEntry,
  removeLocalCity,
  setFieldEnabled,
  setFieldRequired,
  toggleAllowedMode,
  toggleObjectionKey,
  toggleSupportedLanguage,
  updateFaqEntry,
  upsertQuestion
} from "./recruitingConfigHelpers";

function ReadOnlyBadge({ translate }) {
  return (
    <span className="configuration-badge configuration-badge--muted">
      {translate("recruitingConfigReadOnly")}
    </span>
  );
}

function MetaBadge({ label, value }) {
  return (
    <span className="configuration-meta-badge">
      <span className="configuration-meta-badge__label">{label}</span>
      <span className="configuration-meta-badge__value">{value}</span>
    </span>
  );
}

function ChipList({ items, onRemove, disabled }) {
  if (!items?.length) {
    return null;
  }

  return (
    <ul className="configuration-chip-list">
      {items.map((item) => (
        <li key={item} className="configuration-chip">
          <span>{item}</span>
          {!disabled ? (
            <button type="button" className="configuration-chip__remove" onClick={() => onRemove(item)}>
              ×
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function RecruitingConfiguration() {
  const { translate } = useLanguage();
  const { user, supportMode } = useWorkspace();
  const canEdit = canEditRecruitingConfig(user);

  const [meta, setMeta] = useState(null);
  const [config, setConfig] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [cityInput, setCityInput] = useState("");

  const dirty = useMemo(
    () => baseline && config && isRecruitingConfigDirty(baseline, config),
    [baseline, config]
  );

  const load = useCallback(async () => {
    const result = await fetchRecruitingConfig();
    setMeta({
      source: result.source,
      persisted: result.persisted,
      schemaVersion: result.config?.schemaVersion
    });
    setConfig(structuredClone(result.config));
    setBaseline(structuredClone(result.config));
  }, []);

  useEffect(() => {
    load().catch((loadError) => setError(formatRecruitingConfigError(loadError)));
  }, [load]);

  useEffect(() => {
    if (!dirty) {
      return undefined;
    }

    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  function updateConfig(updater) {
    setConfig((current) => updater(structuredClone(current)));
  }

  function resetChanges() {
    setConfig(structuredClone(baseline));
    setError("");
    setMessage("");
    setCityInput("");
  }

  async function saveChanges(event) {
    event.preventDefault();
    if (!canEdit || !baseline || !config) {
      return;
    }

    const patch = buildRecruitingConfigPatch(baseline, config);
    if (Object.keys(patch).length === 0) {
      setMessage(translate("recruitingConfigNoChanges"));
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const result = await updateRecruitingConfig(patch);
      setMeta({
        source: result.source,
        persisted: result.persisted,
        schemaVersion: result.config?.schemaVersion
      });
      setConfig(structuredClone(result.config));
      setBaseline(structuredClone(result.config));
      setMessage(translate("configurationSaved"));
    } catch (saveError) {
      setError(formatRecruitingConfigError(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (!config || !meta) {
    return error ? (
      <p className="configuration-message configuration-message--error" role="alert">
        {error}
      </p>
    ) : (
      <ConfigurationLoading />
    );
  }

  const supportModeActive = supportMode?.active === true;
  const supportOrgName = supportMode?.organizationName;

  return (
    <>
      <header className="configuration-recruiting-header">
        <div className="configuration-recruiting-header__titles">
          <h2 className="configuration-card__title configuration-recruiting-header__title">
            {SETTINGS_SECTIONS.recruiting}
          </h2>
          {supportModeActive && supportOrgName ? (
            <p className="configuration-recruiting-header__tenant" data-testid="recruiting-config-tenant">
              {translate("recruitingConfigSupportModeTenant", { organizationName: supportOrgName })}
            </p>
          ) : null}
        </div>
        {!canEdit ? <ReadOnlyBadge translate={translate} /> : null}
      </header>

      <div className="configuration-meta-row">
        <MetaBadge label={translate("recruitingConfigMetaSource")} value={meta.source} />
        <MetaBadge
          label={translate("recruitingConfigMetaPersisted")}
          value={meta.persisted ? translate("recruitingConfigMetaYes") : translate("recruitingConfigMetaNo")}
        />
        <MetaBadge label={translate("recruitingConfigMetaSchema")} value={String(meta.schemaVersion ?? "")} />
      </div>

      {meta.source === RECRUITING_CONFIG_SOURCES.DEFAULT_TEMPLATE && meta.persisted === false ? (
        <p className="configuration-message configuration-message--info" role="status">
          {translate("recruitingConfigDefaultTemplateNotice")}
        </p>
      ) : null}

      {message ? (
        <p className="configuration-message configuration-message--success" role="status">
          {message}
        </p>
      ) : null}

      {error ? (
        <pre className="configuration-message configuration-message--error" role="alert">
          {error}
        </pre>
      ) : null}

      <form className="configuration-form configuration-form--recruiting" onSubmit={saveChanges}>
        <ConfigurationSection title={translate("recruitingConfigSectionProfile")}>
          <label>
            {translate("recruitingConfigIndustry")}
            <select
              value={config.profile.industry}
              disabled={!canEdit}
              onChange={(event) =>
                updateConfig((current) => {
                  current.profile.industry = event.target.value;
                  return current;
                })
              }
            >
              {RECRUITING_INDUSTRIES.map((industry) => (
                <option key={industry} value={industry}>
                  {translate(`recruitingConfigIndustry_${industry}`)}
                </option>
              ))}
            </select>
          </label>

          <label>
            {translate("recruitingConfigBusinessName")}
            <input
              value={config.profile.businessName}
              disabled={!canEdit}
              onChange={(event) =>
                updateConfig((current) => {
                  current.profile.businessName = event.target.value;
                  return current;
                })
              }
            />
          </label>

          <label>
            {translate("recruitingConfigRecruitingObjective")}
            <textarea
              rows={3}
              value={config.profile.recruitingObjective}
              disabled={!canEdit}
              onChange={(event) =>
                updateConfig((current) => {
                  current.profile.recruitingObjective = event.target.value;
                  return current;
                })
              }
            />
          </label>

          <fieldset disabled={!canEdit}>
            <legend>{translate("recruitingConfigSupportedLanguages")}</legend>
            {RECRUITING_LANGUAGES.map((language) => (
              <label key={language} className="configuration-checkbox-label">
                <input
                  type="checkbox"
                  checked={config.profile.supportedLanguages.includes(language)}
                  onChange={(event) =>
                    updateConfig((current) => {
                      current.profile.supportedLanguages = toggleSupportedLanguage(
                        current.profile.supportedLanguages,
                        language,
                        event.target.checked
                      );
                      if (
                        current.profile.defaultLanguage &&
                        !current.profile.supportedLanguages.includes(current.profile.defaultLanguage)
                      ) {
                        current.profile.defaultLanguage = current.profile.supportedLanguages[0] || "en";
                      }
                      return current;
                    })
                  }
                />
                {translate(language === "es" ? "configurationLanguageSpanish" : "configurationLanguageEnglish")}
              </label>
            ))}
          </fieldset>

          <label>
            {translate("recruitingConfigDefaultLanguage")}
            <select
              value={config.profile.defaultLanguage}
              disabled={!canEdit}
              onChange={(event) =>
                updateConfig((current) => {
                  current.profile.defaultLanguage = event.target.value;
                  return current;
                })
              }
            >
              {config.profile.supportedLanguages.map((language) => (
                <option key={language} value={language}>
                  {translate(language === "es" ? "configurationLanguageSpanish" : "configurationLanguageEnglish")}
                </option>
              ))}
            </select>
          </label>

          <label>
            {translate("recruitingConfigTone")}
            <select
              value={config.profile.tone}
              disabled={!canEdit}
              onChange={(event) =>
                updateConfig((current) => {
                  current.profile.tone = event.target.value;
                  return current;
                })
              }
            >
              {RECRUITING_TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {translate(`recruitingConfigTone_${tone}`)}
                </option>
              ))}
            </select>
          </label>
        </ConfigurationSection>

        <ConfigurationSection title={translate("recruitingConfigSectionCoverage")}>
          <label>
            {translate("recruitingConfigOfficeAddress")}
            <input
              value={config.coverage.officeAddress}
              disabled={!canEdit}
              onChange={(event) =>
                updateConfig((current) => {
                  current.coverage.officeAddress = event.target.value;
                  return current;
                })
              }
            />
          </label>

          <label>
            {translate("recruitingConfigLocalRadiusMiles")}
            <input
              type="number"
              min={1}
              max={200}
              value={config.coverage.localRadiusMiles}
              disabled={!canEdit}
              onChange={(event) =>
                updateConfig((current) => {
                  current.coverage.localRadiusMiles = Number.parseInt(event.target.value, 10) || 1;
                  return current;
                })
              }
            />
          </label>

          <div className="configuration-subsection">
            <span className="configuration-subsection__label">{translate("recruitingConfigLocalCities")}</span>
            <ChipList
              items={config.coverage.localCities}
              disabled={!canEdit}
              onRemove={(city) =>
                updateConfig((current) => {
                  current.coverage.localCities = removeLocalCity(current.coverage.localCities, city);
                  return current;
                })
              }
            />
            {canEdit ? (
              <div className="configuration-inline-add">
                <input
                  value={cityInput}
                  placeholder={translate("recruitingConfigLocalCitiesPlaceholder")}
                  onChange={(event) => setCityInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      updateConfig((current) => {
                        current.coverage.localCities = addLocalCity(current.coverage.localCities, cityInput);
                        return current;
                      });
                      setCityInput("");
                    }
                  }}
                />
                <AtlasButton
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    updateConfig((current) => {
                      current.coverage.localCities = addLocalCity(current.coverage.localCities, cityInput);
                      return current;
                    });
                    setCityInput("");
                  }}
                >
                  {translate("recruitingConfigAddCity")}
                </AtlasButton>
              </div>
            ) : null}
          </div>

          <label>
            {translate("recruitingConfigDefaultInterviewMode")}
            <select
              value={config.coverage.defaultInterviewMode}
              disabled={!canEdit}
              onChange={(event) =>
                updateConfig((current) => {
                  current.coverage.defaultInterviewMode = event.target.value;
                  return current;
                })
              }
            >
              {RECRUITING_INTERVIEW_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {translate(`recruitingConfigInterviewMode_${mode}`)}
                </option>
              ))}
            </select>
          </label>
        </ConfigurationSection>

        <ConfigurationSection title={translate("recruitingConfigSectionQualification")}>
          <p className="configuration-help">{translate("recruitingConfigQualificationHelp")}</p>
          <div className="configuration-field-list">
            {config.qualification.fieldOrder.map((fieldId, index) => {
              const question = getQuestionForField(config.qualification.questions, fieldId);
              const required = config.qualification.requiredFields.includes(fieldId);

              return (
                <div key={fieldId} className="configuration-field-item" data-field-id={fieldId}>
                  <div className="configuration-field-item__header">
                    <strong>{translate(`recruitingConfigField_${fieldId}`)}</strong>
                    <span className="configuration-field-item__id">{fieldId}</span>
                    {canEdit ? (
                      <div className="configuration-field-item__actions">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() =>
                            updateConfig((current) => {
                              current.qualification.fieldOrder = moveFieldInOrder(
                                current.qualification.fieldOrder,
                                fieldId,
                                "up"
                              );
                              return current;
                            })
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={index === config.qualification.fieldOrder.length - 1}
                          onClick={() =>
                            updateConfig((current) => {
                              current.qualification.fieldOrder = moveFieldInOrder(
                                current.qualification.fieldOrder,
                                fieldId,
                                "down"
                              );
                              return current;
                            })
                          }
                        >
                          ↓
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <label className="configuration-checkbox-label">
                    <input
                      type="checkbox"
                      checked={required}
                      disabled={!canEdit}
                      onChange={(event) =>
                        updateConfig((current) => {
                          current.qualification.requiredFields = setFieldRequired(
                            fieldId,
                            event.target.checked,
                            current.qualification.fieldOrder,
                            current.qualification.requiredFields
                          );
                          return current;
                        })
                      }
                    />
                    {translate("recruitingConfigFieldRequired")}
                  </label>

                  <label>
                    {translate("recruitingConfigQuestionEn")}
                    <input
                      value={question.text_en || ""}
                      disabled={!canEdit}
                      onChange={(event) =>
                        updateConfig((current) => {
                          current.qualification.questions = upsertQuestion(
                            current.qualification.questions,
                            fieldId,
                            "en",
                            event.target.value
                          );
                          return current;
                        })
                      }
                    />
                  </label>

                  <label>
                    {translate("recruitingConfigQuestionEs")}
                    <input
                      value={question.text_es || ""}
                      disabled={!canEdit}
                      onChange={(event) =>
                        updateConfig((current) => {
                          current.qualification.questions = upsertQuestion(
                            current.qualification.questions,
                            fieldId,
                            "es",
                            event.target.value
                          );
                          return current;
                        })
                      }
                    />
                  </label>
                </div>
              );
            })}
          </div>

          <fieldset disabled={!canEdit}>
            <legend>{translate("recruitingConfigDisabledFields")}</legend>
            {QUALIFICATION_FIELD_IDS.filter(
              (fieldId) => !isFieldEnabled(fieldId, config.qualification.fieldOrder)
            ).map((fieldId) => (
              <label key={fieldId} className="configuration-checkbox-label">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() =>
                    updateConfig((current) => {
                      const next = setFieldEnabled(
                        fieldId,
                        true,
                        current.qualification.fieldOrder,
                        current.qualification.requiredFields
                      );
                      current.qualification.fieldOrder = next.fieldOrder;
                      current.qualification.requiredFields = next.requiredFields;
                      return current;
                    })
                  }
                />
                {translate(`recruitingConfigField_${fieldId}`)}
              </label>
            ))}
          </fieldset>

          <fieldset disabled={!canEdit}>
            <legend>{translate("recruitingConfigEnabledFieldsToggle")}</legend>
            {config.qualification.fieldOrder.map((fieldId) => (
              <label key={fieldId} className="configuration-checkbox-label">
                <input
                  type="checkbox"
                  checked
                  onChange={() =>
                    updateConfig((current) => {
                      const next = setFieldEnabled(
                        fieldId,
                        false,
                        current.qualification.fieldOrder,
                        current.qualification.requiredFields
                      );
                      current.qualification.fieldOrder = next.fieldOrder;
                      current.qualification.requiredFields = next.requiredFields;
                      return current;
                    })
                  }
                />
                {translate(`recruitingConfigField_${fieldId}`)}
              </label>
            ))}
          </fieldset>
        </ConfigurationSection>

        <ConfigurationSection title={translate("recruitingConfigSectionDisqualifiers")}>
          {(config.qualification.disqualifiers || []).map((item, index) => (
            <div key={`${item.fieldId}-${index}`} className="configuration-subsection">
              <label>
                {translate("recruitingConfigDisqualifierField")}
                <select
                  value={item.fieldId}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateConfig((current) => {
                      current.qualification.disqualifiers[index].fieldId = event.target.value;
                      return current;
                    })
                  }
                >
                  {QUALIFICATION_FIELD_IDS.map((fieldId) => (
                    <option key={fieldId} value={fieldId}>
                      {fieldId}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {translate("recruitingConfigDisqualifierWhen")}
                <select
                  value={String(item.when)}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateConfig((current) => {
                      current.qualification.disqualifiers[index].when = event.target.value === "true";
                      return current;
                    })
                  }
                >
                  <option value="false">{translate("recruitingConfigDisqualifierWhenFalse")}</option>
                  <option value="true">{translate("recruitingConfigDisqualifierWhenTrue")}</option>
                </select>
              </label>

              <label>
                {translate("recruitingConfigDisqualifierAction")}
                <select
                  value={item.action}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateConfig((current) => {
                      current.qualification.disqualifiers[index].action = event.target.value;
                      return current;
                    })
                  }
                >
                  {DISQUALIFIER_ACTIONS.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {translate("recruitingConfigDisqualifierMessageEn")}
                <textarea
                  rows={2}
                  value={item.messages?.en || ""}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateConfig((current) => {
                      current.qualification.disqualifiers[index].messages = {
                        ...current.qualification.disqualifiers[index].messages,
                        en: event.target.value
                      };
                      return current;
                    })
                  }
                />
              </label>

              <label>
                {translate("recruitingConfigDisqualifierMessageEs")}
                <textarea
                  rows={2}
                  value={item.messages?.es || ""}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateConfig((current) => {
                      current.qualification.disqualifiers[index].messages = {
                        ...current.qualification.disqualifiers[index].messages,
                        es: event.target.value
                      };
                      return current;
                    })
                  }
                />
              </label>
            </div>
          ))}

          {canEdit ? (
            <AtlasButton
              type="button"
              variant="secondary"
              onClick={() =>
                updateConfig((current) => {
                  current.qualification.disqualifiers = [
                    ...(current.qualification.disqualifiers || []),
                    {
                      fieldId: "authorization",
                      when: false,
                      action: "current_not_fit",
                      messages: { en: "", es: "" }
                    }
                  ];
                  return current;
                })
              }
            >
              {translate("recruitingConfigAddDisqualifier")}
            </AtlasButton>
          ) : null}
        </ConfigurationSection>

        <ConfigurationSection title={translate("recruitingConfigSectionScheduling")}>
          <p className="configuration-help">{translate("recruitingConfigSchedulingHoursNote")}</p>

          <label>
            {translate("recruitingConfigAppointmentPurpose")}
            <input value={config.scheduling.appointmentPurpose} disabled />
          </label>

          <label>
            {translate("recruitingConfigDurationMinutes")}
            <input
              type="number"
              min={15}
              max={120}
              value={config.scheduling.durationMinutes}
              disabled={!canEdit}
              onChange={(event) =>
                updateConfig((current) => {
                  current.scheduling.durationMinutes = Number.parseInt(event.target.value, 10) || 15;
                  return current;
                })
              }
            />
          </label>

          <fieldset disabled={!canEdit}>
            <legend>{translate("recruitingConfigAllowedModes")}</legend>
            {RECRUITING_INTERVIEW_MODES.map((mode) => (
              <label key={mode} className="configuration-checkbox-label">
                <input
                  type="checkbox"
                  checked={config.scheduling.allowedModes.includes(mode)}
                  onChange={(event) =>
                    updateConfig((current) => {
                      current.scheduling.allowedModes = toggleAllowedMode(
                        current.scheduling.allowedModes,
                        mode,
                        event.target.checked
                      );
                      return current;
                    })
                  }
                />
                {translate(`recruitingConfigInterviewMode_${mode}`)}
              </label>
            ))}
          </fieldset>
        </ConfigurationSection>

        <ConfigurationSection title={translate("recruitingConfigSectionFaq")}>
          {(config.conversation.faq || []).map((entry, index) => (
            <div key={entry.id || index} className="configuration-subsection">
              <label>
                {translate("recruitingConfigFaqId")}
                <input
                  value={entry.id || ""}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateConfig((current) => {
                      current.conversation.faq = updateFaqEntry(current.conversation.faq, index, {
                        id: event.target.value
                      });
                      return current;
                    })
                  }
                />
              </label>

              <label>
                {translate("recruitingConfigFaqKeywords")}
                <input
                  value={(entry.keywords || []).join(", ")}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateConfig((current) => {
                      current.conversation.faq = updateFaqEntry(current.conversation.faq, index, {
                        keywords: event.target.value
                          .split(",")
                          .map((keyword) => keyword.trim())
                          .filter(Boolean)
                      });
                      return current;
                    })
                  }
                />
              </label>

              <label>
                {translate("recruitingConfigFaqResponseEn")}
                <textarea
                  rows={2}
                  value={entry.response_en || ""}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateConfig((current) => {
                      current.conversation.faq = updateFaqEntry(current.conversation.faq, index, {
                        response_en: event.target.value
                      });
                      return current;
                    })
                  }
                />
              </label>

              <label>
                {translate("recruitingConfigFaqResponseEs")}
                <textarea
                  rows={2}
                  value={entry.response_es || ""}
                  disabled={!canEdit}
                  onChange={(event) =>
                    updateConfig((current) => {
                      current.conversation.faq = updateFaqEntry(current.conversation.faq, index, {
                        response_es: event.target.value
                      });
                      return current;
                    })
                  }
                />
              </label>

              {canEdit ? (
                <AtlasButton
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    updateConfig((current) => {
                      current.conversation.faq = removeFaqEntry(current.conversation.faq, index);
                      return current;
                    })
                  }
                >
                  {translate("recruitingConfigDeleteFaq")}
                </AtlasButton>
              ) : null}
            </div>
          ))}

          {canEdit ? (
            <AtlasButton
              type="button"
              variant="secondary"
              onClick={() =>
                updateConfig((current) => {
                  current.conversation.faq = addFaqEntry(current.conversation.faq, {
                    id: `faq_${Date.now()}`,
                    keywords: [],
                    response_en: "",
                    response_es: ""
                  });
                  return current;
                })
              }
            >
              {translate("recruitingConfigAddFaq")}
            </AtlasButton>
          ) : null}
        </ConfigurationSection>

        <ConfigurationSection title={translate("recruitingConfigSectionConversation")}>
          <label>
            {translate("recruitingConfigOpeningInstructionsEn")}
            <textarea
              rows={2}
              value={config.conversation.openingInstructions.en || ""}
              disabled={!canEdit}
              onChange={(event) =>
                updateConfig((current) => {
                  current.conversation.openingInstructions.en = event.target.value;
                  return current;
                })
              }
            />
          </label>

          <label>
            {translate("recruitingConfigOpeningInstructionsEs")}
            <textarea
              rows={2}
              value={config.conversation.openingInstructions.es || ""}
              disabled={!canEdit}
              onChange={(event) =>
                updateConfig((current) => {
                  current.conversation.openingInstructions.es = event.target.value;
                  return current;
                })
              }
            />
          </label>

          <label>
            {translate("recruitingConfigHandoffDisplayName")}
            <input
              value={config.conversation.handoffDisplayName || ""}
              disabled={!canEdit}
              onChange={(event) =>
                updateConfig((current) => {
                  current.conversation.handoffDisplayName = event.target.value;
                  return current;
                })
              }
            />
          </label>

          <fieldset disabled={!canEdit}>
            <legend>{translate("recruitingConfigObjectionKeys")}</legend>
            {KNOWN_OBJECTION_KEYS.map((key) => (
              <label key={key} className="configuration-checkbox-label">
                <input
                  type="checkbox"
                  checked={(config.conversation.objectionKeys || []).includes(key)}
                  onChange={(event) =>
                    updateConfig((current) => {
                      current.conversation.objectionKeys = toggleObjectionKey(
                        current.conversation.objectionKeys,
                        key,
                        event.target.checked
                      );
                      return current;
                    })
                  }
                />
                {key}
              </label>
            ))}
          </fieldset>
        </ConfigurationSection>

        {canEdit ? (
          <div className="configuration-actions">
            <AtlasButton type="submit" disabled={saving || !dirty}>
              {saving ? translate("configurationSaving") : translate("recruitingConfigSaveChanges")}
            </AtlasButton>
            <AtlasButton type="button" variant="secondary" disabled={saving || !dirty} onClick={resetChanges}>
              {translate("recruitingConfigCancelChanges")}
            </AtlasButton>
          </div>
        ) : null}
      </form>
    </>
  );
}
