-- ============================================
-- EZRA KNOWLEDGE BASE — COMPLETE PRODUCT INTELLIGENCE
-- Run in Supabase SQL Editor
-- Created by Eddie Barragan — Above All CRM
-- ============================================

-- Clear old seed data
DELETE FROM ezra_knowledge_base WHERE is_system = true;

-- ============================================
-- 1. PRODUCT STRUCTURES
-- ============================================
INSERT INTO ezra_knowledge_base (category, title, content, is_system) VALUES
(
    'product_structures',
    'Fixed HELOC Programs Overview',
    'Fixed HELOC programs are fully amortizing loans. Monthly payments include principal and interest from day one. Borrowers typically draw the full approved amount upfront (minus fees) at closing. Additional draws may be available as principal is repaid. Unlike traditional HELOCs, these products do NOT have long interest-only draw periods.',
    true
),
(
    'product_structures',
    'Fixed HELOC Draw Windows',
    '5 Year Fixed HELOC: Draw period 2 years, Loan term 5 years. 10 Year Fixed HELOC: Draw period 3 years, Loan term 10 years. 15 Year Fixed HELOC: Draw period 4 years, Loan term 15 years. 30 Year Fixed HELOC: Draw period 5 years, Loan term 30 years. All fixed programs use fully amortized principal and interest payments. The draw window does not change the amortization schedule.',
    true
),
(
    'product_structures',
    'Variable HELOC Programs',
    'Variable HELOC products include interest-only draw periods. Two structures: 1) 10 Year Variable HELOC — Draw 10 years (interest-only payments), Repayment 20 years amortization after draw. 2) 5 Year Draw HELOC — Draw 5 years (interest-only), Repayment begins after draw period ends.',
    true
)
ON CONFLICT (category, title) DO UPDATE SET content = EXCLUDED.content;

-- ============================================
-- 2. PAYMENT RULES
-- ============================================
INSERT INTO ezra_knowledge_base (category, title, content, is_system) VALUES
(
    'payment_rules',
    'Fixed HELOC Payment Calculation',
    'For fixed HELOC programs: Monthly payment = fully amortized principal and interest. Inputs: loan amount, interest rate, amortization period. Formula: P&I = Loan × [r(1+r)^n] / [(1+r)^n - 1] where r = monthly rate, n = total payments. Always clearly label as principal and interest payment.',
    true
),
(
    'payment_rules',
    'Variable HELOC Payment Calculation',
    'For variable HELOC during draw period: Monthly payment = loan amount × interest rate ÷ 12. This is interest-only. After draw period: Remaining balance amortizes over the repayment term using standard P&I formula. Always clearly label which payment type is being displayed.',
    true
)
ON CONFLICT (category, title) DO UPDATE SET content = EXCLUDED.content;

-- ============================================
-- 3. APPROVAL PROCESS
-- ============================================
INSERT INTO ezra_knowledge_base (category, title, content, is_system) VALUES
(
    'approval_process',
    'AI Underwriting Process',
    'The HELOC platform uses AI-assisted underwriting. Process: 1) Borrower submits application. 2) Soft credit check determines eligibility — NO impact to credit score. 3) AI underwriting evaluates profile. 4) Income verified using secure bank-grade technology. 5) Borrower chooses preferred offer from multiple structures. 6) Final underwriting approval and closing. Borrowers remain in control. No hard credit pull required to view initial offers.',
    true
),
(
    'approval_process',
    'Approval Speed & Timeline',
    'Automated underwriting and digital verification enable fast approvals. Some loans may fund in as little as 5 days depending on documentation and underwriting review. CRITICAL RULE: Always present timelines as possibilities, NEVER as guarantees. Say "as fast as 5 days" not "guaranteed in 5 days".',
    true
),
(
    'approval_process',
    'Income Verification',
    'Income verification uses secure bank-grade technology. Borrowers connect accounts through a secure portal. Digital verification reduces paperwork and speeds up the process. All borrower financial data is protected with bank-level encryption and is never sold to third parties.',
    true
)
ON CONFLICT (category, title) DO UPDATE SET content = EXCLUDED.content;

-- ============================================
-- 4. DATA PRIVACY
-- ============================================
INSERT INTO ezra_knowledge_base (category, title, content, is_system) VALUES
(
    'data_privacy',
    'Data Privacy & Security',
    'Borrower information is handled with bank-grade security. Information is NEVER sold to third parties. Borrowers maintain control of their information and loan choices. All loan options shown transparently so borrowers can decide which structure best fits their goals.',
    true
)
ON CONFLICT (category, title) DO UPDATE SET content = EXCLUDED.content;

