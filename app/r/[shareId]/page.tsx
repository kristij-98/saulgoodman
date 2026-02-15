
import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Check, X, ExternalLink, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ReportPage({ params }: { params: { shareId: string } }) {
  const report = await prisma.report.findUnique({
    where: { shareId: params.shareId },
    include: { case: true }
  });

  if (!report) return notFound();

  const data = report.payloadJson as any;
  const confidence = data.meta.confidence as "HIGH" | "MED" | "LOW";

  const confidenceColor = {
    HIGH: "text-green-600 bg-green-50 border-green-200",
    MED: "text-amber-600 bg-amber-50 border-amber-200",
    LOW: "text-red-600 bg-red-50 border-red-200"
  };

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
           <h1 className="text-3xl font-bold tracking-tight">Audit Report</h1>
           <p className="text-muted-foreground">For {report.case.websiteUrl}</p>
        </div>
        <Link href="/new" className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-8 text-sm font-medium text-white shadow hover:bg-slate-800 transition-colors">
          Run Another Audit
        </Link>
      </div>

      {/* Quick Verdict */}
      <section className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white rounded-xl p-6 border shadow-sm">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-slate-900" />
            Verdict
          </h2>
          <p className="text-lg leading-relaxed">{data.quick_verdict}</p>
        </div>

        <div className={cn("rounded-xl p-6 border shadow-sm flex flex-col items-center justify-center text-center space-y-2", confidenceColor[confidence])}>
           <div className="text-sm font-bold uppercase tracking-wider opacity-80">Confidence Score</div>
           <div className="text-5xl font-black tracking-tighter">{confidence}</div>
           {confidence !== 'HIGH' && (
             <p className="text-xs opacity-75 px-4">Not enough transparent competitors found to be 100% certain.</p>
           )}
        </div>
      </section>

      {/* Benchmark Table */}
      <section className="space-y-4">
        <h3 className="text-xl font-bold">Competitor Benchmark</h3>
        <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-500">Competitor</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-500">Trip Fee</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-500">Membership</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-500">Warranty</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.competitors.map((c: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium">
                      <a href={c.url} target="_blank" className="hover:underline decoration-slate-400 underline-offset-4 flex items-center gap-2">
                        {c.name} <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-center">{c.trip_fee || '-'}</td>
                    <td className="px-4 py-3 text-center">
                       {c.membership_offer ? <Check className="w-4 h-4 mx-auto text-green-500"/> : <span className="text-slate-300">-</span>}
                    </td>
                     <td className="px-4 py-3 text-center">{c.warranty_offer || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Offer Rebuilds */}
      <section className="space-y-4">
        <h3 className="text-xl font-bold">Offer Rebuild Opportunities</h3>
        <div className="grid md:grid-cols-2 gap-6">
          {data.offer_rebuild.map((item: any, i: number) => (
            <div key={i} className="bg-white p-6 rounded-xl border shadow-sm space-y-3">
              <h4 className="font-bold text-lg">{item.title}</h4>
              <p className="text-slate-600 leading-relaxed">{item.content}</p>
            </div>
          ))}
        </div>
      </section>
      
      {/* Evidence Drawer */}
       <section className="space-y-4">
        <h3 className="text-xl font-bold">Evidence Drawer</h3>
        <div className="space-y-2">
          {data.evidence_drawer.map((e: any, i: number) => (
             <details key={i} className="group bg-white border rounded-lg px-4 open:pb-4">
                <summary className="py-4 font-medium cursor-pointer list-none flex items-center justify-between">
                   <span className="flex items-center gap-2">
                     <span className="bg-slate-100 text-xs px-2 py-0.5 rounded uppercase tracking-wider font-bold text-slate-600">{e.type}</span>
                     <span className="truncate max-w-[300px] md:max-w-md">{e.snippet.substring(0, 60)}...</span>
                   </span>
                   <ChevronDownIcon className="w-4 h-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="pt-2 text-sm text-slate-600 space-y-2 pl-2 border-l-2 border-slate-100 ml-1">
                   <p>"{e.snippet}"</p>
                   <a href={e.source_url} target="_blank" className="text-blue-600 hover:underline flex items-center gap-1 text-xs">
                     Source <ExternalLink className="w-3 h-3" />
                   </a>
                </div>
             </details>
          ))}
        </div>
       </section>

      {/* Next 7 Days */}
      <section className="bg-slate-900 text-white rounded-xl p-8 space-y-6">
         <h3 className="text-2xl font-bold">Next 7 Days Plan</h3>
         <ul className="space-y-4">
           {data.next_7_days.map((step: string, i: number) => (
             <li key={i} className="flex gap-4 items-start">
               <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white text-slate-900 font-bold flex items-center justify-center text-sm">{i+1}</div>
               <p className="leading-snug pt-0.5">{step}</p>
             </li>
           ))}
         </ul>
      </section>
    </div>
  );
}

function ChevronDownIcon(props: any) {
    return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
}
