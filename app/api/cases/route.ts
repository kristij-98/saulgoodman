import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { IntakeSchema } from "@/shared/schema/extractor.zod";

function availabilityToLegacy(v: string) {
  if (v === "Same day") return "Same Day";
  if (v === "Next day") return "Next Day";
  if (v === "2–3 days") return "2-3 Days";
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

    // Normalize inputs to the canonical schema field names expected by IntakeSchema.
    // Canonical choice: state_province (NOT state_region).
    const payload = {
      ...body,
      website_url: body.website_url ?? body.websiteUrl,
      street_address: body.street_address ?? body.streetAddress,
      city: body.city,
      state_province:
        body.state_province ?? body.stateProvince ?? body.state_region ?? body.stateRegion,
      postal_code: body.postal_code ?? body.postalCode ?? body.zip ?? body.zip_code ?? body.zipCode,
      what_they_sell: body.what_they_sell ?? body.whatTheySell,
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

    // Keep backward-compatible vitals fields used by worker/scoring.
    const legacyCompatVitals = {
      ...rawVitals,

      // legacy key expected elsewhere:
      state_province: state_province,

      // keep both for old code paths that might read either:
      state_region: state_province,

      // legacy availability formatting used in older prompts/UI:
      availability_legacy: availabilityToLegacy(validated.availability),
      availability: availabilityToLegacy(validated.availability),

      // compatibility field for older worker expectations:
      trip_fee:
        validated.consult_fee_enabled && validated.consult_fee_amount != null
          ? String(validated.consult_fee_amount)
          : null,

      has_membership: validated.membership_status === "yes",
      has_priority: false,

      service_area_label: serviceAreaLabel(validated.service_area),
    };

    // Include street address for better precision (Option B you wanted)
    const location = `${street_address}, ${city}, ${state_province} ${postal_code}`.trim();

    const newCase = await prisma.case.create({
      data: {
        websiteUrl: website_url,
        location,
        whatTheySell: what_they_sell,
        vitals: legacyCompatVitals as any,
        proInputs: {
          ...body,
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
