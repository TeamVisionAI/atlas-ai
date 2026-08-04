import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import {
  createPolicyReview,
  fetchPolicyReviewBundle,
  listPolicyReviews,
  savePolicyExtraction,
  uploadPolicyDocument
} from "../services/policyIntelligenceService";
import ComparisonWorkspace from "../components/policy-intelligence/ComparisonWorkspace";
import FinancialIntelligencePanel from "../components/financial-intelligence/FinancialIntelligencePanel";
import "./WorkspaceDashboard.css";
import "./PolicyIntelligence.css";

/**
 * Policy Intelligence workspace — Atlas Extract + BR-054 zero-knowledge.
 * Canonical form captures anonymous insurance attributes only (no PII).
 */
const EMPTY_FORM = {
  carrier: "",
  productType: "",
  gender: "",
  issueAge: "",
  underwritingClass: "",
  tobaccoStatus: "",
  premiumAmount: "",
  premiumFrequency: "",
  faceAmount: ""
};

function toStructuredFields(form) {
  return {
    carrier: form.carrier.trim() || null,
    productType: form.productType.trim() || null,
    product: form.productType.trim() || null,
    insured: {
      gender: form.gender.trim() || null,
      issueAge: form.issueAge === "" ? null : Number(form.issueAge),
      underwritingClass: form.underwritingClass.trim() || null,
      tobaccoStatus: form.tobaccoStatus.trim() || null
    },
    premium: {
      amount: form.premiumAmount === "" ? null : Number(form.premiumAmount),
      currency: "USD",
      frequency: form.premiumFrequency.trim() || null
    },
    faceAmount: form.faceAmount === "" ? null : Number(form.faceAmount)
  };
}

