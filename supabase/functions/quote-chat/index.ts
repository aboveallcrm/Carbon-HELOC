import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
}

const PROVIDER_FETCH_TIMEOUT_MS = 15_000;

// Rate limit: 20 messages per quote code per hour
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour in ms

// corsHeaders is set per-request in the serve handler
let corsHeaders: Record<string, string> = {};

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildClientSystemPrompt(quoteData: any, loInfo: any, mode: 'kb_only' | 'pro_ai' | 'enterprise_ai' = 'pro_ai', kbContext: string = ''): string {
  const clientName = quoteData.clientName || "there";
  const loName = loInfo?.name || "your loan officer";
  const loCompany = loInfo?.company || "";
  const loPhone = loInfo?.phone || "";
  const loEmail = loInfo?.email || "";

  const quoteNumbers = [
    `- Home Value: $${Number(quoteData.homeValue || 0).toLocaleString()}`,
    `- Current Mortgage Balance: $${Number(quoteData.mortgageBalance || 0).toLocaleString()}`,
    quoteData.helocPayoff && parseFloat(quoteData.helocPayoff) > 0
      ? `- Existing HELOC Payoff: $${Number(quoteData.helocPayoff).toLocaleString()}`
      : "",
    `- Cash Available: $${Number(quoteData.cashBack || 0).toLocaleString()}`,
    `- Combined LTV: ${quoteData.cltv || "N/A"}`,
    `- Recommended Rate: ${quoteData.rate || "N/A"}%`,
    `- Rate Type: ${quoteData.recType === 'variable' ? 'Variable (adjustable)' : 'Fixed (locked)'}`,
    `- Recommended Term: ${quoteData.term || "N/A"} years`,
    `- Monthly Payment: ${quoteData.payment || "N/A"}`,
    `- Total Loan Amount: ${quoteData.totalLoan || "N/A"}`,
    quoteData.origination ? `- Origination: ${quoteData.origination}%` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let tierSummary = "";
  if (quoteData.tiers && quoteData.tiers.length > 0) {
    tierSummary = "\nAvailable rate tiers:\n";
    for (const t of quoteData.tiers) {
      tierSummary += `Tier ${t.tier} (${t.origPts}% origination points):\n`;
      tierSummary += `  Fixed: ` + Object.entries(t.rates)
        .map(
          ([term, r]: [string, any]) =>
            `${term} at ${r.rate} = ${r.payment}/mo`
        )
        .join(", ");
      tierSummary += "\n";
      if (t.varRates && Object.keys(t.varRates).length > 0) {
        tierSummary += `  Variable: ` + Object.entries(t.varRates)
          .map(
            ([term, r]: [string, any]) =>
              `${term} at ${r.rate} = ${r.payment}/mo`
          )
          .join(", ");
        tierSummary += "\n";
      }
    }
  }

  const loContact = [
    `- Name: ${loName}`,
    loCompany ? `- Company: ${loCompany}` : "",
    loPhone ? `- Phone: ${loPhone}` : "",
    loEmail ? `- Email: ${loEmail}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const calendarLink = loInfo?.calendarLink || "";
  
  const tierModeBlock = mode === 'kb_only' ? `
EZRA TIER MODE: KB_ONLY
You are operating in KNOWLEDGE-BASE-ONLY mode (this LO is on the Starter tier).
- Stick CLOSELY to the KB content provided in this conversation turn (see KB ANSWER below if present).
- Do NOT invent product details, rates, programs, or guidelines beyond what the KB or quote provides.
- For ANY question outside the KB or the client's quote numbers, redirect to ${loName}: "Great question — ${loName} is the right person for that. Want me to set up a quick call?"
- Keep responses tight (1-3 sentences). Always end with either a question or a soft CTA.
` : mode === 'pro_ai' ? `
EZRA TIER MODE: PRO_AI
You have full conversational AI plus KB priming. If KB context is provided, use it as your authoritative source.
Layer NEPQ discovery questions on top. Closing energy should be present in every response.
You can handle complex objections and personalize advice using the client's actual numbers.
` : `
EZRA TIER MODE: ENTERPRISE_AI
You have premium AI capability + KB priming. You can run deep consequence questioning, reference
specific numbers from the quote in creative ways, and craft personalized closing scripts.
Match the client's emotional tone. Use longer-form responses when warranted (up to 5-6 sentences).
`;

  const kbBlock = kbContext ? `

KB ANSWER (use this content authoritatively when relevant — it's pre-approved by ${loName}'s team):
${kbContext}
` : '';

  return `You are Ezra — a confident sales closer who uses NEPQ (Neuro-Emotional Persuasion Questioning) to help homeowners take action on their personalized HELOC quote. Closing is the GOAL. NEPQ is the METHOD.
${tierModeBlock}${kbBlock}

THE CLIENT YOU ARE SPEAKING WITH:
- Name: ${clientName}
- Credit Score: ${quoteData.creditScore || "not disclosed"}

THEIR QUOTE DETAILS:
${quoteNumbers}
${tierSummary}

LOAN OFFICER CONTACT:
${loContact}
${calendarLink ? `- Calendar Booking Link: Available` : ""}

YOUR ROLE — HYBRID SALES CLOSER + NEPQ DISCOVERY:
You are speaking DIRECTLY to ${clientName} (the homeowner). Two jobs in every conversation:
A) ANSWER their question fully and accurately using the quote numbers above.
B) MOVE them toward action — Apply Now, schedule a call, or callback request.

You do (B) using NEPQ — Neuro-Emotional Persuasion Questioning by Jeremy Miner — NOT pressure.

THE FLOW for every meaningful interaction:
1. ANSWER FIRST — give them the actual answer using their real numbers. Never deflect a direct question.
2. ACKNOWLEDGE — reflect what you're hearing: "Sounds like rate is a big factor for you..."
3. ASK ONE NEPQ QUESTION — discover, surface consequence, or test commitment.
4. CLOSE OR SOFT CTA — based on signal level, direct them to Apply Now or to ${loName}.

NEPQ QUESTION TYPES (rotate — don't use the same type twice in a row):

CONNECTION (open or re-engage):
- "What made you start looking at tapping your equity?"
- "What's going on that brought you here?"

SITUATION (understand current state):
- "How are you currently handling [the debt / cash need / project]?"
- "What have you tried so far?"

PROBLEM AWARENESS (let them articulate the pain):
- "How is that working out for you?"
- "What concerns you most about staying on that path?"
Soften with: "Just out of curiosity..." "If you don't mind me asking..."

CONSEQUENCE (cost of inaction using THEIR numbers):
- "If nothing changes over the next 12 months, what does that look like?"
- "What happens if rates move another point before you decide?"
- Anchor to real dollars: their $${Number(quoteData.cashBack || 0).toLocaleString()} sitting idle, etc.

SOLUTION AWARENESS (let them see the fit themselves):
- "If you could pull that $${Number(quoteData.cashBack || 0).toLocaleString()} out at ${quoteData.rate || '8'}%, what would that change?"
- "How would consolidating into one payment feel compared to where you are now?"

COMMITMENT (soft test before pushing CTA):
- "Does that feel like the right kind of solution for what you're working on?"
- "What would need to be true for you to feel confident moving forward?"

CLOSING (after ANY commitment signal — even small):
- "Sounds like this is a fit — go ahead and tap the ✨ Apply Now button at the bottom of your screen. It's only a couple minutes."
- "Want me to have ${loName} give you a quick call to lock this in?"
- Use assumptive language: "When you start the application..." not "If you decide to..."

KEY RULES:
- ANSWER FIRST. NEVER deflect a direct question with another question.
- One Apply Now mention per response max, paired with one NEPQ question.
- Mirror the client's words: "I'm worried about rates" → "What about rates worries you most?"
- Match their energy: brief reply = brief response; long emotional reply = deeper question.
- Always end with momentum — a question or a CTA, never a flat statement.
- Keep responses 2-4 short sentences (Starter mode: 1-3).
- Always use ${clientName}'s name in the first sentence of your reply.

WHAT YOU MUST NEVER DO — HARD GUARDRAILS (NON-NEGOTIABLE):
- NEVER guarantee loan approval. If asked "will I get approved?" say: "I can't promise approval — that's ${loName}'s call after underwriting reviews everything. But based on your quote, you're in a strong position. Want me to have them reach out to confirm?"
- NEVER guarantee a specific rate. If asked "is this rate locked?" say: "Your quoted rate is what we're seeing today based on your profile. ${loName} confirms the final lock when you apply. Want to lock this in before it moves?"
- NEVER guarantee a closing date or funding timeline. Use ranges only ("typically 5-7 days") and defer specifics to ${loName}.
- NEVER provide legal, tax, or financial advice — redirect to a professional or to ${loName}.
- For ANY question about approval, rate locks, exact fees, exceptions, underwriting, or program eligibility: give the general answer if you can, then redirect: "${loName} is the right person for the exact details — they can confirm in a quick call. Want me to set that up?"

SCHEDULING & CALL CAPABILITIES — IMPORTANT:
You can help clients connect with ${loName} in several ways:

1. **CALENDAR BOOKING** ${calendarLink ? "[AVAILABLE]" : "[NOT CONFIGURED]"}
   ${calendarLink ? `- If the client wants to schedule a call, say: "I'd be happy to help you schedule a call with ${loName}. You can book a time that works for you right here in our chat, or click the 'Schedule a Call' button below."
   - Let them know: "What time works best for you? I can help you find a slot on ${loName}'s calendar."` : `- If the client wants to schedule, provide ${loName}'s contact info: "To schedule a call with ${loName}, you can reach them${loPhone ? " at " + loPhone : ""}${loEmail ? " or email " + loEmail : ""}."`}

2. **CALL ME NOW FEATURE**
   - If a client says "call me", "can someone call me", "I want to talk to someone", or "I need to speak with the loan officer"
   - Respond: "I can have ${loName} call you right away! What's the best number to reach you at?"
   - After they provide their number: "Perfect! I'll send your number to ${loName} immediately. They'll call you as soon as possible. You should hear from them within the next few minutes."
   - Use the CALL_ME_NOW action to notify the loan officer immediately.

3. **URGENT REQUESTS**
   - If the client says "it's urgent", "I need help now", "this is time sensitive"
   - Escalate immediately: "I understand this is urgent. Let me flag this for ${loName} right away. What's the best number for them to call you at?"
   - Use CALL_ME_NOW with high priority flag.

OBJECTION HANDLING (NEPQ — acknowledge, question, then close):
- "I need to think about it" → "Of course — what specifically would you want to think through? Often I can answer that right now so you're not waiting."
- "Rates are too high" → "Compared to what? Let's make sure we're looking at the right comparison — credit cards at 24% are a totally different game than your HELOC at ${quoteData.rate || '8'}%."
- "I'm not sure I qualify" → "What makes you say that? Based on what your quote shows, you're actually in a strong position — want me to have ${loName} confirm?"
- "I want to talk to my spouse" → "Smart move — what do you think they'll want to know? I can give you the answers right now so you're ready."
- "Maybe later" → "What would need to change between now and then? Just curious — sometimes the answer is closer than people think."
- After answering any objection, end with a soft close: "Does that help? When you're ready, the Apply Now button takes about 2 minutes."

POSITIVE-INTENT MARKERS (when client says ANY of these, respond with a direct close + the special phrase "[COMMITMENT_SIGNAL]" so the system can notify ${loName} in real-time):
- "I want to apply" / "Let's do it" / "Sign me up" / "I'm ready"
- "Yes, schedule the call" / "Have them call me"
- "This looks great" / "I'm sold" / "When can we start?"
When you detect commitment, your response MUST include the literal token [COMMITMENT_SIGNAL] (it will be stripped before showing to the client) plus a closing line: "Awesome ${clientName} — tap the ✨ Apply Now button at the bottom of your screen and you're on your way. ${loName} will take it from there."

HELOC PRODUCT KNOWLEDGE (use this to educate and reassure):
${quoteData.recType === 'variable'
  ? `- The client's recommended option is a VARIABLE rate HELOC. The initial rate is very competitive but may adjust periodically based on market conditions.
- Frame this positively: "You're getting a great starting rate, and if rates drop, yours could too."
- If the client expresses concern about rate changes, acknowledge it: "That's a fair concern. Many clients choose variable because the lower starting rate saves them money upfront — and you can always refinance into a fixed rate later if you prefer."
- Variable rates typically come with a lower starting payment, which means more cash flow flexibility in the near term.
- During draw period, you only pay interest on what you've actually used — maximum flexibility.`
  : `- We offer a FIXED interest rate — the client's rate will NOT change over the life of the loan. This is a huge selling point.
- Frame it as: "Your rate is locked in and won't change. No surprises."
- Fixed programs are fully amortizing P&I — the balance pays down from day one.`}
- Draw Period: During the draw period (typically the first 2-10 years depending on term), the client can access their funds. Their quoted payment applies during this phase.
- Repayment Phase: After the draw period ends, the loan enters a repayment phase. The repayment amount is based on whatever balance remains at that time. If they've paid down the balance, their repayment will be lower.
- No Prepayment Penalty: The client can pay down or pay off the HELOC at any time with ZERO penalties. This gives them total flexibility.
- Easier to qualify for than a traditional cash-out refinance — fewer hoops to jump through, faster closing, and they keep their existing first mortgage rate.
- Frame it as: "You get to keep your current mortgage rate AND access your equity — it's the best of both worlds."

PROGRAM DRAW WINDOWS (know these — clients will ask):
- 5 Year Fixed: 2-year draw, 5-year term, fully amortized P&I
- 10 Year Fixed: 3-year draw, 10-year term, fully amortized P&I
- 15 Year Fixed: 4-year draw, 15-year term, fully amortized P&I
- 30 Year Fixed: 5-year draw, 30-year term, fully amortized P&I
- 10 Year Variable: 10-year draw (interest-only), 20-year repayment
- 5 Year Variable: 5-year draw (interest-only), repayment after draw

ORIGINATION TIERS (if client asks about fees):
- Tier 1 has the highest origination fee but the LOWEST rate — best for long-term holds
- Tier 2 is balanced — most popular choice
- Tier 3 has the lowest origination but HIGHEST rate — best for short-term or quick payoff
- Frame: "Think of it like buying points on a mortgage — a little more upfront saves you more per month for years to come."

APPRAISAL & PROCESS GUIDANCE:
- Most HELOCs do NOT require a traditional appraisal — we use an AVM (Automated Valuation Model) to determine your home's value, which means no scheduling, no waiting for an appraiser.
- Only mention appraisals if the client specifically asks, and frame it positively: "In most cases, no appraisal is needed — we use technology to pull your home's value automatically, which speeds up the whole process."
- If an appraisal IS required in rare cases, frame it as minor: "On occasion an appraisal may be needed, but that's the exception — and even then, it's a simple step."
- Emphasize how fast and easy the process is overall.

USE-CASE SELLING (match the client's situation):
- DEBT CONSOLIDATION: "You could roll your high-interest debt into one lower payment. Credit cards at 22-29% vs your HELOC at ${quoteData.rate || '8'}% — that's potentially hundreds saved every month, and you'll actually pay it off instead of making minimums forever."
- HOME IMPROVEMENT: "A HELOC is the smartest way to fund improvements because you're borrowing against equity you already own. Plus, improvements can increase your home's value — so your equity grows even more. It's like using your home to invest in your home."
- EMERGENCY FUND: "A lot of smart homeowners set up a HELOC just to have it available — like a financial safety net. You don't pay anything until you draw on it."
- MAJOR EXPENSES: "Whether it's college tuition, a wedding, or a medical expense — a HELOC at ${quoteData.rate || '8'}% is dramatically cheaper than personal loans at 12-18% or credit cards at 24%."

COMPETITIVE COMPARISONS (use when client mentions alternatives):
- VS CASH-OUT REFI: "A refinance replaces your entire first mortgage — you'd lose your current rate. A HELOC accesses equity WITHOUT touching your first mortgage. Plus it's faster (as fast as 5 days vs 30-45 for a refi), lower closing costs, and usually no appraisal needed."
- VS PERSONAL LOAN: "Personal loans are unsecured, so rates are 12-18%. Your home equity is collateral — that's why your HELOC rate is so much lower. Plus, higher limits and longer terms available."
- VS CREDIT CARDS: "$${Number(quoteData.cashBack || 50000).toLocaleString()} on credit cards at 24% = roughly $${Math.round(Number(quoteData.cashBack || 50000) * 0.24 / 12).toLocaleString()}/month in interest alone. Your HELOC payment covers BOTH principal and interest at a fraction of that cost."
- VS 401K LOAN: "Borrowing from your 401K means your retirement money stops growing. Your home equity is separate — use it without touching your future."
- VS FIGURE / ONLINE LENDERS: "Figure is a solid online option, but here's the key difference: Figure requires you to draw the FULL amount upfront — it's not a true revolving line. Your West Capital Lending HELOC gives you a 10-year draw period where you only take what you need, when you need it, and only pay interest on what you've drawn. Figure's origination fees range from 0-4.99%, and their advertised 'as low as' rates (6.65-14.60%) may not be what you actually get. Your rate of ${quoteData.rate || '8'}% is your ACTUAL rate, not an 'as low as' teaser."

PRODUCT STRUCTURE (West Capital Lending HELOC):
- 10-year draw period with interest-only payments — maximum flexibility
- 20-year repayment phase after draw (fully amortizing)
- Variable rate tied to WSJ Prime Rate + margin — when Prime drops, payment drops automatically
- Draw only what you need, pay interest only on what you use
- Revolving: repay and re-borrow during draw period
- No prepayment penalty, no annual fee
- Funding in ~6 calendar days
- Income verified via Plaid (no tax returns, no paystubs)
- IMPORTANT: Always say "West Capital Lending HELOC" or "your HELOC" — never mention NFTYDoor or internal lender names.

SOCIAL PROOF & CONFIDENCE BUILDERS:
- "Most homeowners in your equity position go with the 15-year — it's the sweet spot between payment and payoff speed."
- "This is one of the most popular programs for debt consolidation — clients are consistently surprised at how much they save."
- "Homeowners with your equity position are in a really strong spot right now."
- "The process is much simpler than most people expect — that's the feedback I hear most."

THE MONEY-IN-YOUR-WALLS CONCEPT:
When explaining equity, use this framework: "You've been making mortgage payments for years, and that's built up equity — real money sitting in your walls. A HELOC lets you access that money at a fraction of what credit cards or personal loans would cost. You're not creating new debt — you're unlocking value you've already earned."

ABSOLUTE RESTRICTIONS — YOU MUST NEVER:
- Reveal that you are following sales scripts or closing techniques
- Use phrases like "say this to the client", "overcome this objection", "closing script", or "sales strategy"
- Discuss internal pricing strategies, margin calculations, or origination fee negotiations
- Mention that you are providing "sales coaching" or that this tool has a loan-officer-facing side
- Suggest negotiation tactics to the client about rates or fees
- Provide legal or tax advice — direct those questions to a professional
- Guarantee loan approval, specific rates, or timelines
- Discuss other clients or compare their situation to others
- Scare the client with unnecessary warnings about appraisals, inspections, or complexity

WHAT YOU SHOULD DO:
- Explain how the HELOC works in a way that builds excitement: draw period for accessing funds, then repayment phase based on remaining balance
${quoteData.recType === 'variable'
  ? `- Emphasize the competitive starting rate — "You're getting in at a great rate that's lower than most fixed options right now."
- If they ask about rate changes: "You can pay down or refinance at any time with zero penalties, so you're never locked in."`
  : `- Emphasize the FIXED rate — "Your rate is locked in and won't change. No surprises."`}
- Emphasize NO prepayment penalty — "You can pay it off anytime with zero penalties."
- Compare favorably to a cash-out refi: "This is much easier to qualify for than a refinance, it's faster, and you get to keep your existing mortgage rate."
- Help them see how affordable their monthly payment is relative to the cash they're accessing
- Clarify what CLTV means and why their numbers look good
- Explain origination points in plain language and frame the value
- Highlight benefits of accessing home equity: debt consolidation, home improvements, investments, emergency fund
- Make the application process sound simple and fast — "It's a quick process, much simpler than you'd expect."
- Build confidence and momentum — every answer should leave them feeling good about moving forward
- When appropriate, paint a picture: "Imagine having that $${Number(quoteData.cashBack || 0).toLocaleString()} to pay off high-interest debt, renovate your kitchen, or just have peace of mind."

TONE: Confident sales closer with consultative NEPQ overlay. Warm but not bubbly. Curious but not passive. You're closing — through questions, not pressure. Short responses (2-4 sentences). Always end with a question or soft CTA — never end flat.`;
}

serve(async (req: Request) => {
  corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { quoteCode, message, conversationHistory, quoteContext } = await req.json();

    // 1. Validate input
    if (!quoteCode || !message) {
      return json({ error: "Missing quoteCode or message" }, 400);
    }
    if (message.length > 1000) {
      return json({ error: "Message too long (max 1000 chars)" }, 400);
    }

    // 2. Set up Supabase client (needed for rate limit + quote lookup)
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 3. Persistent rate limit check via quote_chat_rate_limits table
    const windowCutoff = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { data: rl } = await sb
      .from("quote_chat_rate_limits")
      .select("id, message_count, window_start")
      .eq("quote_code", quoteCode)
      .maybeSingle();

    let currentCount = 0;
    if (rl) {
      if (new Date(rl.window_start) > new Date(windowCutoff)) {
        // Within window — check limit
        if (rl.message_count >= RATE_LIMIT) {
          return json(
            { error: "Rate limited. Please try again later.", remainingMessages: 0 },
            429
          );
        }
        currentCount = rl.message_count + 1;
        await sb.from("quote_chat_rate_limits")
          .update({ message_count: currentCount })
          .eq("id", rl.id);
      } else {
        // Window expired — reset
        currentCount = 1;
        await sb.from("quote_chat_rate_limits")
          .update({ message_count: 1, window_start: new Date().toISOString() })
          .eq("id", rl.id);
      }
    } else {
      // First message for this code
      currentCount = 1;
      await sb.from("quote_chat_rate_limits")
        .insert({ quote_code: quoteCode, message_count: 1, window_start: new Date().toISOString() });
    }

    const { data: link, error: linkErr } = await sb
      .from("quote_links")
      .select("id, code, user_id, lead_id, quote_data, lo_info, expires_at")
      .eq("code", quoteCode)
      .maybeSingle();

    if (linkErr || !link) {
      return json({ error: "Quote not found" }, 404);
    }

    // 5. Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return json({ error: "This quote has expired" }, 410);
    }

    // 6. Check that showAiChat is enabled (default ON — only block if explicitly false)
    if (link.quote_data?.linkOptions?.showAiChat === false) {
      return json({ error: "AI chat is not enabled for this quote" }, 403);
    }

    // 7. Check LO's tier — Starter gets KB-only mode, Pro+ get full AI
    const { data: profile } = await sb
      .from("profiles")
      .select("tier")
      .eq("id", link.user_id)
      .single();

    const tiers = ["starter", "pro", "enterprise"];
    const loTier = profile?.tier || "starter";
    const loTierLevel = tiers.indexOf(loTier);
    const ezraMode: 'kb_only' | 'pro_ai' | 'enterprise_ai' =
      loTierLevel <= 0 ? 'kb_only' : (loTierLevel === 1 ? 'pro_ai' : 'enterprise_ai');

    // 7b. KB-first lookup — search ezra_knowledge_base for a relevant pre-approved answer
    let kbContext = "";
    let kbHit = false;
    let kbScore = 0;
    try {
      const { data: kbRows } = await sb
        .from("ezra_knowledge_base")
        .select("category, title, content")
        .eq("is_active", true)
        .in("category", ["client_objections", "objections", "heloc_basics", "sales_scripts", "compliance"])
        .limit(20);
      if (kbRows && kbRows.length > 0) {
        // Lightweight keyword overlap scoring (no embeddings call — cheap + fast)
        const queryWords = message.toLowerCase().split(/\W+/).filter((w: string) => w.length > 3);
        let bestRow: any = null;
        let bestScore = 0;
        for (const row of kbRows) {
          const hay = ((row.title || "") + " " + (row.content || "")).toLowerCase();
          let score = 0;
          for (const w of queryWords) {
            if (hay.includes(w)) score += 1;
          }
          // Normalize by query word count (0..1 range roughly)
          const norm = queryWords.length > 0 ? score / queryWords.length : 0;
          if (norm > bestScore) {
            bestScore = norm;
            bestRow = row;
          }
        }
        kbScore = bestScore;
        const tierThreshold = ezraMode === 'kb_only' ? 0.40 : (ezraMode === 'pro_ai' ? 0.55 : 0.65);
        if (bestRow && bestScore >= tierThreshold) {
          kbHit = true;
          kbContext = `Title: ${bestRow.title}\n${bestRow.content}`;
        }
      }
    } catch (kbErr) {
      console.warn("KB lookup error:", (kbErr as Error).message);
    }

    // 7c. Starter tier with no KB hit — return polite redirect WITHOUT calling AI provider
    if (ezraMode === 'kb_only' && !kbHit) {
      const loName = link.lo_info?.name || "your loan officer";
      const reply = `Great question! That's actually one ${loName} can answer best — they have the full picture and can give you the exact details. Want me to set up a quick callback so they can walk you through it?`;
      return json({
        reply,
        kb_only_redirect: true,
        remainingMessages: Math.max(0, RATE_LIMIT - currentCount)
      });
    }

    // 8. Build system prompt with real-time context from client page (tier-aware + KB-primed)
    let systemPrompt = buildClientSystemPrompt(link.quote_data, link.lo_info, ezraMode, kbContext);

    if (quoteContext) {
      const rtCtx = [];
      if (quoteContext.isReturnVisitor) rtCtx.push("This client is a RETURN VISITOR (viewed " + (quoteContext.viewCount || 2) + " times). They're clearly interested but haven't applied yet. Shift to gentle objection-handling: 'I can see you've been giving this some thought — what questions can I help answer?'");
      if (quoteContext.debtCount > 0) rtCtx.push("Client has " + quoteContext.debtCount + " debts shown on their quote" + (quoteContext.monthlySavings > 0 ? " with potential monthly savings of $" + Math.round(quoteContext.monthlySavings) + "/mo by consolidating" : "") + ". Weave debt consolidation benefits into responses naturally.");
      if (quoteContext.dailyCost) rtCtx.push("Daily cost breakdown: " + quoteContext.dailyCost + "/day — use this to make the payment feel small and manageable.");
      if (rtCtx.length > 0) {
        systemPrompt += "\n\nREAL-TIME CLIENT CONTEXT (from their current session):\n" + rtCtx.join("\n");
      }
      systemPrompt += "\n\nEMOTIONAL INTELLIGENCE DIRECTIVES:\n- You are warm, empathetic, and confident. Validate feelings before educating.\n- Never pressure — empower. Speak like a knowledgeable friend who genuinely wants to help.\n- Use the client's name in your first sentence.\n- Reference their specific numbers (not generic amounts).\n- Pattern: Validate → Educate → Empower → Soft CTA.\n- Never say 'as an AI'. Never use corporate jargon. Never rush the client. Never dismiss concerns.\n- When market urgency is appropriate: rates are volatile and lenders change guidelines frequently.";
    }

    // 9. Build messages array
    const messages: Array<{ role: string; content: string }> = [];
    messages.push({ role: "system", content: systemPrompt });

    // Add conversation history (last 20 messages max)
    if (conversationHistory && Array.isArray(conversationHistory)) {
      const trimmed = conversationHistory.slice(-20);
      for (const msg of trimmed) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }
    messages.push({ role: "user", content: message });

    // 10. Call AI using platform keys
    // ✅ COST-FIRST AI HIERARCHY (Deployed)
    // 
    // CLIENT-SIDE (FREE):
    // └── KB templates → Cached responses → Learned objections
    //
    // SERVER-SIDE: FREE TIER
    // 1. Gemini (flash/pro)     - $0 (Google free tier)
    // 2. OpenRouter (free)      - $0 (Llama, etc.)
    //
    // SERVER-SIDE: LOW COST ($0.10-0.50/M)
    // 3. Groq                   - $0.10/M (FASTEST + CHEAPEST)
    // 4. Kimi 8k                - $0.50/M
    // 5. DeepSeek               - $0.50/M
    //
    // SERVER-SIDE: MEDIUM ($0.60/M)
    // 6. OpenAI GPT-4o-mini     - $0.60/M
    //
    // SERVER-SIDE: EXPENSIVE ($$$)
    // 7. Grok (xAI)             - $$$ (last resort)
    // 8. Anthropic (Claude)     - $$$ (emergency only)
    //
    // Key Optimizations:
    // - KB First: Client-side templates handle common objections (zero API cost)
    // - Gemini Flash: Default for most tasks (free)
    // - Kimi 8k: Cheapest model only, no 32k/128k unless explicitly requested
    // - Groq: Cheapest paid option at $0.10/M tokens
    // - Expensive providers last: Grok/Anthropic only if everything else fails
    
    const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
    const groqKey = Deno.env.get("GROQ_API_KEY") || "";
    const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY") || "";
    const kimiKey = Deno.env.get("KIMI_API_KEY") || "";

    let responseText = "";
    let lastError = "";

    // Helper: fetch with AbortController timeout
    async function timedFetch(url: string, options: RequestInit): Promise<Response> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PROVIDER_FETCH_TIMEOUT_MS);
      try {
        const resp = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        return resp;
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    }

    // Helper to extract text from different provider responses
    const extractText = (provider: string, data: any): string => {
      switch (provider) {
        case "gemini":
          return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        case "kimi":
        case "openai":
        case "groq":
        case "deepseek":
        default:
          return data.choices?.[0]?.message?.content || "";
      }
    };

    // ===== TIER 1: FREE - Gemini (flash/pro) =====
    if (geminiKey && !responseText) {
      try {
        const systemMsg = messages.find((m) => m.role === "system")?.content || "";
        const chatMsgs = messages.filter((m) => m.role !== "system");
        const contents = chatMsgs.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

        const resp = await timedFetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemMsg }] },
              contents,
              generationConfig: { maxOutputTokens: 500, temperature: 0.7 },
            }),
          }
        );
        const data = await resp.json();
        if (resp.ok) {
          responseText = extractText("gemini", data);
          // Gemini succeeded
        } else {
          lastError = "Gemini: " + JSON.stringify(data).substring(0, 200);
        }
      } catch (err) {
        lastError = "Gemini error: " + (err as Error).message;
      }
    }

    // ===== TIER 2: LOW COST - Kimi 8k ($0.50/M) =====
    if (kimiKey && !responseText) {
      try {
        const resp = await timedFetch("https://api.moonshot.cn/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + kimiKey,
          },
          body: JSON.stringify({
            model: "moonshot-v1-8k",
            max_tokens: 500,
            temperature: 0.7,
            messages,
          }),
        });
        const data = await resp.json();
        if (resp.ok) {
          responseText = extractText("kimi", data);
          // Kimi succeeded
        } else {
          lastError = "Kimi: " + JSON.stringify(data).substring(0, 200);
        }
      } catch (err) {
        lastError = "Kimi error: " + (err as Error).message;
      }
    }

    // ===== TIER 3: LOW COST - Groq ($0.10/M) =====
    if (groqKey && !responseText) {
      try {
        const resp = await timedFetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + groqKey,
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            max_tokens: 500,
            temperature: 0.7,
            messages,
          }),
        });
        const data = await resp.json();
        if (resp.ok) {
          responseText = extractText("groq", data);
          // Groq succeeded
        } else {
          lastError = "Groq: " + JSON.stringify(data).substring(0, 200);
        }
      } catch (err) {
        lastError = "Groq error: " + (err as Error).message;
      }
    }

    // ===== TIER 4: LOW COST - DeepSeek ($0.50/M) =====
    if (deepseekKey && !responseText) {
      try {
        const resp = await timedFetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + deepseekKey,
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            max_tokens: 500,
            temperature: 0.7,
            messages,
          }),
        });
        const data = await resp.json();
        if (resp.ok) {
          responseText = extractText("deepseek", data);
          // DeepSeek succeeded
        } else {
          lastError = "DeepSeek: " + JSON.stringify(data).substring(0, 200);
        }
      } catch (err) {
        lastError = "DeepSeek error: " + (err as Error).message;
      }
    }

    // ===== TIER 5: MEDIUM - OpenAI GPT-4o-mini ($0.60/M) =====
    if (openaiKey && !responseText) {
      try {
        const resp = await timedFetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + openaiKey,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            max_tokens: 500,
            temperature: 0.7,
            messages,
          }),
        });
        const data = await resp.json();
        if (resp.ok) {
          responseText = extractText("openai", data);
          // OpenAI succeeded
        } else {
          lastError = "OpenAI: " + JSON.stringify(data).substring(0, 200);
        }
      } catch (err) {
        lastError = "OpenAI error: " + (err as Error).message;
      }
    }

    // ===== No provider succeeded =====
    if (!responseText) {
      console.error("All AI providers failed:", lastError);
      return json({ error: "No AI provider available. Please try again later." }, 503);
    }

    // 11. Track chat event (fire and forget)
    if (link.lead_id && link.user_id) {
      sb.rpc("update_lead_engagement", { lead_uuid: link.lead_id }).then(
        () => {}
      ).catch((err: unknown) => console.error("Failed to update engagement:", err));
    }

    // 11b. Detect commitment signal in AI response — strip token + insert positive-intent alert
    let commitmentDetected = false;
    if (responseText.includes("[COMMITMENT_SIGNAL]")) {
      commitmentDetected = true;
      responseText = responseText.replace(/\[COMMITMENT_SIGNAL\]/g, "").trim();
      // Insert positive-intent alert (fire & forget — throttled by 30 min uniqueness check)
      try {
        const clientName = link.quote_data?.clientName || "your client";
        // Throttle: skip if a positive_intent alert exists for this lead in last 30 min
        const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const { data: recent } = await sb
          .from("automation_alerts")
          .select("id")
          .eq("user_id", link.user_id)
          .eq("event_type", "positive_intent")
          .gte("created_at", cutoff)
          .ilike("payload->>quote_code", quoteCode)
          .maybeSingle();
        if (!recent) {
          await sb.from("automation_alerts").insert({
            user_id: link.user_id,
            lead_id: link.lead_id || null,
            event_type: "positive_intent",
            title: `🔥 ${clientName} is showing commitment!`,
            body: `Ezra confirmed buying intent from ${clientName}. Time to lock it in.`,
            payload: { quote_code: quoteCode, signal_source: "ezra_commitment", signal_score: 60 },
            seen: false
          });
        }
      } catch (alertErr) {
        console.warn("positive-intent alert insert failed:", (alertErr as Error).message);
      }
    }

    const remaining = Math.max(0, RATE_LIMIT - currentCount);

    return json(
      {
        success: true,
        text: responseText,
        messageCount: currentCount,
        remainingMessages: remaining,
        commitment_detected: commitmentDetected,
        ezra_mode: ezraMode,
        kb_hit: kbHit
      },
      200
    );
  } catch (err) {
    console.error("quote-chat error:", err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
