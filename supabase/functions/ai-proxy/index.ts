import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing env vars");

const SUPER_ADMIN_EMAILS = [
  (Deno.env.get("SUPER_ADMIN_EMAIL") || "barraganmortgage@gmail.com").toLowerCase(),
  "eddieb@westcapitallending.com",
];

const CASCADE_TIMEOUT_MS     = 8_000;
const AI_FETCH_TIMEOUT_MS    = 25_000;
const SUPER_ADMIN_TIMEOUT_MS = 90_000;
const RL_WINDOW_MS  = Number(Deno.env.get("AI_PROXY_RATE_LIMIT_WINDOW_MS")  || 60_000);
const RL_MAX_REQ    = Number(Deno.env.get("AI_PROXY_RATE_LIMIT_MAX_REQUESTS") || 20);

// ─── MODEL CONSTANTS ────────────────────────────────────────────────────────
const CLAUDE_SONNET = "claude-sonnet-4-6";
const CLAUDE_HAIKU  = "claude-haiku-4-5-20251001";

// ─── OPENROUTER MODELS ──────────────────────────────────────────────────────
const OR_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const OR_KIMI_MODEL    = "moonshotai/kimi-vl-a3b-thinking:free";
const OR_KIMI_PAID     = "moonshotai/moonshot-v1-8k";
const OR_GEMINI_MODEL  = "google/gemini-2.0-flash-001";
const OR_CLAUDE_MODEL  = "anthropic/claude-sonnet-4-5";
// Tier-escalating free/near-free models for Starter+Pro daily drivers
const OR_GEMMA_FREE    = "google/gemma-2-9b-it:free";
const OR_QWEN_FREE     = "qwen/qwen-2.5-72b-instruct:free";
const OR_MINIMAX_FREE  = "minimax/minimax-m1:free";
// Kimi 2.5 w/ 200K context — shines on long rate sheets + objection reasoning
const OR_KIMI_2_5      = "moonshotai/moonshot-v1-128k";

// ─── TIER CONFIG ─────────────────────────────────────────────────────────────
const TIER_LEVEL: Record<string,number> = { starter:0, pro:1, enterprise:2 };
const TIER_CASCADE_CUTOFF: Record<string,number> = { starter:1, pro:5, enterprise:7 };

function getFeatureRoute(feature: string, tier: string, isSuperAdmin: boolean): { provider:string; model:string } {
  const level = TIER_LEVEL[tier] || 0;
  const isPro = level >= 1;
  const isEnterprise = level >= 2 || isSuperAdmin;

  // Super-admin lane: Kimi 2.5 for reasoning, Gemini for parsing
  if (isSuperAdmin) {
    switch (feature) {
      case "document_parse": case "rate_sheet":
        return { provider:"openrouter", model:OR_GEMINI_MODEL };
      case "heygen_script":
        return { provider:"openrouter", model:OR_CLAUDE_MODEL };
      default:
        return { provider:"openrouter", model:OR_KIMI_2_5 };
    }
  }

  switch (feature) {
    // Structured parsing — Gemini Flash is the cheapest/fastest structured-output
    // model and stays across all tiers. This is the SAFE path for PII-adjacent work.
    case "document_parse": case "rate_sheet":
      return { provider:"gemini", model:"gemini-2.0-flash" };

    // High-value reasoning / objection handling / NEPQ reframe
    // Enterprise → Claude Sonnet 4.5; Pro → Kimi 2.5 (200K ctx); Starter → Gemini Flash
    case "deal_analysis": case "ezra_copilot": case "objection":
    case "prompt_improver": case "campaign_generation":
      if (isEnterprise) return { provider:"anthropic", model:CLAUDE_SONNET };
      if (isPro)        return { provider:"openrouter", model:OR_KIMI_2_5 };
      return { provider:"gemini", model:"gemini-2.0-flash" };

    // HeyGen script — Enterprise-only feature, Claude Sonnet for the prose quality
    case "heygen_script":
      return isEnterprise
        ? { provider:"anthropic", model:CLAUDE_SONNET }
        : { provider:"gemini", model:"gemini-2.0-flash" }; // fallback if accidentally called

    // Quick SMS/notes/call-scripts — cheap lane
    // Enterprise → Claude Haiku (premium quick); Pro → Qwen/MiniMax free; Starter → Gemma free
    case "sms_reply": case "note_taker": case "call_script":
      if (isEnterprise) return { provider:"anthropic", model:CLAUDE_HAIKU };
      if (isPro)        return { provider:"openrouter", model:OR_QWEN_FREE };
      return { provider:"openrouter", model:OR_GEMMA_FREE };

    // Default (general chat) — same ladder as SMS
    default:
      if (isEnterprise) return { provider:"anthropic", model:CLAUDE_HAIKU };
      if (isPro)        return { provider:"openrouter", model:OR_MINIMAX_FREE };
      return { provider:"openrouter", model:OR_GEMMA_FREE };
  }
}

