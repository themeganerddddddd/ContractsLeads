"use client";

import { useMemo, useState } from "react";

type Signal = { components?: Record<string, unknown> | null; explanation?: string | null; date?: string | null; score?: string | null };
type Kind = "expansion" | "relocation" | "contraction";
type Mode = "Expansion" | "Potential moves" | "Retention exposure";
const modeByKind: Record<Kind, Mode> = { expansion: "Expansion", relocation: "Potential moves", contraction: "Retention exposure" };

const centers: Record<string, [number, number]> = {
AL:[32.8,-86.8],AK:[64,-153],AZ:[34.1,-111.8],AR:[34.7,-92.4],CA:[36.8,-119.5],CO:[39,-105.5],CT:[41.6,-72.7],DE:[39,-75.5],DC:[38.9,-77.04],FL:[27.8,-81.7],GA:[32.7,-83.4],HI:[20.8,-156.3],ID:[44.2,-114.5],IL:[40,-89.2],IN:[40,-86.3],IA:[42,-93.5],KS:[38.5,-98],KY:[37.6,-85.3],LA:[31,-92],ME:[45.2,-69.4],MD:[39,-76.7],MA:[42.3,-71.7],MI:[44.3,-85.5],MN:[46,-94.5],MS:[32.7,-89.7],MO:[38.6,-92.5],MT:[46.9,-110.4],NE:[41.5,-99.8],NV:[39.3,-116.6],NH:[43.9,-71.6],NJ:[40.1,-74.5],NM:[34.3,-106],NY:[42.9,-75.5],NC:[35.8,-79.8],ND:[47.6,-100.4],OH:[40.4,-82.7],OK:[35.5,-97.3],OR:[44,-120.5],PA:[41,-77.7],RI:[41.7,-71.6],SC:[33.8,-80.9],SD:[44.4,-100.2],TN:[35.9,-86.6],TX:[31,-99],UT:[39.3,-111.7],VT:[44,-72.7],VA:[37.5,-78.8],WA:[47.3,-120.6],WV:[38.6,-80.6],WI:[44.6,-89.5],WY:[43,-107.5],
};
const stateNames: Record<string, string> = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"};
// Public-domain Natural Earth coastline simplified for an illustrative continental U.S. context map.
const usOutline = "M84.2,50.4 L471.8,50.4 L471.8,45.2 L476.6,45.1 L483.4,54.9 L521.0,62.1 L554.2,63.7 L566.7,59.8 L615.7,78.9 L619.5,85.2 L626.0,84.2 L635.4,91.2 L633.7,93.6 L648.3,100.0 L654.1,124.1 L640.3,144.4 L646.3,149.9 L698.8,133.7 L695.6,125.6 L701.9,123.4 L728.5,123.3 L755.9,104.7 L802.9,104.6 L814.8,98.5 L834.7,71.5 L854.9,76.6 L854.9,95.2 L866.5,107.3 L822.4,122.6 L812.6,133.7 L812.5,140.9 L817.1,148.1 L822.9,148.5 L821.4,143.5 L825.6,146.5 L824.5,150.4 L772.1,160.0 L796.8,160.0 L768.7,162.4 L764.4,166.2 L768.5,166.8 L765.5,176.6 L755.3,187.0 L746.6,179.5 L753.2,194.3 L740.8,210.4 L743.9,200.7 L736.7,195.5 L735.1,184.2 L732.4,190.1 L735.4,198.7 L726.1,196.6 L735.8,200.9 L743.8,233.1 L734.9,243.2 L697.2,261.0 L665.3,288.9 L665.6,308.0 L683.2,350.9 L678.7,373.6 L667.6,373.7 L660.1,364.6 L644.0,337.2 L646.9,328.2 L632.1,309.4 L626.6,307.3 L612.5,313.4 L594.4,303.1 L549.7,306.3 L555.0,318.1 L552.3,319.9 L531.7,320.1 L521.2,312.9 L498.8,311.4 L478.3,315.6 L444.0,338.0 L440.7,353.5 L444.0,364.6 L438.6,365.0 L417.7,357.8 L410.7,341.9 L390.6,316.9 L380.7,311.5 L369.3,311.8 L360.5,322.5 L348.8,318.4 L341.6,314.3 L333.5,299.7 L312.9,284.7 L288.6,284.7 L288.6,290.3 L249.7,290.4 L196.6,274.2 L197.9,271.5 L164.2,274.0 L161.9,267.1 L144.7,253.8 L115.3,245.9 L113.6,238.4 L100.0,224.8 L88.8,202.8 L71.8,186.9 L69.9,175.8 L62.4,168.4 L65.0,145.5 L60.5,135.1 L69.4,97.6 L66.9,79.4 L58.4,61.5 L60.1,58.8 L80.3,63.4 L87.8,76.2 L91.2,72.7 L84.2,50.4 Z";
const stateCode = (raw: string) => {
  const value = raw.trim();
  const upper = value.toUpperCase();
  return centers[upper] ? upper : Object.keys(stateNames).find(code => stateNames[code].toLowerCase() === value.toLowerCase()) || null;
};
function locatedDestination(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const place = raw as Record<string, unknown>;
  const code = stateCode(String(place.state || place.region || ""));
  if (!code) return null;
  const label = [place.city, place.county, stateNames[code]].filter(Boolean).join(", ") || stateNames[code];
  return { code, label, coords: centers[code], source: String(place.source_url || "") };
}
function destination(signal: Signal) {
  if (signal.components?.destination_claim_supported !== true) return null;
  return locatedDestination(signal.components.destination);
}
type Pin = { code: string; label: string; coords: [number, number]; kind: "supported" | "sourcedAlternative" | "comparison"; source?: string };
function mapPosition([lat, lon]: [number, number]) { return { x: 40 + ((lon + 126) / 60) * 840, y: 30 + ((50.5 - lat) / 26.5) * 360 }; }

