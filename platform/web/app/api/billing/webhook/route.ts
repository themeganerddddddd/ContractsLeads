import type Stripe from "stripe";
import { withTransaction } from "@/lib/db";
import { stripeClient } from "@/lib/stripe";

function planForPrice(priceId: string | undefined): string {
  const pairs: Array<[string|undefined,string]> = [[process.env.STRIPE_PRICE_LOCAL_MONTHLY,"local"],[process.env.STRIPE_PRICE_LOCAL_ANNUAL,"local"],[process.env.STRIPE_PRICE_PRO_MONTHLY,"pro"],[process.env.STRIPE_PRICE_PRO_ANNUAL,"pro"],[process.env.STRIPE_PRICE_ANALYST_MONTHLY,"analyst"]];
  return pairs.find(([id])=>id===priceId)?.[1] || "free";
}

export async function POST(request: Request) {
  const stripe=stripeClient(), secret=process.env.STRIPE_WEBHOOK_SECRET, signature=request.headers.get("stripe-signature");
  if(!stripe||!secret||!signature)return Response.json({error:"Stripe webhook is not configured"},{status:503});
  let event: Stripe.Event;
  try { event=stripe.webhooks.constructEvent(await request.text(),signature,secret); } catch { return Response.json({error:"Invalid signature"},{status:400}); }
  const processed=await withTransaction(async(client)=>{
    const inserted=await client.query("INSERT INTO stripe_events (id,event_type) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING id",[event.id,event.type]);
    if(!inserted.rowCount)return false;
    if(event.type.startsWith("customer.subscription.")){
      const subscription=event.data.object as Stripe.Subscription;
      const customer=typeof subscription.customer==="string"?subscription.customer:subscription.customer.id;
      const priceId=subscription.items.data[0]?.price?.id;
      const item=subscription.items.data[0] as any;
      await client.query(`INSERT INTO subscriptions (user_id,provider,provider_customer_id,provider_subscription_id,plan,status,period_start,period_end)
        SELECT user_id,'stripe',$1,$2,$3,$4,to_timestamp($5),to_timestamp($6) FROM subscriptions WHERE provider_customer_id=$1 ORDER BY updated_at DESC LIMIT 1
        ON CONFLICT (provider,provider_subscription_id) DO UPDATE SET plan=EXCLUDED.plan,status=EXCLUDED.status,period_start=EXCLUDED.period_start,period_end=EXCLUDED.period_end`,
        [customer,subscription.id,planForPrice(priceId),subscription.status,item.current_period_start||0,item.current_period_end||0]);
    }
    if(event.type==="checkout.session.completed"){
      const session=event.data.object as Stripe.Checkout.Session; const userId=session.metadata?.userId||session.client_reference_id; const subscription=typeof session.subscription==="string"?session.subscription:null; const customer=typeof session.customer==="string"?session.customer:null;
      if(userId&&subscription)await client.query(`INSERT INTO subscriptions (user_id,provider,provider_customer_id,provider_subscription_id,plan,status) VALUES ($1,'stripe',$2,$3,$4,'active') ON CONFLICT (provider,provider_subscription_id) DO UPDATE SET user_id=EXCLUDED.user_id,provider_customer_id=EXCLUDED.provider_customer_id,plan=EXCLUDED.plan,status='active'`,[userId,customer,subscription,session.metadata?.plan||"free"]);
    }
    return true;
  });
  return Response.json({received:true,processed});
}
