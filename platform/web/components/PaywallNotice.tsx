import Link from "next/link";

export function PaywallNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return <aside className="paywall"><span className="lock" aria-hidden="true">◆</span><div><strong>{title}</strong><p>{children}</p></div><Link className="button secondary" href="/pricing">Compare plans</Link></aside>;
}
