
"use client";
import {useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import {US_STATES} from "@/components/MarketFilterBar";

type Props={state?:string;county?:string;country?:string};
const states=US_STATES as readonly (readonly [string,string])[];
const censusUrl="https://geocoding.geo.census.gov/geocoder/geographies/coordinates";

export function GeoMarketSelector({state:initialState="",county:initialCounty="",country="US"}:Props){
  const router=useRouter();
  const [state,setState]=useState(initialState);
  const [county,setCounty]=useState(initialCounty);
  const [status,setStatus]=useState("");
  const [busy,setBusy]=useState(false);
  const target=county?county+", "+(states.find(s=>s[0]===state)?.[1]||state):state?states.find(s=>s[0]===state)?.[1]||state:"United States";
  function navigate(nextState:string,nextCounty:string){
    const params=new URLSearchParams();
    if(nextState)params.set("state",nextState);
    if(nextCounty && nextState)params.set("county",nextCounty);
    router.push("/workspace"+(params.size?"?"+params.toString():""));
  }
  async function locate(prompt:boolean){
    if(!navigator.geolocation || !window.isSecureContext){setStatus("Location unavailable. Showing the United States.");return;}
    if(prompt)setStatus("Checking county with the U.S. Census Geocoder…");
    setBusy(true);
    try {
      const location=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:8500,maximumAge:900000,enableHighAccuracy:false}));
      const q=new URLSearchParams({x:String(location.coords.longitude),y:String(location.coords.latitude),benchmark:"Public_AR_Current",vintage:"Current_Current",format:"json"});
      const response=await fetch(censusUrl+"?"+q,{signal:AbortSignal.timeout(10000),cache:"no-store"});
      if(!response.ok)throw new Error("Geocoder unavailable");
      const payload=await response.json();
      const countyRecord=payload?.result?.geographies?.Counties?.[0] || payload?.result?.geographies?.["County Subdivisions"]?.[0];
      const region=countyRecord?.STATE;
      const fips=countyRecord?.NAME;
      const code=states.find(([c])=>Number(region)===({AL:1,AK:2,AZ:4,AR:5,CA:6,CO:8,CT:9,DE:10,DC:11,FL:12,GA:13,HI:15,ID:16,IL:17,IN:18,IA:19,KS:20,KY:21,LA:22,ME:23,MD:24,MA:25,MI:26,MN:27,MS:28,MO:29,MT:30,NE:31,NV:32,NH:33,NJ:34,NM:35,NY:36,NC:37,ND:38,OH:39,OK:40,OR:41,PA:42,RI:44,SC:45,SD:46,TN:47,TX:48,UT:49,VT:50,VA:51,WA:53,WV:54,WI:55,WY:56,PR:72} as Record<string,number>)[c])?.[0];
      if(code && typeof fips==="string" && fips.trim()){
        setStatus("County identified. Applying local market.");
        setState(code);setCounty(fips.trim());navigate(code,fips.trim());
      }else{setStatus("County could not be resolved; showing the United States.");navigate("","");}
    }catch {
      setStatus("Location denied or unavailable. United States remains the default.");
    }finally{setBusy(false);}
  }
  useEffect(()=>{
    if(initialState||initialCounty||country!=="US")return;
    let active=true;
    if(navigator.permissions?.query)navigator.permissions.query({name:"geolocation"}).then(permission=>{
      if(active && permission.state==="granted")void locate(false);
    }).catch(()=>{});
    return()=>{active=false};
  // Geolocation is automatic only when previously granted; never cause a surprise permission prompt.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[initialState,initialCounty,country]);
  return <section className="bc-geo-picker" aria-label="Research market selector">
    <div className="bc-geo-identity"><span className="bc-geo-globe" aria-hidden="true">◎</span><div><span className="bc-microcopy">YOUR TARGET MARKET</span><h2>{target}</h2><p>{county?"County-level intelligence workspace":state?"State-level intelligence workspace":"National intelligence workspace · choose a market or use your location"}</p></div></div>
    <form className="bc-geo-controls" onSubmit={event=>{event.preventDefault();navigate(state,county)}}>
      <label>State<select value={state} onChange={e=>{setState(e.target.value);setCounty("");}}><option value="">United States (all states)</option>{states.map(([code,label])=><option value={code} key={code}>{label}</option>)}</select></label>
      <label>County / parish<input value={county} disabled={!state} onChange={e=>setCounty(e.target.value)} placeholder={state?"County or parish":"Select a state"}/></label>
      <button className="bc-outline-btn" type="submit">Set market</button>
      <button className="bc-geo-detect" type="button" disabled={busy} onClick={()=>void locate(true)}>{busy?"Locating…":"⌾ Use my location"}</button>
      <small role={status?"status":undefined}>{status||"Your browser shares coordinates once with the U.S. Census Geocoder to resolve a county; FirmQuarry does not store them."}</small>
    </form>
  </section>;
}