const COST_PER_1M: Record<string,{input:number;output:number}> = {
  gemini:     { input:0.075, output:0.30 },
  groq:       { input:0.59,  output:0.79 },
  openai:     { input:0.15,  output:0.60 },
  deepseek:   { input:0.27,  output:1.10 },
  grok:       { input:5.00,  output:15.00 },
  anthropic:  { input:3.00,  output:15.00 },
  perplexity: { input:1.00,  output:1.00 },
  kimi:       { input:0.30,  output:1.20 },
  openrouter: { input:0.20,  output:0.80 },
};

const CASCADE_ORDER = [
  { name:"gemini",     model:"gemini-2.0-flash",          url:"" },
  { name:"openrouter", model:OR_QWEN_FREE,                url:OR_BASE_URL },  // Qwen 72B free via OpenRouter
  { name:"openrouter", model:OR_GEMMA_FREE,               url:OR_BASE_URL },  // Gemma 2 9B free via OpenRouter
  { name:"groq",       model:"llama-3.3-70b-versatile",   url:"" },
  { name:"kimi",       model:"moonshot-v1-8k",            url:"https://api.moonshot.cn/v1/chat/completions" },
  { name:"perplexity", model:"sonar",                     url:"https://api.perplexity.ai/chat/completions" },
  { name:"grok",       model:"grok-beta",                 url:"https://api.x.ai/v1/chat/completions" },
  { name:"openai",     model:"gpt-4o-mini",               url:"https://api.openai.com/v1/chat/completions" },
  { name:"anthropic",  model:CLAUDE_HAIKU,                url:"https://api.anthropic.com/v1/messages" },
];

const ENV_KEY_MAP: Record<string,string> = {
  gemini:"GEMINI_API_KEY", openai:"OPENAI_API_KEY", anthropic:"ANTHROPIC_API_KEY",
  deepseek:"DEEPSEEK_API_KEY", groq:"GROQ_API_KEY", grok:"XAI_API_KEY",
  perplexity:"PERPLEXITY_API_KEY", kimi:"MOONSHOT_API_KEY",
  openrouter:"OPENROUTER_API_KEY",
};

const DEFAULT_MODELS: Record<string,string> = {
  openai:"gpt-4o-mini", gemini:"gemini-2.0-flash", anthropic:CLAUDE_SONNET,
  deepseek:"deepseek-chat", groq:"llama-3.3-70b-versatile",
  grok:"grok-beta", kimi:"moonshot-v1-8k", perplexity:"sonar",
  openrouter:OR_KIMI_MODEL,
};

const DEFAULT_URLS: Record<string,string> = {
  openai:"https://api.openai.com/v1/chat/completions",
  deepseek:"https://api.deepseek.com/v1/chat/completions",
  groq:"https://api.groq.com/openai/v1/chat/completions",
  grok:"https://api.x.ai/v1/chat/completions",
  kimi:"https://api.moonshot.cn/v1/chat/completions",
  perplexity:"https://api.perplexity.ai/chat/completions",
  openrouter:OR_BASE_URL,
};

