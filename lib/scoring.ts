import { ExtractedData } from "../shared/schema/extractor.zod";

export interface ScoreResult {
  confidence: "HIGH" | "MED" | "LOW";
  price_corridor: "low" | "mid" | "high" | "unknown";

  patterns: {
    membership_common: boolean;
    fees_common: boolean;
    warranty_common: boolean;
  };

  // NEW: financial delta
  delta: {
    revenue_gap_per_job: number;
    estimated_jobs_per_month: number;
    revenue_gap_per_month: number;
    revenue_gap_per_year: number;
  };

  // NEW: structured leak snapshot
  leaks: {
    per_month_low: number;
    per_month_high: number;
    per_year_low: number;
    per_year_high: number;
  };

  inputs_used: {
    jobs_per_month: number;
    avg_ticket: number;
  };
}

export function computeBenchmark(clientData: any, extracted: ExtractedData): ScoreResult {
  const competitorCount = extracted.competitors.length;
  const pricingEvidenceCount = extracted.competitors.filter(c => c.pricing_signals.length > 0).length;

  // Confidence logic
  let confidence: "HIGH" | "MED" | "LOW" = "LOW";
  if (competitorCount >= 5 && pricingEvidenceCount >= 3) {
    confidence = "HIGH";
  } else if (competitorCount >= 3) {
    confidence = "MED";
  }

  const membershipCount = extracted.competitors.filter(c => c.membership_offer).length;
  const feeCount = extracted.competitors.filter(c => c.trip_fee).length;
  const warrantyCount = extracted.competitors.filter(c => c.warranty_offer).length;

  const patterns = {
    membership_common: membershipCount > competitorCount * 0.3,
    fees_common: feeCount > competitorCount * 0.4,
    warranty_common: warrantyCount > competitorCount * 0.5
  };

  const avgTicket = (clientData.ticket_min + clientData.ticket_max) / 2;
  const jobsPerMonth = (clientData.jobs_min + clientData.jobs_max) / 2;

  // Conservative 15–30% structural upside range
  const lowMultiplier = 0.15;
  const highMultiplier = 0.30;

  const revenueGapPerJobLow = avgTicket * lowMultiplier;
  const revenueGapPerJobHigh = avgTicket * highMultiplier;

  const perMonthLow = revenueGapPerJobLow * jobsPerMonth;
  const perMonthHigh = revenueGapPerJobHigh * jobsPerMonth;

  const perYearLow = perMonthLow * 12;
  const perYearHigh = perMonthHigh * 12;

  return {
    confidence,
    price_corridor: pricingEvidenceCount > 0 ? "mid" : "unknown",

    patterns,

    delta: {
      revenue_gap_per_job: revenueGapPerJobHigh,
      estimated_jobs_per_month: jobsPerMonth,
      revenue_gap_per_month: perMonthHigh,
      revenue_gap_per_year: perYearHigh
    },

    leaks: {
      per_month_low: Math.round(perMonthLow),
      per_month_high: Math.round(perMonthHigh),
      per_year_low: Math.round(perYearLow),
      per_year_high: Math.round(perYearHigh)
    },

    inputs_used: {
      jobs_per_month: jobsPerMonth,
      avg_ticket: avgTicket
    }
  };
}
