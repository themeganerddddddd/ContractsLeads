"use client";

import { useState } from "react";

type Saved = { id: string; name: string; query_json: Record<string, unknown>; alert_frequency: string; updated_at: string };
const keys: Record<string,string> = {recipientState:"recipient_state",recipientCounty:"recipient_county",recipientCity:"recipient_city",recipientZip:"recipient_zip",performanceState:"performance_state",performanceCounty:"performance_county",performanceCity:"performance_city",performanceZip:"performance_zip",dateFrom:"date_from",dateTo:"date_to",minValue:"min_value",maxValue:"max_value",pageSize:"page_size"};

function searchUrl(query: Record<string,unknown>) { const params=new URLSearchParams(); Object.entries(query).forEach(([key,value])=>{if(value!==undefined&&value!==null&&value!=="")params.set(keys[key]||key,String(value));}); return `/search?${params}`; }

export function SavedSearchesClient({ initial }: { initial: Saved[] }) {
  const [rows,setRows]=useState(initial); const [message,setMessage]=useState("");
  async function remove(id:string){const response=await fetch(`/api/saved-searches/${id}`,{method:"DELETE"}); if(response.ok)setRows((current)=>current.filter((row)=>row.id!==id)); else setMessage("Could not delete search");}
  async function rename(row:Saved){const name=window.prompt("Rename search",row.name); if(!name)return; const response=await fetch(`/api/saved-searches/${row.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({name})}); if(response.ok)setRows((current)=>current.map((item)=>item.id===row.id?{...item,name}:item)); else setMessage("Could not rename search");}
  return <div className="saved-list">{rows.length?rows.map((row)=><article className="saved-row" key={row.id}><div><h3><a href={searchUrl(row.query_json)}>{row.name}</a></h3><p>{row.alert_frequency} alerts · Updated {new Date(row.updated_at).toLocaleDateString()}</p></div><div className="inline-actions"><a className="button secondary" href={searchUrl(row.query_json)}>Run</a><button className="button secondary" onClick={()=>rename(row)}>Rename</button><button className="button secondary" onClick={()=>remove(row.id)}>Delete</button></div></article>):<div className="empty-panel">No saved searches yet. Run a search and choose “Save search.”</div>}<small aria-live="polite">{message}</small></div>;
}
