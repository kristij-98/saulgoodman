import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { IntakeSchema } from '@/shared/schema/extractor.zod';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validated = IntakeSchema.parse(body);

    const { 
      website_url, 
      city, 
      state_province, 
      what_they_sell, 
      ...vitals 
    } = validated;

    const newCase = await prisma.case.create({
      data: {
        website_url,
        location: `${city}, ${state_province}`,
        what_they_sell,
        vitals: vitals as any,
        pro_inputs: body // Store full body as pro inputs for simplicity or separate if strict
      }
    });

    return NextResponse.json(newCase);
  } catch (error) {
    return NextResponse.json({ error: 'Invalid Request' }, { status: 400 });
  }
}