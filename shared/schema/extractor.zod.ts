export const IntakeSchema = z
  .object({
    website_url: z.string().url(),

    // Address (required)
    street_address: z.string().min(3),
    city: z.string().min(2),
    state_province: z.string().min(2),
    postal_code: z.string().min(2),

    what_they_sell: z.string().min(3),

    // Required numbers (coerce allows "123" from inputs)
    jobs_min: z.coerce.number().min(0),
    jobs_max: z.coerce.number().min(0),
    ticket_min: z.coerce.number().min(0),
    ticket_max: z.coerce.number().min(0),

    // MUST match UI exactly
    availability: z.enum(["Same Day", "Next Day", "2-3 Days", "1 Week+"]),

    // Service area (default so it can never be undefined)
    service_area: z
      .enum([
        "local_only",
        "within_10_miles",
        "within_25_miles",
        "within_50_miles",
        "multiple_cities",
      ])
      .default("local_only"),
    service_area_notes: z.string().optional().nullable(),

    // Services (object array)
    services: z
      .array(
        z.object({
          name: z.string().min(1),
          price: z.string().optional(),
        })
      )
      .optional()
      .default([]),

    // Pricing visibility & consult fee
    public_pricing: z.enum(["yes", "some", "no"]).optional().default("some"),
    consult_fee_enabled: z.boolean().optional().default(false),
    consult_fee_amount: z.coerce.number().optional(),

    // Offer levers
    packages_status: z.enum(["yes", "no", "not_sure"]).optional().default("not_sure"),
    addons_status: z.enum(["yes", "no", "not_sure"]).optional().default("not_sure"),
    membership_status: z.enum(["yes", "no", "not_sure"]).optional().default("not_sure"),
    warranty_status: z.enum(["yes", "no", "not_sure"]).optional().default("not_sure"),

    // Optional details
    trip_fee: z.string().optional(),
    warranty: z.string().optional(),
    has_membership: z.boolean().optional(),
    has_priority: z.boolean().optional(),
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

    pricing_problem: z.string().optional().nullable(),
    known_competitors: z.string().optional().nullable(),
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

    if (data.service_area === "multiple_cities") {
      if (!data.service_area_notes || data.service_area_notes.trim().length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["service_area_notes"],
          message: "Required",
        });
      }
    }

    if (data.consult_fee_enabled) {
      if (data.consult_fee_amount === undefined || Number.isNaN(data.consult_fee_amount)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["consult_fee_amount"],
          message: "Required",
        });
      }
    }
  });

export type IntakeData = z.infer<typeof IntakeSchema>;
