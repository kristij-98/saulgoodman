import { z } from "zod";

export const IntakeSchema = z.object({
  website_url: z.string().url(),
  city: z.string().min(2),
  state_province: z.string().min(2),
  what_they_sell: z.string().min(3),
  jobs_min: z.number().min(0),
  jobs_max: z.number().min(0),
  ticket_min: z.number().min(0),
  ticket_max: z.number().min(0),
  availability: z.enum(["Same Day", "Next Day", "2-3 Days", "1 Week+"]),
  services: z.array(
    z.object({
      name: z.string(),
      price: z.string().optional().nullable()
    })
  ).optional(),
  trip_fee: z.string().optional().nullable(),
  warranty: z.string().optional().nullable(),
  has_membership: z.boolean().optional(),
  has_priority: z.boolean().optional(),
});

export type IntakeData = z.infer<typeof IntakeSchema>;

// --- COMPETITOR SCHEMA (HARDENED) ---

export const CompetitorSchema = z.object({
  name: z.string().default("Unknown"),
  url: z.string().default(""),

  services: z.array(z.string())
    .optional()
    .default([]),

  pricing_signals: z.array(z.string())
    .optional()
    .default([]),

  trip_fee: z.string()
    .nullable()
    .optional()
    .default(null),

  membership_offer: z.string()
    .nullable()
    .optional()
    .default(null),

  warranty_offer: z.string()
    .nullable()
    .optional()
    .default(null),

  premium_signals: z.array(z.string())
    .optional()
    .default([]),

  evidence_ids: z.array(z.string())
    .optional()
    .default([])
});

// --- EXTRACTED DATA SCHEMA (HARDENED) ---

export const ExtractedDataSchema = z.object({
  competitors: z.array(CompetitorSchema)
    .optional()
    .default([]),

  evidence: z.array(
    z.object({
      id: z.string(),
      source_url: z.string(),
      snippet: z.string(),
      type: z.enum(['pricing', 'service', 'reputation', 'guarantee', 'other'])
    })
  )
  .optional()
  .default([])
});

export type ExtractedData = z.infer<typeof ExtractedDataSchema>;
