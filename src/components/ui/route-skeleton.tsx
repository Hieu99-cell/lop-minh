export function RouteSkeleton() {
  return (
    <section
      className="route-skeleton"
      data-route-loading
      role="status"
      aria-label="Đang tải trang"
    >
      <span className="skeleton-line skeleton-title" />
      <span className="skeleton-line" />
      <div className="stats-grid" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div className="stat-card skeleton-block" key={i} />
        ))}
      </div>
      <div className="panel skeleton-block" aria-hidden="true" />
      <span className="sr-only">Đang tải dữ liệu…</span>
    </section>
  );
}
