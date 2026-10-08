import { NextResponse } from "next/server";
import { moneyFromPence, requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function countByStatus(rows = []) {
  return rows.reduce((result, row) => {
    const key = row.status || "unknown";
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

export async function GET(request) {
  try {
    const admin = await requireAdmin(request);
    if (admin.error) {
      return NextResponse.json(
        { success: false, message: admin.error },
        { status: admin.status }
      );
    }

    const { service } = admin;

    const [
      profilesResult,
      walletsResult,
      purchasesResult,
      jobsResult,
      completedEpisodesResult,
      assetsResult,
    ] = await Promise.all([
      service.from("profiles").select("id,role,created_at"),
      service.from("credit_wallets").select("user_id,available_credits,reserved_credits,credit_debt"),
      service
        .from("credit_purchases")
        .select("id,user_id,pack_id,credits,amount_pence,currency,status,refunded_amount_pence,refunded_credits,created_at")
        .order("created_at", { ascending: false }),
      service
        .from("generation_jobs")
        .select("id,user_id,episode_id,status,current_stage,progress,credits_required,credits_reserved,final_asset_ready,settlement_error,created_at,completed_at")
        .order("created_at", { ascending: false }),
      service.from("episodes").select("id,status,production_generation_count").eq("status", "completed"),
      service.from("generation_assets").select("id,generation_job_id,asset_type,status,provider_cost_pence"),
    ]);

    const results = [
      profilesResult,
      walletsResult,
      purchasesResult,
      jobsResult,
      completedEpisodesResult,
      assetsResult,
    ];

    const firstError = results.find((result) => result.error)?.error;
    if (firstError) throw firstError;

    const profiles = profilesResult.data || [];
    const wallets = walletsResult.data || [];
    const purchases = purchasesResult.data || [];
    const jobs = jobsResult.data || [];
    const completedEpisodes = completedEpisodesResult.data || [];
    const assets = assetsResult.data || [];

    const paidPurchases = purchases.filter(
      (purchase) =>
        purchase.status === "paid" ||
        purchase.status === "completed" ||
        purchase.status === "partially_refunded" ||
        purchase.status === "refunded"
    );

    const totalSalesPence = paidPurchases.reduce(
      (sum, purchase) =>
        sum +
        Math.max(
          0,
          Number(purchase.amount_pence || 0) -
            Number(purchase.refunded_amount_pence || 0)
        ),
      0
    );

    const providerCostPence = assets.reduce(
      (sum, asset) => sum + Number(asset.provider_cost_pence || 0),
      0
    );

    const completedJobs = jobs.filter((job) => job.status === "completed");
    const creditsConsumed = completedJobs.reduce(
      (sum, job) => sum + Number(job.credits_required || 0),
      0
    );

    const availableCredits = wallets.reduce(
      (sum, wallet) => sum + Number(wallet.available_credits || 0),
      0
    );

    const reservedCredits = wallets.reduce(
      (sum, wallet) => sum + Number(wallet.reserved_credits || 0),
      0
    );

    const creditDebt = wallets.reduce(
      (sum, wallet) => sum + Number(wallet.credit_debt || 0),
      0
    );

    const grossProfitPence = totalSalesPence - providerCostPence;
    const grossMarginPercent =
      totalSalesPence > 0
        ? Number(((grossProfitPence / totalSalesPence) * 100).toFixed(1))
        : null;

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      overview: {
        totalUsers: profiles.length,
        creators: profiles.filter((profile) => profile.role === "creator").length,
        admins: profiles.filter((profile) => profile.role === "admin").length,
        availableCredits,
        reservedCredits,
        creditDebt,
        settlementPendingJobs: jobs.filter(
          (job) => job.current_stage === "settlement_pending"
        ).length,
        totalCreditSales: moneyFromPence(totalSalesPence),
        totalCreditSalesPence: totalSalesPence,
        providerCost: moneyFromPence(providerCostPence),
        providerCostPence,
        grossProfit: moneyFromPence(grossProfitPence),
        grossProfitPence,
        grossMarginPercent,
        completedProductions: completedJobs.length,
        completedEpisodes: completedEpisodes.length,
        creditsConsumed,
        totalGenerationJobs: jobs.length,
      },
      jobsByStatus: countByStatus(jobs),
      recentPurchases: purchases.slice(0, 20),
      recentJobs: jobs.slice(0, 20),
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Unable to load admin overview." },
      { status: 500 }
    );
  }
}
