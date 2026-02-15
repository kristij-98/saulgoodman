
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getQueue } from '@/lib/queue';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const caseId = params.id;
  const exists = await prisma.case.findUnique({ where: { id: caseId } });
  
  if (!exists) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

  // Create Job Record
  const job = await prisma.job.create({
    data: {
      caseId: caseId,
      status: 'pending',
      progress: 0
    }
  });

  // Send to Queue
  const queue = await getQueue();
  await queue.send('audit-job', { caseId, jobId: job.id });

  return NextResponse.json({ jobId: job.id });
}