export default function PolicyIntelligence() {
  const { translate } = useLanguage();
  const [reviews, setReviews] = useState([]);
  const [selectedReviewId, setSelectedReviewId] = useState("");
  const [bundle, setBundle] = useState(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState("extract");

  const refreshReviews = useCallback(async () => {
    const rows = await listPolicyReviews();
    setReviews(rows);
    return rows;
  }, []);

  const loadBundle = useCallback(async (reviewId) => {
    if (!reviewId) {
      setBundle(null);
      return;
    }

    const next = await fetchPolicyReviewBundle(reviewId);
    setBundle(next);

    const firstDoc = next.documents?.[0];
    const firstExtraction = next.extractions?.[0];
    setSelectedDocumentId(firstDoc?.id || "");

    if (firstExtraction?.extractedData) {
      const data = firstExtraction.extractedData;
      setForm({
        carrier: data.carrier || "",
        productType: data.productType || data.product || "",
        gender: data.insured?.gender || "",
        issueAge:
          data.insured?.issueAge === null || data.insured?.issueAge === undefined
            ? ""
            : String(data.insured.issueAge),
        underwritingClass: data.insured?.underwritingClass || "",
        tobaccoStatus: data.insured?.tobaccoStatus || "",
        premiumAmount:
          data.premium?.amount === null || data.premium?.amount === undefined
            ? ""
            : String(data.premium.amount),
        premiumFrequency: data.premium?.frequency || "",
        faceAmount:
          data.faceAmount === null || data.faceAmount === undefined
            ? ""
            : String(data.faceAmount)
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      setLoading(true);
      setError("");

      try {
        const rows = await refreshReviews();
        if (cancelled) {
          return;
        }

        if (rows[0]?.id) {
          setSelectedReviewId(rows[0].id);
          await loadBundle(rows[0].id);
        }
      } catch (bootError) {
        if (!cancelled) {
          setError(bootError.message || translate("policyIntelligenceErrorLoad"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [loadBundle, refreshReviews, translate]);

  async function handleCreateReview(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const review = await createPolicyReview({ title });
      setTitle("");
      await refreshReviews();
      setSelectedReviewId(review.id);
      await loadBundle(review.id);
      setNotice(translate("policyIntelligenceNoticeReviewCreated"));
    } catch (createError) {
      setError(createError.message || translate("policyIntelligenceErrorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectReview(event) {
    const reviewId = event.target.value;
    setSelectedReviewId(reviewId);
    setError("");
    setNotice("");
    setBusy(true);

    try {
      await loadBundle(reviewId);
    } catch (selectError) {
      setError(selectError.message || translate("policyIntelligenceErrorLoad"));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(event) {
    event.preventDefault();

    if (!selectedReviewId || !file) {
      setError(translate("policyIntelligenceErrorUploadRequired"));
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const result = await uploadPolicyDocument(
        selectedReviewId,
        file,
        toStructuredFields(form)
      );
      setFile(null);
      await refreshReviews();
      await loadBundle(selectedReviewId);
      setSelectedDocumentId(result.document?.id || "");
      setNotice(translate("policyIntelligenceNoticeUploaded"));
    } catch (uploadError) {
      setError(uploadError.message || translate("policyIntelligenceErrorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveExtraction(event) {
    event.preventDefault();

    if (!selectedDocumentId) {
      setError(translate("policyIntelligenceErrorNoDocument"));
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await savePolicyExtraction(selectedDocumentId, toStructuredFields(form));
      await loadBundle(selectedReviewId);
      setNotice(translate("policyIntelligenceNoticeExtractionSaved"));
    } catch (saveError) {
      setError(saveError.message || translate("policyIntelligenceErrorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const selectedExtraction =
    bundle?.extractions?.find((item) => item.policyDocumentId === selectedDocumentId) ||
    bundle?.extractions?.[0] ||
    null;

  return (
    <div className="workspace-dashboard workspace-dashboard--policy-intelligence">
      <header className="workspace-dashboard__header workspace-dashboard__header--inline">
        <div>
          <p className="workspace-dashboard__eyebrow">
            {translate("policyIntelligenceEyebrow")}
          </p>
          <h1>{translate("policyIntelligenceTitle")}</h1>
          <p className="workspace-dashboard__intro">
            {translate("policyIntelligenceIntroZeroKnowledge")}
          </p>
        </div>
      </header>

      <div className="policy-intelligence__tabs" role="tablist" aria-label="Policy Intelligence">
        <button
          type="button"
          role="tab"
          aria-selected={workspaceTab === "extract"}
          className={
            workspaceTab === "extract"
              ? "policy-intelligence__tab policy-intelligence__tab--active"
              : "policy-intelligence__tab"
          }
          onClick={() => setWorkspaceTab("extract")}
        >
          {translate("policyIntelligenceTabExtract")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workspaceTab === "comparison"}
          className={
            workspaceTab === "comparison"
              ? "policy-intelligence__tab policy-intelligence__tab--active"
              : "policy-intelligence__tab"
          }
          onClick={() => setWorkspaceTab("comparison")}
        >
          {translate("policyIntelligenceTabComparison")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workspaceTab === "discussion"}
          className={
            workspaceTab === "discussion"
              ? "policy-intelligence__tab policy-intelligence__tab--active"
              : "policy-intelligence__tab"
          }
          onClick={() => setWorkspaceTab("discussion")}
          data-testid="pi-tab-discussion-scenarios"
        >
          Discussion scenarios
        </button>
      </div>

      {error ? <p className="workspace-dashboard__error">{error}</p> : null}
      {notice ? <p className="policy-intelligence__notice">{notice}</p> : null}
      {loading ? <p>{translate("loading")}</p> : null}

      {workspaceTab === "comparison" ? (
        <ComparisonWorkspace
          reviews={reviews}
          selectedReviewId={selectedReviewId}
          onSelectReview={(reviewId) => {
            setSelectedReviewId(reviewId);
            loadBundle(reviewId).catch(() => {});
          }}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          setNotice={setNotice}
        />
      ) : null}

      {workspaceTab === "discussion" ? (
        <section className="workspace-dashboard__panel" aria-labelledby="pi-fi-discussion">
          <div className="workspace-dashboard__panel-head">
            <h2 id="pi-fi-discussion">
              Possible Discussion Scenarios for the Primerica Representative
            </h2>
          </div>
          {reviews.length ? (
            <label className="policy-intelligence__select-label">
              <span>{translate("policyIntelligenceSelectReview")}</span>
              <select
                value={selectedReviewId}
                onChange={handleSelectReview}
                disabled={busy}
                data-testid="fi-review-select"
              >
                {reviews.map((review) => (
                  <option key={review.id} value={review.id}>
                    {review.title} ({review.status})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <FinancialIntelligencePanel reviewId={selectedReviewId || null} />
        </section>
      ) : null}

      {workspaceTab === "extract" ? (
      <>
      <section className="workspace-dashboard__panel" aria-labelledby="pi-create-review">
        <div className="workspace-dashboard__panel-head">
          <h2 id="pi-create-review">{translate("policyIntelligenceCreateReviewTitle")}</h2>
        </div>
        <form className="policy-intelligence__form" onSubmit={handleCreateReview}>
          <label htmlFor="pi-review-title">{translate("policyIntelligenceReviewTitleLabel")}</label>
          <input
            id="pi-review-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            disabled={busy}
            placeholder={translate("policyIntelligenceReviewTitlePlaceholder")}
          />
          <button type="submit" disabled={busy || !title.trim()}>
            {translate("policyIntelligenceCreateReviewAction")}
          </button>
        </form>
      </section>

      <section className="workspace-dashboard__panel" aria-labelledby="pi-reviews">
        <div className="workspace-dashboard__panel-head">
          <h2 id="pi-reviews">{translate("policyIntelligenceReviewsTitle")}</h2>
        </div>
        {reviews.length === 0 ? (
          <p className="policy-intelligence__empty-copy">
            {translate("policyIntelligenceEmptyDescription")}
          </p>
        ) : (
          <label className="policy-intelligence__select-label">
            <span>{translate("policyIntelligenceSelectReview")}</span>
            <select value={selectedReviewId} onChange={handleSelectReview} disabled={busy}>
              {reviews.map((review) => (
                <option key={review.id} value={review.id}>
                  {review.title} ({review.status})
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {selectedReviewId ? (
        <>
          <section className="workspace-dashboard__panel" aria-labelledby="pi-upload">
            <div className="workspace-dashboard__panel-head">
              <h2 id="pi-upload">{translate("policyIntelligenceUploadTitle")}</h2>
            </div>
            <form className="policy-intelligence__form" onSubmit={handleUpload}>
              <label htmlFor="pi-document">{translate("policyIntelligenceDocumentLabel")}</label>
              <input
                id="pi-document"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.json,application/pdf,image/*,text/plain,application/json"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                disabled={busy}
              />
              <button type="submit" disabled={busy || !file}>
                {translate("policyIntelligenceUploadAction")}
              </button>
            </form>
          </section>

          <section className="workspace-dashboard__panel" aria-labelledby="pi-extraction">
            <div className="workspace-dashboard__panel-head">
              <h2 id="pi-extraction">{translate("policyIntelligenceExtractionTitle")}</h2>
            </div>
            <p className="policy-intelligence__empty-copy">
              {translate("policyIntelligenceExtractionHelpZk")}
            </p>

            {bundle?.documents?.length ? (
              <label className="policy-intelligence__select-label">
                <span>{translate("policyIntelligenceSelectDocument")}</span>
                <select
                  value={selectedDocumentId}
                  onChange={(event) => setSelectedDocumentId(event.target.value)}
                  disabled={busy}
                >
                  {bundle.documents.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.fileName} ({document.uploadStatus})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {selectedExtraction ? (
              <p className="policy-intelligence__meta">
                {translate("policyIntelligenceExtractionStatus")}: {selectedExtraction.status}
                {" · "}
                {translate("policyIntelligenceExtractionMethod")}:{" "}
                {selectedExtraction.extractionMethod}
                {" · "}
                schema {selectedExtraction.schemaVersion || selectedExtraction.extractedData?.schemaVersion}
              </p>
            ) : null}

            <form
              className="policy-intelligence__form policy-intelligence__grid"
              onSubmit={handleSaveExtraction}
            >
              <label>
                <span>{translate("policyIntelligenceFieldCarrier")}</span>
                <input
                  value={form.carrier}
                  onChange={(event) => updateForm("carrier", event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                <span>{translate("policyIntelligenceFieldProductType")}</span>
                <input
                  value={form.productType}
                  onChange={(event) => updateForm("productType", event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                <span>{translate("policyIntelligenceFieldGender")}</span>
                <input
                  value={form.gender}
                  onChange={(event) => updateForm("gender", event.target.value)}
                  disabled={busy}
                  placeholder="Male / Female"
                />
              </label>
              <label>
                <span>{translate("policyIntelligenceFieldIssueAge")}</span>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={form.issueAge}
                  onChange={(event) => updateForm("issueAge", event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                <span>{translate("policyIntelligenceFieldUnderwritingClass")}</span>
                <input
                  value={form.underwritingClass}
                  onChange={(event) => updateForm("underwritingClass", event.target.value)}
                  disabled={busy}
                  placeholder="Preferred Non-Smoker"
                />
              </label>
              <label>
                <span>{translate("policyIntelligenceFieldTobaccoStatus")}</span>
                <input
                  value={form.tobaccoStatus}
                  onChange={(event) => updateForm("tobaccoStatus", event.target.value)}
                  disabled={busy}
                  placeholder="Non-Smoker"
                />
              </label>
              <label>
                <span>{translate("policyIntelligenceFieldPremiumAmount")}</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.premiumAmount}
                  onChange={(event) => updateForm("premiumAmount", event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                <span>{translate("policyIntelligenceFieldPremiumFrequency")}</span>
                <input
                  value={form.premiumFrequency}
                  onChange={(event) => updateForm("premiumFrequency", event.target.value)}
                  disabled={busy}
                  placeholder="monthly"
                />
              </label>
              <label>
                <span>{translate("policyIntelligenceFieldFaceAmount")}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.faceAmount}
                  onChange={(event) => updateForm("faceAmount", event.target.value)}
                  disabled={busy}
                />
              </label>
              <button type="submit" disabled={busy || !selectedDocumentId}>
                {translate("policyIntelligenceSaveExtractionAction")}
              </button>
            </form>
          </section>
        </>
      ) : null}
      </>
      ) : null}
    </div>
  );
}