-- ============================================
-- 5. DEAL ARCHITECT
-- ============================================
INSERT INTO ezra_knowledge_base (category, title, content, is_system) VALUES
(
    'deal_architect',
    'Deal Architect Mode',
    'When a loan officer requests "structure this deal" or provides borrower info, Ezra performs: Step 1 — Identify borrower goal (consolidation, equity access, liquidity, payment reduction). Step 2 — Calculate CLTV: (first mortgage + HELOC amount) / property value. Step 3 — Evaluate program eligibility. Step 4 — Recommend best program with reasoning. Step 5 — Calculate payment (P&I for fixed, IO for variable draw). Step 6 — Return AUTO_FILL_FIELDS JSON for quote auto-population. Step 7 — Generate client explanation.',
    true
),
(
    'deal_architect',
    'Structuring Intelligence',
    'Program recommendations by borrower goal: Debt consolidation → 15yr or 30yr fixed (longer amortization). Short-term liquidity → 5yr or 10yr fixed (shorter programs). Payment flexibility → variable HELOC (interest-only draw). Rapid payoff → shorter amortization. Home improvement → 10yr fixed (moderate term). Maximum cash flow → 30yr fixed (lowest monthly payment).',
    true
)
ON CONFLICT (category, title) DO UPDATE SET content = EXCLUDED.content;

-- ============================================
-- 6. SALES SCRIPTS & OBJECTION HANDLING
-- ============================================
INSERT INTO ezra_knowledge_base (category, title, content, is_system) VALUES
(
    'sales_scripts',
    'HELOC Client Introduction',
    'Opening: "This program gives you access to your home equity with complete transparency. You can view your potential offers with just a soft credit check — no impact to your credit score. Our technology evaluates your eligibility quickly, verifies income securely, and presents you with multiple options. You pick the offer that works best for you. Some approvals can fund in as little as 5 days."',
    true
),
(
    'sales_scripts',
    'Fixed HELOC Explanation Script',
    'How to explain: "This program works more like a traditional loan. Instead of interest-only payments, the balance starts paying down right away with principal and interest. That helps build equity faster and keeps the loan structured on a predictable schedule." Example: 15 Year Fixed HELOC with 4-year draw, fully amortized P&I.',
    true
),
(
    'sales_scripts',
    'Sales Coach Three-Section Format',
    'When presenting a loan, provide: 1) Loan Structure — program name, term, draw window, payment type. 2) Strategy Explanation — why this structure fits the borrower goal. 3) Suggested Script — word-for-word client-facing explanation.',
    true
),
(
    'objections',
    'Rate Concern Response',
    '"I understand rate is important. The advantage is you can see your actual offers with just a soft credit check — no impact to your score. Compare multiple structures and pick what fits. Unlike credit cards at 22%+, a HELOC at 8-9% saves thousands while providing structured payoff."',
    true
),
(
    'objections',
    'Speed Concern Response',
    '"Our platform uses AI-assisted underwriting and bank-grade digital verification. The process is faster than traditional HELOCs — some approvals can fund in as little as 5 days depending on documentation."',
    true
),
(
    'objections',
    'Trust & Privacy Response',
    '"Your information is protected with bank-grade security — the same level used by major financial institutions. We never sell your data to third parties. You see all options transparently and choose what works best. No obligation."',
    true
),
(
    'objections',
    'Refinance vs HELOC Response',
    '"A refinance replaces your first mortgage — which means giving up your current rate. A HELOC lets you access equity without touching your first mortgage. If your current rate is below market, a HELOC preserves that advantage."',
    true
),
(
    'objections',
    'General Hesitation Response',
    '"That is completely fine. You can view your potential offers with just a soft credit check — no commitment, no impact to your credit. Think of it as understanding what is available. Many clients find it helpful to know their options before they need them."',
    true
)
ON CONFLICT (category, title) DO UPDATE SET content = EXCLUDED.content;

-- ============================================
-- 7. VALUE PROPOSITION
-- ============================================
INSERT INTO ezra_knowledge_base (category, title, content, is_system) VALUES
(
    'value_proposition',
    'Core Value Proposition',
    'Key advantages: Multiple loan structures to choose from. Soft credit check to view offers (no hard pull). AI-assisted underwriting for faster decisions. Secure bank-grade income verification. Borrower controls which offer to select. Potential funding as fast as 5 days. Fixed rate options for predictable payments.',
    true
)
ON CONFLICT (category, title) DO UPDATE SET content = EXCLUDED.content;

-- ============================================
-- 8. HELOC GUIDELINES
-- ============================================
INSERT INTO ezra_knowledge_base (category, title, content, is_system) VALUES
(
    'heloc_guidelines',
    'CLTV Calculation',
    'Combined Loan-to-Value (CLTV) = (First Mortgage Balance + HELOC Amount) / Property Value. Most programs allow up to 85% CLTV for primary residences. Some programs may go higher depending on credit score and other factors.',
    true
),
(
    'heloc_guidelines',
    'Knowledge Authority Order',
    'When answering HELOC questions, follow this priority: 1) Internal HELOC knowledge base. 2) Product rules from system prompt. 3) Loan officer provided inputs. 4) General mortgage knowledge. Internal knowledge base overrides external assumptions. Never invent loan program structures not defined in the product rules.',
    true
)
ON CONFLICT (category, title) DO UPDATE SET content = EXCLUDED.content;

SELECT 'Ezra knowledge base seeded — ' || COUNT(*) || ' entries' AS result FROM ezra_knowledge_base;
