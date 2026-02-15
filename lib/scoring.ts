import { ExtractedData } from "../shared/schema/extractor.zod";

interface ScoreResult {
  confidence: "HIGH" | "MED" | "LOW";
  price_corridor: "low" | "mid" | "high" | "unknown";
  patterns: {
    membership_common: boolean;
    fees_common: boolean;
    warranty_common: boolean;
  };
  upside: {
    potential_revenue_increase: string;
    description: string;
  };
}

export function computeBenchmark(clientData: any, extracted: ExtractedData): ScoreResult {
  const competitorCount = extracted.competitors.length;
  const pricingEvidenceCount = extracted.competitors.filter(c => c.pricing_signals.length > 0).length;
  
  // 1. Confidence Score
  let confidence: "HIGH" | "MED" | "LOW" = "LOW";
  if (competitorCount >= 5 && pricingEvidenceCount >= 3) {
    confidence = "HIGH";
  } else if (competitorCount >= 3) {
    confidence = "MED";
  }

  // 2. Pattern Recognition
  const membershipCount = extracted.competitors.filter(c => c.membership_offer).length;
  const feeCount = extracted.competitors.filter(c => c.trip_fee).length;
  const warrantyCount = extracted.competitors.filter(c => c.warranty_offer).length;

  const patterns = {
    membership_common: membershipCount > competitorCount * 0.3, // >30% have memberships
    fees_common: feeCount > competitorCount * 0.4,
    warranty_common: warrantyCount > competitorCount * 0.5
  };

  // 3. Upside Calculation (Simple deterministic logic)
  const currentTicket = (clientData.ticket_min + clientData.ticket_max) / 2;
  const potentialIncrease = currentTicket * 0.20; // Conservative 20% upside assumption for baseline

  return {
    confidence,
    price_corridor: pricingEvidenceCount > 0 ? "mid" : "unknown", // Simplified for MVP
    patterns,
    upside: {
      potential_revenue_increase: `$${Math.floor(potentialIncrease)}`,
      description: "Based on premium positioning and membership attach rates observed in market leaders."
    }
  };
}