export function CompanyGeographicOutlook({
  company, expansion = {}, relocation = {}, contraction = {}, compact = false, focus = null, visibleKinds = ["expansion", "relocation", "contraction"],
}: {
  company: string; expansion?: Signal; relocation?: Signal; contraction?: Signal; compact?: boolean;
  focus?: Kind | null; visibleKinds?: Kind[];
}) {
  const modes = visibleKinds.map(kind => modeByKind[kind]);
  const [mode, setMode] = useState<Mode>(focus ? modeByKind[focus] : modes[0] || "Expansion");
  const [selectedComparison, setSelectedComparison] = useState("");
  const [comparisons, setComparisons] = useState<string[]>([]);
  const currentMode = modes.includes(mode) ? mode : modes[0] || "Expansion";
  const active = currentMode === "Expansion" ? expansion : currentMode === "Potential moves" ? relocation : contraction;
  const supported = useMemo(() => destination(active), [active]);
  const alternatives = useMemo(() => {
    const entries = active.components?.alternative_destinations;
    if (!Array.isArray(entries)) return [];
    return entries.filter(entry => entry && typeof entry === "object" && (entry.source_url || entry.source_supported === true))
      .map(locatedDestination).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)).slice(0, 5);
  }, [active]);
  const pins: Pin[] = [
    ...(supported ? [{ ...supported, kind: "supported" as const }] : []),
    ...alternatives.filter(item => item.code !== supported?.code).map(item => ({ ...item, kind: "sourcedAlternative" as const })),
    ...comparisons.filter(code => code !== supported?.code && !alternatives.some(item => item.code === code))
      .map(code => ({ code, coords: centers[code], label: stateNames[code], kind: "comparison" as const })),
  ];
  const comparedCodes = new Set(pins.map(pin => pin.code));
  const availableStates = Object.entries(stateNames).filter(([code]) =>
    centers[code][1] > -126 && centers[code][0] < 50.5 && !comparedCodes.has(code));
  return <section className={compact ? "bc-company-map fq-outlook-map compact" : "bc-company-map fq-outlook-map"} aria-label="Company geographic outlook">
    <header><div><span className="bc-microcopy">DESTINATION RESEARCH / {company.toUpperCase()}</span>
      <h2>Geographic outlook &amp; alternative markets</h2>
      <p>Source-supported destinations and optional markets for comparison are clearly separated. A comparison is not evidence of company intent.</p></div></header>
    {modes.length > 1 ? <div className="bc-map-tabs" role="group" aria-label="Company outlook category">
      {modes.map(item => <button type="button" key={item} aria-pressed={item === currentMode} className={item === currentMode ? "is-active" : ""} onClick={() => setMode(item)}>{item}</button>)}
    </div> : null}
    <div className="bc-map-grid fq-map-grid">
      <div className="fq-map-panel">
        <div className="fq-map-control-bar"><span>CONTINENTAL U.S. · GEOGRAPHIC CONTEXT</span><span>{pins.length} markers</span></div>
        <svg className="fq-vector-map" viewBox="0 0 920 430" role="img" aria-label={pins.length ? `Map with ${pins.length} verified or research-comparison markers` : "Map of the continental United States; no destination is verified"}>
          <defs><linearGradient id="fqMapFade" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f1f7f7"/><stop offset="1" stopColor="#dbe9e9"/></linearGradient></defs>
          <rect width="920" height="430" rx="12" fill="url(#fqMapFade)"/>
          {[0,1,2,3,4,5].map(i=><line key={i} x1={i*185} y1="0" x2={i*185} y2="430" stroke="#c6dadb" strokeDasharray="3 8" opacity=".6"/>)}
          {[0,1,2,3].map(i=><line key={i} x1="0" y1={i*135} x2="920" y2={i*135} stroke="#c6dadb" strokeDasharray="3 8" opacity=".6"/>)}
          <path d={usOutline} fill="#fbfdfc" stroke="#aecacc" strokeWidth="2.5" strokeLinejoin="round"/>
          {pins.map((pin,index) => {
            const { x, y } = mapPosition(pin.coords);
            const color = pin.kind === "comparison" ? "#dd923a" : pin.kind === "supported" ? "#0a777a" : "#4b80a6";
            return <g key={pin.kind + pin.code} transform={`translate(${x} ${y})`}>
              <circle r="14" fill={color} opacity=".15"/>
              <circle r="7" fill={color} stroke="#fff" strokeWidth="2.5"/>
              <text y="-18" textAnchor="middle" fill="#244a58" fontSize="13" fontWeight="800">{pin.code}</text>
              <title>{index+1}. {pin.label} · {pin.kind === "comparison" ? "User-selected comparison only" : "Source-supported destination"}</title>
            </g>;
          })}
          <text x="17" y="410" fontSize="10" fill="#64838b">Schematic state-center markers · Natural Earth coastline</text>
        </svg>
        <div className="fq-map-legend">
          <span><i className="fq-legend-verified"/> Verified destination</span>
          <span><i className="fq-legend-source"/> Other sourced options</span>
          <span><i className="fq-legend-compare"/> Your comparison markets</span>
        </div>
      </div>
      <aside className="bc-map-evidence fq-map-evidence">
        <span className="bc-microcopy">SOURCE-BACKED DESTINATION</span>
        <h3>{supported ? supported.label : "No verified destination identified"}</h3>
        <p>{supported ? "This destination is supported by an attached source claim, not a statistically ranked suitability score." : "No specific destination has been independently supported by the current evidence. You can still select states to compare, without implying a forecast."}</p>
        {active.score != null ? <div><strong>Evidence strength {Number(active.score).toFixed(0)}/100</strong><small>Descriptive score; not a calibrated probability</small></div> : null}
        {alternatives.length > 0 ? <div className="fq-map-alternatives"><strong>Additional source-supported possibilities</strong>{alternatives.map(item =>
          <p key={item.code}>{item.label}{item.source ? <> · <a href={item.source} target="_blank" rel="noopener noreferrer">source ↗</a></> : null}</p>)}</div> : null}
        <div className="fq-map-compare">
          <label htmlFor="fq-map-compare-state">Compare another state</label>
          <div><select id="fq-map-compare-state" value={selectedComparison} onChange={e=>setSelectedComparison(e.target.value)}>
            <option value="">Select a state</option>
            {availableStates.map(([code,name])=><option key={code} value={code}>{name}</option>)}
          </select><button type="button" disabled={!selectedComparison || comparisons.length >= 4} onClick={() => {
            if (selectedComparison && !comparisons.includes(selectedComparison)) setComparisons([...comparisons, selectedComparison]);
            setSelectedComparison("");
          }}>Add</button></div>
          {comparisons.length ? <div className="fq-map-selected">{comparisons.map(code=><button type="button" key={code} onClick={()=>setComparisons(comparisons.filter(c=>c!==code))} aria-label={`Remove ${stateNames[code]} comparison`}>{stateNames[code]} ×</button>)}</div> : null}
          <small>Comparison pins are manually selected research geographies, not predicted company destinations.</small>
        </div>
        {active.explanation ? <p className="fq-map-reason">{active.explanation}</p> : null}
      </aside>
    </div>
  </section>;
}
