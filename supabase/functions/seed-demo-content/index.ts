import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SeedBody = {
  examUrl?: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Server misconfigured" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const authed = createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userErr } = await authed.auth.getUser();
  if (userErr || !userData.user) return json(401, { error: "Unauthorized" });
  const userId = userData.user.id;

  // Admin-only action (roles are stored in a separate table)
  const { data: adminRoleRow, error: adminRoleErr } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (adminRoleErr) return json(500, { error: adminRoleErr.message });
  if (!adminRoleRow) return json(403, { error: "Forbidden" });

  let body: SeedBody = {};
  try {
    body = (await req.json()) as SeedBody;
  } catch {
    // allow empty body
  }

  // NOTE: exam URL is validated in DB trigger (allowed hosts: testmoz.com / rayvila.com)
  const examUrl = asString(body.examUrl)?.trim() || "https://www.testmoz.com/";

  // 1) Create course
  const courseIns = await admin
    .from("courses")
    .insert({
      owner_id: userId,
      title: "Demo Course: Interactive Video Learning",
      description: "A working demo showing quizzes, simulations, and in-player exams.",
      published: true,
      featured: true,
      featured_rank: 1,
      tags: ["demo", "interactive"],
    })
    .select("id")
    .single();
  if (courseIns.error) return json(500, { error: courseIns.error.message });

  const courseId = courseIns.data.id as string;

  // 2) Create video
  // Public sample MP4 that works without requiring uploads.
  const videoIns = await admin
    .from("videos")
    .insert({
      owner_id: userId,
      course_id: courseId,
      title: "Demo Video: Timeline Events",
      description: "Watch until checkpoints appear. Quizzes must be answered correctly to unlock forward seeking.",
      published: true,
      video_url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      duration_seconds: 60,
      lecture_sheet_url: "https://developer.mozilla.org/en-US/",
    })
    .select("id")
    .single();
  if (videoIns.error) return json(500, { error: videoIns.error.message });

  const videoId = videoIns.data.id as string;

  // 3) Create events
  const quiz1 = await admin
    .from("timeline_events")
    .insert({
      owner_id: userId,
      video_id: videoId,
      type: "quiz",
      at_seconds: 10,
      required: true,
      title: "Checkpoint #1",
      payload: {},
    })
    .select("id")
    .single();
  if (quiz1.error) return json(500, { error: quiz1.error.message });

  const quiz2 = await admin
    .from("timeline_events")
    .insert({
      owner_id: userId,
      video_id: videoId,
      type: "quiz",
      at_seconds: 25,
      required: true,
      title: "Checkpoint #2",
      payload: {},
    })
    .select("id")
    .single();
  if (quiz2.error) return json(500, { error: quiz2.error.message });

  const simulation = await admin
    .from("timeline_events")
    .insert({
      owner_id: userId,
      video_id: videoId,
      type: "simulation",
      at_seconds: 40,
      required: true,
      title: "Simulation (demo)",
      payload: { simulation_url: "/simulations/demo.html" },
    })
    .select("id")
    .single();
  if (simulation.error) return json(500, { error: simulation.error.message });

  const exam = await admin
    .from("timeline_events")
    .insert({
      owner_id: userId,
      video_id: videoId,
      type: "exam",
      at_seconds: 55,
      required: false,
      title: "Exam (external)",
      payload: { url: examUrl },
    })
    .select("id")
    .single();
  if (exam.error) return json(500, { error: exam.error.message });

  // 4) Create quizzes
  const q1 = await admin.from("quizzes").insert({
    event_id: quiz1.data.id,
    question: "Which action unlocks forward seeking?",
    options: ["Watching only", "Answering quizzes correctly", "Refreshing the page", "Changing playback speed"],
    correct_index: 1,
  });
  if (q1.error) return json(500, { error: q1.error.message });

  const q2 = await admin.from("quizzes").insert({
    event_id: quiz2.data.id,
    question: "Where does the simulation load for students?",
    options: ["Inside the video canvas overlay", "Only in a new tab", "In the admin page", "As a downloadable file"],
    correct_index: 0,
  });
  if (q2.error) return json(500, { error: q2.error.message });

  return json(200, {
    ok: true,
    courseId,
    videoId,
    eventIds: {
      quiz1: quiz1.data.id,
      quiz2: quiz2.data.id,
      simulation: simulation.data.id,
      exam: exam.data.id,
    },
  });
});
