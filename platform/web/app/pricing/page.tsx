import { BillingButton } from "@/components/BillingButton";

export const metadata = { title: "Pricing", description: "Plans for federal contract intelligence, geographic searches, alerts, and exports." };

const plans = [
  {name:"Free",price:"$0",note:"forever",features:["30 days history","20 results per search","Company and contract profiles","Basic company-location search","Basic industry browsing"]},
  {name:"Local",price:"$15",note:"/ month · $150 annual",features:["Full company-location search","Five years history","All search results","Saved searches","Weekly alerts"]},
  {name:"Pro",price:"$39",note:"/ month · $390 annual",featured:true,features:["Everything in Local","Place-of-performance search","Complete history","CSV downloads","Daily alerts","25,000 export rows / month"]},
  {name:"Analyst",price:"$99",note:"/ month",features:["Everything in Pro","Large exports","XLSX export architecture","250,000 export rows / month","Advanced dashboards","Limited API architecture"]},
  {name:"Organization",price:"$249+",note:"starting monthly",features:["Organization deployment","Team-access architecture","Higher limits","Custom market architecture","Contact for scope"]}
];

export default function PricingPage() {
  return <><section className="page-heading"><p className="eyebrow">Simple market-data pricing</p><h1>Start useful. Upgrade for depth.</h1><p>Public profiles and a meaningful search preview remain free. Paid plans unlock more history, geography, alerts, and exports.</p></section><section className="pricing-grid">{plans.map((plan)=><article className={`price-card ${plan.featured?"featured":""}`} key={plan.name}>{plan.featured?<span className="plan-badge">Best for analysts</span>:null}<h2>{plan.name}</h2><div className="price">{plan.price} <small>{plan.note}</small></div><ul>{plan.features.map((feature)=><li key={feature}>{feature}</li>)}</ul>{plan.name==="Free"?<a className="button secondary" href="/search">Search free</a>:plan.name==="Organization"?<a className="button secondary" href="mailto:sales@example.test">Contact</a>:<BillingButton plan={plan.name.toLowerCase()}>{`Choose ${plan.name}`}</BillingButton>}</article>)}</section><p className="notice">Local development uses <code>DEV_PLAN</code> and optional mock checkout. No Stripe credentials are required to evaluate plan behavior.</p></>;
}
