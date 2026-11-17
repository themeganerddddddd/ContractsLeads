import Link from "next/link";

export function SupportLauncher() {
  return <Link
    className="bc-support-launcher"
    href="/support"
    aria-label="Open FirmQuarry help and feedback"
  >Help &amp; feedback</Link>;
}
