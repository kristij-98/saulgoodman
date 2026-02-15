import PgBoss from 'pg-boss';
import { PrismaClient } from '@prisma/client';
import { GoogleGenAI } from "@google/genai";
import { IntakeSchema, ExtractedDataSchema, ExtractedData } from '../../shared/schema/extractor.zod';
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

// --- PROMPTS ---
const RESEARCH_PROMPT = `
You are a senior market researcher. Find 6-10 direct competitors for a specific business in a specific location.
Focus on extracting SPECIFIC EVIDENCE of pricing, diagnostic fees, memberships, and warranties.
If specific pricing isn't on the homepage, look for "pricing", "services", or "about" pages.

Output format: Plain text with URLs and extracted raw snippets.
`;

const EXTRACTOR_PROMPT = `
Convert the provided research text into strict JSON format matching the following schema.
Extract 'evidence' separately. Every claim in 'competitors' must reference an evidence_id.
Return ONLY JSON.
`;

const COMPOSER_PROMPT = `
You are "Profit Leak Attorney", a confident, blunt, high-ticket consultant.
Write a strategic audit report based on the provided client data, competitor analysis, and computed benchmarks.
Tone: Expert, no-nonsense, "fixer" vibe. No fluff.

Return valid JSON with these keys:
- quick_verdict: string (1-2 sentences)
- scorecard_rows: array of { label: string, score: string, notes: string }
- offer_rebuild: array of { title: string, content: string }
- scripts: array of { title: string, script_body: string }
- next_7_days: array of string
- assumptions_ledger: array of string
`;

// --- WORKER LOGIC ---

async function runAuditJob(job: any) {
  const { caseId, jobId } = job.data;
  console.log(`[Job ${jobId}] Starting audit for Case ${caseId}`);

  try {
    const caseData = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseData) throw new Error("Case not found");

    // Helper to update progress
    const updateStage = async (stage: string, progress: number) => {
      await prisma.job.update({
        where: { id: jobId },
        data: { stage, progress }
      });
      console.log(`[Job ${jobId}] ${stage} (${progress}%)`);
    };

    // --- STAGE 1: Research (Call A) ---
    await updateStage("Competitor Discovery", 10);
    
    // We construct a query based on input
    const vitals = caseData.vitals as any;
    const query = `${caseData.what_they_sell} companies in ${caseData.location} pricing membership reviews`;
    
    const researchResult = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: `SEARCH QUERY: ${query}\n\n${RESEARCH_PROMPT}`
    });
    
    const researchText = researchResult.text || "";
    
    // Fallback: extracting any URL-like strings from text
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const sourceUrls = researchText.match(urlRegex) || [];

    await updateStage("Evidence Extraction", 40);

    // --- STAGE 2: Extractor (Call B) ---
    // Prepare context for extractor
    const extractorInput = `
      RAW RESEARCH:
      ${researchText}
      
      SOURCES FOUND:
      ${sourceUrls.join(', ')}
    `;

    const extractorResult = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: EXTRACTOR_PROMPT + "\n\n" + extractorInput,
        config: { responseMimeType: "application/json" }
    });

    const extractedJsonRaw = extractorResult.text || "{}";
    let extractedData: ExtractedData;
    
    try {
      extractedData = ExtractedDataSchema.parse(JSON.parse(extractedJsonRaw));
    } catch (e) {
      console.error("JSON Parse fail, retrying extraction...");
      throw new Error("Failed to parse competitor data");
    }

    await updateStage("Benchmarking", 70);

    // --- STAGE 3: Deterministic Scoring ---
    const benchmark = computeBenchmark(vitals, extractedData);

    // --- STAGE 4: Composer (Call C) ---
    await updateStage("Report Composition", 85);

    const composerInput = JSON.stringify({
      client: {
        ...caseData,
        vitals
      },
      market_data: extractedData,
      benchmark: benchmark
    });

    const composerResult = await ai.models.generateContent({
         model: 'gemini-1.5-flash',
         contents: COMPOSER_PROMPT + "\n\n" + composerInput,
         config: { responseMimeType: "application/json" }
    });

    const reportContent = JSON.parse(composerResult.text || "{}");

    // Final Report Payload Construction
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

    // Save Report
    await prisma.report.create({
      data: {
        case_id: caseId,
        share_id: nanoid(10),
        payload_json: finalReport
      }
    });

    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'completed', progress: 100, finished_at: new Date() }
    });

    console.log(`[Job ${jobId}] Finished successfully.`);

  } catch (error: any) {
    console.error(`[Job ${jobId}] Failed:`, error);
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'failed', error: error.message, finished_at: new Date() }
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