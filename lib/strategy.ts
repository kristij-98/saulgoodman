type StrategyProfile = {
  recommended_position: string;
  revenue_strategy: string;
  structural_priority: string;
  pricing_move: string;
  competitive_edge_play: string;
};

export function computeStrategicProfile(
  delta: any,
  vitals: any,
  benchmark: any
): StrategyProfile {

  const {
    price_position,
    price_gap_percent,
    membership_penetration_rate,
    premium_signal_market_avg,
    premium_signal_client
  } = delta;

  let recommended_position = "Undefined";
  let revenue_strategy = "Stabilize";
  let structural_priority = "Clarify Offer";
  let pricing_move = "Maintain";
  let competitive_edge_play = "Differentiate Messaging";

  // -----------------------------------
  // POSITIONING LOGIC
  // -----------------------------------

  if (price_position === "below_market") {
    recommended_position = "Discount Drift";
    revenue_strategy = "Ticket Expansion";
    pricing_move = "Raise 5–15% with justification layer";
  }

  if (price_position === "at_market" && premium_signal_client < premium_signal_market_avg) {
    recommended_position = "Under-Leveraged Mid-Tier";
    revenue_strategy = "Perception Upgrade";
    pricing_move = "Increase perceived value before price increase";
  }

  if (price_position === "above_market") {
    recommended_position = "Premium Attempt";
    revenue_strategy = "Authority Reinforcement";
    pricing_move = "Defend pricing with warranty + financing";
  }

  // -----------------------------------
  // MEMBERSHIP STRATEGY
  // -----------------------------------

  if (membership_penetration_rate > 0.5) {
    structural_priority = "Membership Monetization";
    competitive_edge_play = "Recurring Revenue Lock-In";
  }

  // -----------------------------------
  // PREMIUM SIGNAL GAP
  // -----------------------------------

  if (premium_signal_client < premium_signal_market_avg) {
    competitive_edge_play = "Premium Signal Layer Required";
  }

  // -----------------------------------
  // LOW VOLUME HIGH TICKET STRATEGY
  // -----------------------------------

  const avgJobs = Math.round((vitals?.jobs_min + vitals?.jobs_max) / 2 || 0);
  const avgTicket = Math.round((vitals?.ticket_min + vitals?.ticket_max) / 2 || 0);

  if (avgJobs < 20 && avgTicket > 500) {
    revenue_strategy = "High Ticket Optimization";
  }

  return {
    recommended_position,
    revenue_strategy,
    structural_priority,
    pricing_move,
    competitive_edge_play
  };
}
