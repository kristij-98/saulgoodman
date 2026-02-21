import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { IntakeSchema } from '@/shared/schema/extractor.zod';

function availabilityToLegacy(v: string) {
  if (v === 'Same day') return 'Same Day';
  if (v === 'Next day') return 'Next Day';
  if (v === '2–3 days') return '2-3 Days';
  return '1 Week+';
}

function serviceAreaLabel(v: string) {
  if (v === 'local_only') return 'Local only (near me)';
  if (v === 'within_10_miles') return 'Within 10 miles / 15 km';
  if (v === 'within_25_miles') return 'Within 25 miles / 40 km';
  if (v === 'within_50_miles') return 'Within 50 miles / 80 km';
  return 'Multiple cities / regions';
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const payload = {
      ...body,
      website_url: body.website_url ?? body.websiteUrl,
      state_region: body.state_region ?? body.state_province ?? body.stateProvince,
      postal_code: body.postal_code ?? body.zip ?? body.zip_code,
      street_address: body.street_address ?? body.streetAddress,
      what_they_sell: body.what_they_sell ?? body.whatTheySell,
    };

    const result = IntakeSchema.safeParse(payload);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Invalid Request',
          issues: process.env.NODE_ENV !== 'production' ? result.error.issues : undefined,
        },
        { status: 400 }
      );
    }

    const validated = result.data;

    const {
      website_url,
      city,
      state_region,
      postal_code,
      street_address,
      what_they_sell,
      ...rawVitals
    } = validated;

    const legacyCompatVitals = {
      ...rawVitals,
      state_province: state_region,
      availability_legacy: availabilityToLegacy(validated.availability),
      availability: availabilityToLegacy(validated.availability),
      trip_fee: validated.consult_fee_enabled && validated.consult_fee_amount != null ? String(validated.consult_fee_amount) : null,
      has_membership: validated.membership_status === 'yes',
      has_priority: false,
      service_area_label: serviceAreaLabel(validated.service_area),
    };

    const location = `${city}, ${state_region} ${postal_code}`.trim();

    const newCase = await prisma.case.create({
      data: {
        websiteUrl: website_url,
        location,
        whatTheySell: what_they_sell,
        vitals: legacyCompatVitals as any,
        proInputs: {
          ...body,
          normalized: validated,
          street_address,
        } as any,
      },
    });

    return NextResponse.json(newCase);
  } catch (error) {
    console.error('Create case error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