// ─── KB SEARCH ────────────────────────────────────────────────────────────────
async function searchKB(supabase:any, query:string, feature:string): Promise<{context:string;hitCount:number;entryIds:string[]}> {
  try {
    const STOP = new Set(["the","and","for","are","but","not","you","all","can","her","was","one","our","out","day","get","has","him","his","how","its","may","new","now","own","say","she","too","use","way","who","did","let","put","old"]);
    const words = query.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w.length>3&&!STOP.has(w));
    if (!words.length) return {context:"",hitCount:0,entryIds:[]};
    const terms = words.slice(0,5);
    const catMap: Record<string,string[]> = {
      sms_reply:["objections","sales_scripts","sms_templates"],
      deal_analysis:["sales_scripts","objections","guidelines"],
      ezra_copilot:["sales_scripts","guidelines","compliance"],
      objection:["objections","sales_scripts"],
      note_taker:["guidelines"],
      document_parse:["guidelines","aus_guidelines","credit"],
      call_script:["sales_scripts","objections"],
      campaign_generation:["sales_scripts","sms_templates","guidelines"],
    };
    const cats = catMap[feature]||[];
    const filter = terms.map(w=>`title.ilike.%${w}%,content.ilike.%${w}%`).join(",");
    const {data:entries,error} = await supabase.from("knowledge_base").select("id,title,content,category").eq("is_active",true).or(filter).limit(5);
    if (error||!entries?.length) return {context:"",hitCount:0,entryIds:[]};
    const scored = entries.map((e:any)=>{ let s=cats.includes(e.category)?2:0; const c=(e.title+" "+e.content).toLowerCase(); s+=terms.filter(w=>c.includes(w)).length; return {...e,score:s}; }).sort((a:any,b:any)=>b.score-a.score).slice(0,3);
    if (!scored.length) return {context:"",hitCount:0,entryIds:[]};
    const context = scored.map((e:any)=>`## KB: ${e.title}\n${e.content.substring(0,800)}`).join("\n\n");
    return {context,hitCount:scored.length,entryIds:scored.map((e:any)=>e.id)};
  } catch(err) { console.error("KB search error:",err); return {context:"",hitCount:0,entryIds:[]}; }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function estimateCost(p:string,i:number,o:number):number { const r=COST_PER_1M[p]||COST_PER_1M["openai"]; return(i*r.input+o*r.output)/1_000_000; }

function extractUsage(p:string,d:any){let i=0,o=0;if(p==="gemini"){i=d.usageMetadata?.promptTokenCount||0;o=d.usageMetadata?.candidatesTokenCount||0;}else if(p==="anthropic"){i=d.usage?.input_tokens||0;o=d.usage?.output_tokens||0;}else{i=d.usage?.prompt_tokens||0;o=d.usage?.completion_tokens||0;}return{inputTokens:i,outputTokens:o,totalTokens:i+o};}

function extractText(p:string,d:any):string{if(p==="gemini")return d.candidates?.[0]?.content?.parts?.[0]?.text||"";if(p==="anthropic")return d.content?.[0]?.text||"";return d.choices?.[0]?.message?.content||""}

function getAllKeys(p:string,uk?:string):string[]{const ks:string[]=[],seen=new Set<string>();const add=(k:string)=>{if(k&&!seen.has(k)){seen.add(k);ks.push(k);}};if(uk)add(uk);const en=ENV_KEY_MAP[p];if(!en)return ks;add(Deno.env.get(en)||"" );for(let i=1;i<=10;i++)add(Deno.env.get(en.replace("_KEY",`_KEY_${i}`))||"" );return ks;}
function getKey(p:string,uk?:string):string{return getAllKeys(p,uk)[0]||""}

async function isSuperAdmin(sb:any,uid:string,email:string):Promise<boolean>{
  if(SUPER_ADMIN_EMAILS.includes(email.toLowerCase()))return true;
  try{const{data:p}=await sb.from("profiles").select("role,is_platform_admin,email").eq("id",uid).single();if(!p)return false;if(SUPER_ADMIN_EMAILS.includes((p.email||"").toLowerCase()))return true;return p.role==="super_admin"||p.is_platform_admin===true;}catch{return false;}
}

interface CR{ok:boolean;text:string;usage:{inputTokens:number;outputTokens:number;totalTokens:number};provider:string;model:string;aiData?:any;status?:number;}

