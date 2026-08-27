export default function TablePagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  label = "rows"
}) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="atlas-table-pagination" data-testid="table-pagination">
      <span className="atlas-table-pagination__meta">
        {total} {label} · Page {page} of {pageCount}
      </span>
      <div className="atlas-table-pagination__controls">
        <button
          type="button"
          className="identity-button-secondary"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="identity-button-secondary"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

void pageSize;
