import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useState } from "react";

type Video = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  lecture_sheet_url: string | null;
  duration_seconds: number | null;
};

type TimelineEventType = "quiz" | "exam" | "simulation";

type TimelineEvent = {
  id: string;
  video_id: string;
  type: TimelineEventType;
  at_seconds: number;
  required: boolean;
  title: string | null;
  payload: any;
};

type Quiz = {
  id: string;
  event_id: string;
  question: string;
  options: string[];
  correct_index: number;
};

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function VideoPage() {
  const { courseId, videoId } = useParams();
  const [selectedByEvent, setSelectedByEvent] = useState<Record<string, number | undefined>>({});
  const [submittingByEvent, setSubmittingByEvent] = useState<Record<string, boolean>>({});
  const [resultByEvent, setResultByEvent] = useState<Record<string, { ok: boolean; isCorrect: boolean } | undefined>>({});

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

  const eventsQuery = useQuery({
    queryKey: ["video", videoId, "timeline"],
    enabled: Boolean(videoId),
    queryFn: async () => {
      const res = await supabase
        .from("timeline_events")
        .select("id,video_id,type,at_seconds,required,title,payload")
        .eq("video_id", videoId!)
        .order("at_seconds", { ascending: true });
      if (res.error) throw res.error;
      return (res.data ?? []) as TimelineEvent[];
    },
  });

  const quizEventIds = useMemo(
    () => (eventsQuery.data ?? []).filter((e) => e.type === "quiz").map((e) => e.id),
    [eventsQuery.data],
  );

  const quizzesQuery = useQuery({
    queryKey: ["video", videoId, "quizzes"],
    enabled: Boolean(videoId) && quizEventIds.length > 0,
    queryFn: async () => {
      const res = await supabase
        .from("quizzes")
        .select("id,event_id,question,options,correct_index")
        .in("event_id", quizEventIds);
      if (res.error) throw res.error;
      return (res.data ?? []) as Quiz[];
    },
  });

  const quizByEventId = useMemo(() => {
    const map = new Map<string, Quiz>();
    for (const q of quizzesQuery.data ?? []) map.set(q.event_id, q);
    return map;
  }, [quizzesQuery.data]);

  const v = videoQuery.data;
  const events = eventsQuery.data ?? [];

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

            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium">Timeline events</div>
                <div className="text-xs text-muted-foreground">Quizzes submit through the secure backend endpoint.</div>
              </div>
              {eventsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading events…</p>
              ) : eventsQuery.isError ? (
                <p className="text-sm text-destructive">Failed to load events.</p>
              ) : events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events yet.</p>
              ) : (
                <div className="space-y-3">
                  {events.map((e) => {
                    const quiz = e.type === "quiz" ? quizByEventId.get(e.id) : undefined;
                    const examUrl = e.type === "exam" ? (e.payload?.url as string | undefined) : undefined;
                    const simulationUrl = e.type === "simulation" ? (e.payload?.simulation_url as string | undefined) : undefined;
                    const selected = selectedByEvent[e.id];
                    const submitting = Boolean(submittingByEvent[e.id]);
                    const result = resultByEvent[e.id];

                    return (
                      <Card key={e.id}>
                        <CardHeader>
                          <CardTitle className="text-base">
                            {fmt(e.at_seconds)} · {e.type}
                            {e.required ? "" : " (optional)"}
                          </CardTitle>
                          <CardDescription>{e.title ?? ""}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {e.type === "exam" ? (
                            examUrl ? (
                              <Button asChild variant="secondary">
                                <a href={examUrl} target="_blank" rel="noreferrer">
                                  Open exam
                                </a>
                              </Button>
                            ) : (
                              <p className="text-sm text-muted-foreground">Exam URL missing.</p>
                            )
                          ) : null}

                          {e.type === "simulation" ? (
                            simulationUrl ? (
                              <Button asChild variant="secondary">
                                <a href={simulationUrl} target="_blank" rel="noreferrer">
                                  Open simulation
                                </a>
                              </Button>
                            ) : (
                              <p className="text-sm text-muted-foreground">Simulation URL missing.</p>
                            )
                          ) : null}

                          {e.type === "quiz" ? (
                            quiz ? (
                              <div className="space-y-3">
                                <div className="text-sm font-medium">{quiz.question}</div>
                                <div className="space-y-2">
                                  {quiz.options.map((opt, idx) => (
                                    <label key={idx} className="flex cursor-pointer items-start gap-2 text-sm">
                                      <input
                                        type="radio"
                                        name={`q-${e.id}`}
                                        checked={selected === idx}
                                        disabled={submitting}
                                        onChange={() => setSelectedByEvent((s) => ({ ...s, [e.id]: idx }))}
                                      />
                                      <span>{opt}</span>
                                    </label>
                                  ))}
                                </div>
                                <div className="flex flex-wrap items-center gap-3">
                                  <Button
                                    disabled={selected === undefined || submitting}
                                    onClick={async () => {
                                      if (selected === undefined) return;
                                      setSubmittingByEvent((s) => ({ ...s, [e.id]: true }));
                                      try {
                                        const res = await supabase.functions.invoke("quiz-attempt", {
                                          body: { eventId: e.id, selectedIndex: selected },
                                        });
                                        if (res.error) throw res.error;
                                        setResultByEvent((r) => ({ ...r, [e.id]: { ok: true, isCorrect: Boolean((res.data as any)?.isCorrect) } }));
                                      } catch {
                                        setResultByEvent((r) => ({ ...r, [e.id]: { ok: false, isCorrect: false } }));
                                      } finally {
                                        setSubmittingByEvent((s) => ({ ...s, [e.id]: false }));
                                      }
                                    }}
                                  >
                                    {submitting ? "Submitting…" : "Submit"}
                                  </Button>
                                  {result ? (
                                    <p className={result.ok && result.isCorrect ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
                                      {result.ok ? (result.isCorrect ? "Correct." : "Incorrect.") : "Submit failed (sign in required)."}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">Quiz not loaded yet.</p>
                            )
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
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
