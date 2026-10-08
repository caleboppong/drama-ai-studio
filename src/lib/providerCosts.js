function integerEnv(name, fallback = 0) {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.round(value);
}

export function imageProviderCostPence() {
  return integerEnv("OPENAI_IMAGE_COST_PENCE", 0);
}

export function speechProviderCostPence(text) {
  const perMillionCharacters = integerEnv(
    "OPENAI_SPEECH_COST_PER_MILLION_CHARACTERS_PENCE",
    0
  );
  if (!perMillionCharacters) return 0;
  const characters = String(text || "").length;
  return Math.max(1, Math.ceil((characters / 1000000) * perMillionCharacters));
}

export function imageProviderCostGbp({
  estimatedCostUsd,
  usdToGbp,
} = {}) {
  const costUsd = Number(estimatedCostUsd);
  const exchangeRate = Number(usdToGbp);

  if (
    !Number.isFinite(costUsd) ||
    costUsd < 0 ||
    !Number.isFinite(exchangeRate) ||
    exchangeRate <= 0
  ) {
    throw new Error("Valid image cost and USD-to-GBP rate are required.");
  }

  return Number((costUsd * exchangeRate).toFixed(4));
}