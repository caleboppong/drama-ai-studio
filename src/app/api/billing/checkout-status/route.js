import { createClient } from "@supabase/supabase-js";
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
    }
  );
}

export async function POST(request) {
  try {
    const authHeader =
      request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        {
          success: false,
          message:
            "Authentication required.",
        },
        { status: 401 }
      );
    }

    const token =
      authHeader.replace("Bearer ", "");

    const supabase =
      createUserClient(token);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(
      token
    );

    if (userError || !user) {
      return Response.json(
        {
          success: false,
          message:
            "Your session is invalid.",
        },
        { status: 401 }
      );
    }

    const body =
      await request.json();

    if (!body.sessionId) {
      return Response.json(
        {
          success: false,
          message:
            "Checkout session ID is required.",
        },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    const session =
      await stripe.checkout.sessions.retrieve(
        body.sessionId
      );

    const owner =
      session.metadata?.user_id ||
      session.client_reference_id;

    if (owner !== user.id) {
      return Response.json(
        {
          success: false,
          message:
            "This checkout does not belong to your account.",
        },
        { status: 403 }
      );
    }

    const { data: purchase } =
      await supabase
        .from("credit_purchases")
        .select(
          "id, pack_id, credits, amount_pence, currency, status, created_at"
        )
        .eq(
          "stripe_checkout_session_id",
          session.id
        )
        .eq("user_id", user.id)
        .maybeSingle();

    const { data: wallet } =
      await supabase
        .from("credit_wallets")
        .select(
          "available_credits, reserved_credits"
        )
        .eq("user_id", user.id)
        .single();

    return Response.json({
      success: true,
      paymentStatus:
        session.payment_status,
      credited: Boolean(purchase),
      purchase: purchase || null,
      wallet: wallet || null,
    });
  } catch (error) {
    console.error(
      "DramaAI checkout status error:",
      error
    );

    return Response.json(
      {
        success: false,
        message:
          error?.message ||
          "Could not check payment status.",
      },
      { status: 500 }
    );
  }
}