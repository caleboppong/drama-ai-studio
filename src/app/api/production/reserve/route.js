import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json(
        {
          success: false,
          message: "Authentication required.",
        },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(
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
        { status: 401 }
      );
    }

    const body = await request.json();
    const { jobId } = body;

    if (!jobId) {
      return Response.json(
        {
          success: false,
          message: "Production job ID is required.",
        },
        { status: 400 }
      );
    }

    const { data: job, error: jobError } =
      await supabase
        .from("generation_jobs")
        .select(
          "id, user_id, episode_id, status, credits_required, credits_reserved"
        )
        .eq("id", jobId)
        .eq("user_id", user.id)
        .single();

    if (jobError || !job) {
      return Response.json(
        {
          success: false,
          message: "Production job could not be found.",
        },
        { status: 404 }
      );
    }

    const { data: debtWallet, error: debtWalletError } = await supabase
      .from("credit_wallets")
      .select("credit_debt")
      .eq("user_id", user.id)
      .single();

    if (debtWalletError) throw debtWalletError;

    if (Number(debtWallet?.credit_debt || 0) > 0) {
      return Response.json(
        {
          success: false,
          accountRestricted: true,
          message:
            "Production is temporarily unavailable because this account has credits affected by a payment refund. Please contact support.",
        },
        { status: 402 }
      );
    }

    if (job.status === "reserved") {
      const { data: wallet } = await supabase
        .from("credit_wallets")
        .select(
          "available_credits, reserved_credits, credit_debt"
        )
        .eq("user_id", user.id)
        .single();

      return Response.json({
        success: true,
        alreadyReserved: true,
        job,
        wallet,
      });
    }

    if (job.status !== "quoted") {
      return Response.json(
        {
          success: false,
          message:
            "This production job can no longer reserve credits.",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(job.credits_required) ||
      job.credits_required <= 0
    ) {
      return Response.json(
        {
          success: false,
          message:
            "This production job has an invalid credit cost.",
        },
        { status: 400 }
      );
    }

    const { data: reserved, error: reserveError } =
      await supabase.rpc(
        "reserve_generation_credits",
        {
          p_job_id: job.id,
          p_credits: job.credits_required,
        }
      );

    if (reserveError) {
      throw reserveError;
    }

    if (!reserved) {
      return Response.json(
        {
          success: false,
          insufficientCredits: true,
          message:
            "You do not have enough available credits for this production.",
        },
        { status: 402 }
      );
    }

    const { data: updatedJob, error: updatedJobError } =
      await supabase
        .from("generation_jobs")
        .select(
          "id, episode_id, status, credits_required, credits_reserved"
        )
        .eq("id", job.id)
        .eq("user_id", user.id)
        .single();

    if (updatedJobError) {
      throw updatedJobError;
    }

    const { data: wallet, error: walletError } =
      await supabase
        .from("credit_wallets")
        .select(
          "available_credits, reserved_credits, credit_debt"
        )
        .eq("user_id", user.id)
        .single();

    if (walletError) {
      throw walletError;
    }

    return Response.json({
      success: true,
      alreadyReserved: false,
      job: updatedJob,
      wallet,
    });
  } catch (error) {
    console.error(
      "DramaAI credit reservation error:",
      error
    );

    return Response.json(
      {
        success: false,
        message:
          error?.message ||
          "Could not reserve production credits.",
      },
      { status: 500 }
    );
  }
}