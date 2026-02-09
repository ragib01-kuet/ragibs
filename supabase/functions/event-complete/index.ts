import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // Must include all headers the client may send (including platform/runtime headers)
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Body = {
  eventId: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    "";
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Server misconfigured" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Allow anonymous access (for public project)
  const { data: userData, error: userErr } = await authed.auth.getUser();
  const userId = userData?.user?.id ?? null;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!body?.eventId) return json(400, { error: "Missing eventId" });

  const { data: event, error: eventErr } = await admin
    .from("timeline_events")
    .select("id,video_id,at_seconds,type")
    .eq("id", body.eventId)
    .maybeSingle();
  if (eventErr) return json(500, { error: eventErr.message });
  if (!event) return json(404, { error: "Event not found" });

  // Do NOT allow completing quiz events here (must be graded via quiz-attempt)
  if (event.type === "quiz") return json(400, { error: "Use quiz-attempt for quiz events" });

  const { data: video, error: videoErr } = await admin
    .from("videos")
    .select("id,published,owner_id")
    .eq("id", event.video_id)
    .maybeSingle();
  if (videoErr) return json(500, { error: videoErr.message });
  if (!video) return json(404, { error: "Video not found" });

  // Access: allow if video is published OR user is owner (teacher preview) OR admin.
  const { data: adminRoleRow, error: adminRoleErr } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (adminRoleErr) return json(500, { error: adminRoleErr.message });
  const isAdmin = Boolean(adminRoleRow);
  const canAccess = Boolean(video.published || video.owner_id === userId || isAdmin);
  if (!canAccess) return json(403, { error: "Forbidden" });

  // If anonymous, just return ok without saving anything
  if (!userId) {
    return json(200, { ok: true });
  }

  // Record completion for signed-in users
  const { error: compErr } = await admin.from("video_event_completions").insert({
    event_id: event.id,
    user_id: userId,
  });
  if (compErr && !/duplicate key|unique/i.test(compErr.message)) {
    return json(500, { error: compErr.message });
  }

  // Update progress to at least this timestamp
  const { data: existingProgress } = await admin
    .from("video_progress")
    .select("id,unlocked_until_seconds")
    .eq("video_id", event.video_id)
    .eq("user_id", userId)
    .maybeSingle();

  const nextUnlocked = Math.max(existingProgress?.unlocked_until_seconds ?? 0, event.at_seconds ?? 0);
  if (existingProgress?.id) {
    const { error: upErr } = await admin
      .from("video_progress")
      .update({ unlocked_until_seconds: nextUnlocked })
      .eq("id", existingProgress.id);
    if (upErr) return json(500, { error: upErr.message });
  } else {
    const { error: insErr } = await admin.from("video_progress").insert({
      video_id: event.video_id,
      user_id: userId,
      unlocked_until_seconds: nextUnlocked,
    });
    if (insErr) return json(500, { error: insErr.message });
  }

  return json(200, { ok: true });
});
