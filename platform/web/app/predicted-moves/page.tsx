import { redirect } from "next/navigation";

type RawParams=Record<string,string|string[]|undefined>;
export const dynamic="force-dynamic";

/** Do not expose an unvalidated relocation forecast. Show documented movement records instead. */
export default async function MovementArchiveRedirect({searchParams}:{searchParams:Promise<RawParams>}) {
  const raw=await searchParams;
  const params=new URLSearchParams({tab:"moving"});
  for(const key of ["state","county","city","industry"]){
    const v=raw[key];
    const value=Array.isArray(v)?v[0]:v;
    if(value && value.length<160)params.set(key,value);
  }
  redirect("/business-change?"+params.toString());
}
