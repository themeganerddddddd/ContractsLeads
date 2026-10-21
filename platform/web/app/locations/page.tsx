export const metadata = { title: "Locations" };

export default function LocationsPage() {
  return <><section className="page-heading"><p className="eyebrow">Geographic intelligence</p><h1>Explore contract locations</h1><p>Use a state code and five-digit county FIPS to compare companies based in a county with work performed there.</p></section><section className="panel"><form className="geo-search" action="/location/MD/24031"><label>Open a county profile<div><input name="state" defaultValue="MD" aria-label="State code" /><input name="county" defaultValue="24031" aria-label="County FIPS" /><a className="button primary" href="/location/MD/24031">View Montgomery County demo</a></div></label></form></section></>;
}
