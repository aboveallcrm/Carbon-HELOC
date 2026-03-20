import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
};

interface AIResult { text: string | null; provider: string; model: string; inputTokens: number; outputTokens: number; totalTokens: number; }
interface AIContext { supabase: ReturnType<typeof createClient>; userId: string; source: string; }

const COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gemini-2.0-flash": { input: 0.10, output: 0.40 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "claude-sonnet-4-20250514": { input: 3.00, output: 15.00 },
};

function estimateCost(model: string, inp: number, out: number): number {
  const r = COST_PER_MILLION[model] || { input: 1.0, output: 1.0 };
  return (inp * r.input + out * r.output) / 1_000_000;
}

function getProviderKeys(prefix: string): string[] {
  const keys: string[] = [];
  const base = Deno.env.get(prefix);
  if (base) keys.push(base);
  for (let i = 1; i <= 10; i++) { const k = Deno.env.get(`${prefix}_${i}`); if (k) keys.push(k); }
  return keys;
}

function logTokenUsage(ctx: AIContext, provider: string, model: string, inp: number, out: number, attempts: string[]): void {
  ctx.supabase.from("ai_token_usage").insert({
    user_id: ctx.userId, provider, model, input_tokens: inp, output_tokens: out,
    total_tokens: inp + out, estimated_cost: estimateCost(model, inp, out),
    source: ctx.source, edge_function: "parse-credit-report", cascade_attempts: attempts,
  }).then(() => {}).catch((e: unknown) => console.error("[token-usage] log failed:", e));
}

const NULL_RESULT: AIResult = { text: null, provider: "", model: "", inputTokens: 0, outputTokens: 0, totalTokens: 0 };

async function callGemini(apiKey: string, sys: string, msg: string, maxTok = 4096, temp = 0.2): Promise<AIResult> {
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents: [{ parts: [{ text: msg }] }], generationConfig: { temperature: temp, maxOutputTokens: maxTok } }),
    });
    if (!resp.ok) return { ...NULL_RESULT };
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    const u = data?.usageMetadata;
    return { text, provider: "gemini", model: "gemini-2.0-flash", inputTokens: u?.promptTokenCount || 0, outputTokens: u?.candidatesTokenCount || 0, totalTokens: u?.totalTokenCount || 0 };
  } catch { return { ...NULL_RESULT }; }
}

async function callGeminiVision(apiKey: string, sys: string, b64: string, mime: string, maxTok = 4096): Promise<AIResult> {
  try {
    const clean = b64.replace(/^data:[^;]+;base64,/, "");
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents: [{ parts: [{ inlineData: { mimeType: mime, data: clean } }, { text: "Extract all data from this document image." }] }], generationConfig: { temperature: 0.1, maxOutputTokens: maxTok } }),
    });
    if (!resp.ok) return { ...NULL_RESULT };
    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    const u = data?.usageMetadata;
    return { text, provider: "gemini", model: "gemini-2.0-flash", inputTokens: u?.promptTokenCount || 0, outputTokens: u?.candidatesTokenCount || 0, totalTokens: u?.totalTokenCount || 0 };
  } catch { return { ...NULL_RESULT }; }
}

async function callGroq(apiKey: string, sys: string, msg: string, maxTok = 4096): Promise<AIResult> {
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: sys }, { role: "user", content: msg }], temperature: 0.2, max_tokens: maxTok }),
    });
    if (!resp.ok) return { ...NULL_RESULT };
    const data = await resp.json(); const text = data?.choices?.[0]?.message?.content || null; const u = data?.usage;
    return { text, provider: "groq", model: "llama-3.3-70b-versatile", inputTokens: u?.prompt_tokens || 0, outputTokens: u?.completion_tokens || 0, totalTokens: u?.total_tokens || 0 };
  } catch { return { ...NULL_RESULT }; }
}

async function callOpenAI(apiKey: string, sys: string, msg: string, maxTok = 4096): Promise<AIResult> {
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: sys }, { role: "user", content: msg }], temperature: 0.2, max_tokens: maxTok }),
    });
    if (!resp.ok) return { ...NULL_RESULT };
    const data = await resp.json(); const text = data?.choices?.[0]?.message?.content || null; const u = data?.usage;
    return { text, provider: "openai", model: "gpt-4o-mini", inputTokens: u?.prompt_tokens || 0, outputTokens: u?.completion_tokens || 0, totalTokens: u?.total_tokens || 0 };
  } catch { return { ...NULL_RESULT }; }
}

