import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { VideoEventOverlay } from "@/components/VideoEventOverlay";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Video = {
  id: string;
  course_id: string;
  owner_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  lecture_sheet_url: string | null;
  duration_seconds: number | null;
};

type TeacherPublicProfile = {
  user_id: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  avatar_url: string | null;
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

  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const lastProgressSentAtRef = useRef<number>(0);
  const unlockedRef = useRef<number>(0);

  const videoQuery = useQuery({
    queryKey: ["video", videoId],
    enabled: Boolean(videoId),
    queryFn: async () => {
      const res = await supabase
        .from("videos")
        .select("id,course_id,owner_id,title,description,video_url,lecture_sheet_url,duration_seconds")
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
    queryKey: ["video", videoId, "quizzes", quizEventIds.join(",")],
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
        .eq("user_id", userId!)
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

  const hasQuizEvents = useMemo(() => events.some((e) => e.type === "quiz"), [events]);

  const videoUrl = v?.video_url ?? null;

  const teacherQuery = useQuery({
    queryKey: ["teacher-public", v?.owner_id],
    enabled: Boolean(v?.owner_id),
    queryFn: async () => {
      const res = await supabase
        .from("teacher_public_profiles")
        .select("user_id,display_name,headline,bio,avatar_url")
        .eq("user_id", v!.owner_id)
        .maybeSingle();
      if (res.error) throw res.error;
      return (res.data ?? null) as TeacherPublicProfile | null;
    },
  });

  const unlockedUntil = useMemo(() => {
    const fromDb = progressQuery.data?.unlocked_until_seconds ?? 0;
    return Math.max(0, fromDb);
  }, [progressQuery.data]);

  useEffect(() => {
    unlockedRef.current = unlockedUntil;
  }, [unlockedUntil]);

  useEffect(() => {
    if (!videoElRef.current) return;
    videoElRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  // Auto-open the next event once playback reaches it (and it's not already completed).
  useEffect(() => {
    if (!videoElRef.current) return;
    const el = videoElRef.current;

    const onTimeUpdate = () => {
      const t = el.currentTime;

      // Progress writeback (best-effort): every 5s, advance unlocked to watched time.
      // IMPORTANT: When this video has quizzes, progress/seek unlock is gated by quiz completion.
      // So we ONLY auto-advance progress for non-quiz videos.
      if (userId && !hasQuizEvents) {
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

      // Auto-popups and completion require a real signed-in session.
      // Without that, function calls would use an anon token and return 401.
      if (!userId) return;

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
      if (!userId) return;
      // If there are no quizzes in this video, allow free seeking.
      if (!hasQuizEvents) return;
      const allowed = unlockedRef.current;
      if (el.currentTime > allowed + 0.5) el.currentTime = allowed;
    };

    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("seeking", onSeeking);
    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("seeking", onSeeking);
    };
  }, [activeEventId, completionsQuery.data, events, hasQuizEvents, progressQuery, userId, videoId]);

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
              {videoUrl ? (
                <div className="space-y-2">
                  <video
                    ref={videoElRef}
                    src={videoUrl}
                    controls
                    playsInline
                    className="w-full rounded-md"
                    onError={(e) => {
                      console.error("Video failed to load", { src: videoUrl, error: e });
                    }}
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-xs text-muted-foreground">Speed</div>
                    <Select
                      value={String(playbackRate)}
                      onValueChange={(v) => {
                        const n = Number(v);
                        if (Number.isFinite(n) && n > 0) setPlaybackRate(n);
                      }}
                    >
                      <SelectTrigger className="h-8 w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0.5">0.5×</SelectItem>
                        <SelectItem value="0.75">0.75×</SelectItem>
                        <SelectItem value="1">1×</SelectItem>
                        <SelectItem value="1.25">1.25×</SelectItem>
                        <SelectItem value="1.5">1.5×</SelectItem>
                        <SelectItem value="2">2×</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {userId ? (
                      hasQuizEvents ? (
                        <>Quiz gating enabled · Seeking unlocked until {fmt(unlockedUntil)}</>
                      ) : (
                        <>Seeking unlocked · (no quizzes in this video)</>
                      )
                    ) : (
                      <>Sign in to enable progress tracking.</>
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
                <div className="text-xs text-muted-foreground">
                  Quizzes auto-popup during playback. Simulations and exams are listed here.
                </div>
              </div>
              {eventsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading events…</p>
              ) : eventsQuery.isError ? (
                <p className="text-sm text-destructive">Failed to load events.</p>
              ) : events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events yet.</p>
              ) : (
                <div className="space-y-3">
                  {events
                    .filter((e) => e.type !== "quiz") // Hide quizzes from the student timeline list (they still auto-popup)
                    .map((e) => {
                    const quiz = e.type === "quiz" ? quizByEventId.get(e.id) : undefined;
                    const examUrl = e.type === "exam" ? (e.payload?.url as string | undefined) : undefined;
                    const simulationUrl = e.type === "simulation" ? (e.payload?.simulation_url as string | undefined) : undefined;
                    const selected = selectedByEvent[e.id];
                    const submitting = Boolean(submittingByEvent[e.id]);
                    const result = resultByEvent[e.id];
                    const isCompleted = Boolean(completionsQuery.data?.has(e.id));

                    return (
                      <Card key={e.id}>
                        <CardHeader>
                          <CardTitle className="text-base">
                            {fmt(e.at_seconds)} · {e.type}
                            {e.required ? "" : " (optional)"}
                          </CardTitle>
                          <div className="flex flex-wrap items-center gap-2">
                            {e.required ? <Badge variant="secondary">Required</Badge> : <Badge variant="secondary">Optional</Badge>}
                            {userId ? (
                              isCompleted ? <Badge variant="secondary">Completed</Badge> : <Badge variant="outline">Not completed</Badge>
                            ) : (
                              <Badge variant="outline">Sign in to track</Badge>
                            )}
                          </div>
                          <CardDescription>{e.title ?? ""}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {e.type === "exam" ? (
                            examUrl ? (
                              <Button
                                variant="secondary"
                                onClick={async () => {
                                  videoElRef.current?.pause();
                                  setActiveEventId(e.id);
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
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  videoElRef.current?.pause();
                                  setActiveEventId(e.id);
                                }}
                              >
                                Open simulation
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
                                    disabled={!userId || selected === undefined || submitting}
                                    onClick={async () => {
                                      if (!userId) {
                                        setResultByEvent((r) => ({ ...r, [e.id]: { ok: false, isCorrect: false } }));
                                        return;
                                      }
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
                                      {result.ok
                                        ? result.isCorrect
                                          ? "Correct."
                                          : "Incorrect."
                                        : userId
                                          ? "Submit failed."
                                          : "Sign in required to submit."}
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

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Teacher</CardTitle>
                <CardDescription>Lesson author</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {teacherQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : teacherQuery.isError ? (
                  <p className="text-sm text-muted-foreground">Teacher profile not available.</p>
                ) : teacherQuery.data ? (
                  <div className="flex flex-wrap items-start gap-3">
                    {teacherQuery.data.avatar_url ? (
                      <img
                        src={teacherQuery.data.avatar_url}
                        alt={`${teacherQuery.data.display_name} avatar`}
                        className="h-12 w-12 rounded-full border object-cover"
                        loading="lazy"
                      />
                    ) : null}
                    <div className="min-w-[220px] flex-1">
                      <div className="text-sm font-medium">{teacherQuery.data.display_name}</div>
                      {teacherQuery.data.headline ? (
                        <div className="text-xs text-muted-foreground">{teacherQuery.data.headline}</div>
                      ) : null}
                      {teacherQuery.data.bio ? <p className="mt-2 text-sm text-muted-foreground">{teacherQuery.data.bio}</p> : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Teacher profile not set yet.</p>
                )}
              </CardContent>
            </Card>

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
            isAuthed={Boolean(userId)}
            busy={eventsQuery.isLoading || quizzesQuery.isLoading || progressQuery.isLoading}
            onSubmitQuiz={async (selectedIndex) => {
              if (!userId) return { ok: false, isCorrect: false };
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
              if (!userId) return { ok: false };
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
