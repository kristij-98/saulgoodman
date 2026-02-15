import PgBoss from 'pg-boss';
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI } from "@google/genai";
import { ExtractedDataSchema, ExtractedData } from '../../shared/schema/extractor.zod';
import { ReportSchema } from '../../shared/schema/report.zod';
import { computeBenchmark } from '../../lib/scoring';
import { computeStrategicProfile } from '../../lib/strategy';
import { nanoid } from 'nanoid';

// ------------------------------------------------
// CONFIG
// ------------------------------------------------
const DATABASE_URL = process.env.DATABASE_URL!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

if (!DATABASE_URL || !GEMINI_API_KEY) {
  console.error("Missing env vars: DATABASE_URL or GEMINI_API_KEY");
  process.exit(1);
}

const prisma = new PrismaClient();
const boss = new PgBoss(DATABASE_URL);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ------------------------------------------------
// HELPERS
// ------------------------------------------------
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); })
     .catch(e => { clearTimeout(t); reject(e); });
  });
}

function safeJsonParse(text: string): any | null {
  try { return JSON.parse(text); } catch { return null; }
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function safeString(x: any) {
  if (typeof x === "string") return x;
  if (x == null) return "";
  return String(x);
}

// ------------------------------------------------
// PROMPTS (MAX FORENSIC — DO NOT DUMB DOWN)
// ------------------------------------------------

const RESEARCH_PROMPT = `
You are a forensic-grade competitive intelligence analyst.

Collect REAL competitor evidence for a paid audit.

DO NOT summarize.
DO NOT give advice.
ONLY extract factual evidence with URLs and snippets.

Find 6–10 DIRECT competitors.

PRIORITY DATA:
1) Service/diagnostic/trip fees
2) Published price ranges
3) Membership/maintenance plans
4) Warranty/guarantee terms
5) Financing offers
6) Premium positioning signals
7) Review signals

OUTPUT FORMAT:

COMPETITOR:
- name:
- primary_url:
- location_served:

EVIDENCE:
- [pricing] url: ... | snippet: "..."
- [trip_fee] url: ... | snippet: "..."
- [membership] url: ... | snippet: "..."
- [warranty] url: ... | snippet: "..."
- [financing] url: ... | snippet: "..."
- [premium] url: ... | snippet: "..."
- [reputation] url: ... | snippet: "..."

NOTES:
- pricing_visibility: public / partial / not_public
- missing_data: list missing areas

Repeat per competitor.
`;

const EXTRACTOR_JSON_SHAPE = `
{
  "competitors": [
    {
      "name": "string",
      "url": "string",
      "services": ["string"],
      "pricing_signals": ["string"],
      "trip_fee": null,
      "membership_offer": null,
      "warranty_offer": null,
      "premium_signals": ["string"],
      "evidence_ids": ["e1"]
    }
  ],
  "evidence": [
    {
      "id": "e1",
      "source_url": "https://example.com",
      "snippet": "raw copied snippet",
      "type": "pricing|service|reputation|guarantee|other"
    }
  ]
}
`;

const EXTRACTOR_PROMPT = `
You are a strict data extractor.

Convert the research into STRICT JSON.

Match EXACTLY this structure:

${EXTRACTOR_JSON_SHAPE}

Rules:
- Return ONLY JSON. No markdown. No commentary.
- Never omit keys. If unknown: null or [].
- evidence.type must be one of: pricing, service, reputation, guarantee, other.
- competitors[].evidence_ids MUST exist (can be []).
- competitors[].pricing_signals MUST exist (can be []).
- competitors[].premium_signals MUST exist (can be []).
- competitors[].services MUST exist (can be []).
`;

const COMPOSER_PROMPT = `
You are "Profit Leak Attorney".

You are not a marketer.
You are a strategic cross-examiner.

You have:
- Client vitals
- Competitor evidence (with proof)
- Benchmark scoring
- Strategic profile

Produce a sharp audit.

RULES:
- Compare client vs market directly.
- No generic advice.
- Short decisive sentences.
- Sound like a $25k consultant.
- If evidence is weak, SAY IT. Do not invent.
- Claims about market must tie back to competitor evidence patterns.

Return STRICT JSON:

{
  "quick_verdict": string,
  "market_position": string,
  "top_leaks_ranked": [
    { "title": string, "why_it_matters": string, "market_contrast": string }
  ],
  "scorecard_rows": [
    { "label": string, "score": string, "notes": string }
  ],
  "offer_rebuild": [
    { "title": string, "content": string }
  ],
  "scripts": [
    { "title": string, "script_body": string }
  ],
  "next_7_days": string[],
  "assumptions_ledger": string[]
}

Return ONLY JSON.
`;

// ------------------------------------------------
// WORKER
// ------------------------------------------------

async function runAuditJob(job: any) {
  const { caseId, jobId } = job.data;

  // Small helper: always persist “premium” progress info
  const setProgress = async (stage: string, progress: number, patchPayload?: any) => {
    // Merge payloadJson safely (without relying on old local job object)
    let currentPayload: any = {};
    try {
      const j = await prisma.job.findUnique({ where: { id: jobId } });
      currentPayload = (j?.payloadJson && typeof j.payloadJson === "object") ? j.payloadJson : {};
    } catch {
      currentPayload = {};
    }

    const nextPayload = patchPayload ? { ...currentPayload, ...patchPayload } : currentPayload;

    await prisma.job.update({
      where: { id: jobId },
      data: {
        stage,
        progress: clampInt(progress, 0, 100),
        payloadJson: nextPayload
      }
    });
  };

  try {
    const caseData = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseData) throw new Error("Case not found");

    const vitals = caseData.vitals as any;
    const base = `${caseData.whatTheySell} in ${caseData.location}`;

    // ------------------------------------------------
    // STAGE 1 — MAX FORENSIC MULTI-PASS RESEARCH (ANTI-FRAGILE)
    // ------------------------------------------------
    await setProgress("Initializing Market Intelligence Engine…", 5, {
      research_mode: "grounded",
      passes_completed: 0,
      total_passes: 0,
      grounded_sources_count: 0,
      current_query: ""
    });

    const queries = [
      `${base} pricing service call fee diagnostic trip fee`,
      `${base} membership maintenance plan tune-up club`,
      `${base} warranty guarantee workmanship parts`,
      `${base} financing options monthly payment`,
      `${base} reviews rating competitor`,
      `${base} premium service same day priority VIP`
    ];

    const totalPasses = queries.length;
    const researchChunks: string[] = [];
    const sourceUrls: string[] = [];

    let groundedSourcesTotal = 0;
    let researchMode: "grounded" | "degraded" = "grounded";
    const researchErrors: string[] = [];

    await setProgress("Scanning Market Landscape…", 10, {
      total_passes: totalPasses
    });

    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];

      // premium progress BEFORE pass
      await setProgress(
        `Scanning Market Landscape… (Pass ${i + 1}/${totalPasses})`,
        10 + Math.floor(((i) / totalPasses) * 20),
        {
          passes_completed: i,
          current_query: q,
          grounded_sources_count: groundedSourcesTotal,
          research_mode: researchMode
        }
      );

      try {
        const res = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `SEARCH QUERY: ${q}\n\n${RESEARCH_PROMPT}`,
            config: { tools: [{ googleSearch: {} }] }
          }),
          60000,
          `Research Pass ${i + 1}`
        );

        const txt = res.text || "";
        researchChunks.push(`\n\n=== PASS ${i + 1} ===\nQUERY: ${q}\n${txt}`);

        const grounding =
          res.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

        const groundingUrls = grounding
          .map((c: any) => c.web?.uri)
          .filter((u: any) => u);

        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const textUrls = txt.match(urlRegex) || [];

        groundedSourcesTotal += groundingUrls.length;

        sourceUrls.push(...groundingUrls, ...textUrls);

      } catch (e: any) {
        researchMode = "degraded";
        researchErrors.push(`[Pass ${i + 1}] ${safeString(e?.message || e)}`);
        researchChunks.push(`\n\n=== PASS ${i + 1} FAILED ===\nQUERY: ${q}\nERROR: ${safeString(e?.message || e)}`);
      }

      // update after pass
      await setProgress(
        `Scanning Market Landscape… (Pass ${i + 1}/${totalPasses})`,
        10 + Math.floor(((i + 1) / totalPasses) * 20),
        {
          passes_completed: i + 1,
          current_query: q,
          grounded_sources_count: groundedSourcesTotal,
          research_mode: groundedSourcesTotal > 0 ? "grounded" : "degraded",
          research_errors: researchErrors
        }
      );
    }

    if (groundedSourcesTotal === 0) {
      researchMode = "degraded";
    }

    const researchText = researchChunks.join("\n");
    const allSourceUrls = Array.from(new Set(sourceUrls));

    // ------------------------------------------------
    // STAGE 2 — EXTRACTION (HARDENED)
    // ------------------------------------------------
    await setProgress("Extracting Price & Offer Signals…", 40, {
      extractor_attempt: 1,
      sources_found: allSourceUrls.length
    });

    const extractorInput = `
RAW RESEARCH:
${researchText}

SOURCE URLS (deduped):
${allSourceUrls.join("\n")}
`;

    const extractorCall = async (prompt: string) =>
      await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: { responseMimeType: "application/json" }
        }),
        60000,
        "Extractor"
      );

    let extractedData: ExtractedData | null = null;

    // Attempt 1
    try {
      const r1 = await extractorCall(EXTRACTOR_PROMPT + "\n\n" + extractorInput);
      const j1 = safeJsonParse(r1.text || "");
      if (j1) extractedData = ExtractedDataSchema.parse(j1);
    } catch {
      extractedData = null;
    }

    // Attempt 2 (repair)
    if (!extractedData) {
      await setProgress("Extracting Price & Offer Signals…", 45, {
        extractor_attempt: 2
      });

      const repairPrompt = `
Your previous output was invalid.

Return ONLY valid JSON matching EXACTLY this shape:

${EXTRACTOR_JSON_SHAPE}

Rules:
- NEVER omit keys.
- Unknown => null or [].
- evidence.type must be one of pricing|service|reputation|guarantee|other.

Re-extract from this input:

${extractorInput}
`.trim();

      try {
        const r2 = await extractorCall(repairPrompt);
        const j2 = safeJsonParse(r2.text || "");
        if (j2) extractedData = ExtractedDataSchema.parse(j2);
      } catch {
        extractedData = null;
      }
    }

    // Final fallback (job continues)
    if (!extractedData) {
      extractedData = { competitors: [], evidence: [] };
      await setProgress("Extracting Price & Offer Signals…", 48, {
        extractor_fallback_used: true
      });
    }

    // ------------------------------------------------
    // STAGE 3 — BENCHMARKING (DETERMINISTIC)
    // ------------------------------------------------
    await setProgress("Running Competitive Cross-Examination…", 70, {
      competitors_count: extractedData.competitors.length,
      evidence_count: extractedData.evidence.length
    });

    const benchmark = computeBenchmark(vitals, extractedData);

    // IMPORTANT: you do NOT have benchmark.delta in your ScoreResult.
    // We compute a safe delta locally for strategy (so no compile failures).
    const delta = {
      competitors_count: extractedData.competitors.length,
      pricing_evidence_count: extractedData.competitors.filter(c => (c.pricing_signals || []).length > 0).length,
      membership_competitor_count: extractedData.competitors.filter(c => !!c.membership_offer).length,
      trip_fee_competitor_count: extractedData.competitors.filter(c => !!c.trip_fee).length,
      warranty_competitor_count: extractedData.competitors.filter(c => !!c.warranty_offer).length,
      research_mode: researchMode,
      grounded_sources_count: groundedSourcesTotal
    };

    const strategicProfile = computeStrategicProfile(delta as any, vitals, benchmark as any);

    // ------------------------------------------------
    // STAGE 4 — COMPOSER (HARDENED)
    // ------------------------------------------------
    await setProgress("Constructing Strategic Verdict…", 85, {
      composer_model: "gemini-3-pro-preview",
      confidence: benchmark.confidence,
      research_mode: researchMode,
      grounded_sources_count: groundedSourcesTotal
    });

    const composerInput = JSON.stringify({
      client: { ...caseData, vitals },
      market_data: extractedData,
      benchmark,
      delta,
      strategic_profile: strategicProfile,
      diagnostics: {
        research_mode: researchMode,
        grounded_sources_count: groundedSourcesTotal,
        source_urls_count: allSourceUrls.length
      }
    });

    const composerCall = async () =>
      await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: COMPOSER_PROMPT + "\n\n" + composerInput,
          config: { responseMimeType: "application/json" }
        }),
        90000,
        "Composer"
      );

    let reportContent: any = {};
    try {
      const cr = await composerCall();
      reportContent = safeJsonParse(cr.text || "") || {};
    } catch {
      reportContent = {};
    }

    const validatedReport = ReportSchema.parse(reportContent);

    // ------------------------------------------------
    // SAVE REPORT
    // ------------------------------------------------
    const finalReport = {
      meta: {
        generated_at: new Date().toISOString(),
        confidence: benchmark.confidence,
        research_mode: researchMode,
        grounded_sources_count: groundedSourcesTotal,
        passes_total: totalPasses,
        sources_found: allSourceUrls.length,
        competitor_count: extractedData.competitors.length,
        evidence_count: extractedData.evidence.length
      },
      ...validatedReport,
      benchmark_data: benchmark,
      delta,
      strategic_profile: strategicProfile,
      evidence_drawer: extractedData.evidence,
      competitors: extractedData.competitors
    };

    await prisma.report.create({
      data: {
        caseId,
        shareId: nanoid(10),
        content: finalReport as any
      }
    });

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'completed', progress: 100, finishedAt: new Date() }
    });

  } catch (error: any) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: safeString(error?.message || error),
        finishedAt: new Date()
      }
    });
  }
}

async function start() {
  await boss.start();
  await boss.work('audit-job', runAuditJob);
  console.log("Worker started. Waiting for jobs...");
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