async function callClaude(apiKey: string, sys: string, msg: string, maxTok = 4096): Promise<AIResult> {
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: maxTok, system: sys, messages: [{ role: "user", content: msg }] }),
    });
    if (!resp.ok) return { ...NULL_RESULT };
    const data = await resp.json(); const text = data?.content?.[0]?.text || null; const u = data?.usage;
    return { text, provider: "claude", model: "claude-sonnet-4-20250514", inputTokens: u?.input_tokens || 0, outputTokens: u?.output_tokens || 0, totalTokens: (u?.input_tokens || 0) + (u?.output_tokens || 0) };
  } catch { return { ...NULL_RESULT }; }
}

type AICallFn = (key: string, sys: string, msg: string, maxTok: number) => Promise<AIResult>;

async function callAICascade(ctx: AIContext, sys: string, msg: string, maxTok = 4096): Promise<AIResult & { cascadeAttempts: string[] }> {
  const attempts: string[] = [];
  const providers: [string, AICallFn][] = [["GEMINI_API_KEY", callGemini], ["GROQ_API_KEY", callGroq], ["OPENAI_API_KEY", callOpenAI], ["ANTHROPIC_API_KEY", callClaude]];
  for (const [prefix, fn] of providers) {
    const keys = getProviderKeys(prefix);
    for (let i = 0; i < keys.length; i++) {
      attempts.push(`${prefix.split("_")[0].toLowerCase()}[${i + 1}/${keys.length}]`);
      const r = await fn(keys[i], sys, msg, maxTok);
      if (r.text) { logTokenUsage(ctx, r.provider, r.model, r.inputTokens, r.outputTokens, attempts); return { ...r, cascadeAttempts: attempts }; }
    }
  }
  return { ...NULL_RESULT, cascadeAttempts: attempts };
}

async function callVisionCascade(ctx: AIContext, sys: string, b64: string, mime: string, maxTok = 4096): Promise<AIResult & { cascadeAttempts: string[] }> {
  const attempts: string[] = [];
  const keys = getProviderKeys("GEMINI_API_KEY");
  for (let i = 0; i < keys.length; i++) {
    attempts.push(`gemini-vision[${i + 1}/${keys.length}]`);
    const r = await callGeminiVision(keys[i], sys, b64, mime, maxTok);
    if (r.text) { logTokenUsage(ctx, r.provider, r.model, r.inputTokens, r.outputTokens, attempts); return { ...r, cascadeAttempts: attempts }; }
  }
  return { ...NULL_RESULT, cascadeAttempts: attempts };
}

/** Extract JSON from AI response — resilient to markdown fences and partial text */
function extractJSON(text: string): unknown {
  try { return JSON.parse(text); } catch { /* continue */ }
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) { try { return JSON.parse(jsonMatch[0]); } catch { /* continue */ } }
  const arrMatch = cleaned.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch { /* continue */ } }
  throw new Error("AI returned non-JSON response");
}

