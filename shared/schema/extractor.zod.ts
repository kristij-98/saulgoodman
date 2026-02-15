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
  // Pro inputs
  services: z.array(z.object({
    name: z.string(),
    price: z.string().optional()
  })).optional(),
  trip_fee: z.string().optional(),
  warranty: z.string().optional(),
  has_membership: z.boolean().optional(),
  has_priority: z.boolean().optional(),
});

export type IntakeData = z.infer<typeof IntakeSchema>;

// Gemini Extractor Schema
export const CompetitorSchema = z.object({
  name: z.string(),
  url: z.string(),
  services: z.array(z.string()),
  pricing_signals: z.array(z.string()),
  trip_fee: z.string().nullable(),
  membership_offer: z.string().nullable(),
  warranty_offer: z.string().nullable(),
  premium_signals: z.array(z.string()),
  evidence_ids: z.array(z.string())
});

export const ExtractedDataSchema = z.object({
  competitors: z.array(CompetitorSchema),
  evidence: z.array(z.object({
    id: z.string(),
    source_url: z.string(),
    snippet: z.string(),
    type: z.enum(['pricing', 'service', 'reputation', 'guarantee', 'other'])
  }))
});

export type ExtractedData = z.infer<typeof ExtractedDataSchema>;
