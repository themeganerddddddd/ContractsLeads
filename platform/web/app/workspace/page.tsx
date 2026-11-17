
import {ResearchHome,type HomeSignal} from "@/components/ResearchHome";
import {parsePredictionInput,searchPredictionCompanies,type PredictionCompanyRow} from "@/lib/company-intelligence";
import {resolveViewer} from "@/lib/plan";
type RawParams=Record<string,string|string[]|undefined>;
export const dynamic="force-dynamic";
function signal(row:PredictionCompanyRow,type:HomeSignal["type"]):HomeSignal {
 const components=type==="expansion"?row.expansion_components:type==="movement"?row.relocation_components:row.contraction_components;
 const supported=components?.destination_claim_supported===true && components.destination && typeof components.destination==="object" ? components.destination as Record<string,unknown>:null;
 const score=type==="expansion"?row.expansion_score:type==="movement"?row.relocation_score:row.contraction_score;
 const date=type==="expansion"?row.expansion_date:type==="movement"?row.relocation_date:row.contraction_date;
 const validated=row.probability_eligible===true && row.model_status==="active" && row.prediction_sufficiency==="sufficient" && row.probability!=null;
 return {id:row.id,name:row.canonical_name,slug:row.slug,sector:row.industry_name||"Industry not reported",location:row.location_label||"Not reported",
   observedState:row.location_state||"",observedCounty:row.location_county||"",signalDate:date||"",
   score,probability:validated?row.probability:null,verifiedDestination:supported?Object.values(supported).filter(Boolean).join(", "):null,destinationState:typeof supported?.state==="string"?supported.state.toUpperCase():null,type};
}
export default async function WorkspacePage({searchParams}:{searchParams:Promise<RawParams>}){
 const raw=await searchParams;const values=parsePredictionInput(raw);
 let signals:HomeSignal[]=[];let hasDatabase=false;
 if(process.env.DATABASE_URL)try{
   const viewer=await resolveViewer();
   const [expansion,contraction,movement]=await Promise.all([
    searchPredictionCompanies("expansion",values,viewer.plan,viewer.userId),
    searchPredictionCompanies("contraction",values,viewer.plan,viewer.userId),
    searchPredictionCompanies("moves",values,viewer.plan,viewer.userId)]);
   signals=[...expansion.rows.map(r=>signal(r,"expansion")),...contraction.rows.map(r=>signal(r,"contraction")),...movement.rows.map(r=>signal(r,"movement"))];
   // Attraction considers companies outside the target, but only with a supported destination.
   // This is a bounded first-page research sample, not an exhaustive national candidate universe.
   if(values.state){
     const national=await searchPredictionCompanies("expansion",{...values,state:undefined,county:undefined,page:1},viewer.plan,viewer.userId);
     const seen=new Set(signals.filter(s=>s.type==="expansion").map(s=>s.id));
     for(const item of national.rows){
       const prospect=signal(item,"expansion");
       if(prospect.verifiedDestination && !seen.has(prospect.id)){signals.push(prospect);seen.add(prospect.id);}
     }
   }
   hasDatabase=true;
 }catch{hasDatabase=false;}
 return <ResearchHome values={values} signals={signals} hasDatabase={hasDatabase}/>;
}