// ─── CALL PROVIDER ────────────────────────────────────────────────────────────
async function callProvider(provider:string,aiModel:string,aiKey:string,maxTok:number,sysprompt:string,usermsg:string,epUrl:string,img64?:string,imgMime?:string,timeoutMs=AI_FETCH_TIMEOUT_MS):Promise<CR>{
  let body:string, hdrs:Record<string,string>, url:string;
  const isVision=!!img64, model=aiModel||DEFAULT_MODELS[provider]||"gpt-4o-mini";

  if(provider==="gemini"){
    url=(epUrl||"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent").replace("{model}",model)+"?key="+aiKey;
    hdrs={"Content-Type":"application/json"};
    const parts:any[]=[]; if(sysprompt)parts.push({text:sysprompt+"\n\n"}); if(isVision)parts.push({inline_data:{mime_type:imgMime,data:img64}}); parts.push({text:usermsg});
    body=JSON.stringify({contents:[{parts}],generationConfig:{maxOutputTokens:maxTok}});
  } else if(provider==="anthropic"){
    url=epUrl||"https://api.anthropic.com/v1/messages";
    hdrs={"Content-Type":"application/json","x-api-key":aiKey,"anthropic-version":"2023-06-01"};
    const content:any[]=[]; if(isVision)content.push({type:"image",source:{type:"base64",media_type:imgMime,data:img64}}); content.push({type:"text",text:usermsg});
    body=JSON.stringify({model,max_tokens:maxTok,...(sysprompt?{system:sysprompt}:{}),messages:[{role:"user",content}]});
  } else {
    url=epUrl||DEFAULT_URLS[provider]||OR_BASE_URL;
    hdrs={"Content-Type":"application/json","Authorization":"Bearer "+aiKey};
    if(provider==="openrouter"){
      hdrs["HTTP-Referer"]="https://aboveallcrm.com";
      hdrs["X-Title"]="Above All CRM";
    }
    const msgs:any[]=[]; if(sysprompt)msgs.push({role:"system",content:sysprompt}); if(isVision)msgs.push({role:"user",content:[{type:"image_url",image_url:{url:`data:${imgMime};base64,${img64}`}},{type:"text",text:usermsg}]});else msgs.push({role:"user",content:usermsg});
    body=JSON.stringify({model,max_tokens:maxTok,messages:msgs});
  }

  const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const r=await fetch(url,{method:"POST",headers:hdrs,body,signal:ctrl.signal}); clearTimeout(t);
    const d=await r.json(); const text=extractText(provider,d); const usage=extractUsage(provider,d);
    if(!r.ok) console.error(`[callProvider] ${provider}/${model} HTTP ${r.status}:`, JSON.stringify(d).substring(0,400));
    return{ok:r.ok&&!!text,text,usage,provider,model,aiData:d,status:r.status};
  }catch(e:any){clearTimeout(t);console.error(`[callProvider] ${provider}/${model} error:`,e.message);return{ok:false,text:"",usage:{inputTokens:0,outputTokens:0,totalTokens:0},provider,model,status:0};}
}

