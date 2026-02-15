// app/r/[shareId]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

type ReportAny = any;

function moneyish(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return `$${Math.round(v).toLocaleString()}`;
  if (typeof v === "string") return v;
  return "—";
}

function safeArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}

function safeString(v: any, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function badge(conf: string) {
  const c = (conf || "").toUpperCase();
  if (c === "HIGH") return { text: "HIGH", cls: "bg-emerald-100 text-emerald-900 border-emerald-200" };
  if (c === "MED") return { text: "MEDIUM", cls: "bg-amber-100 text-amber-900 border-amber-200" };
  return { text: "LOW", cls: "bg-rose-100 text-rose-900 border-rose-200" };
}

function pickTopActions(report: ReportAny): string[] {
  // prefer next_7_days, fallback to offer_rebuild titles, fallback generic
  const next = safeArray<string>(report?.next_7_days).filter(Boolean);
  if (next.length) return next.slice(0, 5);

  const offers = safeArray(report?.offer_rebuild)
    .map((o: any) => safeString(o?.title).trim())
    .filter(Boolean);
  if (offers.length) return offers.slice(0, 5).map((t) => `Launch: ${t}`);

  return [
    "Add a clear service call / trip fee (or waive it for members).",
    "Create a membership / maintenance plan (most competitors use this).",
    "Publish a simple pricing corridor so buyers trust you faster.",
  ];
}

function evidenceTypeLabel(t: string) {
  const x = (t || "").toLowerCase();
  if (x === "pricing") return "Pricing";
  if (x === "service") return "Service";
  if (x === "reputation") return "Reputation";
  if (x === "guarantee") return "Guarantee";
  return "Other";
}

export default async function ReportPage({ params }: { params: { shareId: string } }) {
  const shareId = params.shareId;

  const reportRow = await prisma.report.findUnique({
    where: { shareId },
    include: { case: true },
  });

  if (!reportRow) return notFound();

  const data = (reportRow.content ?? {}) as ReportAny;

  const meta = data?.meta ?? {};
  const confidence = safeString(meta?.confidence, "LOW") as "HIGH" | "MED" | "LOW";
  const confBadge = badge(confidence);

  const quickVerdict = safeString(data?.quick_verdict, "No verdict generated.");
  const marketPosition = safeString(data?.market_position, "");

  const topLeaks = safeArray(data?.top_leaks_ranked);
  const scorecard = safeArray(data?.scorecard_rows);
  const offers = safeArray(data?.offer_rebuild);
  const scripts = safeArray(data?.scripts);

  const competitors = safeArray(data?.competitors);
  const evidence = safeArray(data?.evidence_drawer);

  const actions = pickTopActions(data);

  // Build competitor snapshot rows (simple + readable)
  const competitorRows = competitors.slice(0, 10).map((c: any) => {
    const name = safeString(c?.name, "Unknown");
    const url = safeString(c?.url, "");
    const tripFee = c?.trip_fee ?? null;
    const membership = c?.membership_offer ?? null;
    const warranty = c?.warranty_offer ?? null;
    return { name, url, tripFee, membership, warranty };
  });

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-6 py-6 flex items-start justify-between gap-6">
          <div>
            <div className="text-xs text-zinc-500">Profit Leak Attorney (Beta)</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Audit Report</h1>
            <div className="mt-1 text-sm text-zinc-600">
              For{" "}
              <span className="font-medium text-zinc-800">{reportRow.case.websiteUrl}</span>
              <span className="mx-2 text-zinc-300">•</span>
              {reportRow.case.location}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`px-3 py-2 rounded-lg border text-sm font-semibold ${confBadge.cls}`}>
              Confidence: {confBadge.text}
            </div>
            <Link
              href="/new"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Run Another Audit
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* What this means (simple) */}
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 rounded-2xl border bg-white p-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Verdict</div>
            <p className="mt-3 text-base leading-relaxed text-zinc-900">{quickVerdict}</p>

            {marketPosition ? (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm text-zinc-700">
                <span className="font-semibold">Market position:</span> {marketPosition}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Do this next</div>
            <ol className="mt-3 space-y-2 text-sm text-zinc-800 list-decimal pl-5">
              {actions.map((a, i) => (
                <li key={i} className="leading-relaxed">{a}</li>
              ))}
            </ol>
            <div className="mt-4 text-xs text-zinc-500">
              (These are the highest-leverage moves based on what competitors are already doing.)
            </div>
          </div>
        </div>

        {/* Top 3 leaks */}
        <div className="rounded-2xl border bg-white p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Top revenue leaks</div>
              <h2 className="mt-2 text-lg font-semibold text-zinc-900">Where you’re losing money (and how to fix it)</h2>
            </div>
          </div>

          {topLeaks.length ? (
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {topLeaks.slice(0, 3).map((l: any, idx: number) => (
                <div key={idx} className="rounded-xl border bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-500">Leak #{idx + 1}</div>
                  <div className="mt-1 font-semibold text-zinc-900">{safeString(l?.title, "Untitled leak")}</div>
                  <div className="mt-2 text-sm text-zinc-700">
                    <span className="font-semibold">Why it matters:</span>{" "}
                    {safeString(l?.why_it_matters, "—")}
                  </div>
                  <div className="mt-2 text-sm text-zinc-700">
                    <span className="font-semibold">Market contrast:</span>{" "}
                    {safeString(l?.market_contrast, "—")}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 text-sm text-zinc-600">No “top leaks” were generated for this run.</div>
          )}
        </div>

        {/* Competitor snapshot */}
        <div className="rounded-2xl border bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Competitor snapshot</div>
          <h2 className="mt-2 text-lg font-semibold text-zinc-900">What competitors offer (simple view)</h2>

          <div className="mt-4 overflow-hidden rounded-xl border">
            <div className="grid grid-cols-12 bg-zinc-100 px-4 py-3 text-xs font-semibold text-zinc-600">
              <div className="col-span-4">Competitor</div>
              <div className="col-span-2">Trip fee</div>
              <div className="col-span-3">Membership</div>
              <div className="col-span-3">Warranty</div>
            </div>

            {competitorRows.length ? (
              competitorRows.map((r, i) => (
                <div key={i} className="grid grid-cols-12 px-4 py-3 text-sm border-t">
                  <div className="col-span-4">
                    <div className="font-semibold text-zinc-900">{r.name}</div>
                    {r.url ? (
                      <a className="text-xs text-zinc-500 hover:underline" href={r.url} target="_blank" rel="noreferrer">
                        {r.url.replace(/^https?:\/\//, "")}
                      </a>
                    ) : null}
                  </div>
                  <div className="col-span-2 text-zinc-800">{r.tripFee ? safeString(r.tripFee) : "—"}</div>
                  <div className="col-span-3 text-zinc-800">{r.membership ? safeString(r.membership) : "—"}</div>
                  <div className="col-span-3 text-zinc-800">{r.warranty ? safeString(r.warranty) : "—"}</div>
                </div>
              ))
            ) : (
              <div className="px-4 py-4 text-sm text-zinc-600">No competitors were extracted for this run.</div>
            )}
          </div>

          <div className="mt-3 text-xs text-zinc-500">
            We keep this view simple. The detailed proof is below in the Evidence section.
          </div>
        </div>

        {/* Offer rebuild (simple) */}
        <div className="rounded-2xl border bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Offer rebuild</div>
          <h2 className="mt-2 text-lg font-semibold text-zinc-900">What to add to your offer</h2>

          {offers.length ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {offers.slice(0, 4).map((o: any, i: number) => (
                <div key={i} className="rounded-xl border bg-zinc-50 p-4">
                  <div className="font-semibold text-zinc-900">{safeString(o?.title, "Untitled")}</div>
                  <div className="mt-2 text-sm leading-relaxed text-zinc-700">{safeString(o?.content, "")}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm text-zinc-600">No offer rebuild items were generated.</div>
          )}
        </div>

        {/* Evidence drawer (still there, but readable) */}
        <div className="rounded-2xl border bg-white p-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Evidence</div>
          <h2 className="mt-2 text-lg font-semibold text-zinc-900">Proof (click to expand)</h2>
          <div className="mt-2 text-sm text-zinc-600">
            This is the raw proof used to generate the audit. If you want, you can forward this to a partner or manager.
          </div>

          {/* Simple filter */}
          <details className="mt-4 rounded-xl border bg-zinc-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
              Show evidence list ({evidence.length})
            </summary>

            <div className="mt-4 space-y-2">
              {evidence.length ? (
                evidence.map((e: any, idx: number) => (
                  <details key={idx} className="rounded-lg border bg-white p-3">
                    <summary className="cursor-pointer flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-500">
                          {evidenceTypeLabel(safeString(e?.type))} •{" "}
                          <span className="font-normal">
                            {safeString(e?.source_url, "").replace(/^https?:\/\//, "").slice(0, 70)}
                            {safeString(e?.source_url, "").length > 70 ? "…" : ""}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-zinc-900 truncate">
                          {safeString(e?.snippet, "—").replace(/\s+/g, " ").slice(0, 140)}
                          {safeString(e?.snippet, "").length > 140 ? "…" : ""}
                        </div>
                      </div>
                      <span className="text-xs text-zinc-500">Expand</span>
                    </summary>

                    <div className="mt-3 text-sm leading-relaxed text-zinc-800 whitespace-pre-wrap">
                      {safeString(e?.snippet, "—")}
                    </div>

                    {e?.source_url ? (
                      <a
                        href={safeString(e?.source_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-block text-sm font-semibold text-zinc-900 hover:underline"
                      >
                        Open source →
                      </a>
                    ) : null}
                  </details>
                ))
              ) : (
                <div className="text-sm text-zinc-600">No evidence was extracted for this run.</div>
              )}
            </div>
          </details>
        </div>

        {/* Next 7 days */}
        <div className="rounded-2xl border bg-zinc-900 p-6 text-white">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Next 7 days</div>
          <h2 className="mt-2 text-lg font-semibold">Simple plan</h2>

          <ol className="mt-4 space-y-2 list-decimal pl-5 text-sm text-zinc-100">
            {safeArray<string>(data?.next_7_days).slice(0, 7).map((x, i) => (
              <li key={i} className="leading-relaxed">{x}</li>
            ))}
          </ol>

          {!safeArray<string>(data?.next_7_days).length ? (
            <div className="mt-3 text-sm text-zinc-300">No plan was generated for this run.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
