export async function recordAssetProviderCost(
  serviceClient,
  assetId,
  costPence,
  costGbp = null,
) {
  const pence = Math.max(0, Math.round(Number(costPence) || 0));

  const pounds =
    costGbp === null || costGbp === undefined ? pence / 100 : Number(costGbp);

  if (!Number.isFinite(pounds) || pounds < 0) {
    throw new Error("Invalid provider cost.");
  }

  const { error } = await serviceClient
    .from("generation_assets")
    .update({
      provider_cost_pence: pence,
      provider_cost_gbp: Number(pounds.toFixed(4)),
    })
    .eq("id", assetId);

  if (error) throw error;
}

export async function settleCompletedProduction(userClient, jobId, outputUrl) {
  const { data, error } = await userClient.rpc("complete_generation_job", {
    p_job_id: jobId,
    p_output_url: outputUrl,
  });
  if (error) throw error;
  if (data !== true)
    throw new Error("Production settlement was not completed.");
  return true;
}

export async function releaseFailedProduction(userClient, jobId, reason) {
  const { data, error } = await userClient.rpc("release_generation_credits", {
    p_job_id: jobId,
    p_reason: String(reason || "Production failed").slice(0, 500),
  });
  if (error) throw error;
  return data === true;
}
