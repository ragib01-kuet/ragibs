import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { VideoEventOverlay } from "@/components/VideoEventOverlay";

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
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [selectedByEvent, setSelectedByEvent] = useState<Record<string, number | undefined>>({});
  const [submittingByEvent, setSubmittingByEvent] = useState<Record<string, boolean>>({});
  const [resultByEvent, setResultByEvent] = useState<Record<string, { ok: boolean; isCorrect: boolean } | undefined>>({});
  const [activeEventId, setActiveEventId] = useState<string | null>(null);

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const lastProgressSentAtRef = useRef<number>(0);
  const unlockedRef = useRef<number>(0);

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

  const progressQuery = useQuery({
    queryKey: ["video", videoId, "progress", userId],
    enabled: Boolean(videoId && userId),
    queryFn: async () => {
      const res = await supabase
        .from("video_progress")
        .select("id,unlocked_until_seconds")
        .eq("video_id", videoId!)
        .eq("user_id", userId!)
        .maybeSingle();
      if (res.error) throw res.error;
      return res.data as { id: string; unlocked_until_seconds: number } | null;
    },
  });

  const completionsQuery = useQuery({
    queryKey: ["video", videoId, "completions", userId, eventsQuery.data?.length ?? 0],
    enabled: Boolean(videoId && userId && (eventsQuery.data?.length ?? 0) > 0),
    queryFn: async () => {
      const ids = (eventsQuery.data ?? []).map((e) => e.id);
      const res = await supabase
        .from("video_event_completions")
        .select("event_id")
        .in("event_id", ids);
      if (res.error) throw res.error;
      return new Set((res.data ?? []).map((r) => r.event_id as string));
    },
  });

  const quizByEventId = useMemo(() => {
    const map = new Map<string, Quiz>();
    for (const q of quizzesQuery.data ?? []) map.set(q.event_id, q);
    return map;
  }, [quizzesQuery.data]);

  const v = videoQuery.data;
  const events = eventsQuery.data ?? [];

  const unlockedUntil = useMemo(() => {
    const fromDb = progressQuery.data?.unlocked_until_seconds ?? 0;
    return Math.max(0, fromDb);
  }, [progressQuery.data]);

  useEffect(() => {
    unlockedRef.current = unlockedUntil;
  }, [unlockedUntil]);

  // Auto-open the next event once playback reaches it (and it's not already completed).
  useEffect(() => {
    if (!videoElRef.current) return;
    const el = videoElRef.current;

    const onTimeUpdate = () => {
      const t = el.currentTime;

      // Progress writeback (best-effort): every 5s, advance unlocked to watched time.
      if (userId) {
        const now = Date.now();
        if (now - lastProgressSentAtRef.current > 5000) {
          const nextUnlocked = Math.max(unlockedRef.current, Math.floor(t));
          lastProgressSentAtRef.current = now;
          unlockedRef.current = nextUnlocked;
          void (async () => {
            try {
              await supabase
                .from("video_progress")
                .upsert(
                  { video_id: videoId!, user_id: userId, unlocked_until_seconds: nextUnlocked },
                  { onConflict: "user_id,video_id" },
                );
              await progressQuery.refetch();
            } catch {
              // best-effort
            }
          })();
        }
      }

      if (activeEventId) return;
      if (events.length === 0) return;

      const completed = completionsQuery.data;
      const next = events.find((e) => t >= e.at_seconds && (!completed || !completed.has(e.id)));
      if (next) {
        el.pause();
        setActiveEventId(next.id);
      }
    };

    const onSeeking = () => {
      const allowed = unlockedRef.current;
      if (el.currentTime > allowed + 0.5) {
        el.currentTime = allowed;
      }
    };

    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("seeking", onSeeking);
    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("seeking", onSeeking);
    };
  }, [activeEventId, completionsQuery.data, events, progressQuery, userId, videoId]);

  const activeEvent = useMemo(() => events.find((e) => e.id === activeEventId) ?? null, [events, activeEventId]);
  const activeQuiz = useMemo(() => (activeEvent?.type === "quiz" ? quizByEventId.get(activeEvent.id) : undefined), [activeEvent, quizByEventId]);
  const activeCompleted = useMemo(() => {
    if (!activeEvent || !completionsQuery.data) return false;
    return completionsQuery.data.has(activeEvent.id);
  }, [activeEvent, completionsQuery.data]);

  async function trackExamLaunch(eventId: string) {
    if (!userId) return;
    // best-effort; RLS ensures only self insert.
    try {
      await supabase.from("exam_launches").insert({ event_id: eventId, user_id: userId });
    } catch {
      // ignore
    }
  }

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
            <div className="rounded-lg border bg-muted p-4">
              {v?.video_url ? (
                <div className="space-y-2">
                  <video
                    ref={videoElRef}
                    src={v.video_url}
                    controls
                    className="w-full rounded-md"
                  />
                  <div className="text-xs text-muted-foreground">
                    {userId ? (
                      <>Seek lock enabled · Unlocked until {fmt(unlockedUntil)}</>
                    ) : (
                      <>Sign in to enable seek lock and progress tracking.</>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No video URL provided.</p>
              )}
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
                              <Button
                                variant="secondary"
                                onClick={async () => {
                                  await trackExamLaunch(e.id);
                                  window.open(examUrl, "_blank", "noopener,noreferrer");
                                }}
                              >
                                Open exam
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
                                        await completionsQuery.refetch();
                                        await progressQuery.refetch();
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

        {activeEvent ? (
          <VideoEventOverlay
            event={activeEvent}
            quiz={
              activeQuiz
                ? {
                    id: activeQuiz.id,
                    event_id: activeQuiz.event_id,
                    question: activeQuiz.question,
                    options: activeQuiz.options,
                  }
                : undefined
            }
            busy={eventsQuery.isLoading || quizzesQuery.isLoading || progressQuery.isLoading}
            onSubmitQuiz={async (selectedIndex) => {
              const res = await supabase.functions.invoke("quiz-attempt", {
                body: { eventId: activeEvent.id, selectedIndex },
              });
              if (res.error) return { ok: false, isCorrect: false };
              const r = { ok: true, isCorrect: Boolean((res.data as any)?.isCorrect) };
              await completionsQuery.refetch();
              await progressQuery.refetch();
              return r;
            }}
            onOpenExam={async (url) => {
              await trackExamLaunch(activeEvent.id);
              window.open(url, "_blank", "noopener,noreferrer");
            }}
            completed={activeCompleted}
            onComplete={async () => {
              const res = await supabase.functions.invoke("event-complete", {
                body: { eventId: activeEvent.id },
              });
              if (res.error) return { ok: false };
              await completionsQuery.refetch();
              await progressQuery.refetch();
              return { ok: true };
            }}
            onClose={() => {
              setActiveEventId(null);
              // Resume playback after closing
              setTimeout(() => {
                void (async () => {
                  try {
                    await videoElRef.current?.play();
                  } catch {
                    // ignore autoplay restrictions
                  }
                })();
              }, 0);
            }}
          />
        ) : null}
      </div>
    </AppShell>
  );
}
