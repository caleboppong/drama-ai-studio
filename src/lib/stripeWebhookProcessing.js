import { getCreditPack } from "@/lib/credits";

export const SUPPORTED_STRIPE_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "charge.refunded",
]);

function paymentIntentId(value) {
  return typeof value === "string" ? value : value?.id || null;
}

async function applyPurchase(admin, session) {
  if (session.payment_status !== "paid") {
    if (session.payment_status === "unpaid" && session.status !== "complete") {
      throw new Error("Checkout has not completed.");
    }
    return { awaitingPayment: true };
  }
  if (session.mode !== "payment" || session.status !== "complete") {
    throw new Error("Unexpected checkout session state.");
  }
  const userId = session.metadata?.user_id;
  const pack = getCreditPack(session.metadata?.pack_id);
  if (!userId || !pack || session.client_reference_id !== userId) {
    throw new Error("Checkout session has invalid account or pack metadata.");
  }
  if (Number(session.amount_total) !== pack.pricePence ||
      String(session.currency || "").toLowerCase() !== pack.currency) {
    throw new Error("Checkout amount or currency does not match the pack.");
  }
  const intent = paymentIntentId(session.payment_intent);
  if (!intent) throw new Error("Checkout is missing a payment intent.");
  const { data, error } = await admin.rpc("apply_credit_purchase", {
    p_user_id: userId,
    p_checkout_session_id: session.id,
    p_payment_intent_id: intent,
    p_pack_id: pack.id,
    p_credits: pack.credits,
    p_amount_pence: pack.pricePence,
    p_currency: pack.currency,
  });
  if (error) throw error;
  if (data !== true) throw new Error("Purchase was not applied.");
  const { error: debtError } = await admin.rpc("reconcile_credit_debt", {
    p_user_id: userId,
  });
  if (debtError) throw debtError;
  return { applied: true };
}

async function applyRefund(admin, charge) {
  const intent = paymentIntentId(charge.payment_intent);
  const amount = charge.amount_refunded;
  if (!intent || !Number.isSafeInteger(amount) || amount <= 0 ||
      amount > charge.amount || charge.refunded !== true && amount === 0) {
    throw new Error("Refund charge has invalid payment details.");
  }
  const { data, error } = await admin.rpc("apply_credit_refund", {
    p_payment_intent_id: intent,
    p_refunded_amount_pence: amount,
  });
  if (error) throw error;
  if (data === false) throw new Error("Refund was not applied.");
  return { applied: true };
}

async function finish(admin, eventId, token, success, message = null) {
  const { data, error } = await admin.rpc("finish_stripe_webhook_event", {
    p_event_id: eventId,
    p_claim_token: token,
    p_success: success,
    p_error: message,
  });
  if (error) throw error;
  if (data !== true) throw new Error("Webhook event claim was lost.");
}

export async function processStripeEvent(admin, stripe, event) {
  if (!SUPPORTED_STRIPE_EVENTS.has(event.type)) {
    return { received: true, ignored: true };
  }
  if (!event.id || !event.data?.object?.id) {
    throw new Error("Stripe event is missing required identifiers.");
  }
  const object = event.data.object;
  const isCheckout = event.type.startsWith("checkout.session.");
  const { data: token, error: claimError } = await admin.rpc(
    "claim_stripe_webhook_event",
    {
      p_event_id: event.id,
      p_event_type: event.type,
      p_payment_intent_id: paymentIntentId(object.payment_intent),
      p_checkout_session_id: isCheckout ? object.id : null,
    }
  );
  if (claimError) throw claimError;
  if (!token) {
    const { data: existing, error } = await admin
      .from("stripe_webhook_events")
      .select("status,event_type")
      .eq("event_id", event.id)
      .single();
    if (error) throw error;
    if (existing.event_type !== event.type) throw new Error("Event ID/type conflict.");
    if (existing.status === "processed") return { received: true, duplicate: true };
    throw new Error("Event is already being processed; retry after the claim expires.");
  }
  try {
    let result;
    if (isCheckout) {
      const session = await stripe.checkout.sessions.retrieve(object.id);
      result = await applyPurchase(admin, session);
    } else {
      const charge = await stripe.charges.retrieve(object.id);
      result = await applyRefund(admin, charge);
    }
    await finish(admin, event.id, token, true);
    return { received: true, ...result };
  } catch (error) {
    try {
      await finish(admin, event.id, token, false, error?.message || "Unknown error");
    } catch (finishError) {
      console.error("Unable to mark Stripe event failed:", finishError);
    }
    throw error;
  }
}