// ─── SUPER ADMIN CHAIN ────────────────────────────────────────────────────────
async function superAdminChain(
  sysprompt:string, usermsg:string, maxTok:number,
  img64?:string, imgMime?:string
): Promise<CR> {
  const orKey  = getKey("openrouter");
  const ck     = getKey("anthropic");

  if (orKey) {
    console.log("[SuperAdmin] Trying Kimi 2.5 via OpenRouter...");
    const kimiModels = [OR_KIMI_MODEL, OR_KIMI_PAID];
    for (const km of kimiModels) {
      const r = await callProvider("openrouter", km, orKey, maxTok, sysprompt, usermsg, OR_BASE_URL, img64, imgMime, 20_000);
      if (r.ok) {
        console.log(`[SuperAdmin] Kimi succeeded: ${km}`);
        return r;
      }
      console.log(`[SuperAdmin] Kimi ${km} failed (${r.status}), trying next...`);
    }
  }

  if (ck) {
    console.log("[SuperAdmin] Kimi failed, falling back to Claude Sonnet...");
    const r = await callProvider("anthropic", CLAUDE_SONNET, ck, maxTok, sysprompt, usermsg, "", img64, imgMime, SUPER_ADMIN_TIMEOUT_MS);
    if (r.ok) {
      console.log("[SuperAdmin] Claude Sonnet succeeded");
      return r;
    }
    console.log(`[SuperAdmin] Claude also failed (${r.status})`);
  }

  return { ok:false, text:"", usage:{inputTokens:0,outputTokens:0,totalTokens:0}, provider:"none", model:"none" };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
serve(async(req:Request)=>{
  const ch=getCorsHeaders(req);
  if(req.method==="OPTIONS")return new Response("ok",{headers:ch});
  const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...ch,"Content-Type":"application/json"}});

  try{
    const auth=req.headers.get("Authorization"); if(!auth)return json({error:"Missing authorization header"},401);
    const sb=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY);
    const tok=auth.replace("Bearer ","");
    const{data:{user},error:ae}=await sb.auth.getUser(tok); if(ae||!user)return json({error:"Invalid or expired token"},401);
    const uid=user.id, email=(user.email||"").toLowerCase();
    const isAdmin=await isSuperAdmin(sb,uid,email);

    const body=await req.json();
    const{action,provider,model,maxTokens,systemPrompt,userMessage,endpointUrl,imageBase64,imageMimeType,intent,feature}=body;
    const ftag=feature||intent||"";

    const[intRes,profRes]=await Promise.all([
      sb.from("user_integrations").select("metadata").eq("user_id",uid).eq("provider","heloc_keys").maybeSingle(),
      sb.from("profiles").select("tier,current_tier,preferred_ai_mode").eq("id",uid).maybeSingle(),
    ]);
    const intg=intRes.data;
    const rawTier=profRes.data?.tier||profRes.data?.current_tier||"starter";
    const userTier=["starter","pro","enterprise"].includes(rawTier)?rawTier:"starter";
    const tierLevel=TIER_LEVEL[userTier]||0;
    const aiMode = isAdmin ? (profRes.data?.preferred_ai_mode||"auto") : "auto";
    const userAiKey=intg?.metadata?.ai_api_key||"";
    const aiMaxTokens=intg?.metadata?.ai_max_tokens||maxTokens||800;
    const aiEndpointUrl=intg?.metadata?.ai_endpoint_url||"";

    let aiProvider:string, aiModel:string;
    if(isAdmin && aiMode==="claude"){ aiProvider="anthropic"; aiModel=model||CLAUDE_SONNET; }
    else if(isAdmin && aiMode==="gemini"){ aiProvider="openrouter"; aiModel=model||OR_GEMINI_MODEL; }
    else if(ftag && action==="generate"){
      const route=getFeatureRoute(ftag,userTier,isAdmin&&aiMode==="auto");
      aiProvider=provider||route.provider; aiModel=model||route.model;
    } else {
      aiProvider=intg?.metadata?.ai_provider||provider||"gemini";
      aiModel=intg?.metadata?.ai_model||model||DEFAULT_MODELS[aiProvider]||"gemini-2.0-flash";
    }

    let aiKey=userAiKey; if(!aiKey){aiKey=getKey(aiProvider,"");}

    let finalSysprompt=intg?.metadata?.ai_system_prompt||systemPrompt||"";
    // Mortgage scope fence: prevent off-topic drift for all non-super-admin users
    if(!isAdmin){finalSysprompt=`SCOPE: You are a HELOC and mortgage specialist ONLY. You may discuss mortgages, home equity, real estate, debt consolidation, credit, and personal finance topics. If the user asks about anything unrelated, respond: "I specialize in HELOC and mortgage topics — how can I help with your home equity needs?" Do not answer off-topic questions.\n\n${finalSysprompt}`;}
    let kbHit=false,kbIds:string[]=[],kbCount=0;
    if((action==="generate"||action==="generate_super_admin")&&userMessage&&ftag){
      const kb=await searchKB(sb,userMessage,ftag);
      if(kb.hitCount>0){
        kbHit=true;kbCount=kb.hitCount;kbIds=kb.entryIds;
        finalSysprompt=`KNOWLEDGE BASE CONTEXT (use this first before generating — this is curated West Capital intelligence):\n${kb.context}\n\n---\n\n${finalSysprompt}`;
        console.log(`[KB] Hit ${kbCount} entries for feature=${ftag}`);
      } else {
        logKBGap(sb,uid,userMessage,ftag).catch(()=>{});
        console.log(`[KB] Miss for feature=${ftag} — logged to kb_gaps`);
      }
    }

    if(action!=="check_status"&&action!=="test"){ try{ const{data:sr}=await sb.from("user_integrations").select("metadata").eq("user_id",uid).eq("provider","heloc_settings").maybeSingle(); const cp=sr?.metadata?.ai?.customSystemPrompt; if(cp&&(tierLevel>=3||isAdmin))finalSysprompt=cp+"\n\n"+finalSysprompt; }catch(_e){} }

    if(["generate","generate_cascade","generate_super_admin","analyze_image"].includes(action)){
      const{data:bd}=await sb.rpc("get_or_create_token_budget",{p_user_id:uid});
      const b=Array.isArray(bd)?bd[0]:bd;
      if(b&&!isAdmin&&b.tokens_limit!==-1&&b.budget_tokens_used>=b.budget_tokens_limit){
        return json({error:"Monthly AI token budget exceeded",tokens_used:b.budget_tokens_used,tokens_limit:b.budget_tokens_limit,tier:b.budget_tier,upgrade_hint:"Upgrade your tier for more AI tokens"},429);
      }
    }

    if(action==="check_status"){
      const orKey=getKey("openrouter"); const ck=getKey("anthropic");
      return json({
        success:true, configured:!!aiKey, provider:aiProvider, model:aiModel, tier:userTier,
        is_super_admin:isAdmin, ai_mode:aiMode,
        lane:isAdmin?`super_admin_${aiMode}`:"feature_routed",
        kimi_available:!!orKey,
        claude_available:!!ck,
        super_admin_chain: isAdmin ? (orKey?"kimi→claude":ck?"claude_only":"none") : null,
        tier_cascade_entries:TIER_CASCADE_CUTOFF[userTier]||1,
      });
    }

    if(action==="test"){
      const rl=await checkRL(sb,uid); if(!rl.allowed)return json({error:"Rate limited",retry_after_sec:rl.retryAfterSec},429);
      if(isAdmin){
        const r=await superAdminChain("Reply with: Connection successful!", "Test", 50);
        if(r.ok)return json({success:true,text:r.text,provider:r.provider,model:r.model,is_super_admin:true,ai_mode:aiMode,chain:"kimi_first"});
        return json({error:"All super admin providers failed",status:r.status},502);
      }
      const r=await callProvider(aiProvider,aiModel,aiKey,50,"","Say \"Connection successful!\"",aiEndpointUrl);
      if(r.ok){await logUsage(sb,uid,r.provider,r.model,"test","test",r.usage);return json({success:true,text:r.text,provider:r.provider,model:r.model});}
      return json({error:"AI error",status:r.status,details:JSON.stringify(r.aiData||{}).substring(0,500)},502);
    }

    if(action==="generate"||action==="generate_super_admin"){
      if(!userMessage)return json({error:"Missing userMessage"},400);
      const rl=await checkRL(sb,uid); if(!rl.allowed)return json({error:"Rate limited",retry_after_sec:rl.retryAfterSec},429);

      if(isAdmin && aiMode==="cascade"){
        const r=await runCascade(sb,uid,"enterprise",finalSysprompt,userMessage,maxTokens||2500,ftag,kbHit,kbIds,userAiKey);
        if(!r.ok)return json({error:"All cascade providers failed"},502);
        return json({success:true,...r,is_super_admin:true,ai_mode:"cascade",kb_hit:kbHit,kb_entries:kbCount});
      }

      if(isAdmin){
        console.log(`[SuperAdmin:${aiMode}] ${email} | feature=${ftag} | KB=${kbHit} | maxTok=${maxTokens||2500}`);
        const r=await superAdminChain(finalSysprompt,userMessage,maxTokens||2500,imageBase64,imageMimeType);
        if(!r.ok)return json({error:"All super admin providers failed (Kimi + Claude)"},502);
        await logUsage(sb,uid,r.provider,r.model,"generate",ftag||"super_admin",r.usage,{lane:`super_admin_${aiMode}`,kb_hit:kbHit,kb_entries:kbIds,chain:"kimi_then_claude"});
        await logEvent(sb,uid,"ai_call",{provider:r.provider,model:r.model,action:"generate",feature:ftag,total_tokens:r.usage.totalTokens,lane:`super_admin_${aiMode}`,kb_hit:kbHit});
        await incBudget(sb,uid,r.usage.totalTokens);
        return json({success:true,text:r.text,provider:r.provider,model:r.model,usage:r.usage,lane:`super_admin_${aiMode}`,is_super_admin:true,ai_mode:aiMode,kb_hit:kbHit,kb_entries:kbCount});
      }

      if(!aiKey)return json({error:"No AI key configured for "+aiProvider},403);
      const r=await callProvider(aiProvider,aiModel,aiKey,aiMaxTokens,finalSysprompt,userMessage,aiEndpointUrl);
      if(!r.ok)return json({error:"AI error",status:r.status,details:JSON.stringify(r.aiData||{}).substring(0,500)},502);
      console.log(`[Generate] ${userTier} | ${aiProvider}/${aiModel} | feature=${ftag} | KB=${kbHit}`);
      await logUsage(sb,uid,r.provider,r.model,"generate",ftag||"generate",r.usage,{kb_hit:kbHit,kb_entries:kbIds,tier:userTier,feature:ftag});
      await logEvent(sb,uid,"ai_call",{provider:r.provider,model:r.model,action:"generate",feature:ftag,total_tokens:r.usage.totalTokens,kb_hit:kbHit,tier:userTier});
      const bu=await incBudget(sb,uid,r.usage.totalTokens);
      return json({success:true,text:r.text,provider:r.provider,model:r.model,usage:r.usage,kb_hit:kbHit,kb_entries:kbCount,tier:userTier,...bu});
    }

    if(action==="generate_cascade"){
      if(!userMessage)return json({error:"Missing userMessage"},400);
      const rl=await checkRL(sb,uid); if(!rl.allowed)return json({error:"Rate limited",retry_after_sec:rl.retryAfterSec},429);
      const r=await runCascade(sb,uid,userTier,finalSysprompt,userMessage,aiMaxTokens,ftag,kbHit,kbIds,userAiKey);
      if(!r.ok)return json({error:"All cascade providers failed",code:"all_providers_failed",cascadeAttempts:r.attempts},502);
      const bu=await incBudget(sb,uid,r.usage.totalTokens);
      return json({success:true,...r,kb_hit:kbHit,...bu});
    }

    if(action==="analyze_image"){
      if(!imageBase64||!imageMimeType)return json({error:"Missing imageBase64 or imageMimeType"},400);
      const msg=userMessage||"Analyze this image in detail.";
      const rl=await checkRL(sb,uid); if(!rl.allowed)return json({error:"Rate limited",retry_after_sec:rl.retryAfterSec},429);
      if(isAdmin){
        const r=await superAdminChain(finalSysprompt,msg,aiMaxTokens,imageBase64,imageMimeType);
        if(r.ok){
          await logUsage(sb,uid,r.provider,r.model,"analyze_image",intent||"document_analysis",r.usage);
          const bu=await incBudget(sb,uid,r.usage.totalTokens);
          return json({success:true,text:r.text,provider:r.provider,model:r.model,usage:r.usage,is_super_admin:true,...bu});
        }
      }
      const vCascade=["gemini","openai","anthropic"];
      const attempts:string[]=[];
      for(const prov of vCascade){
        const keys=getAllKeys(prov,prov===aiProvider?userAiKey:""); if(!keys.length)continue;
        const pm=prov==="anthropic"?CLAUDE_SONNET:(DEFAULT_MODELS[prov]||"gpt-4o-mini");
        for(let ki=0;ki<keys.length;ki++){
          const kl=`${prov}[${ki}]`; attempts.push(kl);
          const r=await callProvider(prov,pm,keys[ki],aiMaxTokens,finalSysprompt,msg,"",imageBase64,imageMimeType,CASCADE_TIMEOUT_MS);
          if(r.ok){
            await logUsage(sb,uid,prov,pm,"analyze_image",intent||"document_analysis",r.usage);
            const bu=await incBudget(sb,uid,r.usage.totalTokens);
            return json({success:true,text:r.text,provider:prov,model:pm,usage:r.usage,cascadeAttempts:attempts,...bu});
          }
        }
      }
      return json({error:"All vision providers failed"},502);
    }

    if(action==="set_ai_mode"){
      if(!isAdmin)return json({error:"Super admin only"},403);
      const newMode=body.mode;
      if(!["auto","claude","cascade","gemini"].includes(newMode))return json({error:"Invalid mode. Use: auto|claude|cascade|gemini"},400);
      await sb.from("profiles").update({preferred_ai_mode:newMode}).eq("id",uid);
      console.log(`[SuperAdmin] ${email} set AI mode → ${newMode}`);
      return json({success:true,ai_mode:newMode,message:`AI mode set to ${newMode}. Super admin chain: Kimi→Claude will be used for auto/claude modes.`});
    }

    return json({error:"Unknown action: "+action},400);
  }catch(err){
    console.error("ai-proxy error:",err);
    return json({error:(err as Error)?.message||"Internal error"},500);
  }
});

