export function DatabaseNotice({ message }: { message?: string }) {
  return (
    <section className="notice error-notice" role="status">
      <strong>Database not available</strong>
      <p>{message || "Start PostgreSQL, run migrations, and seed demo data using the commands in platform/README.md."}</p>
    </section>
  );
}
