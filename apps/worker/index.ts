import PgBoss from 'pg-boss';
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI } from "@google/genai";
import { ExtractedDataSchema, ExtractedData } from '../../shared/schema/extractor.zod';
import { ReportSchema } from '../../shared/schema/report.zod';
import { computeBenchmark } from '../../lib/scoring';
import { nanoid } from 'nanoid';

// --- CONFIG ---
const DATABASE_URL = process.env.DATABASE_URL!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

if (!DATABASE_URL || !GEMINI_API_KEY) {
  console.error("Missing env vars: DATABASE_URL or GEMINI_API_KEY");
  (process as any).exit(1);
}

const prisma = new PrismaClient();
const boss = new PgBoss(DATABASE_URL);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// --- HELPERS (Step 2: reliability) ---
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); })
     .catch((e) => { clearTimeout(t); reject(e); });
  });
}

function safeJsonParse(text: string): any | null {
  try { return JSON.parse(text); } catch { return null; }
}

// --- PROMPTS ---
const RESEARCH_PROMPT = `
You are a senior market researcher. Find 6-10 direct competitors for a specific business in a specific location.
Focus on extracting SPECIFIC EVIDENCE of pricing, diagnostic fees, memberships, and warranties.
If specific pricing isn't on the homepage, look for "pricing", "services", "membership", "financing", "warranty", or "about" pages.

Output format: Plain text with URLs and extracted raw snippets.
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
      "evidence_ids": ["e1","e2"]
    }
  ],
  "evidence": [
    {
      "id": "e1",
      "source_url": "https://example.com/page",
      "snippet": "raw text snippet copied from the page",
      "type": "pricing|service|reputation|guarantee|other"
    }
  ]
}
`;

const EXTRACTOR_PROMPT = `
You are a strict data extractor.

TASK:
Convert the provided research text into JSON ONLY, matching EXACTLY the following shape:

${EXTRACTOR_JSON_SHAPE}

RULES:
- Return ONLY JSON. No markdown. No commentary.
- NEVER omit keys. If unknown, use null for nullable fields and [] for arrays.
- Every competitor should have evidence_ids (can be empty []).
- Every evidence item MUST have id, source_url, snippet, type.
- type MUST be one of: pricing, service, reputation, guarantee, other.
`;

// Composer prompt stays blunt but JSON must match ReportSchema defaults
const COMPOSER_PROMPT = `
You are "Profit Leak Attorney", a confident, blunt, high-ticket consultant.
Write a strategic audit report based on the provided client data, competitor analysis, and computed benchmarks.
Tone: Expert, no-nonsense, "fixer" vibe. No fluff.

Return JSON with keys:
- quick_verdict
- scorecard_rows
- offer_rebuild
- scripts
- next_7_days
- assumptions_ledger

Return ONLY JSON.
`;

// --- WORKER LOGIC ---
async function runAuditJob(job: any) {
  const { caseId, jobId } = job.data;
  console.log(`[Job ${jobId}] Starting audit for Case ${caseId}`);

  try {
    const caseData = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseData) throw new Error("Case not found");

    const updateStage = async (stage: string, progress: number) => {
      await prisma.job.update({
        where: { id: jobId },
        data: { stage, progress }
      });
      console.log(`[Job ${jobId}] ${stage} (${progress}%)`);
    };

    // -------------------------
    // STAGE 1: RESEARCH
    // -------------------------
    await updateStage("Competitor Discovery", 10);

    const vitals = caseData.vitals as any;
    const query = `${caseData.whatTheySell} companies in ${caseData.location} pricing membership reviews`;

    const researchResult = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `SEARCH QUERY: ${query}\n\n${RESEARCH_PROMPT}`,
        config: { tools: [{ googleSearch: {} }] }
      }),
      45000,
      "Research"
    );

    const researchText = researchResult.text || "";

    const groundingChunks =
      researchResult.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    const groundingUrls = groundingChunks
      .map((c: any) => c.web?.uri)
      .filter((u: any) => u);

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const textUrls = researchText.match(urlRegex) || [];

    const allSourceUrls = Array.from(new Set([...groundingUrls, ...textUrls]));

    // -------------------------
    // STAGE 2: EXTRACTION (Step 2 hardened)
    // -------------------------
    await updateStage("Evidence Extraction", 40);

    const extractorInput = `
RAW RESEARCH:
${researchText}

SOURCES FOUND:
${allSourceUrls.join(', ')}
`;

    const callExtractor = async (prompt: string) => {
      return await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: { responseMimeType: "application/json" }
        }),
        45000,
        "Extractor"
      );
    };

    let extractedData: ExtractedData | null = null;

    // Attempt 1
    const extractorResult1 = await callExtractor(EXTRACTOR_PROMPT + "\n\n" + extractorInput);
    const json1 = safeJsonParse(extractorResult1.text || "");
    if (json1) {
      try {
        extractedData = ExtractedDataSchema.parse(json1);
      } catch (e) {
        extractedData = null;
      }
    }

    // Attempt 2 (Repair)
    if (!extractedData) {
      console.error("Extractor output invalid. Retrying with repair prompt...");
      const repairPrompt =
        `Your previous output was invalid or missing required keys.\n` +
        `Return ONLY valid JSON matching EXACTLY this shape:\n${EXTRACTOR_JSON_SHAPE}\n\n` +
        `Rules: never omit keys, unknown => null or [], type must be one of pricing|service|reputation|guarantee|other.\n\n` +
        `Now re-extract from this input:\n${extractorInput}`;

      const extractorResult2 = await callExtractor(repairPrompt);
      const json2 = safeJsonParse(extractorResult2.text || "");
      if (json2) {
        try {
          extractedData = ExtractedDataSchema.parse(json2);
        } catch (e) {
          extractedData = null;
        }
      }
    }

    // Final fallback (never fail job)
    if (!extractedData) {
      console.error("Extractor failed twice. Using empty extracted data fallback.");
      extractedData = ExtractedDataSchema.parse({ competitors: [], evidence: [] });
    }

    // -------------------------
    // STAGE 3: BENCHMARKING
    // -------------------------
    await updateStage("Benchmarking", 70);
    const benchmark = computeBenchmark(vitals, extractedData);

    // -------------------------
    // STAGE 4: COMPOSER
    // -------------------------
    await updateStage("Report Composition", 85);

    const composerInput = JSON.stringify({
      client: { ...caseData, vitals },
      market_data: extractedData,
      benchmark
    });

    const composerResult = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: COMPOSER_PROMPT + "\n\n" + composerInput,
        config: { responseMimeType: "application/json" }
      }),
      60000,
      "Composer"
    );

    let rawComposer: any = {};
    try {
      rawComposer = JSON.parse(composerResult.text || "{}");
    } catch (e) {
      console.error("Composer JSON parse failed. Using empty object.");
      rawComposer = {};
    }

    const reportContent = ReportSchema.parse(rawComposer);

    // -------------------------
    // FINAL REPORT
    // -------------------------
    const finalReport = {
      meta: {
        generated_at: new Date().toISOString(),
        confidence: benchmark.confidence,
      },
      ...reportContent,
      benchmark_data: benchmark,
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

    console.log(`[Job ${jobId}] Finished successfully.`);

  } catch (error: any) {
    console.error(`[Job ${jobId}] Failed:`, error);
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error: error?.message || "Unknown error",
        finishedAt: new Date()
      }
    });
  }
}

async function start() {
  await boss.start();
  await boss.work('audit-job', runAuditJob);
  console.log('Worker started. Waiting for jobs...');
}

start().catch(err => {
  console.error(err);
  (process as any).exit(1);
});
