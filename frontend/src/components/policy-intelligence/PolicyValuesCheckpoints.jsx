import {
  formatClassifiedTableCell,
  TABLE_UNAVAILABLE
} from "./classifiedValueDisplay";

function cell(classified) {
  return formatClassifiedTableCell(classified);
}

function Head({ lines, className = "", testId }) {
  return (
    <th
      className={`pi-checkpoint-table__col ${className}`.trim()}
      scope="col"
      data-testid={testId}
    >
      <span className="pi-checkpoint-table__head">
        {lines.map((line) => (
          <span key={line} className="pi-checkpoint-table__head-line">
            {line}
          </span>
        ))}
      </span>
    </th>
  );
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
        <colgroup>
          <col className="pi-checkpoint-table__col--year" />
          <col className="pi-checkpoint-table__col--age" />
          <col className="pi-checkpoint-table__col--premium" />
          <col className="pi-checkpoint-table__col--coi" />
          <col className="pi-checkpoint-table__col--other" />
          <col className="pi-checkpoint-table__col--surrender" />
          <col className="pi-checkpoint-table__col--av" />
          <col className="pi-checkpoint-table__col--csv" />
          <col className="pi-checkpoint-table__col--db" />
        </colgroup>
        <caption className="pi-checkpoint-table__caption">
          Sourced checkpoint values. Missing costs display as “—” and are never treated as $0.
          {footnoteId ? <sup className="pi-fn">{`[${footnoteId}]`}</sup> : null}
        </caption>
        <thead>
          <tr>
            <Head lines={["Policy Year"]} className="pi-checkpoint-table__col--year" testId="pi-checkpoint-h-year" />
            <Head lines={["Attained Age"]} className="pi-checkpoint-table__col--age" testId="pi-checkpoint-h-age" />
            <Head lines={["Annual Premium"]} className="pi-checkpoint-table__col--premium" testId="pi-checkpoint-h-premium" />
            <Head
              lines={["Cost of", "Insurance"]}
              className="pi-checkpoint-table__col--coi"
              testId="pi-checkpoint-h-coi"
            />
            <Head
              lines={["Other Known", "Charges"]}
              className="pi-checkpoint-table__col--other"
              testId="pi-checkpoint-h-other"
            />
            <Head
              lines={["Surrender", "Charge"]}
              className="pi-checkpoint-table__col--surrender"
              testId="pi-checkpoint-h-surrender"
            />
            <Head
              lines={["Accumulated", "Value"]}
              className="pi-checkpoint-table__col--av pi-checkpoint-table__av"
              testId="pi-checkpoint-h-av"
            />
            <Head
              lines={["Cash Surrender", "Value"]}
              className="pi-checkpoint-table__col--csv pi-checkpoint-table__csv"
              testId="pi-checkpoint-h-csv"
            />
            <Head
              lines={["Death", "Benefit"]}
              className="pi-checkpoint-table__col--db"
              testId="pi-checkpoint-h-db"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.requestedYear}-${row.usedYear}`}
              data-testid={`pi-checkpoint-${row.requestedYear}`}
              data-fallback={row.fallback ? "true" : "false"}
            >
              <td className="pi-checkpoint-table__col--year">
                {row.usedYear}
                {row.fallback ? (
                  <span className="pi-checkpoint-table__fallback">
                    {" "}
                    (requested {row.requestedYear}, 5-year fallback)
                  </span>
                ) : null}
              </td>
              <td className="pi-checkpoint-table__col--age">
                {row.attainedAge != null ? row.attainedAge : TABLE_UNAVAILABLE}
              </td>
              <td className="pi-checkpoint-table__col--premium">{cell(row.premium)}</td>
              <td className="pi-checkpoint-table__col--coi">{cell(row.costOfInsurance)}</td>
              <td className="pi-checkpoint-table__col--other">{cell(row.otherKnownCharges)}</td>
              <td className="pi-checkpoint-table__col--surrender">{cell(row.surrenderCharge)}</td>
              <td className="pi-checkpoint-table__col--av pi-checkpoint-table__av" data-testid="pi-checkpoint-av">
                {cell(row.accountValue)}
              </td>
              <td className="pi-checkpoint-table__col--csv pi-checkpoint-table__csv" data-testid="pi-checkpoint-csv">
                {cell(row.cashSurrenderValue)}
              </td>
              <td className="pi-checkpoint-table__col--db">{cell(row.deathBenefit)}</td>
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
