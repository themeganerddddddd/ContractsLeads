
import Link from "next/link";
export function ResearchTopbar(){return <div className="bc-research-topbar"><div className="bc-topbar-brand"><span className="bc-microcopy">FIRMQUARRY</span><strong>Research workspace</strong></div>
<form method="get" action="/companies" role="search"><span aria-hidden="true">⌕</span><input type="search" name="q" aria-label="Global company search" placeholder="Search companies, organizations, and legal names"/><button type="submit">Search ↗</button></form>
<div className="bc-topbar-actions"><Link href="/coverage">Coverage</Link><Link href="/account">My account</Link><Link href="/support">Help</Link></div></div>}
