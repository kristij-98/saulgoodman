// app/r/[shareId]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

type ReportAny = any;

function safeArray<T = any>(v: any): T[] {
  return Array.isArray(v) ? v : [];
}
function safeString(v: any, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function num(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const x = Number(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(x) ? x : null;
  }
  return null;
}
function money(n: number | null): string {
  if (n === null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}
function moneyRange(lo: number | null, hi: number | null): string {
  if (lo === null && hi === null) return "—";
  if (lo !== null && hi === null) return `${money(lo)}`;
  if (lo === null && hi !== null) return `${money(hi)}`;
  return `${money(lo)}–${money(hi)}`;
}

function badge(conf: string) {
  const c = (conf || "").toUpperCase();
  if (c === "HIGH") return { text: "HIGH", cls: "bg-emerald-100 text-emerald-900 border-emerald-200" };
  if (c === "MED") return { text: "MEDIUM", cls: "bg-amber-100 text-amber-900 border-amber-200" };
  return { text: "LOW", cls: "bg-rose-100 text-rose-900 border-rose-200" };
}

function evidenceTypeLabel(t: string) {
  const x = (t || "").toLowerCase();
  if (x === "pricing") return "Pricing";
  if (x === "service") return "Service";
  if (x === "reputation") return "Reputation";
  if (x === "guarantee") return "Guarantee";
  return "Other";
}

function pickTopActions(report: ReportAny): string[] {
  const next = safeArray<string>(report?.next_7_days).filter(Boolean);
  if (next.length) return next.slice(0, 5);

  const offers = safeArray(report?.offer_rebuild)
    .map((o: any) => safeString(o?.title).trim())
    .filter(Boolean);
  if (offers.length) return offers.slice(0, 5).map((t) => `Launch: ${t}`);

  return [
    "Set a standard dispatch / trip fee (and waive it for members).",
    "Add a simple membership plan to lock recurring revenue.",
    "Publish a clear pricing corridor so buyers trust you faster.",
  ];
}

// Honest allocation for prioritization only (not fake precision)
function allocateLeakImpact(perMonthLow: number | null, perMonthHigh: number | null, idx: number) {
  const weights = [0.45, 0.35, 0.20];
  const w = weights[idx] ?? 0.2;
  const lo = perMonthLow === null ? null : perMonthLow * w;
  const hi = perMonthHigh === null ? null : perMonthHigh * w;
  return { lo, hi, w };
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

  const quickVerdict = safeString(data?.quick_verdict, "");
  const marketPosition = safeString(data?.market_position, "");

  const topLeaks = safeArray(data?.top_leaks_ranked);
  const offers = safeArray(data?.offer_rebuild);

  const competitors = safeArray(data?.competitors);
  const evidence = safeArray(data?.evidence_drawer);

  const actions = pickTopActions(data);
  const do72 = actions.slice(0, 3);

  // Leak metrics: try multiple places so UI doesn't break when scoring evolves
  const leakCandidates = [
    data?.benchmark_data?.leaks,
    data?.benchmark_data?.delta?.leaks,
    data?.delta?.leaks,
    data?.benchmark_data?.leak_estimate,
    data?.delta?.leak_estimate,
  ].filter(Boolean);

  function pickLeakNumber(keys: string[]): number | null {
    for (const obj of leakCandidates) {
      for (const k of keys) {
        const n = num((obj as any)?.[k]);
        if (n !== null) return n;
      }
    }
    return null;
  }

  const perMonthLow = pickLeakNumber(["per_month_low", "monthly_low", "month_low", "leak_month_low"]);
  const perMonthHigh = pickLeakNumber(["per_month_high", "monthly_high", "month_high", "leak_month_high"]);
  const perYearLow = pickLeakNumber(["per_year_low", "yearly_low", "year_low", "leak_year_low"]);
  const perYearHigh = pickLeakNumber(["per_year_high", "yearly_high", "year_high", "leak_year_high"]);

  const perMonthFallback = perMonthLow ?? perMonthHigh;
  const finalPerMonthLow = perMonthLow ?? perMonthFallback;
  const finalPerMonthHigh = perMonthHigh ?? perMonthFallback;

  const perYearFallback = perYearLow ?? perYearHigh;
  const finalPerYearLow =
    perYearLow ?? perYearFallback ?? (finalPerMonthLow !== null ? finalPerMonthLow * 12 : null);
  const finalPerYearHigh =
    perYearHigh ?? perYearFallback ?? (finalPerMonthHigh !== null ? finalPerMonthHigh * 12 : null);

  const perWeekLow = finalPerMonthLow === null ? null : finalPerMonthLow / 4;
  const perWeekHigh = finalPerMonthHigh === null ? null : finalPerMonthHigh / 4;

  // Competitor snapshot rows (simple + readable)
  const competitorRows = competitors.slice(0, 10).map((c: any) => {
    const name = safeString(c?.name, "Unknown");
    const url = safeString(c?.url, "");
    const tripFee = c?.trip_fee ?? null;
    const membership = c?.membership_offer ?? null;
    const warranty = c?.warranty_offer ?? null;
    return { name, url, tripFee, membership, warranty };
  });

  const proofLine = `Based on ${competitors.length || "—"} competitors and ${evidence.length || "—"} proof snippets.`;

  const diagnosisLine =
    marketPosition
      ? `Positioning: ${marketPosition}. This usually forces you to win on price and caps your ticket.`
      : `This market has levers (fees, memberships, warranties) that increase profit per customer.`;

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* HEADER */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-6 py-6 flex items-start justify-between gap-6">
          <div>
            <div className="text-xs text-zinc-500">Profit Leak Attorney (Beta)</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Audit Report</h1>
            <div className="mt-1 text-sm text-zinc-600">
              For <span className="font-medium text-zinc-800">{reportRow.case.websiteUrl}</span>
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

      <div className="mx-auto max-w-5xl px-6 py-10 space-y-10">
        {/* HERO — simple, premium, readable */}
        <div className="rounded-2xl border bg-white p-7 md:p-8">
          <div className="grid gap-6 md:grid-cols-12 md:items-start">
            {/* Left: headline + meaning */}
            <div className="md:col-span-8">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Executive summary
              </div>

              <h2 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900">
                You’re leaking{" "}
                <span className="text-rose-600">{moneyRange(finalPerMonthLow, finalPerMonthHigh)}</span>{" "}
                <span className="text-zinc-600 text-base md:text-lg font-semibold">per month</span>.
              </h2>

              <div className="mt-2 text-sm md:text-base text-zinc-700">
                That’s <span className="font-semibold">{moneyRange(finalPerYearLow, finalPerYearHigh)}</span>{" "}
                per year in missed profit from pricing + offer structure vs local competitors.
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-500">What this means</div>
                  <div className="mt-2 text-sm leading-relaxed text-zinc-800">
                    {diagnosisLine}
                  </div>
                </div>

                <div className="rounded-xl border bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-500">Cost of delay</div>
                  <div className="mt-2 text-sm text-zinc-800">
                    Every week you wait costs about{" "}
                    <span className="font-semibold">{moneyRange(perWeekLow, perWeekHigh)}</span>.
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    This is a prioritization estimate, not accounting.
                  </div>
                </div>
              </div>

              {quickVerdict ? (
                <div className="mt-6 rounded-xl border p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Verdict</div>
                  <div className="mt-2 text-sm leading-relaxed text-zinc-900">
                    {quickVerdict}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 text-xs text-zinc-500">{proofLine}</div>
            </div>

            {/* Right: 72h plan (single strong CTA block, not a second dashboard) */}
            <div className="md:col-span-4">
              <div className="rounded-2xl bg-zinc-900 p-5 text-white">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                  Do this in the next 72 hours
                </div>
                <div className="mt-2 text-base font-semibold">
                  Fast wins first (highest leverage)
                </div>

                <ol className="mt-4 space-y-2 list-decimal pl-5 text-sm text-zinc-100">
                  {do72.map((x, i) => (
                    <li key={i} className="leading-relaxed">{x}</li>
                  ))}
                </ol>

                <div className="mt-4 text-xs text-zinc-300">
                  If you only do ONE thing: implement #1. It changes what customers expect to pay.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* TOP 3 LEAKS — clear cards, less text density */}
        <div className="rounded-2xl border bg-white p-7 md:p-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Top revenue leaks</div>
          <h2 className="mt-2 text-xl font-semibold text-zinc-900">Where your profit is bleeding (ranked)</h2>
          <div className="mt-1 text-sm text-zinc-600">
            Fix these in order. Each one directly maps to how competitors justify higher prices.
          </div>

          {topLeaks.length ? (
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {topLeaks.slice(0, 3).map((l: any, idx: number) => {
                const impact = allocateLeakImpact(finalPerMonthLow, finalPerMonthHigh, idx);
                return (
                  <div key={idx} className="rounded-xl border bg-zinc-50 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-semibold text-zinc-500">Leak #{idx + 1}</div>
                      <div className="rounded-full border bg-white px-3 py-1 text-xs font-semibold text-zinc-900">
                        Est. impact: {moneyRange(impact.lo, impact.hi)}/mo
                      </div>
                    </div>

                    <div className="mt-2 text-base font-semibold text-zinc-900">
                      {safeString(l?.title, "Untitled leak")}
                    </div>

                    <div className="mt-3 text-sm text-zinc-700">
                      <span className="font-semibold">Why it matters:</span>{" "}
                      {safeString(l?.why_it_matters, "—")}
                    </div>

                    <div className="mt-3 text-sm text-zinc-700">
                      <span className="font-semibold">Proof from market:</span>{" "}
                      {safeString(l?.market_contrast, "—")}
                    </div>

                    <div className="mt-3 text-xs text-zinc-500">
                      Allocation estimate: {Math.round(impact.w * 100)}% of leak range for prioritization.
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 text-sm text-zinc-600">No “top leaks” were generated for this run.</div>
          )}
        </div>

        {/* OFFER REBUILD */}
        <div className="rounded-2xl border bg-white p-7 md:p-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Offer rebuild</div>
          <h2 className="mt-2 text-xl font-semibold text-zinc-900">What to add to your offer (to stop the leak)</h2>
          <div className="mt-1 text-sm text-zinc-600">
            These are the simplest market levers competitors use to justify higher prices and repeat business.
          </div>

          {offers.length ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {offers.slice(0, 4).map((o: any, i: number) => (
                <div key={i} className="rounded-xl border bg-zinc-50 p-5">
                  <div className="text-base font-semibold text-zinc-900">{safeString(o?.title, "Untitled")}</div>
                  <div className="mt-2 text-sm leading-relaxed text-zinc-700">{safeString(o?.content, "")}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm text-zinc-600">No offer rebuild items were generated.</div>
          )}
        </div>

        {/* COMPETITOR SNAPSHOT */}
        <div className="rounded-2xl border bg-white p-7 md:p-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Competitor snapshot</div>
          <h2 className="mt-2 text-xl font-semibold text-zinc-900">What competitors offer (simple view)</h2>

          <div className="mt-5 overflow-hidden rounded-xl border">
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
            This is the simplified view. The raw proof is in the Proof Locker below.
          </div>
        </div>

        {/* PROOF LOCKER */}
        <div className="rounded-2xl border bg-white p-7 md:p-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Proof locker</div>
          <h2 className="mt-2 text-xl font-semibold text-zinc-900">Evidence (optional — open if you want to verify)</h2>
          <div className="mt-2 text-sm text-zinc-600">
            We collected this proof from competitor sites. You can forward it to a partner or manager.
          </div>

          <details className="mt-5 rounded-xl border bg-zinc-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
              Open proof locker ({evidence.length})
            </summary>

            <div className="mt-4 space-y-2">
              {evidence.length ? (
                evidence.map((e: any, idx: number) => (
                  <details key={idx} className="rounded-lg border bg-white p-4">
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

        {/* NEXT 7 DAYS */}
        <div className="rounded-2xl border bg-zinc-900 p-7 md:p-8 text-white">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Next 7 days plan</div>
          <h2 className="mt-2 text-xl font-semibold">Make the leak stop</h2>
          <div className="mt-2 text-sm text-zinc-300">
            Execute in order. Don’t overthink it — fix the market levers first.
          </div>

          <ol className="mt-5 space-y-2 list-decimal pl-5 text-sm text-zinc-100">
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
