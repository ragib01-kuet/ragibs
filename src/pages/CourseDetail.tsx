import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Course = {
  id: string;
  title: string;
  description: string | null;
  published: boolean;
  thumbnail_url: string | null;
  tags: string[];
};

type Video = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  duration_seconds: number | null;
  published: boolean;
};

export default function CourseDetail() {
  const { courseId } = useParams();

  const courseQuery = useQuery({
    queryKey: ["course", courseId],
    enabled: Boolean(courseId),
    queryFn: async () => {
      const res = await supabase
        .from("courses")
        .select("id,title,description,published,thumbnail_url,tags")
        .eq("id", courseId!)
        .maybeSingle();
      if (res.error) throw res.error;
      return (res.data ?? null) as Course | null;
    },
  });

  const videosQuery = useQuery({
    queryKey: ["course", courseId, "videos"],
    enabled: Boolean(courseId),
    queryFn: async () => {
      const res = await supabase
        .from("videos")
        .select("id,course_id,title,description,duration_seconds,published")
        .eq("course_id", courseId!)
        .eq("published", true)
        .order("created_at", { ascending: true });
      if (res.error) throw res.error;
      return (res.data ?? []) as Video[];
    },
  });

  const title = courseQuery.data?.title ? `Course · ${courseQuery.data.title}` : "Course";

  return (
    <AppShell title={title}>
      <div className="space-y-6">
        <div>
          <Button variant="secondary" asChild>
            <Link to="/">Back to courses</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{courseQuery.isLoading ? "Loading…" : courseQuery.data?.title ?? "Not found"}</CardTitle>
            <CardDescription>
              {courseQuery.isError
                ? "Failed to load course."
                : courseQuery.data?.description ?? ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {courseQuery.data?.thumbnail_url ? (
              <div className="mb-4 overflow-hidden rounded-md border">
                <img
                  src={courseQuery.data.thumbnail_url}
                  alt={`${courseQuery.data.title} course thumbnail`}
                  className="h-48 w-full object-cover"
                  loading="lazy"
                />
              </div>
            ) : null}
            {videosQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading videos…</p>
            ) : videosQuery.isError ? (
              <p className="text-sm text-destructive">Failed to load videos.</p>
            ) : videosQuery.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No published videos yet.</p>
            ) : (
              <div className="space-y-3">
                {videosQuery.data.map((v) => (
                  <div key={v.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{v.title}</div>
                        {v.description ? <div className="mt-1 text-sm text-muted-foreground">{v.description}</div> : null}
                      </div>
                      <Button asChild size="sm">
                        <Link to={`/courses/${courseId}/videos/${v.id}`}>Watch</Link>
                      </Button>
                    </div>
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
