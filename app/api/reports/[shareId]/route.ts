
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { shareId: string } }) {
  const report = await prisma.report.findUnique({
    where: { shareId: params.shareId }
  });

  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(report.payloadJson);
}
