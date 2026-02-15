
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const job = await prisma.job.findUnique({
    where: { id: params.id },
    include: {
      case: {
        include: {
           reports: true
        }
      }
    }
  });

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  let report_share_id = undefined;
  if (job.status === 'completed' && job.case.reports.length > 0) {
     report_share_id = job.case.reports[0].shareId;
  }

  return NextResponse.json({
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    report_share_id
  });
}
