import {
  formatClassifiedTableCell,
  TABLE_UNAVAILABLE
} from "./classifiedValueDisplay";

function cell(classified) {
  return formatClassifiedTableCell(classified);
}

export default function PolicyValuesCheckpoints({
  checkpoints = [],
  sourceLine = null,
  footnoteId = null
}) {
  const rows = (checkpoints || []).filter((row) => row.usedYear != null);

  if (!rows.length) {
    return (
      <p className="pi-report__empty" data-testid="pi-values-unavailable">
        Illustrated annual values are not available for this review.
      </p>
    );
  }

  return (
    <div className="pi-checkpoint-wrap" data-testid="pi-checkpoint-table">
      <table className="pi-checkpoint-table">
        <caption className="pi-checkpoint-table__caption">
          Sourced checkpoint values. Missing costs display as “—” and are never treated as $0.
          {footnoteId ? <sup className="pi-fn">{`[${footnoteId}]`}</sup> : null}
        </caption>
        <thead>
          <tr>
            <th>Policy Year</th>
            <th>Attained Age</th>
            <th>Annual Premium</th>
            <th>Cost of Insurance</th>
            <th>Other Known Charges</th>
            <th>Surrender Charge</th>
            <th className="pi-checkpoint-table__av">Accumulated Value</th>
            <th className="pi-checkpoint-table__csv">Cash Surrender Value</th>
            <th>Death Benefit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.requestedYear}-${row.usedYear}`}
              data-testid={`pi-checkpoint-${row.requestedYear}`}
              data-fallback={row.fallback ? "true" : "false"}
            >
              <td>
                {row.usedYear}
                {row.fallback ? (
                  <span className="pi-checkpoint-table__fallback">
                    {" "}
                    (requested {row.requestedYear}, 5-year fallback)
                  </span>
                ) : null}
              </td>
              <td>{row.attainedAge != null ? row.attainedAge : TABLE_UNAVAILABLE}</td>
              <td>{cell(row.premium)}</td>
              <td>{cell(row.costOfInsurance)}</td>
              <td>{cell(row.otherKnownCharges)}</td>
              <td>{cell(row.surrenderCharge)}</td>
              <td className="pi-checkpoint-table__av" data-testid="pi-checkpoint-av">
                {cell(row.accountValue)}
              </td>
              <td className="pi-checkpoint-table__csv" data-testid="pi-checkpoint-csv">
                {cell(row.cashSurrenderValue)}
              </td>
              <td>{cell(row.deathBenefit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pi-checkpoint-table__legend">
        Accumulated value and cash surrender value are shown separately.
      </p>
      {sourceLine ? (
        <p className="pi-source-line" data-testid="pi-checkpoint-source">
          {sourceLine}
          {footnoteId ? <sup className="pi-fn">{`[${footnoteId}]`}</sup> : null}
        </p>
      ) : null}
    </div>
  );
}
