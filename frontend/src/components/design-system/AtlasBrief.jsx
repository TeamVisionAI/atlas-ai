import { useState } from "react";
import { formatTextWithDates } from "../../utils/dateFormatter";
import { useLanguage } from "../../i18n/LanguageContext";
import ExecutivePanel from "./ExecutivePanel";
import "./AtlasBrief.css";

export default function AtlasBrief({ bullets = [], expandedContent = null }) {
  const { translate } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const previewBullets = bullets.slice(0, 4);
  const hasExpandedContent = Boolean(
    expandedContent?.suggestedReply || expandedContent?.aiRecommendation
  );

  if (!previewBullets.length) {
    return null;
  }

  return (
    <ExecutivePanel>
      <button
        type="button"
        className="atlas-brief__toggle"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        disabled={!hasExpandedContent}
      >
        <span className="atlas-brief__heading">{translate("recruiterBriefTitle")}</span>
        {hasExpandedContent ? (
          <span className="atlas-brief__expand-hint">
            {expanded
              ? translate("missionControlAiBriefHide")
              : translate("missionControlAiBriefExpand")}
          </span>
        ) : null}
      </button>

      <ul className="atlas-brief__list">
        {previewBullets.map((item) => (
          <li key={item} className="atlas-brief__item">
            {formatTextWithDates(item)}
          </li>
        ))}
      </ul>

      {expanded && hasExpandedContent ? (
        <div className="atlas-brief__expanded">
          {expandedContent.suggestedReply ? (
            <div className="atlas-brief__detail">
              <span className="atlas-brief__detail-label">
                {translate("missionControlAiBriefSuggestedReply")}
              </span>
              <p className="atlas-brief__quote">&ldquo;{expandedContent.suggestedReply}&rdquo;</p>
            </div>
          ) : null}

          {expandedContent.aiRecommendation ? (
            <div className="atlas-brief__detail">
              <span className="atlas-brief__detail-label">
                {translate("missionControlAiBriefRecommendation")}
              </span>
              <p className="atlas-brief__detail-text">{expandedContent.aiRecommendation}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </ExecutivePanel>
  );
}