// ─── TIER-AWARE CASCADE ────────────────────────────────────────────────────────
async function runCascade(sb:any,uid:string,tier:string,sysprompt:string,usermsg:string,maxTok:number,ftag:string,kbHit:boolean,kbIds:string[],userKey:string):Promise<any>{
  const cutoff=TIER_CASCADE_CUTOFF[tier]??1;
  const allowed=CASCADE_ORDER.slice(0,cutoff);
  const attempts:string[]=[];
  for(const e of allowed){
    const keys=getAllKeys(e.name,e.name==="gemini"?userKey:"");
    if(!keys.length){console.log(`[Cascade] Skip ${e.name} — no key`);continue;}
    for(let ki=0;ki<keys.length;ki++){
      const kl=keys.length>1?`${e.name}[${ki+1}/${keys.length}]`:e.name; attempts.push(kl);
      try{
        const r=await callProvider(e.name,e.model,keys[ki],maxTok,sysprompt,usermsg,e.url,undefined,undefined,CASCADE_TIMEOUT_MS);
        if(r.ok){
          console.log(`[Cascade:${tier}] Used ${e.name} after ${attempts.length} attempt(s)`);
          await logUsage(sb,uid,e.name,e.model,"generate_cascade",ftag||"generate",r.usage,{cascade_attempts:attempts,kb_hit:kbHit,kb_entries:kbIds,tier});
          await logEvent(sb,uid,"ai_call",{provider:e.name,model:e.model,action:"generate_cascade",feature:ftag,total_tokens:r.usage.totalTokens,cascade_attempts:attempts,kb_hit:kbHit,tier});
          return{ok:true,text:r.text,provider:e.name,model:e.model,usage:r.usage,cascadeAttempts:attempts};
        }
        console.log(`[Cascade] ${kl} failed (${r.status}) — next`);
      }catch(err){console.log(`[Cascade] ${kl} threw — next`,err);}
    }
  }
  return{ok:false,text:"",usage:{inputTokens:0,outputTokens:0,totalTokens:0},provider:"",model:"",attempts};
}

