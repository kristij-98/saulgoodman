import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { IntakeSchema } from "@/shared/schema/extractor.zod";

function availabilityToLegacy(v: string) {
  if (v === "Same Day") return "Same Day";
  if (v === "Next Day") return "Next Day";
  if (v === "2-3 Days") return "2-3 Days";
  return "1 Week+";
}

function serviceAreaLabel(v: string) {
  if (v === "local_only") return "Local only (near me)";
  if (v === "within_10_miles") return "Within 10 miles / 15 km";
  if (v === "within_25_miles") return "Within 25 miles / 40 km";
  if (v === "within_50_miles") return "Within 50 miles / 80 km";
  return "Multiple cities / regions";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Normalize common alternate keys into canonical IntakeSchema keys
    const payload = {
      ...body,
      website_url: body.website_url ?? body.websiteUrl ?? "",
      what_they_sell: body.what_they_sell ?? body.whatTheySell ?? "",

      // Address (canonical)
      street_address: body.street_address ?? body.streetAddress ?? "",
      city: body.city ?? "",
      state_province: body.state_province ?? body.stateProvince ?? body.state_region ?? body.stateRegion ?? "",
      postal_code: body.postal_code ?? body.postalCode ?? body.zip ?? body.zip_code ?? body.zipCode ?? "",

      // Numbers
      jobs_min: body.jobs_min ?? body.jobsMin,
      jobs_max: body.jobs_max ?? body.jobsMax,
      ticket_min: body.ticket_min ?? body.ticketMin,
      ticket_max: body.ticket_max ?? body.ticketMax,

      // Defaults handled by schema, but normalize if UI sends variants
      availability: body.availability ?? "Same Day",
      service_area: body.service_area ?? body.serviceArea ?? "local_only",
      service_area_notes: body.service_area_notes ?? body.serviceAreaNotes ?? null,
    };

    const result = IntakeSchema.safeParse(payload);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid Request",
          issues: process.env.NODE_ENV !== "production" ? result.error.issues : undefined,
        },
        { status: 400 }
      );
    }

    const validated = result.data;

    const {
      website_url,
      street_address,
      city,
      state_province,
      postal_code,
      what_they_sell,
      ...rawVitals
    } = validated as any;

    // Keep vitals compatible with your worker/scoring expectations
    const legacyCompatVitals = {
      ...rawVitals,

      // legacy-ish keys some code might still read
      state_province,
      availability_legacy: availabilityToLegacy(validated.availability),
      availability: availabilityToLegacy(validated.availability),

      // If consult fee is enabled, store as trip_fee string for legacy logic
      trip_fee:
        validated.consult_fee_enabled && validated.consult_fee_amount != null
          ? String(validated.consult_fee_amount)
          : (validated.trip_fee ?? null),

      has_membership: validated.membership_status === "yes" || validated.has_membership === true,
      has_priority: validated.has_priority === true,

      service_area_label: serviceAreaLabel(validated.service_area),
    };

    const location = `${street_address}, ${city}, ${state_province} ${postal_code}`.trim();

    const newCase = await prisma.case.create({
      data: {
        websiteUrl: website_url,
        location,
        whatTheySell: what_they_sell,
        vitals: legacyCompatVitals as any,
        proInputs: {
          raw: body,
          normalized: validated,
        } as any,
      },
    });

    return NextResponse.json(newCase);
  } catch (error) {
    console.error("Create case error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
