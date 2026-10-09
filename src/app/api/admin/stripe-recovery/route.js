import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getStripe } from "@/lib/stripe";
import { processStripeEvent, SUPPORTED_STRIPE_EVENTS } from "@/lib/stripeWebhookProcessing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(request) {
  return requireAdmin(request);
}

export async function GET(request) {
  try {
    const admin = await authorize(request);
    if (admin.error) return NextResponse.json({ success: false, message: admin.error }, { status: admin.status });
    const { data, error } = await admin.service
      .from("stripe_webhook_events")
      .select("event_id,event_type,status,attempts,created_at,updated_at,claimed_at,last_error")
      .in("status", ["failed", "processing", "pending"])
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ success: true, count: data.length, events: data });
  } catch (error) {
    console.error("Stripe recovery inspection error:", error);
    return NextResponse.json({ success: false, message: "Unable to inspect Stripe events." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const admin = await authorize(request);
    if (admin.error) return NextResponse.json({ success: false, message: admin.error }, { status: admin.status });
    const body = await request.json().catch(() => null);
    const eventId = body?.eventId;
    if (typeof eventId !== "string" || !/^evt_[a-zA-Z0-9]{8,}$/.test(eventId)) {
      return NextResponse.json({ success: false, message: "Valid Stripe eventId required." }, { status: 400 });
    }
    const { data: stored, error: lookupError } = await admin.service
      .from("stripe_webhook_events")
      .select("event_id,event_type,status,claimed_at")
      .eq("event_id", eventId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!stored) return NextResponse.json({ success: false, message: "Event is not tracked locally." }, { status: 404 });
    if (stored.status === "processed") return NextResponse.json({ success: true, duplicate: true });
    if (stored.status === "processing" && stored.claimed_at &&
        Date.now() - new Date(stored.claimed_at).getTime() < 10 * 60 * 1000) {
      return NextResponse.json({ success: false, message: "Event is still being processed." }, { status: 409 });
    }
    const stripe = getStripe();
    const event = await stripe.events.retrieve(eventId);
    if (event.id !== stored.event_id || event.type !== stored.event_type ||
        !SUPPORTED_STRIPE_EVENTS.has(event.type)) {
      return NextResponse.json({ success: false, message: "Stripe event does not match tracked event." }, { status: 409 });
    }
    const result = await processStripeEvent(admin.service, stripe, event);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Stripe event recovery failed:", error);
    return NextResponse.json({ success: false, message: "Stripe recovery failed. Check server logs." }, { status: 500 });
  }
}
