import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";

type Video = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  lecture_sheet_url: string | null;
  duration_seconds: number | null;
};

export default function VideoPage() {
  const { courseId, videoId } = useParams();

  const videoQuery = useQuery({
    queryKey: ["video", videoId],
    enabled: Boolean(videoId),
    queryFn: async () => {
      const res = await supabase
        .from("videos")
        .select("id,course_id,title,description,video_url,lecture_sheet_url,duration_seconds")
        .eq("id", videoId!)
        .maybeSingle();
      if (res.error) throw res.error;
      return (res.data ?? null) as Video | null;
    },
  });

  const v = videoQuery.data;

  return (
    <AppShell title={v?.title ?? "Video"}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" asChild>
            <Link to={courseId ? `/courses/${courseId}` : "/"}>Back to course</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{videoQuery.isLoading ? "Loading…" : v?.title ?? "Not found"}</CardTitle>
            <CardDescription>{videoQuery.isError ? "Failed to load video." : v?.description ?? ""}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted p-6">
              <p className="text-sm text-muted-foreground">
                Interactive player (timeline lock + quizzes/simulations/exams) will be implemented next.
              </p>
              {v?.video_url ? (
                <p className="mt-2 text-sm">
                  Video URL: <span className="font-mono text-xs">{v.video_url}</span>
                </p>
              ) : null}
            </div>

            <Separator />

            <div className="grid gap-3 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Lecture sheet</CardTitle>
                </CardHeader>
                <CardContent>
                  {v?.lecture_sheet_url ? (
                    <Button asChild variant="secondary">
                      <a href={v.lecture_sheet_url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not provided.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Exam</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">Exam embeds are added via timeline events.</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
