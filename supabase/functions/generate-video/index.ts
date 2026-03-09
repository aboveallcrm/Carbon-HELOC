import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function error(status: number, message: string) {
  return json({ error: message }, status);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const { action } = body;

    // ---- Public action: poll by quote_link_code (no JWT needed) ----
    if (action === "poll_public") {
      const { videoId, code } = body;
      if (!videoId || !code) return error(400, "Missing videoId or code");

      const { data: row } = await sb
        .from("heygen_videos")
        .select("status, video_url, thumbnail_url")
        .eq("heygen_video_id", videoId)
        .eq("quote_link_code", code)
        .maybeSingle();

      if (!row) return error(404, "Video not found");

      // If still processing, try polling HeyGen directly
      if (row.status === "processing" || row.status === "pending") {
        // Look up the user's API key to poll HeyGen
        const { data: videoRow } = await sb
          .from("heygen_videos")
          .select("user_id")
          .eq("heygen_video_id", videoId)
          .maybeSingle();

        if (videoRow?.user_id) {
          const { data: integration } = await sb
            .from("user_integrations")
            .select("metadata")
            .eq("user_id", videoRow.user_id)
            .eq("provider", "heloc_settings")
            .maybeSingle();

          const apiKey = integration?.metadata?.heygen?.apiKey;
          if (apiKey) {
            const hgResp = await fetch(
              `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
              { headers: { "X-Api-Key": apiKey } }
            );
            if (hgResp.ok) {
              const hgResult = await hgResp.json();
              const hgStatus = hgResult.data?.status;
              const videoUrl = hgResult.data?.video_url;
              const thumbUrl = hgResult.data?.thumbnail_url;

              if (hgStatus === "completed" && videoUrl) {
                await sb
                  .from("heygen_videos")
                  .update({
                    status: "completed",
                    video_url: videoUrl,
                    thumbnail_url: thumbUrl || null,
                    completed_at: new Date().toISOString(),
                  })
                  .eq("heygen_video_id", videoId);

                return json({ status: "completed", videoUrl, thumbnailUrl: thumbUrl });
              } else if (hgStatus === "failed") {
                await sb
                  .from("heygen_videos")
                  .update({
                    status: "failed",
                    error_message: hgResult.data?.error || "Unknown error",
                  })
                  .eq("heygen_video_id", videoId);

                return json({ status: "failed" });
              }
            }
          }
        }
      }

      return json({
        status: row.status,
        videoUrl: row.video_url,
        thumbnailUrl: row.thumbnail_url,
      });
    }

    // ---- Authenticated actions: require JWT ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return error(401, "Missing authorization header");

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await sb.auth.getUser(token);
    if (authError || !user) return error(401, "Invalid or expired token");

    const userId = user.id;

    // Look up HeyGen config from user_integrations
    const { data: integration } = await sb
      .from("user_integrations")
      .select("metadata")
      .eq("user_id", userId)
      .eq("provider", "heloc_settings")
      .maybeSingle();

    const heygenConfig = integration?.metadata?.heygen;

    // ---- check_status: verify API key + avatar ----
    if (action === "check_status") {
      if (!heygenConfig?.apiKey) {
        return json({ configured: false, valid: false });
      }
      try {
        const resp = await fetch("https://api.heygen.com/v2/avatars", {
          headers: { "X-Api-Key": heygenConfig.apiKey },
        });
        return json({
          configured: true,
          valid: resp.ok,
          avatarId: heygenConfig.avatarId || null,
          voiceId: heygenConfig.voiceId || null,
        });
      } catch {
        return json({ configured: true, valid: false });
      }
    }

    if (!heygenConfig?.apiKey)
      return error(403, "HeyGen not configured. Add your API key in Integrations.");
    if (!heygenConfig?.avatarId)
      return error(403, "No avatar ID configured. Create your avatar in HeyGen first.");

    // ---- generate: create a personalized video ----
    if (action === "generate") {
      const { scriptText, scriptVariables, quoteLinkCode } = body;
      if (!scriptText) return error(400, "Missing scriptText");

      const videoPayload: Record<string, unknown> = {
        video_inputs: [
          {
            character: {
              type: "avatar",
              avatar_id: heygenConfig.avatarId,
              avatar_style: "normal",
            },
            voice: {
              type: "text",
              input_text: scriptText,
              ...(heygenConfig.voiceId
                ? { voice_id: heygenConfig.voiceId }
                : {}),
            },
          },
        ],
        dimension: { width: 1280, height: 720 },
      };

      const resp = await fetch("https://api.heygen.com/v2/video/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": heygenConfig.apiKey,
        },
        body: JSON.stringify(videoPayload),
      });

      const result = await resp.json();
      if (!resp.ok) {
        return error(
          502,
          "HeyGen API error: " + (result.message || result.error || resp.statusText)
        );
      }

      const videoId = result.data?.video_id;
      if (!videoId) return error(502, "HeyGen did not return a video_id");

      // Cache in heygen_videos table
      await sb.from("heygen_videos").insert({
        user_id: userId,
        heygen_video_id: videoId,
        status: "processing",
        script_text: scriptText,
        script_variables: scriptVariables || {},
        quote_link_code: quoteLinkCode || null,
      });

      return json({ videoId, status: "processing" });
    }

    // ---- poll: check video generation status ----
    if (action === "poll") {
      const { videoId } = body;
      if (!videoId) return error(400, "Missing videoId");

      const resp = await fetch(
        `https://api.heygen.com/v1/video_status.get?video_id=${videoId}`,
        { headers: { "X-Api-Key": heygenConfig.apiKey } }
      );

      if (!resp.ok) {
        return error(502, "Failed to check video status");
      }

      const result = await resp.json();
      const status = result.data?.status; // pending, processing, completed, failed
      const videoUrl = result.data?.video_url;
      const thumbnailUrl = result.data?.thumbnail_url;
      const duration = result.data?.duration;

      // Update cache table
      if (status === "completed" && videoUrl) {
        await sb
          .from("heygen_videos")
          .update({
            status: "completed",
            video_url: videoUrl,
            thumbnail_url: thumbnailUrl || null,
            duration_seconds: duration ? Math.round(duration) : null,
            completed_at: new Date().toISOString(),
          })
          .eq("heygen_video_id", videoId)
          .eq("user_id", userId);
      } else if (status === "failed") {
        await sb
          .from("heygen_videos")
          .update({
            status: "failed",
            error_message: result.data?.error || "Unknown error",
          })
          .eq("heygen_video_id", videoId)
          .eq("user_id", userId);
      }

      return json({ status, videoUrl, thumbnailUrl, duration });
    }

    // ---- list_avatars: get available avatars ----
    if (action === "list_avatars") {
      const resp = await fetch("https://api.heygen.com/v2/avatars", {
        headers: { "X-Api-Key": heygenConfig.apiKey },
      });
      if (!resp.ok) return error(502, "Failed to list avatars");
      return json(await resp.json());
    }

    return error(400, "Unknown action: " + action);
  } catch (e) {
    return error(500, "Internal error: " + (e as Error).message);
  }
});
