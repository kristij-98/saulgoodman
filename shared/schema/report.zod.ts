import { z } from "zod";

export const ReportSchema = z.object({
  quick_verdict: z.string().default(""),

  // NEW: Market position label
  market_position: z.string().default("Undefined"),

  // NEW: Ranked top leaks
  top_leaks_ranked: z.array(
    z.object({
      title: z.string().default(""),
      why_it_matters: z.string().default(""),
      market_contrast: z.string().default("")
    })
  ).default([]),

  scorecard_rows: z.array(
    z.object({
      label: z.string().default(""),
      score: z.string().default(""),
      notes: z.string().default("")
    })
  ).default([]),

  offer_rebuild: z.array(
    z.object({
      title: z.string().default(""),
      content: z.string().default("")
    })
  ).default([]),

  scripts: z.array(
    z.object({
      title: z.string().default(""),
      script_body: z.string().default("")
    })
  ).default([]),

  next_7_days: z.array(z.string()).default([]),

  assumptions_ledger: z.array(z.string()).default([])
});

export type ReportContent = z.infer<typeof ReportSchema>;
