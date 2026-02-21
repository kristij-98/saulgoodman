import { z } from "zod";

/* =============================
   INTAKE SCHEMA
============================= */

const numberFromInput = z.coerce.number();

export const IntakeSchema = z.object({
  website_url: z.string().url(),
  business_address: z.string().min(8),
  city: z.string().min(2),
  state_province: z.string().min(2),
  what_they_sell: z.string().min(3),

  jobs_min: numberFromInput,
  jobs_max: numberFromInput,
  ticket_min: numberFromInput,
  ticket_max: numberFromInput,

  availability: z.enum(["Same Day", "Next Day", "2-3 Days", "1 Week+"]),

  services: z
    .array(
      z.object({
        name: z.string(),
        price: z.string().optional(),
      })
    )
    .optional(),


  trip_fee: z.string().optional(),
  warranty: z.string().optional(),
  has_membership: z.boolean().optional(),
  has_priority: z.boolean().optional(),
  has_packages: z.boolean().optional(),

  packages: z
    .array(
      z.object({
        name: z.string(),
        price: z.string().optional(),
        includes: z.array(z.string()).optional(),
      })
    )
    .optional(),

  known_competitors: z.string().nullable().optional(),

  // Backward/compat fields kept optional to avoid breaking existing UI and API mapping.
  state_region: z.string().optional(),
  postal_code: z.string().optional(),
  street_address: z.string().nullable().optional(),
  service_area: z.enum(["local_only", "within_10_miles", "within_25_miles", "within_50_miles", "multiple_cities"]),
  service_area_notes: z.string().nullable().optional(),
  main_service_min: numberFromInput.optional(),
  main_service_max: numberFromInput.optional(),
  consult_fee_enabled: z.boolean().optional(),
  consult_fee_amount: numberFromInput.nullable().optional(),
  public_pricing: z.enum(["yes", "some", "no"]).optional(),
  packages_status: z.enum(["yes", "no", "not_sure"]).optional(),
  packages_notes: z.string().nullable().optional(),
  addons_status: z.enum(["yes", "no", "not_sure"]).optional(),
  addons_notes: z.string().nullable().optional(),
  membership_status: z.enum(["yes", "no", "not_sure"]).optional(),
  membership_price: z.string().nullable().optional(),
  membership_notes: z.string().nullable().optional(),
  warranty_status: z.enum(["yes", "no", "not_sure"]).optional(),
  warranty_notes: z.string().nullable().optional(),
  pricing_problem: z.string().nullable().optional(),
});

export type IntakeData = z.infer<typeof IntakeSchema>;

/* =============================
   EXTRACTOR SCHEMAS
============================= */

const EvidenceTypeSchema = z.enum(["pricing", "service", "reputation", "guarantee", "other"]);

export const CompetitorSchema = z.object({
  name: z.string().default("Unknown"),
  url: z.string().default(""),
  services: z.array(z.string()).optional().default([]),
  pricing_signals: z.array(z.string()).optional().default([]),
  trip_fee: z.string().nullable().optional().default(null),
  membership_offer: z.string().nullable().optional().default(null),
  warranty_offer: z.string().nullable().optional().default(null),
  premium_signals: z.array(z.string()).optional().default([]),
  evidence_ids: z.array(z.string()).optional().default([]),
});

const EvidenceSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  source_url: z.string().default(""),
  snippet: z.string().default(""),
  type: EvidenceTypeSchema,
});

export const ExtractedDataSchema = z.object({
  competitors: z.array(CompetitorSchema).optional().default([]),
  evidence: z.array(EvidenceSchema).optional().default([]),
});

export type ExtractedData = z.infer<typeof ExtractedDataSchema>;