function parseCreditReportRegex(text: string): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};
  const scores: Record<string, number> = {};
  const rawScores: number[] = [];
  for (const m of [...text.matchAll(/parseFloat\('(\d{3,6})'\)/g)]) { let v = parseInt(m[1], 10); if (v > 1000) v = Math.round(v / 1000); if (v >= 300 && v <= 850) rawScores.push(v); }
  for (const { bureau, re } of [{ bureau: "equifax", re: /equifax[^0-9]{0,30}(\d{3})/gi }, { bureau: "transunion", re: /trans\s*union[^0-9]{0,30}(\d{3})/gi }, { bureau: "experian", re: /experian[^0-9]{0,30}(\d{3})/gi }]) {
    for (const m of [...text.matchAll(re)]) { const v = parseInt(m[1], 10); if (v >= 300 && v <= 850) { scores[bureau] = v; break; } }
  }
  if (!scores.equifax && !scores.transunion && !scores.experian && rawScores.length >= 3) { const u = [...new Set(rawScores)]; if (u.length >= 3) { scores.equifax = u[0]; scores.transunion = u[1]; scores.experian = u[2]; } }
  const sv = Object.values(scores).filter(v => v >= 300 && v <= 850);
  if (sv.length >= 3) { sv.sort((a, b) => a - b); scores.qualifying = sv[1]; } else if (sv.length === 2) { scores.qualifying = Math.min(...sv); } else if (sv.length === 1) { scores.qualifying = sv[0]; }
  if (Object.keys(scores).length > 0) result.creditScore = scores;
  const debts: Record<string, unknown>[] = [];
  for (const row of [...text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]) {
    const cells: string[] = []; for (const cell of [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]) { cells.push(cell[1].replace(/<[^>]*>/g, "").trim()); }
    if (cells.length < 4 || !cells.some(c => /\$[\d,]+/.test(c))) continue;
    const name = cells[0] || cells[1] || ""; if (!name || name.length < 2 || /^(creditor|name|account)/i.test(name)) continue;
    let balance = 0, payment = 0, type = "Other", status = "Open";
    for (const cell of cells) {
      const dm = cell.match(/\$?([\d,]+(?:\.\d{2})?)/); if (dm) { const v = parseFloat(dm[1].replace(/,/g, "")); if (v > 10000 && !balance) balance = v; else if (v > 0 && v < 10000 && !payment) payment = v; }
      if (/mortgage|mtg/i.test(cell)) type = "Mortgage"; else if (/auto|car/i.test(cell)) type = "Auto"; else if (/student/i.test(cell)) type = "Student Loan"; else if (/revolv|credit\s*card|visa|master/i.test(cell)) type = "Credit Card"; else if (/install/i.test(cell)) type = "Installment";
      if (/charge[\s-]*off/i.test(cell)) status = "Charge-Off"; else if (/collection/i.test(cell)) status = "Collection"; else if (/closed/i.test(cell)) status = "Closed";
    }
    if (name && (balance > 0 || payment > 0)) debts.push({ name, type, balance, payment, rate: 0, status });
  }
  const flaggedItems: string[] = [];
  for (const p of [/serious\s+delinquency/gi, /charge[\s-]*off/gi, /collection/gi, /bankruptcy/gi, /foreclosure/gi, /judgment/gi, /tax\s+lien/gi]) {
    const m = text.match(p); if (m) flaggedItems.push(m.length > 1 ? `${m.length} ${m[0].trim()} items` : m[0].trim());
  }
  if (debts.length > 0) { result.debts = debts; result.totalMonthlyDebt = debts.reduce((s, d) => s + ((d.payment as number) || 0), 0); result.totalBalance = debts.reduce((s, d) => s + ((d.balance as number) || 0), 0); }
  if (flaggedItems.length > 0) result.flaggedItems = [...new Set(flaggedItems)];
  if (!Object.keys(scores).length && debts.length < 3) return null;
  return result;
}

async function parseCreditReportAI(text: string, lang: string, ctx: AIContext): Promise<Record<string, unknown>> {
  const l = lang === "es" ? " Respond with Spanish labels." : "";
  const sys = `You are a credit report parser. Extract structured data from tri-merge credit reports.${l}\n\nReturn ONLY valid JSON with: creditScore (equifax, transunion, experian, qualifying), debts array [{name, type, balance, payment, rate, status}], flaggedItems, totalMonthlyDebt, totalBalance.\n\nRules: qualifying = middle of 3 scores. Include ALL trade lines. Numbers only (no $ or commas). rate=0 if not shown.`;
  const r = await callAICascade(ctx, sys, text.substring(0, 60000), 4096);
  if (!r.text) throw new Error("AI parsing failed - all providers unavailable");
  return extractJSON(r.text) as Record<string, unknown>;
}

async function handleCreditReport(text: string, lang: string, ctx: AIContext): Promise<Record<string, unknown>> {
  const regex = parseCreditReportRegex(text);
  if (regex?.debts && (regex.debts as unknown[]).length >= 3) return regex;
  return parseCreditReportAI(text, lang, ctx);
}

async function parseGenericAI(text: string, sys: string, ctx: AIContext, maxTok = 4096, truncLen = 50000): Promise<Record<string, unknown>> {
  const r = await callAICascade(ctx, sys, text.substring(0, truncLen), maxTok);
  if (!r.text) throw new Error("AI parsing failed - all providers unavailable");
  return extractJSON(r.text) as Record<string, unknown>;
}

