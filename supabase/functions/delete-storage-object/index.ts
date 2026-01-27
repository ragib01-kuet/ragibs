import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  bucket: string;
  path: string;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Lovable Cloud exposes SUPABASE_ANON_KEY; keep a fallback for older setups.
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json(500, {
      error: "Server misconfigured",
      hasUrl: Boolean(supabaseUrl),
      hasServiceRoleKey: Boolean(serviceRoleKey),
      hasAnonKey: Boolean(anonKey),
    });
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

  const bucket = asString(body?.bucket).trim();
  const path = asString(body?.path).trim();
  if (!bucket || !path) return json(400, { error: "Missing bucket/path" });

  // Only allow deleting personal uploads from the videos bucket.
  if (bucket !== "videos") return json(400, { error: "Unsupported bucket" });
  if (!path.startsWith(`${userId}/`)) return json(403, { error: "Forbidden" });

  const { error: rmErr } = await admin.storage.from(bucket).remove([path]);
  if (rmErr && !/not.*found/i.test(rmErr.message)) return json(500, { error: rmErr.message });

  return json(200, { ok: true });
});
