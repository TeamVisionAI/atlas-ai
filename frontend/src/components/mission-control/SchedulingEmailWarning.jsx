import AtlasButton from "../ui/AtlasButton";
import { useLanguage } from "../../i18n/LanguageContext";
import { isValidEmail } from "../../utils/prospectEmail";

export default function SchedulingEmailWarning({
  form,
  onChange,
  disabled = false
}) {
  const { translate } = useLanguage();

  if (!form?.showEmailInput) {
    return (
      <div className="scheduling-form__email-warning" role="status">
        <p className="scheduling-form__email-warning-title">
          {translate("schedulingZoomNoEmailTitle")}
        </p>
        <p className="scheduling-form__email-warning-body">
          {translate("schedulingZoomNoEmailBody")}
        </p>
        <div className="scheduling-form__email-warning-actions">
          <AtlasButton
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => onChange({ ...form, showEmailInput: true })}
          >
            {translate("schedulingZoomAddEmail")}
          </AtlasButton>
          <AtlasButton
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              onChange({
                ...form,
                whatsappDeliveryAcknowledged: true,
                showEmailInput: false
              })
            }
          >
            {translate("schedulingZoomContinueWhatsApp")}
          </AtlasButton>
        </div>
      </div>
    );
  }

  return (
    <div className="scheduling-form__email-warning scheduling-form__email-warning--input" role="status">
      <p className="scheduling-form__email-warning-title">
        {translate("schedulingZoomAddEmailTitle")}
      </p>
      <label className="scheduling-form__field scheduling-form__field--full">
        <span>{translate("schedulingZoomEmailLabel")}</span>
        <input
          type="email"
          value={form.email || ""}
          onChange={(event) => onChange({ ...form, email: event.target.value })}
          placeholder={translate("schedulingZoomEmailPlaceholder")}
          disabled={disabled}
          autoComplete="email"
        />
      </label>
      {form.email && !isValidEmail(form.email) ? (
        <p className="scheduling-form__error" role="alert">
          {translate("schedulingZoomEmailInvalid")}
        </p>
      ) : null}
      <div className="scheduling-form__email-warning-actions">
        <AtlasButton
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...form,
              showEmailInput: false,
              email: ""
            })
          }
        >
          {translate("missionExecutionCancel")}
        </AtlasButton>
        <AtlasButton
          type="button"
          variant="secondary"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...form,
              whatsappDeliveryAcknowledged: true,
              showEmailInput: false,
              email: ""
            })
          }
        >
          {translate("schedulingZoomContinueWhatsApp")}
        </AtlasButton>
      </div>
    </div>
  );
}
