import { ExtractedData } from "../shared/schema/extractor.zod";

export interface ScoreResult {
  confidence: "HIGH" | "MED" | "LOW";
  price_corridor: "low" | "mid" | "high" | "unknown";
  patterns: {
    membership_common: boolean;
    fees_common: boolean;
    warranty_common: boolean;
  };

  // NEW: make money unavoidable
  inputs_used: {
    jobs_per_month: number;
    avg_ticket: number;
  };

  // NEW: ranges (because reality)
  leaks: {
    per_job_low: number;
    per_job_high: number;
    per_month_low: number;
    per_month_high: number;
    per_year_low: number;
    per_year_high: number;
  };

  // keep the old upside (still useful)
  upside: {
    potential_revenue_increase: string;
    description: string;
  };

  assumptions: string[];
}

function clampNumber(n: any, fallback: number) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

export function computeBenchmark(clientData: any, extracted: ExtractedData): ScoreResult {
  const competitorCount = extracted.competitors.length;
  const pricingEvidenceCount = extracted.competitors.filter(c => (c.pricing_signals || []).length > 0).length;

  // 1) Confidence
  let confidence: "HIGH" | "MED" | "LOW" = "LOW";
  if (competitorCount >= 5 && pricingEvidenceCount >= 3) confidence = "HIGH";
  else if (competitorCount >= 3) confidence = "MED";

  // 2) Pattern recognition
  const membershipCount = extracted.competitors.filter(c => !!c.membership_offer).length;
  const feeCount = extracted.competitors.filter(c => !!c.trip_fee).length;
  const warrantyCount = extracted.competitors.filter(c => !!c.warranty_offer).length;

  const patterns = {
    membership_common: competitorCount ? membershipCount > competitorCount * 0.3 : false,
    fees_common: competitorCount ? feeCount > competitorCount * 0.4 : false,
    warranty_common: competitorCount ? warrantyCount > competitorCount * 0.5 : false
  };

  // 3) Inputs from intake (make it personal)
  const jobsMin = clampNumber(clientData?.jobs_min, 0);
  const jobsMax = clampNumber(clientData?.jobs_max, jobsMin);
  const ticketMin = clampNumber(clientData?.ticket_min, 0);
  const ticketMax = clampNumber(clientData?.ticket_max, ticketMin);

  const jobsPerMonth = Math.max(0, Math.round((jobsMin + jobsMax) / 2));
  const avgTicket = Math.max(0, (ticketMin + ticketMax) / 2);

  // 4) Leak model (simple, believable, and ranges)
  // Conservative: 10–25% revenue lift range based on market patterns.
  // Higher if memberships common + fees common.
  let lowPct = 0.10;
  let highPct = 0.25;

  if (patterns.membership_common) highPct += 0.05;
  if (patterns.fees_common) highPct += 0.03;
  if (patterns.warranty_common) highPct += 0.02;

  // cap high to stay believable
  highPct = Math.min(highPct, 0.35);

  const perJobLow = avgTicket * lowPct;
  const perJobHigh = avgTicket * highPct;

  const perMonthLow = perJobLow * jobsPerMonth;
  const perMonthHigh = perJobHigh * jobsPerMonth;

  const perYearLow = perMonthLow * 12;
  const perYearHigh = perMonthHigh * 12;

  const assumptions: string[] = [
    `Jobs/month estimated from intake: avg(jobs_min, jobs_max) = ${jobsPerMonth}`,
    `Avg ticket estimated from intake: avg(ticket_min, ticket_max) = ${Math.round(avgTicket)}`,
    `Leak % range used: ${(lowPct * 100).toFixed(0)}%–${(highPct * 100).toFixed(0)}% (adjusted by market patterns)`
  ];

  const prettyMid = Math.floor(((perMonthLow + perMonthHigh) / 2));
  return {
    confidence,
    price_corridor: pricingEvidenceCount > 0 ? "mid" : "unknown",
    patterns,
    inputs_used: {
      jobs_per_month: jobsPerMonth,
      avg_ticket: avgTicket
    },
    leaks: {
      per_job_low: perJobLow,
      per_job_high: perJobHigh,
      per_month_low: perMonthLow,
      per_month_high: perMonthHigh,
      per_year_low: perYearLow,
      per_year_high: perYearHigh
    },
    upside: {
      potential_revenue_increase: `$${prettyMid}/mo`,
      description: "Conservative estimate based on your volume + ticket and market patterns (fees, memberships, warranties)."
    },
    assumptions
  };
}
