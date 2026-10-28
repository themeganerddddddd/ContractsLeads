import Link from "next/link";

export function Pagination({ page, pageSize, total, params, basePath = "/search" }: { page: number; pageSize: number; total: number; params: Record<string, string | string[] | undefined>; basePath?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (target: number) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      const scalar = Array.isArray(value) ? value[0] : value;
      if (scalar && key !== "page") query.set(key, scalar);
    });
    query.set("page", String(target));
    return `${basePath}?${query}`;
  };
  return <nav className="pagination" aria-label="Search pages">
    {page > 1 ? <Link href={href(page - 1)}>← Previous</Link> : <span />}
    <span>Page {page} of {pages}</span>
    {page < pages ? <Link href={href(page + 1)}>Next →</Link> : <span />}
  </nav>;
}
