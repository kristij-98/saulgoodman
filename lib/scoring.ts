import { ExtractedData } from "../shared/schema/extractor.zod";

export interface ScoreResult {
  confidence: "HIGH" | "MEDIUM" | "LOW";

  marketAverages: {
    avg_ticket: number | null;
    avg_trip_fee: number | null;
    membership_adoption_rate: number;
    warranty_adoption_rate: number;
  };

  clientPosition: {
    ticket_position: "below" | "aligned" | "above" | "unknown";
    trip_fee_position: "below" | "aligned" | "above" | "unknown";
    membership_position: "missing" | "aligned" | "strong";
    warranty_position: "missing" | "aligned" | "strong";
  };

  delta: {
    ticket_gap: number | null;
    trip_fee_gap: number | null;
    membership_gap_score: number;
    warranty_gap_score: number;
  };
}

function extractNumber(str: string | null | undefined): number | null {
  if (!str) return null;
  const match = str.match(/\$?(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeBenchmark(
  clientData: any,
  extracted: ExtractedData
): ScoreResult {
  const competitors = extracted.competitors;
  const competitorCount = competitors.length;

  // ----------------------------------------
  // CONFIDENCE
  // ----------------------------------------
  const pricingEvidenceCount = competitors.filter(
    (c) => c.pricing_signals.length > 0
  ).length;

  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";

  if (competitorCount >= 6 && pricingEvidenceCount >= 4) {
    confidence = "HIGH";
  } else if (competitorCount >= 3) {
    confidence = "MEDIUM";
  }

  // ----------------------------------------
  // MARKET AVERAGES
  // ----------------------------------------
  const competitorTickets: number[] = [];
  const competitorTripFees: number[] = [];

  competitors.forEach((c) => {
    c.pricing_signals.forEach((p) => {
      const n = extractNumber(p);
      if (n) competitorTickets.push(n);
    });

    const fee = extractNumber(c.trip_fee);
    if (fee) competitorTripFees.push(fee);
  });

  const avg_ticket = average(competitorTickets);
  const avg_trip_fee = average(competitorTripFees);

  const membership_adoption_rate =
    competitorCount === 0
      ? 0
      : competitors.filter((c) => c.membership_offer).length /
        competitorCount;

  const warranty_adoption_rate =
    competitorCount === 0
      ? 0
      : competitors.filter((c) => c.warranty_offer).length /
        competitorCount;

  // ----------------------------------------
  // CLIENT POSITIONING
  // ----------------------------------------
  const clientTicket =
    (clientData.ticket_min + clientData.ticket_max) / 2 || null;

  const clientTripFee = extractNumber(clientData.trip_fee);

  let ticket_position: "below" | "aligned" | "above" | "unknown" =
    "unknown";

  if (avg_ticket && clientTicket) {
    if (clientTicket < avg_ticket * 0.9) ticket_position = "below";
    else if (clientTicket > avg_ticket * 1.1) ticket_position = "above";
    else ticket_position = "aligned";
  }

  let trip_fee_position: "below" | "aligned" | "above" | "unknown" =
    "unknown";

  if (avg_trip_fee && clientTripFee) {
    if (clientTripFee < avg_trip_fee * 0.9) trip_fee_position = "below";
    else if (clientTripFee > avg_trip_fee * 1.1) trip_fee_position = "above";
    else trip_fee_position = "aligned";
  }

  const membership_position =
    clientData.has_membership
      ? membership_adoption_rate > 0.5
        ? "aligned"
        : "strong"
      : "missing";

  const warranty_position =
    clientData.warranty
      ? warranty_adoption_rate > 0.5
        ? "aligned"
        : "strong"
      : "missing";

  // ----------------------------------------
  // DELTAS
  // ----------------------------------------
  const ticket_gap =
    avg_ticket && clientTicket ? clientTicket - avg_ticket : null;

  const trip_fee_gap =
    avg_trip_fee && clientTripFee
      ? clientTripFee - avg_trip_fee
      : null;

  const membership_gap_score =
    clientData.has_membership
      ? 0
      : membership_adoption_rate > 0.4
      ? 1
      : 0;

  const warranty_gap_score =
    clientData.warranty
      ? 0
      : warranty_adoption_rate > 0.4
      ? 1
      : 0;

  return {
    confidence,

    marketAverages: {
      avg_ticket,
      avg_trip_fee,
      membership_adoption_rate,
      warranty_adoption_rate,
    },

    clientPosition: {
      ticket_position,
      trip_fee_position,
      membership_position,
      warranty_position,
    },

    delta: {
      ticket_gap,
      trip_fee_gap,
      membership_gap_score,
      warranty_gap_score,
    },
  };
}
