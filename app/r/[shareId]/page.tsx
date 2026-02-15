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
function shortHost(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function badge(conf: string) {
  const c = (conf || "").toUpperCase();
  if (c === "HIGH") return { text: "HIGH", cls: "bg-emerald-50 text-emerald-900 ring-emerald-200" };
  if (c === "MED") return { text: "MEDIUM", cls: "bg-amber-50 text-amber-900 ring-amber-200" };
  return { text: "LOW", cls: "bg-rose-50 text-rose-900 ring-rose-200" };
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

function evidenceTypeLabel(t: string) {
  const x = (t || "").toLowerCase();
  if (x === "pricing") return "Pricing";
  if (x === "service") return "Service";
  if (x === "reputation") return "Reviews";
  if (x === "guarantee") return "Warranty";
  return "Other";
}

// Planning estimate ONLY (helps prioritize; not pretending precision)
function allocateLeakImpact(perMonthLow: number | null, perMonthHigh: number | null, idx: number) {
  const weights = [0.45, 0.35, 0.20];
  const w = weights[idx] ?? 0.2;
  const lo = perMonthLow === null ? null : perMonthLow * w;
  const hi = perMonthHigh === null ? null : perMonthHigh * w;
  return { lo, hi, w };
}

function SectionTitle({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{kicker}</div>
      <h2 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight text-zinc-900">{title}</h2>
      {subtitle ? <div className="mt-1 text-sm text-zinc-600">{subtitle}</div> : null}
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white ring-1 ring-zinc-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
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

  // Pull leak numbers from multiple possible shapes (so UI won't break as scoring evolves)
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

  const proofLine = `Built from ${competitors.length || "—"} local competitors and ${evidence.length || "—"} proof snippets.`;

  const meaningLine =
    marketPosition
      ? `Right now you look like a “${marketPosition}” option. That usually means you get price-shopped and your jobs stay small.`
      : `This market rewards businesses that charge properly and sell a stronger offer (fees, plans, and warranty).`;

  const verdictLine =
    quickVerdict ||
    "You’re leaving money on the table because your offer is weaker than what most competitors show publicly.";

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b bg-white/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-zinc-500">Profit Leak Attorney</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <div className="text-base font-semibold text-zinc-900">Audit Report</div>
              <span className="text-zinc-300">•</span>
              <div className="text-sm text-zinc-600 truncate">
                {shortHost(reportRow.case.websiteUrl)} • {reportRow.case.location}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`hidden sm:inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${confBadge.cls}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
              Confidence: {confBadge.text}
            </div>

            <Link
              href="/new"
              className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Run Another Audit
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10 space-y-10">
        {/* HERO BENTO */}
        <div className="grid grid-cols-12 gap-5">
          {/* Main money card */}
          <Card className="col-span-12 lg:col-span-8 p-7 md:p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Summary</div>

                <div className="mt-3">
                  <div className="text-sm text-zinc-600">Money you’re losing (estimate)</div>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                    <div className="text-4xl md:text-5xl font-semibold tracking-tight text-zinc-900">
                      {moneyRange(finalPerMonthLow, finalPerMonthHigh)}
                    </div>
                    <div className="text-base font-semibold text-zinc-600">/ month</div>
                  </div>

                  <div className="mt-2 text-sm md:text-base text-zinc-700">
                    That’s about{" "}
                    <span className="font-semibold">{moneyRange(finalPerYearLow, finalPerYearHigh)}</span>{" "}
                    per year in missed profit compared to what competitors already charge and offer.
                  </div>
                </div>
              </div>

              <div className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold ring-1 ${confBadge.cls}`}>
                Confidence: {confBadge.text}
              </div>
            </div>

            {/* Support bento inside */}
            <div className="mt-6 grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-5 rounded-xl bg-zinc-50 ring-1 ring-zinc-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">What this means</div>
                <div className="mt-2 text-sm leading-relaxed text-zinc-800">{meaningLine}</div>
                {marketPosition ? (
                  <div className="mt-3 inline-flex items-center rounded-full bg-white ring-1 ring-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-800">
                    Current label: {marketPosition}
                  </div>
                ) : null}
              </div>

              <div className="col-span-12 md:col-span-4 rounded-xl bg-zinc-50 ring-1 ring-zinc-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cost of waiting</div>
                <div className="mt-2 text-sm text-zinc-800">
                  Roughly <span className="font-semibold">{moneyRange(perWeekLow, perWeekHigh)}</span> lost per week.
                </div>
                <div className="mt-2 text-xs text-zinc-500">Simple estimate to force fast decisions.</div>
              </div>

              <div className="col-span-12 md:col-span-3 rounded-xl bg-zinc-50 ring-1 ring-zinc-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Proof</div>
                <div className="mt-2 text-sm text-zinc-800">{proofLine}</div>
                <div className="mt-2 flex gap-2">
                  <div className="rounded-lg bg-white ring-1 ring-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-900">
                    Snippets: {evidence.length || 0}
                  </div>
                  <div className="rounded-lg bg-white ring-1 ring-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-900">
                    Competitors: {competitors.length || 0}
                  </div>
                </div>
              </div>

              <div className="col-span-12 rounded-xl ring-1 ring-zinc-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Bottom line</div>
                <div className="mt-2 text-sm leading-relaxed text-zinc-900">{verdictLine}</div>
              </div>
            </div>
          </Card>

          {/* Action card */}
          <Card className="col-span-12 lg:col-span-4 overflow-hidden">
            <div className="bg-zinc-900 p-7 text-white">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                Do this first (72 hours)
              </div>
              <div className="mt-2 text-lg font-semibold tracking-tight">
                Quick wins that pay you back
              </div>

              <ol className="mt-5 space-y-3 list-decimal pl-5 text-sm text-zinc-100">
                {do72.map((x, i) => (
                  <li key={i} className="leading-relaxed">{x}</li>
                ))}
              </ol>

              <div className="mt-6 rounded-xl bg-white/10 p-4">
                <div className="text-xs font-semibold text-zinc-200">One rule</div>
                <div className="mt-1 text-xs leading-relaxed text-zinc-200">
                  Don’t “improve everything.” Fix #1 first. Then #2. Then #3.
                </div>
              </div>

              <div className="mt-6 text-xs text-zinc-300">
                If you’re serious, do this before you read the rest.
              </div>
            </div>
          </Card>
        </div>

        {/* LEAKS SECTION */}
        <Card className="p-7 md:p-8">
          <SectionTitle
            kicker="Priority list"
            title="What’s causing the leak (ranked)"
            subtitle="Fix these in order. This is where the money is."
          />

          {topLeaks.length ? (
            <div className="mt-6 grid grid-cols-12 gap-4">
              {topLeaks.slice(0, 3).map((l: any, idx: number) => {
                const impact = allocateLeakImpact(finalPerMonthLow, finalPerMonthHigh, idx);
                return (
                  <div key={idx} className="col-span-12 md:col-span-4 rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2">
                        <span className="rounded-full bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-white">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Leak</span>
                      </div>
                      <div className="rounded-full bg-white ring-1 ring-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-900">
                        Est: {moneyRange(impact.lo, impact.hi)}/mo
                      </div>
                    </div>

                    <div className="mt-3 text-base font-semibold text-zinc-900">
                      {safeString(l?.title, "Untitled")}
                    </div>

                    <div className="mt-3 text-sm text-zinc-700">
                      <span className="font-semibold text-zinc-900">Why it hurts:</span>{" "}
                      {safeString(l?.why_it_matters, "—")}
                    </div>

                    <div className="mt-3 text-sm text-zinc-700">
                      <span className="font-semibold text-zinc-900">What competitors do:</span>{" "}
                      {safeString(l?.market_contrast, "—")}
                    </div>

                    <div className="mt-4 text-xs text-zinc-500">
                      Planning split: {Math.round(impact.w * 100)}% (for focus).
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 text-sm text-zinc-600">No ranked leaks were generated for this run.</div>
          )}
        </Card>

        {/* OFFER FIXES */}
        <Card className="p-7 md:p-8">
          <SectionTitle
            kicker="Fix the offer"
            title="What to add (so you can charge more)"
            subtitle="This is how competitors make the same customer worth more money."
          />

          {offers.length ? (
            <div className="mt-6 grid grid-cols-12 gap-4">
              {offers.slice(0, 4).map((o: any, i: number) => (
                <div key={i} className="col-span-12 md:col-span-6 rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-6">
                  <div className="text-base font-semibold text-zinc-900">{safeString(o?.title, "Untitled")}</div>
                  <div className="mt-2 text-sm leading-relaxed text-zinc-700">{safeString(o?.content, "")}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 text-sm text-zinc-600">No offer upgrades were generated.</div>
          )}
        </Card>

        {/* COMPETITOR TABLE */}
        <Card className="p-7 md:p-8">
          <SectionTitle
            kicker="Local comparison"
            title="What competitors show publicly"
            subtitle="Quick view. Proof is in the locker below."
          />

          <div className="mt-6 overflow-hidden rounded-2xl ring-1 ring-zinc-200">
            <div className="grid grid-cols-12 bg-zinc-100 px-4 py-3 text-xs font-semibold text-zinc-600">
              <div className="col-span-4">Competitor</div>
              <div className="col-span-2">Trip fee</div>
              <div className="col-span-3">Membership</div>
              <div className="col-span-3">Warranty</div>
            </div>

            {competitorRows.length ? (
              competitorRows.map((r, i) => (
                <div key={i} className="grid grid-cols-12 px-4 py-4 text-sm border-t border-zinc-200">
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
        </Card>

        {/* PROOF LOCKER */}
        <Card className="p-7 md:p-8">
          <div className="flex items-start justify-between gap-6">
            <SectionTitle
              kicker="Proof locker"
              title="Proof (open if you want to verify)"
              subtitle="Real snippets pulled from competitor pages (pricing, memberships, warranties, etc)."
            />

            <div className="hidden sm:flex items-center gap-2">
              <div className="rounded-full bg-zinc-50 ring-1 ring-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-900">
                Snippets: {evidence.length || 0}
              </div>
              <div className="rounded-full bg-zinc-50 ring-1 ring-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-900">
                Competitors: {competitors.length || 0}
              </div>
            </div>
          </div>

          <details className="mt-6 rounded-2xl bg-zinc-50 ring-1 ring-zinc-200 p-5">
            <summary className="cursor-pointer text-sm font-semibold text-zinc-900">
              Open proof locker ({evidence.length})
            </summary>

            <div className="mt-4 space-y-3">
              {evidence.length ? (
                evidence.map((e: any, idx: number) => (
                  <details key={idx} className="rounded-xl bg-white ring-1 ring-zinc-200 p-4">
                    <summary className="cursor-pointer flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-500">
                          {evidenceTypeLabel(safeString(e?.type))} •{" "}
                          <span className="font-normal">{shortHost(safeString(e?.source_url, "")).slice(0, 80)}</span>
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
        </Card>

        {/* NEXT 7 DAYS */}
        <div className="rounded-2xl bg-zinc-900 p-7 md:p-8 text-white shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Next 7 days</div>
          <h2 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight">Your simple plan</h2>
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