// ─── BACKGROUND HELPERS ────────────────────────────────────────────────────────
async function logKBGap(sb:any,uid:string,q:string,feat:string){ try{await sb.from("kb_gaps").insert({user_id:uid,query:q.substring(0,500),feature:feat,created_at:new Date().toISOString()});}catch(_e){} }
async function incBudget(sb:any,uid:string,tokens:number){ try{const{data:d}=await sb.rpc("increment_token_usage",{p_user_id:uid,p_tokens:tokens});const b=Array.isArray(d)?d[0]:d;if(b)return{tokens_used:b.tokens_used,tokens_limit:b.tokens_limit,tier:b.tier};}catch(e){console.error("Budget inc error:",e);}return{}; }
async function logUsage(sb:any,uid:string,provider:string,model:string,action:string,intent:string,usage:{inputTokens:number;outputTokens:number;totalTokens:number},meta?:Record<string,any>){ try{const cost=estimateCost(provider,usage.inputTokens,usage.outputTokens);await sb.from("ai_usage_log").insert({user_id:uid,provider,model,action,intent,input_tokens:usage.inputTokens,output_tokens:usage.outputTokens,estimated_cost_usd:cost,metadata:meta||{}});}catch(e){console.error("logUsage error:",e);} }
async function logEvent(sb:any,uid:string,et:string,meta:Record<string,any>){ try{await sb.from("usage_events").insert({user_id:uid,event_type:et,metadata:meta||{}});}catch(e){console.error("logEvent error:",e);} }
async function checkRL(sb:any,uid:string):Promise<{allowed:boolean;retryAfterSec?:number}>{
  const now=new Date(),ni=now.toISOString();
  try{
    const{data:row,error}=await sb.from("ai_proxy_rate_limits").select("user_id,window_start,request_count").eq("user_id",uid).maybeSingle();
    if(error){console.error("RL read error:",error);return{allowed:true};}
    if(!row){await sb.from("ai_proxy_rate_limits").upsert({user_id:uid,window_start:ni,request_count:1,updated_at:ni});return{allowed:true};}
    const exp=new Date(row.window_start).getTime()+RL_WINDOW_MS;
    if(now.getTime()>=exp){await sb.from("ai_proxy_rate_limits").upsert({user_id:uid,window_start:ni,request_count:1,updated_at:ni});return{allowed:true};}
    const cnt=Number(row.request_count||0);
    if(cnt>=RL_MAX_REQ)return{allowed:false,retryAfterSec:Math.max(1,Math.ceil((exp-now.getTime())/1000))};
    await sb.from("ai_proxy_rate_limits").upsert({user_id:uid,window_start:row.window_start,request_count:cnt+1,updated_at:ni});
    return{allowed:true};
  }catch(e){console.error("RL error:",e);return{allowed:true};}
}
