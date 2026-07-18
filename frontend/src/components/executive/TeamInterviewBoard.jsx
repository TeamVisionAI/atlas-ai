export default function TeamInterviewBoard({ rows }) {
  return (
    <section>
      <h2 className="executive-section-label">Team Interview Board</h2>
      <div className="executive-card executive-table-wrap">
        <table className="executive-table">
          <thead>
            <tr>
              <th>Leader</th>
              <th>Today&apos;s Interviews</th>
              <th>Completed</th>
              <th>Pending</th>
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
