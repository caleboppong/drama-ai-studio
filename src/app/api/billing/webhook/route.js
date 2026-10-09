import { createServiceClient } from "@/lib/admin";
import { getStripe } from "@/lib/stripe";
import { processStripeEvent } from "@/lib/stripeWebhookProcessing";

export const runtime = "nodejs";

export async function POST(request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("Stripe webhook secret is missing.");
    return Response.json({ received: false }, { status: 500 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing Stripe signature.", { status: 400 });
  const stripe = getStripe();
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(), signature, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return new Response("Invalid Stripe signature.", { status: 400 });
  }
  try {
    return Response.json(await processStripeEvent(createServiceClient(), stripe, event));
  } catch (error) {
    console.error("Stripe webhook processing failed:", error);
    return Response.json({ received: false, message: "Processing failed; Stripe may retry." }, { status: 500 });
  }
}
