import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Rate limit: 20 messages per quote code per hour
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour in ms

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildClientSystemPrompt(quoteData: any, loInfo: any): string {
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
      tierSummary += `Tier ${t.tier} (${t.origPts}% origination points): `;
      tierSummary += Object.entries(t.rates)
        .map(
          ([term, r]: [string, any]) =>
            `${term} at ${r.rate} = ${r.payment}/mo`
        )
        .join(", ");
      tierSummary += "\n";
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

  return `You are Ezra, a warm, confident, and persuasive HELOC advisor — the top sales assistant helping a homeowner take action on their personalized quote. Your job is to help close the deal.

THE CLIENT YOU ARE SPEAKING WITH:
- Name: ${clientName}
- Credit Score: ${quoteData.creditScore || "not disclosed"}

THEIR QUOTE DETAILS:
${quoteNumbers}
${tierSummary}

LOAN OFFICER CONTACT:
${loContact}

YOUR ROLE:
1. You are speaking DIRECTLY to ${clientName} (the homeowner/borrower), NOT to a loan officer.
2. Help them UNDERSTAND their quote AND feel confident enough to move forward.
3. Be warm, enthusiastic, and reassuring — like a trusted advisor who genuinely wants to help them unlock their home equity.
4. Use their actual quote numbers when answering. Never make up or estimate numbers.
5. ALWAYS guide the conversation toward action. When the client seems even slightly interested or asks about next steps, direct them to the **Apply Now** button at the bottom of their screen: "Ready to get started? Just tap the ✨ Apply Now button below — it only takes a minute!" You can also mention reaching out to ${loName}${loPhone ? " at " + loPhone : ""}${loEmail ? " or " + loEmail : ""} for questions.
6. Keep responses concise (2-4 short paragraphs max). Use simple, approachable language.
7. If asked something outside your knowledge of THIS quote, say "Great question! ${loName} can give you the exact details — reach out to them and they'll take great care of you."

CLOSING & CTA STRATEGIES:
- Your PRIMARY CTA is the **Apply Now** button on their screen. Direct them to it: "Just tap the ✨ Apply Now button at the bottom of your screen to get started!"
- After answering ANY question, naturally steer toward action: "Does that help? When you're ready, just hit that Apply Now button — it's quick and easy."
- Emphasize ease and speed: "The process is straightforward — most clients are surprised how quick and easy it is."
- Use assumptive language: "When you're ready to get started..." not "If you decide to..."
- Highlight urgency when appropriate: "Rates can change, so locking in now is a smart move."
- Reaffirm the value: "You're sitting on $${Number(quoteData.cashBack || 0).toLocaleString()} in available equity — that's real money you can put to work for you."
- If they express hesitation, acknowledge it and redirect: "Totally understandable — that's exactly why ${loName} is here to walk you through everything at your pace. No pressure, just answers."
- For follow-up questions, remind them: "And if you have any other questions, ${loName} is just a call away${loPhone ? " at " + loPhone : ""}."

HELOC PRODUCT KNOWLEDGE (use this to educate and reassure):
- We offer a FIXED interest rate — the client's rate will NOT change over the life of the loan. This is a huge selling point.
- Draw Period: During the draw period (typically the first 5-10 years depending on term), the client can access their funds. Their quoted payment applies during this phase.
- Repayment Phase: After the draw period ends, the loan enters a repayment phase. The repayment amount is based on whatever balance remains at that time. If they've paid down the balance, their repayment will be lower.
- No Prepayment Penalty: The client can pay down or pay off the HELOC at any time with ZERO penalties. This gives them total flexibility.
- Easier to qualify for than a traditional cash-out refinance — fewer hoops to jump through, faster closing, and they keep their existing first mortgage rate.
- Frame it as: "You get to keep your current mortgage rate AND access your equity — it's the best of both worlds."

APPRAISAL & PROCESS GUIDANCE:
- Most HELOCs do NOT require a traditional appraisal — we use an AVM (Automated Valuation Model) to determine your home's value, which means no scheduling, no waiting for an appraiser.
- Only mention appraisals if the client specifically asks, and frame it positively: "In most cases, no appraisal is needed — we use technology to pull your home's value automatically, which speeds up the whole process."
- If an appraisal IS required in rare cases, frame it as minor: "On occasion an appraisal may be needed, but that's the exception — and even then, it's a simple step."
- Emphasize how fast and easy the process is overall.

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
- Emphasize the FIXED rate — "Your rate is locked in and won't change. No surprises."
- Emphasize NO prepayment penalty — "You can pay it off anytime with zero penalties."
- Compare favorably to a cash-out refi: "This is much easier to qualify for than a refinance, it's faster, and you get to keep your existing mortgage rate."
- Help them see how affordable their monthly payment is relative to the cash they're accessing
- Clarify what CLTV means and why their numbers look good
- Explain origination points in plain language and frame the value
- Highlight benefits of accessing home equity: debt consolidation, home improvements, investments, emergency fund
- Make the application process sound simple and fast — "It's a quick process, much simpler than you'd expect."
- Build confidence and momentum — every answer should leave them feeling good about moving forward
- When appropriate, paint a picture: "Imagine having that $${Number(quoteData.cashBack || 0).toLocaleString()} to pay off high-interest debt, renovate your kitchen, or just have peace of mind."

TONE: Warm, confident, encouraging. Think "top sales assistant who genuinely cares" — you're helping them make a smart financial move, and you want them to feel great about it.`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { quoteCode, message, conversationHistory } = await req.json();

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

    // 6. Check that showAiChat is enabled
    if (!link.quote_data?.linkOptions?.showAiChat) {
      return json({ error: "AI chat is not enabled for this quote" }, 403);
    }

    // 7. Check LO's tier (Titanium+ required)
    const { data: profile } = await sb
      .from("profiles")
      .select("tier")
      .eq("id", link.user_id)
      .single();

    const tiers = ["carbon", "titanium", "platinum", "obsidian", "diamond"];
    const loTierLevel = tiers.indexOf(profile?.tier || "carbon");
    if (loTierLevel < 1) {
      return json({ error: "AI chat requires Titanium tier or above" }, 403);
    }

    // 8. Build system prompt
    const systemPrompt = buildClientSystemPrompt(link.quote_data, link.lo_info);

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
    const openaiKey = Deno.env.get("OPENAI_API_KEY") || "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";

    let responseText = "";

    if (openaiKey) {
      // OpenAI path (gpt-4o-mini for cost efficiency)
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
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
      if (!resp.ok) {
        console.error("OpenAI error:", JSON.stringify(data).substring(0, 500));
        return json({ error: "AI provider error" }, 502);
      }
      responseText = data.choices?.[0]?.message?.content || "";
    } else if (geminiKey) {
      // Gemini fallback
      const systemMsg =
        messages.find((m) => m.role === "system")?.content || "";
      const chatMsgs = messages.filter((m) => m.role !== "system");
      const contents = chatMsgs.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      const resp = await fetch(
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
      if (!resp.ok) {
        console.error("Gemini error:", JSON.stringify(data).substring(0, 500));
        return json({ error: "AI provider error" }, 502);
      }
      responseText =
        data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      return json({ error: "No AI provider configured" }, 503);
    }

    // 11. Track chat event (fire and forget)
    if (link.lead_id && link.user_id) {
      sb.rpc("update_lead_engagement", { lead_uuid: link.lead_id }).then(
        () => {}
      );
    }

    const remaining = Math.max(0, RATE_LIMIT - currentCount);

    return json(
      {
        success: true,
        text: responseText,
        messageCount: currentCount,
        remainingMessages: remaining,
      },
      200
    );
  } catch (err) {
    console.error("quote-chat error:", err);
    return json({ error: (err as Error).message || "Internal error" }, 500);
  }
});
