import { z } from "zod";

const requiredText = "This field is required.";
const invalidUrlText = "Please enter a valid website link.";
const numberText = "Please enter a number.";
const rangeText = "Max must be higher than Min.";

/* =============================
   INTAKE SCHEMA
============================= */

const requiredNumber = z.coerce.number({ invalid_type_error: numberText }).finite(numberText);

export const IntakeSchema = z
  .object({
    website_url: z.string().url(invalidUrlText),

    city: z.string().min(1, requiredText),
    state_region: z.string().min(1, requiredText),
    postal_code: z.string().min(1, requiredText),
    street_address: z.string().optional().nullable(),

    what_they_sell: z.string().min(1, requiredText),

    service_area: z.enum([
      "local_only",
      "within_10_miles",
      "within_25_miles",
      "within_50_miles",
      "multiple_cities",
    ]),
    service_area_notes: z.string().optional().nullable(),

    services: z.array(z.string()).optional().default([]),

    jobs_min: requiredNumber,
    jobs_max: requiredNumber,

    availability: z.enum(["Same day", "Next day", "2–3 days", "1 week+"]),

    ticket_min: requiredNumber,
    ticket_max: requiredNumber,

    main_service_min: requiredNumber,
    main_service_max: requiredNumber,

    consult_fee_enabled: z.boolean(),
    consult_fee_amount: z.coerce.number({ invalid_type_error: numberText }).optional().nullable(),

    public_pricing: z.enum(["yes", "some", "no"]),

    packages_status: z.enum(["yes", "no", "not_sure"]),
    packages_notes: z.string().optional().nullable(),

    addons_status: z.enum(["yes", "no", "not_sure"]),
    addons_notes: z.string().optional().nullable(),

    membership_status: z.enum(["yes", "no", "not_sure"]),
    membership_price: z.string().optional().nullable(),
    membership_notes: z.string().optional().nullable(),

    warranty_status: z.enum(["yes", "no", "not_sure"]),
    warranty_notes: z.string().optional().nullable(),

    pricing_problem: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.jobs_max <= data.jobs_min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jobs_max"], message: rangeText });
    }

    if (data.ticket_max <= data.ticket_min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ticket_max"], message: rangeText });
    }

    if (data.main_service_max <= data.main_service_min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["main_service_max"], message: rangeText });
    }

    if (data.service_area === "multiple_cities" && !data.service_area_notes?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["service_area_notes"], message: requiredText });
    }

    if (data.consult_fee_enabled && (data.consult_fee_amount === null || data.consult_fee_amount === undefined || Number.isNaN(data.consult_fee_amount))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["consult_fee_amount"], message: numberText });
    }
  });

export type IntakeData = z.infer<typeof IntakeSchema>;

/* =============================
   SAFE EVIDENCE TYPE NORMALIZER
============================= */

const EvidenceTypeSchema = z.string().transform((val) => {
  const normalized = val?.toLowerCase?.() || "";

  if (normalized.includes("price")) return "pricing";
  if (normalized.includes("service")) return "service";
  if (normalized.includes("review") || normalized.includes("reputation")) return "reputation";
  if (normalized.includes("guarantee") || normalized.includes("warranty")) return "guarantee";

  return "other";
});

/* =============================
   COMPETITOR SCHEMA (RESILIENT)
============================= */

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

/* =============================
   EXTRACTED DATA SCHEMA
============================= */

export const ExtractedDataSchema = z.object({
  competitors: z.array(CompetitorSchema).optional().default([]),

  evidence: z
    .array(
      z.object({
        id: z.string().default(() => crypto.randomUUID()),
        source_url: z.string().default(""),
        snippet: z.string().default(""),
        type: EvidenceTypeSchema,
      })
    )
    .optional()
    .default([]),
});

export type ExtractedData = z.infer<typeof ExtractedDataSchema>;
