
"use client";
import {useMemo,useState} from "react";

type Signal={components?:Record<string,unknown>|null;explanation?:string|null;date?:string|null;score?:string|null};
type Mode="Expansion"|"Potential moves"|"Retention exposure";
const center:Record<string,[number,number]>={
AL:[32.8,-86.8],AK:[64,-153],AZ:[34.1,-111.8],AR:[34.7,-92.4],CA:[36.8,-119.5],CO:[39,-105.5],CT:[41.6,-72.7],DE:[39,-75.5],DC:[38.9,-77.04],FL:[27.8,-81.7],GA:[32.7,-83.4],HI:[20.8,-156.3],ID:[44.2,-114.5],IL:[40,-89.2],IN:[40,-86.3],IA:[42,-93.5],KS:[38.5,-98],KY:[37.6,-85.3],LA:[31,-92],ME:[45.2,-69.4],MD:[39,-76.7],MA:[42.3,-71.7],MI:[44.3,-85.5],MN:[46,-94.5],MS:[32.7,-89.7],MO:[38.6,-92.5],MT:[46.9,-110.4],NE:[41.5,-99.8],NV:[39.3,-116.6],NH:[43.9,-71.6],NJ:[40.1,-74.5],NM:[34.3,-106],NY:[42.9,-75.5],NC:[35.8,-79.8],ND:[47.6,-100.4],OH:[40.4,-82.7],OK:[35.5,-97.3],OR:[44,-120.5],PA:[41,-77.7],RI:[41.7,-71.6],SC:[33.8,-80.9],SD:[44.4,-100.2],TN:[35.9,-86.6],TX:[31,-99],UT:[39.3,-111.7],VT:[44,-72.7],VA:[37.5,-78.8],WA:[47.3,-120.6],WV:[38.6,-80.6],WI:[44.6,-89.5],WY:[43,-107.5]
};
const labels:Record<string,string>=Object.fromEntries(Object.entries({
AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"}).map(([key,name])=>[name.toLowerCase(),key]));
function candidate(s?:Signal){
  if(s?.components?.destination_claim_supported!==true)return null;
  const raw=s.components.destination;
  if(!raw||typeof raw!=="object")return null;
  const destination=raw as Record<string,unknown>;
  const state=String(destination.state||destination.region||"").trim();
  const code=center[state.toUpperCase()]?state.toUpperCase():labels[state.toLowerCase()];
  if(!code)return {label:Object.values(destination).filter(Boolean).map(String).join(", ")||"Destination disclosed",coords:null as [number,number]|null};
  return {label:[destination.county,destination.city,labels[code.toLowerCase()]||state].filter(Boolean).map(String).join(", ")||state,coords:center[code] as [number,number]};
}
export function CompanyGeographicOutlook({company,expansion={},relocation={},contraction={},compact=false}:{company:string;expansion?:Signal;relocation?:Signal;contraction?:Signal;compact?:boolean;}){
  const [mode,setMode]=useState<Mode>("Expansion");
  const active=mode==="Expansion"?expansion:mode==="Potential moves"?relocation:contraction;
  const destination=useMemo(()=>candidate(active),[active]);
  const coords=destination?.coords;
  const bbox=coords?[coords[1]-5,coords[0]-3,coords[1]+5,coords[0]+3]:[-125,24,-66,50];
  const src="https://www.openstreetmap.org/export/embed.html?"+new URLSearchParams({bbox:bbox.join(","),layer:"mapnik",...(coords?{marker:coords.join(",")}:{})}).toString();
  return <section className={compact?"bc-company-map compact":"bc-company-map"} aria-label="Company geographic outlook">
    <header><div><span className="bc-microcopy">COMPANY-SPECIFIC GEOGRAPHIC INTELLIGENCE</span><h2>Geographic expansion outlook</h2><p>Explore supported destination claims for {company}, not generic hot spots or invented forecasts.</p></div></header>
    <div className="bc-map-tabs" role="group" aria-label="Company outlook category">{(["Expansion","Potential moves","Retention exposure"] as Mode[]).map(x=><button type="button" key={x} aria-pressed={x===mode} className={mode===x?"is-active":""} onClick={()=>setMode(x)}>{x}</button>)}</div>
    <div className="bc-map-grid"><div className="bc-map-frame"><iframe loading="lazy" title={destination?mode+" destination geographic context": "U.S. geographic overview"} referrerPolicy="strict-origin-when-cross-origin" src={src}/><span>Map: © OpenStreetMap contributors · approximate state-centre markers when supported</span></div>
    <aside className="bc-map-evidence"><span className="bc-microcopy">DESTINATION EVIDENCE</span><h3>{destination?destination.label:"No verified destination identified"}</h3>
      <p>{destination?"A source-backed destination is recorded. The map is geographic context, not a statistically ranked probability surface.":"No source currently supports assigning this company a likely county or state. Geographic rankings and probabilities are deliberately withheld."}</p>
      {active.score?<div><strong>Evidence strength {Number(active.score).toFixed(0)}/100</strong><small>Descriptive score; not a probability</small></div>:null}
      {active.explanation?<p>{active.explanation}</p>:null}
      {destination?.coords?<a href={"https://www.openstreetmap.org/?mlat="+coords?.[0]+"&mlon="+coords?.[1]} target="_blank" rel="noreferrer">Open mapped geography ↗</a>:null}
      <small>{active.date?"Signal updated "+active.date:"Destination confidence requires verified, recent data"} · Cost of living, talent and permitting are contextual factors, not evidence of intent.</small>
    </aside></div>
  </section>;
}
