import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";

type Video = {
  id: string;
  title: string;
  course_id: string;
  owner_id: string;
};

type Course = {
  id: string;
  title: string;
  featured: boolean;
  featured_rank: number;
};

type EventRow = {
  id: string;
  video_id: string;
  type: "quiz" | "exam" | "simulation";
};

export default function TeacherAnalytics() {
  const navigate = useNavigate();
  const { session, roles, loading } = useAuth();
  const isTeacher = roles.includes("teacher") || roles.includes("admin");

  useEffect(() => {
    if (!loading && !session) navigate("/login");
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!loading && session && !isTeacher) navigate("/");
  }, [loading, session, isTeacher, navigate]);

  const canUse = Boolean(session && isTeacher);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyticsQuery = useQuery({
    queryKey: ["teacher", "analytics"],
    enabled: canUse,
    queryFn: async () => {
      // 1) Videos that the teacher/admin can see (RLS will filter)
      const vr = await supabase.from("videos").select("id,title,course_id,owner_id").order("created_at", { ascending: false });
      if (vr.error) throw vr.error;
      const videos = (vr.data ?? []) as Video[];
      if (videos.length === 0) return { videos: [], coursesById: new Map<string, Course>(), statsByVideoId: new Map<string, any>() };

      const courseIds = Array.from(new Set(videos.map((v) => v.course_id)));
      const cr = await supabase.from("courses").select("id,title,featured,featured_rank").in("id", courseIds);
      if (cr.error) throw cr.error;
      const courses = (cr.data ?? []) as Course[];
      const coursesById = new Map(courses.map((c) => [c.id, c] as const));

      // 2) Timeline events for those videos
      const videoIds = videos.map((v) => v.id);
      const er = await supabase.from("timeline_events").select("id,video_id,type").in("video_id", videoIds);
      if (er.error) throw er.error;
      const events = (er.data ?? []) as EventRow[];

      const eventIds = events.map((e) => e.id);
      const quizEventIds = events.filter((e) => e.type === "quiz").map((e) => e.id);
      const examEventIds = events.filter((e) => e.type === "exam").map((e) => e.id);

      // 3) Counts (RLS-protected)
      const [examLaunchesRes, quizAttemptsRes, completionsRes] = await Promise.all([
        examEventIds.length
          ? supabase.from("exam_launches").select("event_id,user_id").in("event_id", examEventIds)
          : Promise.resolve({ data: [], error: null } as any),
        quizEventIds.length
          ? supabase.from("quiz_attempts").select("event_id,is_correct,user_id").in("event_id", quizEventIds)
          : Promise.resolve({ data: [], error: null } as any),
        eventIds.length
          ? supabase.from("video_event_completions").select("event_id,user_id").in("event_id", eventIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (examLaunchesRes.error) throw examLaunchesRes.error;
      if (quizAttemptsRes.error) throw quizAttemptsRes.error;
      if (completionsRes.error) throw completionsRes.error;

      // 4) Aggregate per video
      const videoIdByEventId = new Map(events.map((e) => [e.id, e.video_id] as const));
      const statsByVideoId = new Map<
        string,
        {
          quizAttempts: number;
          quizCorrect: number;
          examLaunches: number;
          completions: number;
          uniqueStudents: Set<string>;
        }
      >();

      const ensure = (videoId: string) => {
        const cur = statsByVideoId.get(videoId);
        if (cur) return cur;
        const next = { quizAttempts: 0, quizCorrect: 0, examLaunches: 0, completions: 0, uniqueStudents: new Set<string>() };
        statsByVideoId.set(videoId, next);
        return next;
      };

      for (const r of examLaunchesRes.data ?? []) {
        const videoId = videoIdByEventId.get(r.event_id as string);
        if (!videoId) continue;
        const s = ensure(videoId);
        s.examLaunches += 1;
        s.uniqueStudents.add(r.user_id as string);
      }

      for (const r of quizAttemptsRes.data ?? []) {
        const videoId = videoIdByEventId.get(r.event_id as string);
        if (!videoId) continue;
        const s = ensure(videoId);
        s.quizAttempts += 1;
        if (r.is_correct) s.quizCorrect += 1;
        s.uniqueStudents.add(r.user_id as string);
      }

      for (const r of completionsRes.data ?? []) {
        const videoId = videoIdByEventId.get(r.event_id as string);
        if (!videoId) continue;
        const s = ensure(videoId);
        s.completions += 1;
        s.uniqueStudents.add(r.user_id as string);
      }

      return { videos, coursesById, statsByVideoId };
    },
  });

  const featuredCourses = useMemo(() => {
    const data = analyticsQuery.data;
    if (!data) return [] as Course[];
    return Array.from(data.coursesById.values())
      .filter((c) => c.featured)
      .sort((a, b) => (a.featured_rank ?? 0) - (b.featured_rank ?? 0));
  }, [analyticsQuery.data]);

  async function bumpFeatured(courseId: string, direction: "up" | "down") {
    const data = analyticsQuery.data;
    if (!data) return;
    const list = featuredCourses;
    const idx = list.findIndex((c) => c.id === courseId);
    if (idx === -1) return;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= list.length) return;

    const a = list[idx];
    const b = list[swapWith];
    setBusy(true);
    setError(null);
    try {
      // Swap ranks
      const [ra, rb] = [a.featured_rank ?? 0, b.featured_rank ?? 0];
      const up1 = await supabase.from("courses").update({ featured_rank: rb }).eq("id", a.id);
      if (up1.error) throw up1.error;
      const up2 = await supabase.from("courses").update({ featured_rank: ra }).eq("id", b.id);
      if (up2.error) throw up2.error;
      await analyticsQuery.refetch();
    } catch (e: any) {
      setError(e?.message ?? "Failed to reorder featured courses");
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(() => {
    const data = analyticsQuery.data;
    if (!data) return [];
    return data.videos.map((v) => {
      const course = data.coursesById.get(v.course_id);
      const stats = data.statsByVideoId.get(v.id);
      return {
        video: v,
        courseTitle: course?.title ?? "(unknown course)",
        quizAttempts: stats?.quizAttempts ?? 0,
        quizAccuracy: stats && stats.quizAttempts > 0 ? Math.round((stats.quizCorrect / stats.quizAttempts) * 100) : null,
        examLaunches: stats?.examLaunches ?? 0,
        completions: stats?.completions ?? 0,
        uniqueStudents: stats?.uniqueStudents.size ?? 0,
      };
    });
  }, [analyticsQuery.data]);

  return (
    <AppShell title="Teacher Studio · Analytics">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" asChild>
            <Link to="/studio">Back to studio</Link>
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Featured courses</CardTitle>
            <CardDescription>Reorder what shows first on the homepage (lower rank = higher).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {analyticsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : featuredCourses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No featured courses yet (toggle it in a course’s settings).</p>
            ) : (
              <div className="space-y-2">
                {featuredCourses.map((c, i) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div>
                      <div className="font-medium">{c.title}</div>
                      <div className="text-xs text-muted-foreground">Rank: {c.featured_rank ?? 0}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" disabled={busy || i === 0} onClick={() => void bumpFeatured(c.id, "up")}
                      >
                        Up
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy || i === featuredCourses.length - 1}
                        onClick={() => void bumpFeatured(c.id, "down")}
                      >
                        Down
                      </Button>
                      <Input
                        type="number"
                        className="w-24"
                        defaultValue={c.featured_rank ?? 0}
                        disabled={busy}
                        onBlur={async (e) => {
                          const next = Number(e.target.value);
                          if (Number.isNaN(next)) return;
                          setBusy(true);
                          setError(null);
                          try {
                            const up = await supabase.from("courses").update({ featured_rank: Math.floor(next) }).eq("id", c.id);
                            if (up.error) throw up.error;
                            await analyticsQuery.refetch();
                          } catch (err: any) {
                            setError(err?.message ?? "Failed to update rank");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Video analytics</CardTitle>
            <CardDescription>Counts are based on student activity for your content.</CardDescription>
          </CardHeader>
          <CardContent>
            {analyticsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : analyticsQuery.isError ? (
              <p className="text-sm text-destructive">Failed to load analytics.</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No videos yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Video</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead className="text-right">Quiz attempts</TableHead>
                    <TableHead className="text-right">Quiz accuracy</TableHead>
                    <TableHead className="text-right">Exam launches</TableHead>
                    <TableHead className="text-right">Completions</TableHead>
                    <TableHead className="text-right">Students</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.video.id}>
                      <TableCell className="font-medium">{r.video.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.courseTitle}</TableCell>
                      <TableCell className="text-right">{r.quizAttempts}</TableCell>
                      <TableCell className="text-right">{r.quizAccuracy === null ? "—" : `${r.quizAccuracy}%`}</TableCell>
                      <TableCell className="text-right">{r.examLaunches}</TableCell>
                      <TableCell className="text-right">{r.completions}</TableCell>
                      <TableCell className="text-right">{r.uniqueStudents}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
