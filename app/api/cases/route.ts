import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { IntakeSchema } from '@/shared/schema/extractor.zod';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Backward compatibility: Normalize camelCase keys to snake_case
    const payload = {
      ...body,
      website_url: body.website_url ?? body.websiteUrl,
      state_province: body.state_province ?? body.stateProvince,
      what_they_sell: body.what_they_sell ?? body.whatTheySell,
    };

    const result = IntakeSchema.safeParse(payload);

    if (!result.success) {
      return NextResponse.json(
        { 
          error: 'Invalid Request', 
          issues: process.env.NODE_ENV !== 'production' ? result.error.issues : undefined 
        }, 
        { status: 400 }
      );
    }

    const validated = result.data;

    const { 
      website_url, 
      city, 
      state_province, 
      what_they_sell, 
      ...vitals 
    } = validated;

    const newCase = await prisma.case.create({
      data: {
        websiteUrl: website_url,
        location: `${city}, ${state_province}`,
        whatTheySell: what_they_sell,
        vitals: vitals as any,
        proInputs: body // Store full original body
      }
    });

    return NextResponse.json(newCase);
  } catch (error) {
    console.error("Create case error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
