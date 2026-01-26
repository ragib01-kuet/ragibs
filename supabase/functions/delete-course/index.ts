import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  courseId: string;
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

async function getRoles(admin: any, userId: string) {
  const { data: roleRows, error: rolesErr } = await admin.from("user_roles").select("role").eq("user_id", userId);
  if (rolesErr) return { ok: false as const, status: 500, error: rolesErr.message };
  return { ok: true as const, roles: new Set((roleRows ?? []).map((r: any) => r.role)) };
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
  const courseId = asString(body?.courseId).trim();
  if (!courseId) return json(400, { error: "Missing courseId" });

  const { data: course, error: courseErr } = await admin
    .from("courses")
    .select("id,owner_id,thumbnail_url")
    .eq("id", courseId)
    .maybeSingle();
  if (courseErr) return json(500, { error: courseErr.message });
  if (!course) return json(404, { error: "Course not found" });

  const rolesRes = await getRoles(admin, userId);
  if (!rolesRes.ok) return json(rolesRes.status, { error: rolesRes.error });
  const roles = rolesRes.roles;
  const isAdmin = roles.has("admin");
  const isTeacher = roles.has("teacher");
  const canDelete = Boolean(isAdmin || (isTeacher && course.owner_id === userId));
  if (!canDelete) return json(403, { error: "Forbidden" });

  const { data: videos, error: vidsErr } = await admin
    .from("videos")
    .select("id,video_url")
    .eq("course_id", courseId);
  if (vidsErr) return json(500, { error: vidsErr.message });

  // Delete videos + their dependent data + their files.
  for (const v of videos ?? []) {
    const videoId = asString((v as any).id);
    if (!videoId) continue;

    const del = await cascadeDeleteVideo(admin, videoId);
    if (!del.ok) return json(del.status, { error: del.error });

    const videoUrl = asString((v as any).video_url);
    const videoPath = videoUrl ? extractPublicObjectPath(videoUrl, "videos") : null;
    if (videoPath) {
      const { error: rmErr } = await admin.storage.from("videos").remove([videoPath]);
      if (rmErr && !/not.*found/i.test(rmErr.message)) return json(500, { error: rmErr.message });
    }
  }

  // Remove thumbnail file if it was stored in our public bucket.
  const thumbUrl = asString(course.thumbnail_url);
  const thumbPath = thumbUrl ? extractPublicObjectPath(thumbUrl, "course-thumbnails") : null;
  if (thumbPath) {
    const { error: rmThumbErr } = await admin.storage.from("course-thumbnails").remove([thumbPath]);
    if (rmThumbErr && !/not.*found/i.test(rmThumbErr.message)) return json(500, { error: rmThumbErr.message });
  }

  const { error: delCourseErr } = await admin.from("courses").delete().eq("id", courseId);
  if (delCourseErr) return json(500, { error: delCourseErr.message });

  return json(200, { ok: true });
});
