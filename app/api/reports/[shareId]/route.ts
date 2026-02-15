import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { shareId: string } }) {
  const report = await prisma.report.findUnique({
    where: { shareId: params.shareId }
  });

  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  
  // Cast to any to handle potential schema field naming mismatches (payloadJson vs content)
  // and resolve the build error.
  const data = (report as any).payloadJson || (report as any).content || {};
  
  return NextResponse.json(data);
}
