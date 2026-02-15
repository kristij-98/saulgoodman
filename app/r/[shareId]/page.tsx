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
  if (lo !== null && hi === null) return money(lo);
  if (lo === null && hi !== null) return money(hi);
  return `${money(lo)}–${money(hi)}`;
}

function badge(conf: string) {
  const c = (conf || "").toUpperCase();
  if (c === "HIGH") return { text: "HIGH", cls: "bg-emerald-50 text-emerald-900 border-emerald-200" };
  if (c === "MED") return { text: "MEDIUM", cls: "bg-amber-50 text-amber-900 border-amber-200" };
  return { text: "LOW", cls: "bg-rose-50 text-rose-900 border-rose-200" };
}

function evidenceTypeLabel(t: string) {
  const x = (t || "").toLowerCase();
  if (x === "pricing") return "Pricing";
  if (x === "service") return "Service";
  if (x === "reputation") return "Reviews";
  if (x === "guarantee") return "Warranty";
  return "Other";
}

function pickTopActions(report: ReportAny): string[] {
  const next = safeArray<string>(report?.next_7_days).filter(Boolean);
  if (next.length) return next.slice(0, 5);

  const offers = safeArray(report?.offer_rebuild)
    .map((o: any) => safeString(o?.title).trim())
    .filter(Boolean);
  if (offers.length) return offers.slice(0, 5).map((t) => `Add: ${t}`);

  return [
    "Set a standard dispatch / trip fee (and waive it for members).",
    "Add a simple membership plan so you get recurring money each month.",
    "Show a clear price range on your site so buyers trust you faster.",
  ];
}

// Planning estimate ONLY (not pretending precision).
// Helps the owner decide what to fix first.
function allocateLeakImpact(perMonthLow: number | null, perMonthHigh: number | null, idx: number) {
  const weights = [0.45, 0.35, 0.20];
  const w = weights[idx] ?? 0.2;
  const lo = perMonthLow === null ? null : perMonthLow * w;
  const hi = perMonthHigh === null ? null : perMonthHigh * w;
  return { lo, hi, w };
}

