import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request, { params }: { params: { shareId: string } }) {
  const report = await prisma.report.findUnique({
    where: { share_id: params.shareId }
  });

  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(report.payload_json);
}