import { createClient } from "@supabase/supabase-js";
import { getCreditPack } from "@/lib/credits";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function createUserClient(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  );
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        {
          success: false,
          message: "Authentication required.",
        },
        { status: 401 },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createUserClient(token);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return Response.json(
        {
          success: false,
          message: "Your session is invalid.",
        },
        { status: 401 },
      );
    }

    // Verify customer contact information on the server before creating any Stripe session.
    const { data: profile, error: profileError } = await supabase
      .from("customer_profiles")
      .select("full_name,phone,address_line1,city,country")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Checkout profile lookup failed:", profileError.message);
      return Response.json({ success: false, message: "Profile verification is temporarily unavailable. Please try again later." }, { status: 503 });
    }
    const requiredFields = ["full_name", "phone", "address_line1", "city", "country"];
    if (!profile || requiredFields.some((field) => !String(profile[field] || "").trim()) ||
        !/^\+[1-9]\d{6,14}$/.test(String(profile.phone || "").replace(/[\s()-]/g, ""))) {
      return Response.json({ success: false, code: "PROFILE_INCOMPLETE", message: "Complete your required contact and address details in My Profile before purchasing credits.", profileUrl: "/profile" }, { status: 403 });
    }
    if (!user.email_confirmed_at) {
      return Response.json({ success: false, code: "EMAIL_UNVERIFIED", message: "Verify your email address before purchasing credits." }, { status: 403 });
    }

    const body = await request.json();
    const pack = getCreditPack(body.packId);

    if (!pack) {
      return Response.json(
        {
          success: false,
          message: "Invalid credit pack.",
        },
        { status: 400 },
      );
    }

    const stripe = getStripe();

    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!configuredAppUrl) {
      throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
    }

    const parsedAppUrl = new URL(configuredAppUrl);

    if (
      parsedAppUrl.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        parsedAppUrl.origin === "http://localhost:3000"
      )
    ) {
      throw new Error("Invalid application URL configuration.");
    }

    const appUrl = parsedAppUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email || undefined,
      client_reference_id: user.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: pack.currency,
            unit_amount: pack.pricePence,
            product_data: {
              name: `${pack.name} Credit Pack`,
              description: `${pack.credits} DramaAI Studio credits`,
            },
          },
        },
      ],
      metadata: {
        user_id: user.id,
        pack_id: pack.id,
        credits: String(pack.credits),
      },
      payment_intent_data: {
        metadata: {
          user_id: user.id,
          pack_id: pack.id,
          credits: String(pack.credits),
        },
      },
      success_url: `${appUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/?payment=cancelled`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    return Response.json({
      success: true,
      checkoutUrl: session.url,
    });
  } catch (error) {
    console.error("DramaAI checkout error:", error);

    return Response.json(
      {
        success: false,
        message: error?.message || "Could not start checkout.",
      },
      { status: 500 },
    );
  }
}
