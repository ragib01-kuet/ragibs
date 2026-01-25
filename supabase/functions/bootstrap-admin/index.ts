import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Body = {
  token: string;
};

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function safeEqual(a: string, b: string) {
  // constant-time-ish compare to avoid timing leaks
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  const len = Math.max(aa.length, bb.length);
  let out = 0;
  for (let i = 0; i < len; i++) out |= (aa[i] ?? 0) ^ (bb[i] ?? 0);
  return out === 0 && aa.length === bb.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const bootstrapToken = Deno.env.get("ADMIN_BOOTSTRAP_TOKEN") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !anonKey || !bootstrapToken) {
    return json(500, { error: "Server misconfigured" });
  }

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
  const token = asString(body?.token).trim();
  if (!token || token.length > 256) return json(400, { error: "Invalid token" });
  if (!safeEqual(token, bootstrapToken)) return json(403, { error: "Invalid bootstrap token" });

  // Only allow bootstrapping the first admin.
  const { data: existingAdmin, error: existingAdminErr } = await admin
    .from("user_roles")
    .select("id")
    .eq("role", "admin")
    .limit(1);
  if (existingAdminErr) return json(500, { error: existingAdminErr.message });
  if ((existingAdmin ?? []).length > 0) {
    return json(409, { error: "Admin already initialized" });
  }

  const { error: insertErr } = await admin.from("user_roles").insert({ user_id: userId, role: "admin" });
  if (insertErr && !/duplicate key|unique/i.test(insertErr.message)) {
    return json(500, { error: insertErr.message });
  }

  return json(200, { ok: true });
});