async function parseWithVisionFallback(text: string, fileData: string | null, fileType: string | null, sys: string, ctx: AIContext, maxTok = 8192): Promise<Record<string, unknown>> {
  if (fileData && fileType && /image/.test(fileType)) {
    const v = await callVisionCascade(ctx, sys, fileData, fileType, maxTok);
    if (v.text) return extractJSON(v.text) as Record<string, unknown>;
  }
  if (text) return parseGenericAI(text, sys, ctx, maxTok);
  throw new Error("No data provided - upload an image or paste text");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/, "");
  if (!jwt) return new Response(JSON.stringify({ error: "Authorization required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user } } = await supabase.auth.getUser(jwt);
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const body = await req.json();
    const { source = "credit-report", text = "", fileType = null, fileData = null, lang = "en", clientData = null, channel = "wholesale", lockPeriod = "30" } = body;
    const ctx: AIContext = { supabase, userId: user.id, source };

    try {
      const { data: budget } = await supabase.rpc("get_or_create_token_budget", { p_user_id: user.id });
      if (budget?.[0]) { const b = budget[0]; if (b.budget_tokens_limit > 0 && b.budget_tokens_used >= b.budget_tokens_limit) return new Response(JSON.stringify({ error: "token_limit_reached", message: "Monthly AI token limit reached." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    } catch { /* budget check non-critical */ }

    if (source !== "client-analysis" && !text && !fileData) return new Response(JSON.stringify({ error: "No document data provided." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (fileData && fileData.length > 13_300_000) return new Response(JSON.stringify({ error: "File too large. Max 10MB." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let result: Record<string, unknown>;
    const l = lang === "es" ? " Respond in Spanish." : "";

    switch (source) {
      case "credit-report": result = await handleCreditReport(text, lang, ctx); break;
      case "rocket-liabilities": result = parseRocketLiabilities(text); break;
      case "rocket-pricing": result = await parseGenericAI(text, `You are a Rocket Pro TPO pricing page parser. Return ONLY valid JSON with scenario, products, rates, adjustments, fees, brokerComp.${l}`, ctx, 12288); break;
      case "bank-statement": result = await parseGenericAI(text, `You are a bank statement parser for mortgage underwriting. Return ONLY valid JSON with bankName, accountHolder, accountNumber, statementPeriod, openingBalance, closingBalance, totalDeposits, totalWithdrawals, deposits, withdrawals, flags, recurringObligations.${l}`, ctx, 8192); break;
      case "mortgage-statement": result = await parseGenericAI(text, `You are a mortgage statement parser. Return ONLY valid JSON with servicer, loanNumber, currentBalance, interestRate, totalMonthlyPayment, escrowBalance, propertyAddress, maturityDate, loanType.${l}`, ctx, 4096, 30000); break;
      case "competitor-le": result = await parseWithVisionFallback(text, fileData, fileType, `You are a CFPB Loan Estimate parser. Return ONLY valid JSON with lender, borrower, property, loanAmount, rate, term, product, monthlyPI, fees, cashToClose, apr, weaknesses.${l}`, ctx); break;
      case "competitor-rate-sheet": result = await parseWithVisionFallback(text, fileData, fileType, `You are a competitor rate sheet parser. Return ONLY valid JSON with lender, product, rateMatrix, fees.${l}`, ctx); break;
      case "trust-certificate": result = await parseGenericAI(text, `You are a trust certificate parser. Return ONLY valid JSON with trustName, trustType, dateEstablished, settlor, trustees, beneficiaries, trustProperties, keyProvisions, titleReview.${l}`, ctx, 8192, 60000); break;
      case "du-aus": result = await parseGenericAI(text, `You are a Fannie Mae DU findings parser. Return ONLY valid JSON with caseId, recommendation, riskClass, loanAmount, ltv, cltv, dti, creditScore, messages, conditions.${l}`, ctx, 8192); break;
      case "1003-xml": result = await parseGenericAI(text, `You are a MISMO 3.4 XML loan application parser. Return ONLY valid JSON with borrower, coBorrower, employment, property, loan, liabilities, assets, declarations.`, ctx, 8192, 80000); break;
      case "lender-rate-sheet": result = await parseWithVisionFallback(text, fileData, fileType, `You are a Rocket Pro TPO ${channel} rate sheet parser. Extract ${lockPeriod}-Day lock pricing. Return ONLY valid JSON with channel, lockPeriod, products, adjustments.`, ctx, 16384); break;
      case "client-analysis":
        if (!clientData) return new Response(JSON.stringify({ error: "No client data." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        result = await parseGenericAI(JSON.stringify(clientData).substring(0, 20000), `You are Ezra, an elite mortgage AI. Analyze client data. Return ONLY valid JSON with closingProbability, riskLevel, clientProfile, potentialIssues, howToOvercome, sellingPoints, recommendedProducts.${l}`, ctx, 4096, 20000);
        break;
      default: return new Response(JSON.stringify({ error: `Unknown source: ${source}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: `Parsing failed: ${message}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
