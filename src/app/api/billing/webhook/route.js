import { createClient } from "@supabase/supabase-js";
import { getCreditPack } from "@/lib/credits";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function applyCheckoutSession(admin, session) {
  if (session.payment_status !== "paid") return;
  const userId = session.metadata?.user_id || session.client_reference_id;
  const pack = getCreditPack(session.metadata?.pack_id);
  if (!userId || !pack) {
    throw new Error("Checkout session contains invalid DramaAI metadata.");
  }
  if (Number(session.amount_total) !== pack.pricePence) {
    throw new Error("Checkout amount does not match the DramaAI credit pack.");
  }
  if (String(session.currency || "").toLowerCase() !== pack.currency) {
    throw new Error("Checkout currency does not match the DramaAI credit pack.");
  }
  const paymentIntent =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;
  const { data: applied, error } = await admin.rpc("apply_credit_purchase", {
    p_user_id: userId,
    p_checkout_session_id: session.id,
    p_payment_intent_id: paymentIntent,
    p_pack_id: pack.id,
    p_credits: pack.credits,
    p_amount_pence: pack.pricePence,
    p_currency: pack.currency,
  });
  if (error) throw error;
  if (!applied) throw new Error("The credit purchase could not be applied.");
  const { error: debtError } = await admin.rpc("reconcile_credit_debt", {
    p_user_id: userId,
  });
  if (debtError) throw debtError;
}

async function applyRefund(admin, charge) {
  const paymentIntent =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id || null;
  if (!paymentIntent) return;
  const { error } = await admin.rpc("apply_credit_refund", {
    p_payment_intent_id: paymentIntent,
    p_refunded_amount_pence: Number(charge.amount_refunded || 0),
  });
  if (error) throw error;
}

export async function POST(request) {
  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
    }
    const signature = request.headers.get("stripe-signature");
    if (!signature) return new Response("Missing Stripe signature.", { status: 400 });
    const rawBody = await request.text();
    const stripe = getStripe();
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error("DramaAI webhook signature error:", error);
      return new Response("Invalid webhook signature.", { status: 400 });
    }
    const admin = createAdminClient();
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await applyCheckoutSession(admin, event.data.object);
    } else if (event.type === "charge.refunded") {
      await applyRefund(admin, event.data.object);
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error("DramaAI billing webhook error:", error);
    return Response.json(
      { received: false, message: error?.message || "Webhook processing failed." },
      { status: 500 }
    );
  }
}
