// app/r/[shareId]/page.tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Search,
  TrendingDown,
} from "lucide-react";

type ReportAny = any;

// -----------------------------
// Helpers (safe + formatting)
// -----------------------------
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

function moneyCompact(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function moneyRange(lo: number | null, hi: number | null): string {
  if (lo === null && hi === null) return "—";
  if (lo !== null && hi === null) return money(lo);
  if (lo === null && hi !== null) return money(hi);
  return `${money(lo)}–${money(hi)}`;
}

function shortHost(url: string) {
  return (url || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/^www\./, "");
}

function confidenceMeta(level: string) {
  const c = (level || "").toUpperCase();
  if (c === "HIGH") {
    return {
      label: "High Confidence",
      cls: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
      dot: "bg-emerald-600",
      pulse: true,
    };
  }
  if (c === "MED") {
    return {
      label: "Medium Confidence",
      cls: "bg-amber-50 text-amber-700 ring-amber-200/60",
      dot: "bg-amber-600",
      pulse: false,
    };
  }
  return {
    label: "Low Confidence",
    cls: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    dot: "bg-zinc-500",
    pulse: false,
  };
}

function evidenceTypeLabel(t: string) {
  const x = (t || "").toLowerCase();
  if (x === "pricing") return "Pricing";
  if (x === "service") return "Service";
  if (x === "reputation") return "Reputation";
  if (x === "guarantee") return "Warranty/Guarantee";
  return "Other";
}

// Honest allocation for “impact badge” (NOT pretending precision)
function leakWeight(idx: number) {
  const weights = [0.45, 0.35, 0.2];
  return weights[idx] ?? 0.15;
}

// Try to guess competitor name for a piece of evidence (best-effort, safe)
function inferCompetitorNameFromUrl(sourceUrl: string, competitors: any[]) {
  const host = shortHost(sourceUrl);
  if (!host) return "Source";
  const match = competitors.find((c) => shortHost(safeString(c?.url, "")) && host.includes(shortHost(safeString(c?.url, ""))));
  if (match?.name) return safeString(match.name, "Source");
  return host;
}

// -----------------------------
// UI atoms
// -----------------------------
function Card({
  children,
  className = "",
  noPad = false,
}: {
  children: React.ReactNode;
  className?: string;
  noPad?: boolean;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm ${className}`}>
      <div className={noPad ? "" : "p-5 sm:p-6"}>{children}</div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 className="text-xl font-extrabold tracking-tight text-zinc-900">{title}</h3>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-500">{subtitle}</p> : null}
      </div>
      {right ? <div className="sm:pb-1">{right}</div> : null}
    </div>
  );
}

function ImpactBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-100">
      -{value}/mo
    </span>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const m = confidenceMeta(level);
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold tracking-wide ring-1 ring-inset ${m.cls}`}>
      <span className="relative flex h-2 w-2">
        {m.pulse ? <span className={`absolute inline-flex h-full w-full rounded-full ${m.dot} opacity-30 animate-ping`} /> : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${m.dot}`} />
      </span>
      {m.label}
    </span>
  );
}

// -----------------------------
// Page
// -----------------------------
export default async function ReportPage({ params }: { params: { shareId: string } }) {
  const shareId = params.shareId;

  const reportRow = await prisma.report.findUnique({
    where: { shareId },
    include: { case: true },
  });

  if (!reportRow) return notFound();

  const data = (reportRow.content ?? {}) as ReportAny;

  const confidence = safeString(data?.meta?.confidence, "LOW");
  const marketPosition = safeString(data?.market_position, "");
  const quickVerdict = safeString(data?.quick_verdict, "");

  const competitors = safeArray(data?.competitors);
  const evidence = safeArray(data?.evidence_drawer);
  const topLeaks = safeArray(data?.top_leaks_ranked);
  const offers = safeArray(data?.offer_rebuild);
  const nextActions = safeArray<string>(data?.next_7_days).filter(Boolean);

  const doFirst = nextActions.slice(0, 3);
  const doLater = nextActions.slice(3, 10);

  const leakObj = data?.benchmark_data?.leaks ?? {};
  const perMonthLow = num(leakObj?.per_month_low ?? leakObj?.monthly_low);
  const perMonthHigh = num(leakObj?.per_month_high ?? leakObj?.monthly_high);

  // Derive yearly if missing
  const perYearLow = num(leakObj?.per_year_low ?? leakObj?.yearly_low) ?? (perMonthLow !== null ? perMonthLow * 12 : null);
  const perYearHigh = num(leakObj?.per_year_high ?? leakObj?.yearly_high) ?? (perMonthHigh !== null ? perMonthHigh * 12 : null);

  const finalPerMonthLow = perMonthLow ?? perMonthHigh;
  const finalPerMonthHigh = perMonthHigh ?? perMonthLow;

  const competitorCount = competitors.length;
  const proofCount = evidence.length;

  // “Cost of delay” (simple framing)
  const perWeekLow = finalPerMonthLow === null ? null : finalPerMonthLow / 4;
  const perWeekHigh = finalPerMonthHigh === null ? null : finalPerMonthHigh / 4;

  const headerCaseHost = shortHost(reportRow.case.websiteUrl);
  const headerLocation = safeString(reportRow.case.location, "");

  const heroSubtitle =
    "This is profit slipping away because your pricing and offer look weaker than what customers see from local competitors.";

  const perceptionLine = marketPosition
    ? marketPosition
    : "Unclear positioning (customers can’t quickly tell why you cost more).";

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      {/* Navbar (wide + responsive) */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
          <div className="flex h-16 items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-900 text-white font-extrabold tracking-tight">
                PA.
              </div>
              <div className="leading-tight">
                <div className="text-sm font-extrabold">ProfitAudit</div>
                <div className="hidden sm:block text-xs text-zinc-500">High-end offer + pricing audit</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden md:block">
                <ConfidenceBadge level={confidence} />
              </div>

              <div className="hidden sm:block text-xs text-zinc-500">
                Case: <span className="font-semibold text-zinc-700">{headerCaseHost || "—"}</span>
                {headerLocation ? <span className="text-zinc-300"> • </span> : null}
                {headerLocation ? <span className="font-semibold text-zinc-700">{headerLocation}</span> : null}
              </div>

              <Link
                href="/new"
                className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Run Another Audit
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-10">
        {/* HERO (centered, not narrow) */}
        <div className="mx-auto mb-10 max-w-5xl text-center">
          <div className="inline-flex items-center justify-center rounded-full bg-rose-50 px-3 py-1 text-xs font-extrabold tracking-wide text-rose-700 ring-1 ring-inset ring-rose-100">
            AUDIT COMPLETE FOR {safeString(reportRow.case.websiteUrl, "").toUpperCase()}
          </div>

          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl leading-[1.05]">
            You are leaking{" "}
            <span className="bg-yellow-200 px-2 py-1">
              {moneyRange(perYearLow, perYearHigh)}
            </span>{" "}
            every single year.
          </h1>

          <p className="mt-5 text-base text-zinc-600 sm:text-lg lg:text-xl leading-relaxed">
            {heroSubtitle}
          </p>

          {quickVerdict ? (
            <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm">
              <div className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Bottom line</div>
              <p className="mt-2 text-sm leading-relaxed text-zinc-800">{quickVerdict}</p>
            </div>
          ) : null}
        </div>

        {/* Main grid: left content + sticky plan */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
          {/* LEFT (wider content) */}
          <div className="lg:col-span-8 space-y-12">
            {/* Leak summary bento */}
            <section>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {/* Big red card spans nicely on large screens */}
                <Card className="sm:col-span-2 xl:col-span-1 bg-gradient-to-br from-red-700 to-rose-900 text-white border-red-800 shadow-2xl shadow-rose-900/20 relative overflow-hidden ring-1 ring-inset ring-white/10">
                  <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
                  <div className="flex items-center gap-2 text-rose-100">
                    <span className="rounded-full bg-white/15 p-1.5">
                      <AlertOctagon className="h-4 w-4 text-white" />
                    </span>
                    <span className="text-xs font-extrabold uppercase tracking-widest">Total Annual Leak</span>
                  </div>

                  <div className="mt-4 text-4xl font-extrabold tracking-tight leading-none sm:text-5xl">
                    {moneyRange(perYearLow, perYearHigh)}
                  </div>

                  <div className="mt-8">
                    <div className="mb-2 flex items-end justify-between text-xs font-semibold text-rose-100">
                      <span>Pricing + Offer Efficiency</span>
                      <span className="text-white">GAP EXISTS</span>
                    </div>

                    <div className="relative h-4 w-full overflow-hidden rounded-full bg-black/25 ring-1 ring-inset ring-white/10">
                      <div className="absolute left-0 top-0 h-full w-[85%] rounded-l-full bg-white/80" />
                      <div className="absolute right-0 top-0 h-full w-[15%] rounded-r-full bg-red-500" />
                    </div>

                    <p className="mt-3 flex items-start gap-2 text-sm font-medium text-rose-50/95">
                      <TrendingDown className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Your competitors are capturing this money. You are not.</span>
                    </p>
                  </div>
                </Card>

                <Card>
                  <div className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">Monthly Cash Impact</div>
                  <div className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl">
                    {moneyRange(finalPerMonthLow, finalPerMonthHigh)}
                    <span className="ml-1 text-sm font-semibold text-zinc-400">/mo</span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">Money you should be keeping each month.</p>
                  <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">
                    Cost of waiting:{" "}
                    <span className="font-extrabold text-zinc-900">{moneyRange(perWeekLow, perWeekHigh)}</span>{" "}
                    <span className="text-zinc-500">per week</span>
                  </div>
                </Card>

                <Card>
                  <div className="text-xs font-extrabold uppercase tracking-wider text-zinc-500">Market Perception</div>
                  <div className="mt-2 text-xl font-extrabold tracking-tight text-zinc-900">
                    {perceptionLine}
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">
                    People hire you because you look cheaper or “good enough” — not because you look safest.
                  </p>
                  <div className="mt-4 text-xs text-zinc-500">
                    Built from {competitorCount || "—"} competitors and {proofCount || "—"} proof snippets.
                  </div>
                </Card>
              </div>
            </section>

            {/* Top leaks */}
            <section>
              <SectionHeader
                title="Where is the money going?"
                subtitle="We found the 3 biggest holes. Fix #1 first."
              />

              <div className="space-y-6">
                {topLeaks.length ? (
                  topLeaks.slice(0, 3).map((leak: any, idx: number) => {
                    const w = leakWeight(idx);
                    const impact = finalPerMonthLow === null ? null : Math.round(finalPerMonthLow * w);

                    return (
                      <div
                        key={idx}
                        className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md hover:border-zinc-300"
                      >
                        {/* Header */}
                        <div className="flex flex-col gap-3 border-b border-zinc-100 bg-zinc-50/60 p-5 sm:flex-row sm:items-center sm:gap-4 sm:p-6">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-base font-extrabold text-zinc-900 shadow-sm">
                            #{idx + 1}
                          </div>

                          <div className="min-w-0">
                            <h4 className="text-lg font-extrabold tracking-tight text-zinc-900">
                              {safeString(leak?.title, "Untitled issue")}
                            </h4>
                            <p className="mt-1 text-sm text-zinc-500">
                              This is costing you profit every month until it’s fixed.
                            </p>
                          </div>

                          <div className="sm:ml-auto">
                            <ImpactBadge value={moneyCompact(impact)} />
                          </div>
                        </div>

                        {/* Body */}
                        <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 md:grid-cols-2 md:gap-10">
                          <div>
                            <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-rose-600">
                              <AlertTriangle className="h-4 w-4" />
                              The problem
                            </div>
                            <p className="text-sm leading-relaxed text-zinc-800 font-medium">
                              {safeString(leak?.why_it_matters, "—")}
                            </p>
                          </div>

                          <div>
                            <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-emerald-600">
                              <CheckCircle2 className="h-4 w-4" />
                              What competitors do instead
                            </div>
                            <p className="text-sm leading-relaxed text-zinc-700">
                              {safeString(leak?.market_contrast, "—")}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
                    No leaks were generated for this run.
                  </div>
                )}
              </div>
            </section>

            {/* Offer rebuild */}
            <section>
              <SectionHeader
                title="What to add (so you can charge more)"
                subtitle="These are simple, proven “add-ons” that help competitors justify higher prices and win better customers."
              />

              {offers.length ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {offers.slice(0, 6).map((o: any, i: number) => (
                    <Card key={i} className="bg-white">
                      <div className="text-sm font-extrabold text-zinc-900">{safeString(o?.title, "Untitled")}</div>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-600">{safeString(o?.content, "")}</p>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="bg-white">
                  <div className="text-sm text-zinc-600">No offer rebuild items were generated.</div>
                </Card>
              )}
            </section>

            {/* Competitor table */}
            <section>
              <SectionHeader
                title="Local competitor comparison"
                subtitle="This is what customers see when they compare you. (Public info pulled from their sites.)"
              />

              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-zinc-50/80 text-xs uppercase font-extrabold text-zinc-500">
                      <tr>
                        <th className="px-6 py-4">Business</th>
                        <th className="px-6 py-4">Trip fee</th>
                        <th className="px-6 py-4">Membership</th>
                        <th className="px-6 py-4">Warranty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {competitors.slice(0, 10).map((c: any, i: number) => (
                        <tr key={i} className="hover:bg-zinc-50/60 transition">
                          <td className="px-6 py-4 font-semibold text-zinc-900">
                            {c?.url ? (
                              <a
                                href={safeString(c.url)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 hover:text-blue-700"
                              >
                                {safeString(c?.name, "Unknown")}
                                <ExternalLink className="h-3 w-3 text-zinc-400" />
                              </a>
                            ) : (
                              safeString(c?.name, "Unknown")
                            )}
                            {c?.url ? (
                              <div className="mt-1 text-xs font-medium text-zinc-400">{shortHost(safeString(c.url))}</div>
                            ) : null}
                          </td>
                          <td className="px-6 py-4 text-zinc-700">{safeString(c?.trip_fee, "—")}</td>
                          <td className="px-6 py-4 text-zinc-700">{safeString(c?.membership_offer, "—")}</td>
                          <td className="px-6 py-4 text-zinc-700">{safeString(c?.warranty_offer, "—")}</td>
                        </tr>
                      ))}
                      {!competitors.length ? (
                        <tr>
                          <td className="px-6 py-6 text-sm text-zinc-500" colSpan={4}>
                            No competitors were extracted for this run.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Evidence locker */}
            <section>
              <SectionHeader
                title="Verified source data"
                subtitle={`We pulled ${proofCount} specific snippets from competitor pages. Open any item to verify.`}
                right={
                  <div className="text-xs font-semibold text-zinc-400">
                    <span className="inline-flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Evidence log
                    </span>
                  </div>
                }
              />

              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-6 py-3">
                  <div className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">
                    Proof locker
                  </div>
                  <div className="text-xs text-zinc-400">Captured: {new Date().toLocaleDateString()}</div>
                </div>

                <div className="divide-y divide-zinc-100">
                  {evidence.length ? (
                    evidence.map((e: any, i: number) => {
                      const sourceUrl = safeString(e?.source_url, "");
                      const label = evidenceTypeLabel(safeString(e?.type, ""));
                      const who = inferCompetitorNameFromUrl(sourceUrl, competitors);

                      return (
                        <details key={i} className="group">
                          <summary className="cursor-pointer list-none px-6 py-5 hover:bg-zinc-50/60 transition">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex w-28 justify-center rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-extrabold text-zinc-600 ring-1 ring-inset ring-zinc-500/10">
                                    {label}
                                  </span>
                                  <span className="text-xs font-extrabold text-zinc-900">{who}</span>
                                  <span className="text-xs text-zinc-300">•</span>
                                  <span className="text-xs text-zinc-500 truncate max-w-[52ch]">
                                    {shortHost(sourceUrl)}
                                  </span>
                                </div>

                                <div className="mt-2 text-sm text-zinc-700 line-clamp-2">
                                  “{safeString(e?.snippet, "—").replace(/\s+/g, " ").trim()}”
                                </div>
                              </div>

                              {sourceUrl ? (
                                <a
                                  href={sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-extrabold text-blue-700 hover:underline"
                                  onClick={(ev) => ev.stopPropagation()}
                                >
                                  Verify source <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <span className="text-xs text-zinc-400">No source URL</span>
                              )}
                            </div>
                          </summary>

                          <div className="px-6 pb-6">
                            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                              <div className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">
                                Raw snippet
                              </div>
                              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 font-mono">
                                {safeString(e?.snippet, "—")}
                              </p>
                            </div>
                          </div>
                        </details>
                      );
                    })
                  ) : (
                    <div className="px-6 py-10 text-center text-sm text-zinc-500">
                      No evidence was extracted for this run.
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* “Later” actions (optional, keeps page useful) */}
            {doLater.length ? (
              <section>
                <SectionHeader
                  title="After you fix the first 3"
                  subtitle="These are the next moves (still important, just not urgent)."
                />
                <Card>
                  <ol className="list-decimal pl-5 text-sm text-zinc-700 space-y-2">
                    {doLater.map((x, i) => (
                      <li key={i} className="leading-relaxed">{x}</li>
                    ))}
                  </ol>
                </Card>
              </section>
            ) : null}
          </div>

          {/* RIGHT (sticky plan) */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 space-y-6">
              {/* Plan card */}
              <div className="rounded-2xl bg-blue-900 p-6 text-white shadow-xl ring-1 ring-blue-900">
                <div className="mb-4 flex items-start gap-3 border-b border-white/10 pb-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-lg font-extrabold tracking-tight">Your Plan</div>
                    <div className="text-xs font-semibold text-blue-200">72-hour turnaround</div>
                  </div>
                </div>

                <p className="mb-6 text-sm leading-relaxed text-blue-100">
                  Stop the bleeding first. Do these 3 things this week to recover{" "}
                  <span className="font-extrabold text-white border-b border-white/30">
                    ~{moneyCompact(finalPerMonthLow)}/mo
                  </span>
                  .
                </p>

                <ul className="space-y-4">
                  {doFirst.length ? (
                    doFirst.map((action, i) => (
                      <li key={i} className="flex gap-3">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-300/50 text-[11px] font-extrabold text-blue-100">
                          {i + 1}
                        </div>
                        <span className="text-sm font-semibold leading-relaxed text-white">{action}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-blue-200">No urgent actions generated.</li>
                  )}
                </ul>

                {/* Keep CTA but make it non-breaking (no mock behavior) */}
                <div className="mt-8">
                  <button
                    type="button"
                    className="w-full rounded-xl bg-white py-3 text-sm font-extrabold text-blue-900 hover:bg-blue-50 transition shadow-sm"
                    onClick={() => {
                      // Placeholder: wire to your email flow later.
                      // This won't break SSR builds and won't show mock data.
                      alert("Email flow not connected yet. (We’ll wire this next.)");
                    }}
                  >
                    Send This Plan To My Email
                  </button>
                </div>

                <div className="mt-4 text-xs text-blue-200">
                  Tip: forward this to your office manager. It’s designed to be “doable”.
                </div>
              </div>

              {/* Trust card */}
              <Card>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100">
                    <Search className="h-5 w-5 text-zinc-700" />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-zinc-900">Why trust this?</div>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                      This isn’t guessing. We pulled public pricing / membership / warranty info from{" "}
                      <span className="font-extrabold text-zinc-900">{competitorCount || "—"}</span> direct competitors and logged{" "}
                      <span className="font-extrabold text-zinc-900">{proofCount || "—"}</span> proof snippets.
                      This is what your market is doing right now.
                    </p>
                  </div>
                </div>
              </Card>

              {/* Quick context (keeps it “official”) */}
              <Card>
                <div className="text-xs font-extrabold uppercase tracking-wide text-zinc-500">Report notes</div>
                <div className="mt-2 text-sm text-zinc-700 space-y-2">
                  <div>
                    <span className="font-extrabold text-zinc-900">Confidence:</span>{" "}
                    {confidenceMeta(confidence).label}
                  </div>
                  <div>
                    <span className="font-extrabold text-zinc-900">Market position:</span>{" "}
                    {marketPosition || "Not detected"}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Numbers are ranges (not fantasy precision). We use ranges so you can act safely and fast.
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
