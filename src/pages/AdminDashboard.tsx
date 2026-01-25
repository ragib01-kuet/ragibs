import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { toast } from "@/hooks/use-toast";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { session, roles, loading } = useAuth();
  const isAdmin = roles.includes("admin");
  const canUse = useMemo(() => Boolean(session && isAdmin), [session, isAdmin]);

  const [seedBusy, setSeedBusy] = useState(false);

  useEffect(() => {
    if (!loading && !session) navigate("/login");
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!loading && session && !isAdmin) navigate("/courses");
  }, [loading, session, isAdmin, navigate]);

  const healthQuery = useQuery({
    queryKey: ["admin", "health"],
    enabled: canUse,
    queryFn: async () => {
      const [courses, videos, events, quizzes, pendingRequests] = await Promise.all([
        supabase.from("courses").select("id", { count: "exact", head: true }),
        supabase.from("videos").select("id", { count: "exact", head: true }),
        supabase.from("timeline_events").select("id", { count: "exact", head: true }),
        supabase.from("quizzes").select("id", { count: "exact", head: true }),
        supabase.from("teacher_role_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);

      const errs = [courses.error, videos.error, events.error, quizzes.error, pendingRequests.error].filter(Boolean);
      if (errs.length) throw errs[0];

      return {
        courses: courses.count ?? 0,
        videos: videos.count ?? 0,
        events: events.count ?? 0,
        quizzes: quizzes.count ?? 0,
        pendingTeacherRequests: pendingRequests.count ?? 0,
      };
    },
  });

  const seeded = (healthQuery.data?.courses ?? 0) > 0 && (healthQuery.data?.videos ?? 0) > 0;

  return (
    <AppShell title="Admin Dashboard">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Common admin tasks for setup and moderation.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link to="/admin/invites">Manage invites</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/admin/teacher-requests">Review teacher requests</Link>
            </Button>
            <Button
              variant="secondary"
              disabled={!canUse || seedBusy}
              onClick={async () => {
                setSeedBusy(true);
                try {
                  const res = await supabase.functions.invoke("seed-demo-content", { body: {} });
                  if (res.error) throw res.error;
                  toast({ title: "Demo content created" });
                  await healthQuery.refetch();
                } catch (e: any) {
                  toast({
                    title: "Failed to seed demo content",
                    description: e?.message ?? "Please try again.",
                    variant: "destructive",
                  });
                } finally {
                  setSeedBusy(false);
                }
              }}
            >
              {seedBusy ? "Creating demo…" : "Seed demo content"}
            </Button>
          </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>Health checks</CardTitle>
            <CardDescription>Basic readiness signals (content + queues).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {healthQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : healthQuery.isError ? (
              <p className="text-sm text-destructive">Failed to load health checks.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">Content seeded</div>
                    <div className="text-xs text-muted-foreground">At least 1 course + 1 video</div>
                  </div>
                  <Badge variant={seeded ? "secondary" : "outline"}>{seeded ? "OK" : "Missing"}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">Pending teacher requests</div>
                    <div className="text-xs text-muted-foreground">Needs review</div>
                  </div>
                  <Badge variant={(healthQuery.data?.pendingTeacherRequests ?? 0) > 0 ? "secondary" : "outline"}>
                    {healthQuery.data?.pendingTeacherRequests ?? 0}
                  </Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">Courses</div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  <Badge variant="outline">{healthQuery.data?.courses ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">Videos</div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  <Badge variant="outline">{healthQuery.data?.videos ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">Timeline events</div>
                    <div className="text-xs text-muted-foreground">Quizzes / exams / sims</div>
                  </div>
                  <Badge variant="outline">{healthQuery.data?.events ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <div className="text-sm font-medium">Quizzes</div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  <Badge variant="outline">{healthQuery.data?.quizzes ?? 0}</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