function shortHost(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
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
  const marketPosition = safeString(data?.market_position, ""); // optional

  const topLeaks = safeArray(data?.top_leaks_ranked);
  const offers = safeArray(data?.offer_rebuild);
  const competitors = safeArray(data?.competitors);
  const evidence = safeArray(data?.evidence_drawer);

  const actions = pickTopActions(data);
  const do72 = actions.slice(0, 3);

  // Pull leak numbers from multiple places (so UI doesn't break as scoring evolves)
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

  const competitorRows = competitors.slice(0, 10).map((c: any) => {
    const name = safeString(c?.name, "Unknown");
    const url = safeString(c?.url, "");
    const tripFee = c?.trip_fee ?? null;
    const membership = c?.membership_offer ?? null;
    const warranty = c?.warranty_offer ?? null;
    return { name, url, tripFee, membership, warranty };
  });

  const proofLine = `Based on ${competitors.length || "—"} local competitors and ${evidence.length || "—"} proof snippets.`;

  // Plain language “what this means”
  const meaningLine =
    marketPosition
      ? `Right now you look like a “${marketPosition}” option. That usually means you get price-shopped and your jobs stay small.`
      : `This market rewards businesses that charge properly and sell a stronger offer (fees, plans, and warranty).`;

  // Optional “tone” line — still simple
  const verdictLine =
    quickVerdict ||
    "You’re leaving money on the table because your offer is weaker than what most competitors show publicly.";

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* TOP BAR */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-6 py-6 flex items-start justify-between gap-6">
          <div>
            <div className="text-xs text-zinc-500">Profit Leak Attorney</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">Audit Report</h1>
            <div className="mt-1 text-sm text-zinc-600">
              For <span className="font-medium text-zinc-800">{shortHost(reportRow.case.websiteUrl)}</span>
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
        {/* HERO — Official audit feel, simple words */}
        <div className="rounded-2xl border bg-white p-7 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Summary
              </div>

              <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                <div className="text-3xl md:text-4xl font-semibold tracking-tight text-zinc-900">
                  Money you’re losing:
                </div>
                <div className="text-3xl md:text-4xl font-semibold tracking-tight text-rose-600">
                  {moneyRange(finalPerMonthLow, finalPerMonthHigh)}
                </div>
                <div className="text-base md:text-lg font-semibold text-zinc-600">
                  / month
                </div>
              </div>

              <div className="mt-2 text-sm md:text-base text-zinc-700">
                That’s about{" "}
                <span className="font-semibold">{moneyRange(finalPerYearLow, finalPerYearHigh)}</span>{" "}
                per year in missed profit compared to what competitors are already charging and offering.
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-500">What this means</div>
                  <div className="mt-2 text-sm leading-relaxed text-zinc-800">
                    {meaningLine}
                  </div>
                </div>

                <div className="rounded-xl border bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-500">Cost of waiting</div>
                  <div className="mt-2 text-sm text-zinc-800">
                    Roughly{" "}
                    <span className="font-semibold">{moneyRange(perWeekLow, perWeekHigh)}</span>{" "}
                    lost per week.
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Simple estimate to help you decide fast.
                  </div>
                </div>

                <div className="rounded-xl border bg-zinc-50 p-4">
                  <div className="text-xs font-semibold text-zinc-500">What you can win back</div>
                  <div className="mt-2 text-sm text-zinc-800">
                    Fix the top 3 items below and you’ll stop the biggest leak first.
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">
                    Start small. Move fast. Stack wins.
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-xl border p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Bottom line</div>
                <div className="mt-2 text-sm leading-relaxed text-zinc-900">
                  {verdictLine}
                </div>
                <div className="mt-3 text-xs text-zinc-500">{proofLine}</div>
              </div>
            </div>

            {/* ACTION CARD — looks premium, reads fast */}
            <div className="w-full md:w-[360px]">
              <div className="rounded-2xl bg-zinc-900 p-5 text-white shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                  Do this first (72 hours)
                </div>
                <div className="mt-2 text-base font-semibold">
                  Quick wins that pay you back
                </div>

                <ol className="mt-4 space-y-2 list-decimal pl-5 text-sm text-zinc-100">
                  {do72.map((x, i) => (
                    <li key={i} className="leading-relaxed">{x}</li>
                  ))}
                </ol>

                <div className="mt-4 rounded-lg bg-white/10 p-3">
                  <div className="text-xs font-semibold text-zinc-200">One rule</div>
                  <div className="mt-1 text-xs text-zinc-200 leading-relaxed">
                    Don’t try to fix everything. Fix #1 first. It changes how customers talk to you and what they accept to pay.
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-zinc-300">
                  <span>Confidence: {confBadge.text}</span>
                  <span>Proof: {evidence.length || 0}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* LEAKS — cleaner hierarchy, less clutter */}
        <div className="rounded-2xl border bg-white p-7 md:p-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Priority list</div>
          <h2 className="mt-2 text-xl font-semibold text-zinc-900">What’s causing the leak (ranked)</h2>
          <div className="mt-1 text-sm text-zinc-600">
            These are the biggest gaps between you and competitors. Fix them in order.
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
                      {safeString(l?.title, "Untitled")}
                    </div>

                    <div className="mt-3 text-sm text-zinc-700">
                      <span className="font-semibold">Why it hurts:</span>{" "}
                      {safeString(l?.why_it_matters, "—")}
                    </div>

                    <div className="mt-3 text-sm text-zinc-700">
                      <span className="font-semibold">What competitors do:</span>{" "}
                      {safeString(l?.market_contrast, "—")}
                    </div>

                    <div className="mt-3 text-xs text-zinc-500">
                      Planning split: {Math.round(impact.w * 100)}% of leak range (for focus).
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 text-sm text-zinc-600">No ranked leaks were generated for this run.</div>
          )}
        </div>

        {/* OFFER FIXES */}
        <div className="rounded-2xl border bg-white p-7 md:p-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Fix the offer</div>
          <h2 className="mt-2 text-xl font-semibold text-zinc-900">What to add (so you can charge more)</h2>
          <div className="mt-1 text-sm text-zinc-600">
            This is how competitors make the same customer worth more money.
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
            <div className="mt-3 text-sm text-zinc-600">No offer upgrades were generated.</div>
          )}
        </div>

        {/* COMPETITOR TABLE — official, readable */}
        <div className="rounded-2xl border bg-white p-7 md:p-8">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Local comparison</div>
          <h2 className="mt-2 text-xl font-semibold text-zinc-900">What competitors show publicly</h2>
          <div className="mt-1 text-sm text-zinc-600">
            This is the quick view. The detailed proof is in the Proof Locker.
          </div>

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
                        {shortHost(r.url)}
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
        </div>

        {/* PROOF LOCKER — trust, not noise */}
        <div className="rounded-2xl border bg-white p-7 md:p-8">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Proof locker</div>
              <h2 className="mt-2 text-xl font-semibold text-zinc-900">Proof (open if you want to verify)</h2>
              <div className="mt-1 text-sm text-zinc-600">
                We pulled this from competitor sites (pricing pages, membership pages, warranty text, etc).
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <div className="rounded-full border bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-900">
                Snippets: {evidence.length || 0}
              </div>
              <div className="rounded-full border bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-900">
                Competitors: {competitors.length || 0}
              </div>
            </div>
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
                            {shortHost(safeString(e?.source_url, "")).slice(0, 72)}
                            {safeString(e?.source_url, "").length > 72 ? "…" : ""}
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

        {/* NEXT 7 DAYS — clean and decisive */}
        <div className="rounded-2xl border bg-zinc-900 p-7 md:p-8 text-white">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Next 7 days</div>
          <h2 className="mt-2 text-xl font-semibold">Your simple plan</h2>
          <div className="mt-1 text-sm text-zinc-300">
            Do this in order. Don’t add extra steps. Get the money back first.
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
