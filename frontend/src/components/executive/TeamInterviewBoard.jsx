import { useLanguage } from "../../i18n/LanguageContext";

export default function TeamInterviewBoard({ rows }) {
  const { translate } = useLanguage();

  return (
    <section>
      <h2 className="executive-section-label">{translate("executiveTeamBoard")}</h2>
      <div className="executive-card executive-table-wrap">
        <table className="executive-table">
          <thead>
            <tr>
              <th>{translate("executiveTeamLeader")}</th>
              <th>{translate("executiveTeamTodayInterviews")}</th>
              <th>{translate("executiveTeamCompleted")}</th>
              <th>{translate("executiveTeamPending")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.leader}
                className={row.needsCoaching ? "executive-table__coaching" : undefined}
              >
                <td>{row.leader}</td>
                <td>{row.todayInterviews}</td>
                <td>{row.completed}</td>
                <td>{row.pending}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
