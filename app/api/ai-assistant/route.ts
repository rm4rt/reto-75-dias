import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const GEMINI_MODEL = "gemini-1.5-flash";
const MAX_RETRIES  = 3;

const SYSTEM_PROMPT = `
Eres un asistente de salud especializado en ayuno intermitente y nutrición práctica.

Reglas:
- Responde siempre en español.
- Sé breve y directo: máximo 5 líneas.
- Da consejos prácticos y accionables.
- Temas permitidos: ayuno intermitente, recetas saludables, qué comer al romper el ayuno, qué hacer cuando se siente hambre durante el ayuno.
- Si la pregunta implica un diagnóstico médico, síntomas graves o medicación, responde con cautela y recomienda consultar a un profesional de salud.
- No hagas diagnósticos médicos bajo ninguna circunstancia.
`.trim();

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Extracts the HTTP status code from a Gemini SDK error.
 * The SDK may expose it as .status, .statusCode, or .code — check those first
 * before falling back to substring matching on the string representation.
 */
function getErrorStatus(err: unknown): number | null {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    for (const key of ["status", "statusCode", "code"]) {
      if (typeof e[key] === "number") return e[key] as number;
    }
  }
  // Fallback: look for a bare HTTP status code in the string
  const match = String(err).match(/\b([45]\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

function isRateLimitError(err: unknown): boolean {
  const status = getErrorStatus(err);
  if (status === 429) return true;
  const s = String(err);
  return s.includes("RESOURCE_EXHAUSTED") || s.includes("quota") || s.includes("429");
}

function isNonRetryableError(err: unknown): boolean {
  const status = getErrorStatus(err);
  if (status !== null) return status === 400 || status === 401 || status === 403 || status === 404 || status === 500;
  return false;
}

function extractRetryDelay(err: unknown): number | null {
  const match = String(err).match(/"retryDelay"\s*:\s*"(\d+)s"/);
  return match ? parseInt(match[1], 10) * 1000 : null;
}

function logError(label: string, err: unknown) {
  const status = getErrorStatus(err);
  const isObj  = err && typeof err === "object";
  console.error(`[ai-assistant] ${label}`, {
    type:    isObj ? (err as object).constructor?.name : typeof err,
    status,
    message: err instanceof Error ? err.message : String(err),
  });
}

// ── Retry wrapper ─────────────────────────────────────────────────────────────

async function fetchWithRetry(ai: GoogleGenAI, prompt: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      console.log(`[ai-assistant] attempt ${attempt + 1}/${MAX_RETRIES} — model: ${GEMINI_MODEL}`);
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });
      const answer = response.text?.trim();
      if (!answer) throw new Error("Empty response from Gemini");
      return answer;
    } catch (err) {
      lastError = err;
      logError(`attempt ${attempt + 1} failed`, err);

      if (isNonRetryableError(err)) {
        console.error("[ai-assistant] non-retryable error, aborting");
        throw err;
      }

      if (!isRateLimitError(err)) {
        console.error("[ai-assistant] unknown error type, aborting");
        throw err;
      }

      if (attempt < MAX_RETRIES - 1) {
        const retryDelay = extractRetryDelay(err);
        const backoff    = Math.min(retryDelay ?? Math.pow(2, attempt) * 1000, 3000);
        console.warn(`[ai-assistant] rate limited — retrying in ${backoff}ms`);
        await sleep(backoff);
      }
    }
  }

  throw lastError;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Parse body
  let question: string | undefined;
  let preset: number | undefined;
  try {
    const body = await req.json();
    question = body?.question;
    preset   = body?.preset;
  } catch {
    return NextResponse.json({ error: "Solicitud malformada." }, { status: 400 });
  }

  if (!question || typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "Pregunta vacía." }, { status: 400 });
  }

  // 2. Validate env
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[ai-assistant] GEMINI_API_KEY is not set");
    return NextResponse.json({ error: "API key no configurada." }, { status: 500 });
  }

  // 3. Build prompt
  const context = preset ? `El usuario está haciendo un ayuno de ${preset} horas.` : "";
  const prompt  = [SYSTEM_PROMPT, context, `Pregunta: ${question.trim()}`]
    .filter(Boolean)
    .join("\n\n");

  // 4. Call Gemini with retry
  try {
    const ai     = new GoogleGenAI({ apiKey });
    const answer = await fetchWithRetry(ai, prompt);
    return NextResponse.json({ answer });
  } catch (err) {
    logError("final error", err);
    const status = getErrorStatus(err);

    if (isRateLimitError(err)) {
      return NextResponse.json(
        { error: "Cuota de IA agotada. Inténtalo en unos segundos." },
        { status: 429 }
      );
    }

    if (status === 404 || String(err).toLowerCase().includes("not found")) {
      return NextResponse.json(
        { error: "Modelo de IA no disponible." },
        { status: 502 }
      );
    }

    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: "API key inválida o sin permisos." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "Error inesperado al contactar con Gemini.", detail: String(err) },
      { status: 502 }
    );
  }
}
