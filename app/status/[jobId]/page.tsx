'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle, Search, FileText, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JobStatus {
  status: string;
  stage: string;
  progress: number;
  report_share_id?: string;
}

export default function StatusPage({ params }: { params: { jobId: string } }) {
  const [job, setJob] = useState<JobStatus | null>(null);
  const router = useRouter();

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${params.jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setJob(data);

        if (data.status === 'completed' && data.report_share_id) {
          router.push(`/r/${data.report_share_id}`);
        }
      } catch (e) {
        console.error(e);
      }
    };

    const interval = setInterval(poll, 2000);
    poll(); // Initial call
    return () => clearInterval(interval);
  }, [params.jobId, router]);

  const stages = [
    { label: "Business Extraction", icon: FileText, minProgress: 0 },
    { label: "Competitor Discovery", icon: Search, minProgress: 10 },
    { label: "Evidence Extraction", icon: Search, minProgress: 40 },
    { label: "Benchmark & Scoring", icon: Scale, minProgress: 70 },
    { label: "Report Composition", icon: FileText, minProgress: 85 },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Building your report…</h2>
        <p className="text-muted-foreground">This usually takes 5–7 minutes.</p>
      </div>

      <div className="w-full max-w-md bg-white rounded-xl border p-8 space-y-6 shadow-sm">
        <div className="space-y-4">
          {stages.map((stage, i) => {
            const isActive = job && job.progress >= stage.minProgress && (i === stages.length - 1 || job.progress < stages[i+1].minProgress);
            const isDone = job && job.progress > stage.minProgress; // Simple approximation

            return (
              <div key={stage.label} className={cn("flex items-center gap-4 transition-colors", 
                (isActive || isDone) ? "text-slate-900" : "text-slate-300"
              )}>
                 <div className={cn("w-8 h-8 rounded-full flex items-center justify-center border",
                   isDone ? "bg-green-50 border-green-200 text-green-600" : 
                   isActive ? "bg-slate-100 border-slate-300 animate-pulse" : "bg-transparent"
                 )}>
                   {isDone ? <CheckCircle className="w-5 h-5" /> : <stage.icon className="w-4 h-4" />}
                 </div>
                 <span className="font-medium text-sm">{stage.label}</span>
              </div>
            );
          })}
        </div>

        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
           <div 
             className="h-full bg-slate-900 transition-all duration-500 ease-out" 
             style={{ width: `${job?.progress || 0}%` }}
           />
        </div>
      </div>
    </div>
  );
}