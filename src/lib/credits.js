export const CREDIT_PACKS = {
  starter: {
    id: "starter",
    name: "Starter",
    credits: 25,
    pricePence: 499,
    currency: "gbp",
  },
  creator: {
    id: "creator",
    name: "Creator",
    credits: 75,
    pricePence: 1299,
    currency: "gbp",
  },
  studio: {
    id: "studio",
    name: "Studio",
    credits: 200,
    pricePence: 2999,
    currency: "gbp",
  },
};

export function getCreditPack(packId) {
  if (!packId) return null;
  return CREDIT_PACKS[packId] || null;
}