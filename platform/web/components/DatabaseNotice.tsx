export function DatabaseNotice({ message: _message }: { message?: string }) {
  return (
    <section className="notice error-notice" role="status" aria-live="polite">
      <strong>Live data is temporarily unavailable</strong>
      <p>Please try again shortly. Existing source records and saved workspace settings are unchanged.</p>
    </section>
  );
}
