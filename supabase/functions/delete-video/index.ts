import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  videoId: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function extractPublicObjectPath(url: string, bucket: string): string | null {
  try {
    const u = new URL(url);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    const after = u.pathname.slice(idx + marker.length);
    return decodeURIComponent(after);
  } catch {
    return null;
  }
}

async function ensureCanDeleteVideo(admin: any, userId: string, videoId: string) {
  const { data: video, error: videoErr } = await admin
    .from("videos")
    .select("id,owner_id,video_url")
    .eq("id", videoId)
    .maybeSingle();
  if (videoErr) return { ok: false as const, status: 500, error: videoErr.message };
  if (!video) return { ok: false as const, status: 404, error: "Video not found" };

  const { data: roleRows, error: rolesErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (rolesErr) return { ok: false as const, status: 500, error: rolesErr.message };

  const roles = new Set((roleRows ?? []).map((r: any) => r.role));
  const isAdmin = roles.has("admin");
  const isTeacher = roles.has("teacher");
  const canDelete = Boolean(isAdmin || (isTeacher && video.owner_id === userId));
  if (!canDelete) return { ok: false as const, status: 403, error: "Forbidden" };

  return { ok: true as const, video };
}

async function cascadeDeleteVideo(admin: any, videoId: string) {
  const { data: events, error: eventsErr } = await admin
    .from("timeline_events")
    .select("id")
    .eq("video_id", videoId);
  if (eventsErr) return { ok: false as const, status: 500, error: eventsErr.message };

  const eventIds = (events ?? []).map((e: any) => e.id).filter(Boolean);

  if (eventIds.length > 0) {
    const { error: qErr } = await admin.from("quizzes").delete().in("event_id", eventIds);
    if (qErr) return { ok: false as const, status: 500, error: qErr.message };

    const { error: qaErr } = await admin.from("quiz_attempts").delete().in("event_id", eventIds);
    if (qaErr) return { ok: false as const, status: 500, error: qaErr.message };

    const { error: elErr } = await admin.from("exam_launches").delete().in("event_id", eventIds);
    if (elErr) return { ok: false as const, status: 500, error: elErr.message };

    const { error: compErr } = await admin.from("video_event_completions").delete().in("event_id", eventIds);
    if (compErr) return { ok: false as const, status: 500, error: compErr.message };

    const { error: delEventsErr } = await admin.from("timeline_events").delete().eq("video_id", videoId);
    if (delEventsErr) return { ok: false as const, status: 500, error: delEventsErr.message };
  }

  const { error: progErr } = await admin.from("video_progress").delete().eq("video_id", videoId);
  if (progErr) return { ok: false as const, status: 500, error: progErr.message };

  const { error: vidErr } = await admin.from("videos").delete().eq("id", videoId);
  if (vidErr) return { ok: false as const, status: 500, error: vidErr.message };

  return { ok: true as const };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return json(500, { error: "Server misconfigured" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const authed = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData.user) return json(401, { error: "Unauthorized" });
  const userId = userData.user.id;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const videoId = asString(body?.videoId).trim();
  if (!videoId) return json(400, { error: "Missing videoId" });

  const can = await ensureCanDeleteVideo(admin, userId, videoId);
  if (!can.ok) return json(can.status, { error: can.error });

  const videoUrl = asString(can.video.video_url);
  const storagePath = videoUrl ? extractPublicObjectPath(videoUrl, "videos") : null;

  const del = await cascadeDeleteVideo(admin, videoId);
  if (!del.ok) return json(del.status, { error: del.error });

  if (storagePath) {
    const { error: rmErr } = await admin.storage.from("videos").remove([storagePath]);
    if (rmErr && !/not.*found/i.test(rmErr.message)) {
      return json(500, { error: rmErr.message });
    }
  }

  return json(200, { ok: true });
});
