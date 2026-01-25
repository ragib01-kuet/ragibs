import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { BookOpen, GraduationCap, PlayCircle, ShieldCheck } from "lucide-react";

type Course = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  featured: boolean;
  featured_rank: number;
  thumbnail_url: string | null;
};

type ContinueItem = {
  video_id: string;
  video_title: string;
  course_id: string;
  course_title: string;
  unlocked_until_seconds: number;
  updated_at: string;
};

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function normalizeTag(t: string) {
  return t.trim();
}

const Index = () => {
  const { session, roles } = useAuth();
  const userId = session?.user?.id ?? null;
  const isAdmin = roles.includes("admin");
  const isTeacher = roles.includes("teacher") || isAdmin;

  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const coursesQuery = useQuery({
    queryKey: ["courses", "published", search, activeTag],
    queryFn: async () => {
      let q = supabase
        .from("courses")
        .select("id,title,description,tags,featured,featured_rank,thumbnail_url")
        .eq("published", true)
        .order("featured", { ascending: false })
        .order("featured_rank", { ascending: true })
        .order("created_at", { ascending: false });

      const s = search.trim();
      if (s.length > 0) {
        // Backend-powered search (simple ilike across title/description)
        q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
      }

      if (activeTag) {
        q = q.contains("tags", [activeTag]);
      }

      const res = await q;
      if (res.error) throw res.error;
      return (res.data ?? []) as Course[];
    },
  });

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const c of coursesQuery.data ?? []) {
      for (const t of c.tags ?? []) {
        const nt = normalizeTag(t);
        if (nt) set.add(nt);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [coursesQuery.data]);

  const featuredCourses = useMemo(() => (coursesQuery.data ?? []).filter((c) => c.featured), [coursesQuery.data]);
  const allCourses = useMemo(() => (coursesQuery.data ?? []).filter((c) => !c.featured), [coursesQuery.data]);

  const continueQuery = useQuery({
    queryKey: ["continue", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      // 1) Get recently updated progress rows
      const pr = await supabase
        .from("video_progress")
        .select("video_id,unlocked_until_seconds,updated_at")
        .eq("user_id", userId!)
        .order("updated_at", { ascending: false })
        .limit(6);
      if (pr.error) throw pr.error;
      const progress = (pr.data ?? []) as Array<{
        video_id: string;
        unlocked_until_seconds: number;
        updated_at: string;
      }>;
      if (progress.length === 0) return [] as ContinueItem[];

      const videoIds = progress.map((p) => p.video_id);

      // 2) Fetch videos for those progress rows
      const vr = await supabase.from("videos").select("id,title,course_id").in("id", videoIds);
      if (vr.error) throw vr.error;
      const videos = (vr.data ?? []) as Array<{ id: string; title: string; course_id: string }>;
      const videoById = new Map(videos.map((v) => [v.id, v] as const));

      // 3) Fetch course titles
      const courseIds = Array.from(new Set(videos.map((v) => v.course_id)));
      const cr = await supabase.from("courses").select("id,title").in("id", courseIds);
      if (cr.error) throw cr.error;
      const courses = (cr.data ?? []) as Array<{ id: string; title: string }>;
      const courseById = new Map(courses.map((c) => [c.id, c] as const));

      return progress
        .map((p) => {
          const v = videoById.get(p.video_id);
          if (!v) return null;
          const c = courseById.get(v.course_id);
          if (!c) return null;
          return {
            video_id: v.id,
            video_title: v.title,
            course_id: v.course_id,
            course_title: c.title,
            unlocked_until_seconds: p.unlocked_until_seconds,
            updated_at: p.updated_at,
          } satisfies ContinueItem;
        })
        .filter(Boolean) as ContinueItem[];
    },
  });

  return (
    <AppShell title="Courses">
      <div className="space-y-10">
        <header className="relative overflow-hidden rounded-xl border bg-background">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background to-muted" />
          <div className="relative grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
            <div className="space-y-4">
              <p className="text-xs font-medium tracking-widest text-muted-foreground">RAGIB’S WORLD</p>
              <div className="space-y-2">
                <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
                  Study smarter: video lessons with quizzes, simulations, and exams.
                </h2>
                <p className="max-w-2xl text-pretty text-sm text-muted-foreground md:text-base">
                  Learn step-by-step with checkpoints that unlock your progress. Rewind anytime—forward seeking unlocks when you pass.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
                  <div className="mt-0.5 rounded-md border bg-muted p-2">
                    <PlayCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Interactive video</div>
                    <div className="text-xs text-muted-foreground">Quizzes + in-player overlays</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
                  <div className="mt-0.5 rounded-md border bg-muted p-2">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Progress saved</div>
                    <div className="text-xs text-muted-foreground">Pick up where you left off</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
                  <div className="mt-0.5 rounded-md border bg-muted p-2">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Teacher-led</div>
                    <div className="text-xs text-muted-foreground">Courses by verified teachers</div>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
                  <div className="mt-0.5 rounded-md border bg-muted p-2">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Lecture sheets</div>
                    <div className="text-xs text-muted-foreground">Open notes alongside lessons</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {session ? (
                  <Button asChild>
                    <Link to="/profile">Go to Profile</Link>
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to="/login">Sign in to track progress</Link>
                  </Button>
                )}
                {isTeacher ? (
                  <Button asChild variant="secondary">
                    <Link to="/studio">Open Teacher Studio</Link>
                  </Button>
                ) : null}
                {isAdmin ? (
                  <Button asChild variant="secondary">
                    <Link to="/admin/invites">Admin tools</Link>
                  </Button>
                ) : null}
                <p className="text-xs text-muted-foreground">Public browsing works without sign-in.</p>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Find a course</CardTitle>
                <CardDescription>Search by title/description or filter by tags.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses…" />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={activeTag === null ? "default" : "secondary"}
                    size="sm"
                    onClick={() => setActiveTag(null)}
                    disabled={coursesQuery.isLoading}
                  >
                    All
                  </Button>
                  {tags.slice(0, 10).map((t) => (
                    <Button
                      key={t}
                      variant={activeTag === t ? "default" : "secondary"}
                      size="sm"
                      onClick={() => setActiveTag((cur) => (cur === t ? null : t))}
                      disabled={coursesQuery.isLoading}
                    >
                      {t}
                    </Button>
                  ))}
                </div>
                {tags.length > 10 ? <p className="text-xs text-muted-foreground">Showing top tags only.</p> : null}

                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="text-sm font-medium">New here?</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Start any course → checkpoints appear automatically → your progress unlocks as you pass.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </header>

        {userId ? (
          <section className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Continue watching</h3>
                <p className="text-sm text-muted-foreground">Jump back into where you left off.</p>
              </div>
            </div>
            {continueQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : continueQuery.isError ? (
              <p className="text-sm text-destructive">Failed to load progress.</p>
            ) : (continueQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No progress yet—start any course to see it here.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {(continueQuery.data ?? []).map((item) => (
                  <Card key={item.video_id}>
                    <CardHeader>
                      <CardTitle className="text-base">{item.video_title}</CardTitle>
                      <CardDescription>{item.course_title}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3">
                      <Badge variant="secondary">Unlocked: {fmt(item.unlocked_until_seconds)}</Badge>
                      <Button asChild size="sm">
                        <Link to={`/courses/${item.course_id}/videos/${item.video_id}`}>Resume</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <Separator />

        <section className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Featured</h3>
            <p className="text-sm text-muted-foreground">Editor picks to start with.</p>
          </div>
          {coursesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : coursesQuery.isError ? (
            <p className="text-sm text-destructive">Failed to load courses.</p>
          ) : featuredCourses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No featured courses yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {featuredCourses.slice(0, 4).map((c) => (
                <Card key={c.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{c.title}</CardTitle>
                    <CardDescription>{c.description ?? ""}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {c.thumbnail_url ? (
                      <div className="overflow-hidden rounded-md border">
                        <img
                          src={c.thumbnail_url}
                          alt={`${c.title} course thumbnail`}
                          className="h-40 w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                    {c.tags?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {c.tags.slice(0, 6).map((t) => (
                          <Badge key={t} variant="secondary">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    <Button asChild size="sm">
                      <Link to={`/courses/${c.id}`}>Open course</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <Separator />

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">All courses</h3>
              <p className="text-sm text-muted-foreground">
                {activeTag ? (
                  <>Filtered by “{activeTag}”.</>
                ) : search.trim() ? (
                  <>Results for “{search.trim()}”.</>
                ) : (
                  <>Explore the full catalog.</>
                )}
              </p>
            </div>
          </div>

          {coursesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : coursesQuery.isError ? (
            <p className="text-sm text-destructive">Failed to load courses.</p>
          ) : (coursesQuery.data ?? []).length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No courses yet</CardTitle>
                <CardDescription>Once a course is published, it will appear here for students.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 text-sm text-muted-foreground">
                  <div>1) Admin creates demo content (one click)</div>
                  <div>2) Students open the demo course and start watching</div>
                  <div>3) Quizzes/simulations/exams appear automatically on the timeline</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isAdmin ? (
                    <Button asChild variant="secondary">
                      <Link to="/admin/invites">Create demo course (Admin)</Link>
                    </Button>
                  ) : null}
                  <Button asChild>
                    <Link to={session ? "/profile" : "/login"}>{session ? "Go to Profile" : "Sign in"}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : allCourses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No courses match this filter.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {allCourses.map((c) => (
                <Card key={c.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{c.title}</CardTitle>
                    <CardDescription>{c.description ?? ""}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {c.thumbnail_url ? (
                      <div className="overflow-hidden rounded-md border">
                        <img
                          src={c.thumbnail_url}
                          alt={`${c.title} course thumbnail`}
                          className="h-40 w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                    {c.tags?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {c.tags.slice(0, 4).map((t) => (
                          <Badge key={t} variant="secondary">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    <Button asChild size="sm">
                      <Link to={`/courses/${c.id}`}>Open course</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
};

export default Index;
