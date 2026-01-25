import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";

type Course = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  published: boolean;
  thumbnail_url: string | null;
  tags: string[];
};

type TeacherPublicProfile = {
  user_id: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  avatar_url: string | null;
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
        .select("id,owner_id,title,description,published,thumbnail_url,tags")
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

  const teacherQuery = useQuery({
    queryKey: ["teacher-public", courseQuery.data?.owner_id],
    enabled: Boolean(courseQuery.data?.owner_id),
    queryFn: async () => {
      const ownerId = courseQuery.data!.owner_id;
      const res = await supabase
        .from("teacher_public_profiles")
        .select("user_id,display_name,headline,bio,avatar_url")
        .eq("user_id", ownerId)
        .maybeSingle();
      if (res.error) throw res.error;
      return (res.data ?? null) as TeacherPublicProfile | null;
    },
  });

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

            <Separator className="my-4" />

            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
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
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Teacher</CardTitle>
                  <CardDescription>Course author</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {teacherQuery.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : teacherQuery.isError ? (
                    <p className="text-sm text-muted-foreground">Teacher profile not available.</p>
                  ) : teacherQuery.data ? (
                    <div className="space-y-2">
                      {teacherQuery.data.avatar_url ? (
                        <img
                          src={teacherQuery.data.avatar_url}
                          alt={`${teacherQuery.data.display_name} avatar`}
                          className="h-12 w-12 rounded-full border object-cover"
                          loading="lazy"
                        />
                      ) : null}
                      <div>
                        <div className="text-sm font-medium">{teacherQuery.data.display_name}</div>
                        {teacherQuery.data.headline ? (
                          <div className="text-xs text-muted-foreground">{teacherQuery.data.headline}</div>
                        ) : null}
                      </div>
                      {teacherQuery.data.bio ? <p className="text-sm text-muted-foreground">{teacherQuery.data.bio}</p> : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Teacher profile not set yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
