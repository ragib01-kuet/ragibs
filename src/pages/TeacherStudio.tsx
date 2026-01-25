import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";

type Course = {
  id: string;
  title: string;
  description: string | null;
  published: boolean;
  owner_id: string;
  created_at: string;
  featured: boolean;
  tags: string[];
};

export default function TeacherStudio() {
  const navigate = useNavigate();
  const { session, roles, loading } = useAuth();
  const isTeacher = roles.includes("teacher") || roles.includes("admin");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) navigate("/login");
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!loading && session && !isTeacher) navigate("/");
  }, [loading, session, isTeacher, navigate]);

  const canUse = useMemo(() => Boolean(session && isTeacher), [session, isTeacher]);

  const coursesQuery = useQuery({
    queryKey: ["teacher", "courses"],
    enabled: canUse,
    queryFn: async () => {
      const res = await supabase
        .from("courses")
        .select("id,title,description,published,owner_id,created_at,featured,tags")
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []) as Course[];
    },
  });

  return (
    <AppShell title="Teacher Studio">
      <div className="grid gap-6 md:grid-cols-5">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Create course</CardTitle>
            <CardDescription>Courses can be published when ready.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} disabled={!canUse || busy} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea
                id="desc"
                value={description}
                disabled={!canUse || busy}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              disabled={!canUse || busy || !title.trim()}
              onClick={async () => {
                if (!session) return;
                setBusy(true);
                setError(null);
                try {
                  const res = await supabase
                    .from("courses")
                    .insert({ owner_id: session.user.id, title: title.trim(), description: description || null })
                    .select("id")
                    .single();
                  if (res.error) throw res.error;
                  setTitle("");
                  setDescription("");
                  await coursesQuery.refetch();
                  navigate(`/studio/courses/${res.data.id}`);
                } catch (e: any) {
                  setError(e?.message ?? "Failed to create course");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Create
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Your courses</CardTitle>
            <CardDescription>Open a course to manage videos and publishing.</CardDescription>
          </CardHeader>
          <CardContent>
            {coursesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : coursesQuery.isError ? (
              <p className="text-sm text-destructive">Failed to load courses.</p>
            ) : coursesQuery.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No courses yet.</p>
            ) : (
              <div className="space-y-3">
                {coursesQuery.data.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div>
                      <div className="font-medium">{c.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.published ? "Published" : "Draft"}
                        {c.featured ? " · Featured" : ""}
                        {(c.tags?.length ?? 0) > 0 ? ` · ${c.tags.length} tags` : ""}
                      </div>
                    </div>
                    <Button asChild size="sm" variant="secondary">
                      <Link to={`/studio/courses/${c.id}`}>Manage</Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
