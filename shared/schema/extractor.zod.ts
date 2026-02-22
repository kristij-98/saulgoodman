import { z } from "zod";

const numberFromInput = z.coerce.number().min(0);

const EvidenceTypeSchema = z.enum(["pricing", "service", "reputation", "guarantee", "other"]);

export const IntakeSchema = z
  .object({
    website_url: z.string().url(),
    what_they_sell: z.string().min(3),

    street_address: z.string().min(8),
    city: z.string().min(2),
    state_province: z.string().min(2),
    postal_code: z.string().min(2),

    jobs_min: numberFromInput,
    jobs_max: numberFromInput,
    ticket_min: numberFromInput,
    ticket_max: numberFromInput,

    availability: z.enum(["Same Day", "Next Day", "2-3 Days", "1 Week+"]),

    service_area: z
      .enum(["local_only", "within_10_miles", "within_25_miles", "within_50_miles", "multiple_cities"])
      .optional(),
    service_area_notes: z.string().optional(),

    services: z
      .array(
        z.object({
          name: z.string().min(1),
          price: z.string().optional(),
        })
      )
      .optional()
      .default([]),

    trip_fee: z.string().optional(),
    has_membership: z.boolean().optional(),
    has_priority: z.boolean().optional(),
    warranty: z.string().optional(),

    has_packages: z.boolean().optional(),
    packages: z
      .array(
        z.object({
          name: z.string().min(1),
          price: z.string().optional(),
          includes: z.array(z.string()).optional(),
        })
      )
      .optional()
      .default([]),

    pricing_frustration: z.string().optional(),
    known_competitors: z.string().optional(),

    consult_fee_enabled: z.boolean().optional(),
    consult_fee_amount: z.coerce.number().min(0).optional(),
    public_pricing: z.enum(["yes", "some", "no"]).optional(),

    packages_status: z.enum(["yes", "no", "not_sure"]).optional(),
    addons_status: z.enum(["yes", "no", "not_sure"]).optional(),
    addons_notes: z.string().optional(),
    membership_status: z.enum(["yes", "no", "not_sure"]).optional(),
    membership_price: z.string().optional(),
    membership_notes: z.string().optional(),
    warranty_status: z.enum(["yes", "no", "not_sure"]).optional(),
    warranty_notes: z.string().optional(),

    main_service_min: numberFromInput.optional(),
    main_service_max: numberFromInput.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.jobs_max <= data.jobs_min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jobs_max"],
        message: "Max must be higher than Min.",
      });
    }

    if (data.ticket_max <= data.ticket_min) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ticket_max"],
        message: "Max must be higher than Min.",
      });
    }

    if (
      typeof data.main_service_min === "number" &&
      typeof data.main_service_max === "number" &&
      data.main_service_max <= data.main_service_min
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["main_service_max"],
        message: "Max must be higher than Min.",
      });
    }

    if (data.service_area === "multiple_cities" && !data.service_area_notes?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["service_area_notes"],
        message: "This field is required.",
      });
    }

    if (data.consult_fee_enabled && typeof data.consult_fee_amount !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["consult_fee_amount"],
        message: "This field is required.",
      });
    }
  });

export type IntakeData = z.infer<typeof IntakeSchema>;

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
