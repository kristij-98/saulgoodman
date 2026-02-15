type DeltaRange = { low: number; high: number };

function median(nums: number[]) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// trims extreme outliers (enterprise-grade, avoids 1 weird competitor ruining the median)
function trimOutliers(nums: number[], trimPct = 0.15) {
  if (nums.length < 6) return nums; // too small to trim safely
  const sorted = [...nums].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * trimPct);
  return sorted.slice(cut, sorted.length - cut);
}

function safeAvg(min?: number, max?: number) {
  if (typeof min !== "number" || typeof max !== "number") return null;
  return Math.round((min + max) / 2);
}

// Very simple price extraction from strings like "$129", "129", "$129–$199", "from $99"
function extractDollars(text: string): number[] {
  const t = (text || "").replace(/,/g, "");
  const matches = t.match(/\$?\b(\d{2,5})\b/g) || [];
  const nums = matches
    .map(m => parseInt(m.replace("$", ""), 10))
    .filter(n => Number.isFinite(n) && n >= 20 && n <= 20000);
  return nums;
}

export function computeMarketDelta(
  vitals: any,
  extractedData: { competitors: any[]; evidence: any[] },
  benchmark: any
) {
  // 1) client vitals
  const monthlyJobs = safeAvg(vitals?.jobs_min, vitals?.jobs_max) ?? 0;
  const clientTicket = safeAvg(vitals?.ticket_min, vitals?.ticket_max) ?? 0;

  // 2) derive market signals from competitor pricing_signals and evidence snippets
  const competitorPriceCandidates: number[] = [];
  for (const c of extractedData?.competitors || []) {
    for (const s of (c?.pricing_signals || [])) {
      competitorPriceCandidates.push(...extractDollars(s));
    }
  }
  // also scan evidence snippets tagged pricing
  for (const e of extractedData?.evidence || []) {
    if ((e?.type || "").toString().includes("pricing")) {
      competitorPriceCandidates.push(...extractDollars(e?.snippet || ""));
    }
  }

  const trimmed = trimOutliers(competitorPriceCandidates, 0.15);
  const marketMedian = median(trimmed);

  // 3) membership penetration (how many competitors have membership_offer not null/empty)
  const competitors = extractedData?.competitors || [];
  const membershipCount = competitors.filter(c => {
    const m = c?.membership_offer;
    return typeof m === "string" && m.trim().length > 0;
  }).length;
  const membershipRate = competitors.length ? membershipCount / competitors.length : 0;

  // 4) warranty “standard” = most common non-null warranty_offer snippet (very simple)
  const warrantyOffers = competitors
    .map(c => (c?.warranty_offer || "").toString().trim())
    .filter(Boolean);
  const warrantyStandard =
    warrantyOffers.length ? warrantyOffers.sort((a, b) => b.length - a.length)[0] : "Not enough public data";

  // 5) premium signal market avg
  const premiumCounts = competitors.map(c => (c?.premium_signals || []).length);
  const premiumAvg =
    premiumCounts.length ? premiumCounts.reduce((a, b) => a + b, 0) / premiumCounts.length : 0;

  // 6) price position + gap
  let price_position: "below_market" | "at_market" | "above_market" | "unknown" = "unknown";
  let price_gap_percent: number | null = null;

  if (marketMedian && clientTicket) {
    const gap = ((clientTicket - marketMedian) / marketMedian) * 100;
    price_gap_percent = Math.round(gap * 10) / 10;

    if (gap <= -8) price_position = "below_market";
    else if (gap >= 8) price_position = "above_market";
    else price_position = "at_market";
  }

  // 7) revenue impact range (conservative)
  // If below market, estimate what “closing half the gap” could do
  let revenue_leak_estimate_range: DeltaRange = { low: 0, high: 0 };

  if (marketMedian && clientTicket && monthlyJobs > 0 && price_position === "below_market") {
    const deltaPerJob = marketMedian - clientTicket;
    const halfClose = deltaPerJob * 0.5;

    const monthlyLow = Math.max(0, Math.round(halfClose * monthlyJobs));
    const monthlyHigh = Math.max(0, Math.round(deltaPerJob * monthlyJobs));

    revenue_leak_estimate_range = {
      low: monthlyLow * 6,   // 6-month conservative window
      high: monthlyHigh * 12 // 12-month full window
    };
  }

  return {
    marketMedianTicket: marketMedian,
    price_position,
    price_gap_percent,
    membership_penetration_rate: Math.round(membershipRate * 100) / 100,
    warranty_standard: warrantyStandard,
    premium_signal_market_avg: Math.round(premiumAvg * 10) / 10,
    premium_signal_client: Number(benchmark?.premium_signal_client ?? 0),
    revenue_leak_estimate_range
  };
}
