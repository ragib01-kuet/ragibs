import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { VideoEventOverlay } from "@/components/VideoEventOverlay";

type TimelineEventType = "quiz" | "exam" | "simulation";

type TimelineEvent = {
  id: string;
  video_id: string;
  owner_id: string;
  type: TimelineEventType;
  at_seconds: number;
  required: boolean;
  title: string | null;
  payload: any;
  created_at: string;
};

type Quiz = {
  id: string;
  event_id: string;
  question: string;
  options: string[];
  correct_index: number;
};

type ExamLaunch = {
  event_id: string;
  user_id: string;
  launched_at: string;
};

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function TeacherVideoTimeline() {
  const { courseId, videoId } = useParams();
  const navigate = useNavigate();
  const { session, roles, loading } = useAuth();
  const isTeacher = roles.includes("teacher") || roles.includes("admin");

  const canUse = useMemo(() => Boolean(session && isTeacher && courseId && videoId), [session, isTeacher, courseId, videoId]);

  useEffect(() => {
    if (!loading && !session) navigate("/login");
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!loading && session && !isTeacher) navigate("/");
  }, [loading, session, isTeacher, navigate]);

  const videoQuery = useQuery({
    queryKey: ["teacher", "video", videoId],
    enabled: canUse,
    queryFn: async () => {
      const res = await supabase.from("videos").select("id,title,course_id,video_url").eq("id", videoId!).maybeSingle();
      if (res.error) throw res.error;
      return res.data;
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["teacher", "video", videoId, "timeline"],
    enabled: canUse,
    queryFn: async () => {
      const res = await supabase
        .from("timeline_events")
        .select("id,video_id,owner_id,type,at_seconds,required,title,payload,created_at")
        .eq("video_id", videoId!)
        .order("at_seconds", { ascending: true });
      if (res.error) throw res.error;
      return (res.data ?? []) as TimelineEvent[];
    },
  });

  const quizEventIds = useMemo(() => (eventsQuery.data ?? []).filter((e) => e.type === "quiz").map((e) => e.id), [eventsQuery.data]);
  const examEventIds = useMemo(() => (eventsQuery.data ?? []).filter((e) => e.type === "exam").map((e) => e.id), [eventsQuery.data]);

  const quizzesQuery = useQuery({
    queryKey: ["teacher", "video", videoId, "quizzes"],
    enabled: canUse && quizEventIds.length > 0,
    queryFn: async () => {
      const res = await supabase
        .from("quizzes")
        .select("id,event_id,question,options,correct_index")
        .in("event_id", quizEventIds);
      if (res.error) throw res.error;
      return (res.data ?? []) as Quiz[];
    },
  });

  const examLaunchesQuery = useQuery({
    queryKey: ["teacher", "video", videoId, "exam-launches", examEventIds.join(",")],
    enabled: canUse && examEventIds.length > 0,
    queryFn: async () => {
      const res = await supabase
        .from("exam_launches")
        .select("event_id,user_id,launched_at")
        .in("event_id", examEventIds);
      if (res.error) throw res.error;
      return (res.data ?? []) as ExamLaunch[];
    },
  });

  const examLaunchCountByEventId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of examLaunchesQuery.data ?? []) {
      counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1);
    }
    return counts;
  }, [examLaunchesQuery.data]);

  const examAnalytics = useMemo(() => {
    const rows = examLaunchesQuery.data ?? [];
    const total = rows.length;
    const uniqueStudents = new Set(rows.map((r) => r.user_id)).size;

    // 14-day daily series
    const days = 14;
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const countsByDay = new Map<string, number>();
    for (const r of rows) {
      const d = new Date(r.launched_at);
      d.setHours(0, 0, 0, 0);
      if (d < start) continue;
      const key = d.toISOString().slice(5, 10); // MM-DD
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
    }

    const series = Array.from({ length: days }).map((_, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      const key = d.toISOString().slice(5, 10);
      return { day: key, launches: countsByDay.get(key) ?? 0 };
    });

    return { total, uniqueStudents, series };
  }, [examLaunchesQuery.data]);

  const quizByEventId = useMemo(() => {
    const map = new Map<string, Quiz>();
    for (const q of quizzesQuery.data ?? []) map.set(q.event_id, q);
    return map;
  }, [quizzesQuery.data]);

  // Timeline Editor v2: preview video + scrubber + draggable event markers
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const durationRef = useRef<number>(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [previewEventId, setPreviewEventId] = useState<string | null>(null);
  const lastTriggeredAtRef = useRef<number>(-1);
  const draggingIdRef = useRef<string | null>(null);

  // Timeline UX controls (YouTube Studio-ish)
  const [zoomPxPerSecond, setZoomPxPerSecond] = useState(10); // 4..40 (roughly)
  const [snapSeconds, setSnapSeconds] = useState(1); // 0 disables snapping

  const snapTime = (seconds: number) => {
    const s = Number(snapSeconds);
    if (!Number.isFinite(s) || s <= 0) return seconds;
    return Math.round(seconds / s) * s;
  };

  const previewEvent = useMemo(() => {
    const list = eventsQuery.data ?? [];
    return list.find((e) => e.id === previewEventId) ?? null;
  }, [eventsQuery.data, previewEventId]);

  const previewQuiz = useMemo(() => {
    if (!previewEvent || previewEvent.type !== "quiz") return undefined;
    const q = quizByEventId.get(previewEvent.id);
    return q
      ? {
          id: q.id,
          event_id: q.event_id,
          question: q.question,
          options: q.options,
        }
      : undefined;
  }, [previewEvent, quizByEventId]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAtSeconds, setEditAtSeconds] = useState<number>(0);
  const [editRequired, setEditRequired] = useState(true);
  const [editTitle, setEditTitle] = useState("");
  const [editExamUrl, setEditExamUrl] = useState("");
  const [editQuizQuestion, setEditQuizQuestion] = useState("");
  const [editQuizOptionsText, setEditQuizOptionsText] = useState("");
  // 1-based for UX: user types 1,2,3... (stored as 0-based in DB)
  const [editQuizCorrectIndex, setEditQuizCorrectIndex] = useState(1);
  const [editQuizDirty, setEditQuizDirty] = useState(false);

  // Add form
  const [type, setType] = useState<TimelineEventType>("quiz");
  const [atSeconds, setAtSeconds] = useState<number>(0);
  const [required, setRequired] = useState(true);
  const [title, setTitle] = useState("");

  const [examUrl, setExamUrl] = useState("");
  const [quizQuestion, setQuizQuestion] = useState("");
  const [quizOptionsText, setQuizOptionsText] = useState("Option A\nOption B\nOption C\nOption D");
  // 1-based for UX: user types 1,2,3... (stored as 0-based in DB)
  const [quizCorrectIndex, setQuizCorrectIndex] = useState(1);

  async function uploadSimulationHtml(file: File) {
    if (!session) throw new Error("Not signed in");
    const userId = session.user.id;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${userId}/${Date.now()}-${safeName}`;
    const up = await supabase.storage.from("simulations").upload(path, file, {
      upsert: true,
      contentType: "text/html",
      cacheControl: "3600",
    });
    if (up.error) throw up.error;
    return supabase.storage.from("simulations").getPublicUrl(path).data.publicUrl;
  }

  function beginEdit(e: TimelineEvent) {
    setEditingId(e.id);
    setEditAtSeconds(e.at_seconds);
    setEditRequired(e.required);
    setEditTitle(e.title ?? "");
    setEditExamUrl(e.type === "exam" ? (e.payload?.url ?? "") : "");

    if (e.type === "quiz") {
      const q = quizByEventId.get(e.id);
      setEditQuizDirty(false);
      setEditQuizQuestion(q?.question ?? "");
      setEditQuizOptionsText((q?.options ?? []).join("\n"));
      setEditQuizCorrectIndex((q?.correct_index ?? 0) + 1);
    } else {
      setEditQuizDirty(false);
      setEditQuizQuestion("");
      setEditQuizOptionsText("");
      setEditQuizCorrectIndex(1);
    }
  }

  // If teacher opens edit before quizzesQuery loads, repopulate once quiz data arrives
  useEffect(() => {
    if (!editingId) return;
    if (editQuizDirty) return;
    const ev = (eventsQuery.data ?? []).find((x) => x.id === editingId);
    if (!ev || ev.type !== "quiz") return;
    const q = quizByEventId.get(editingId);
    if (!q) return;
    // Only hydrate if fields are still blank (avoid overwriting user typing)
    if (editQuizQuestion.trim() || editQuizOptionsText.trim()) return;
    setEditQuizQuestion(q.question);
    setEditQuizOptionsText((q.options ?? []).join("\n"));
    setEditQuizCorrectIndex((q.correct_index ?? 0) + 1);
  }, [editingId, editQuizDirty, editQuizQuestion, editQuizOptionsText, eventsQuery.data, quizByEventId]);

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(e: TimelineEvent) {
    if (!canUse) return;
    setBusy(true);
    setError(null);
    try {
      const nextPayload =
        e.type === "exam"
          ? { ...(e.payload ?? {}), url: editExamUrl.trim() }
          : e.type === "simulation"
            ? e.payload ?? {}
            : e.payload ?? {};

      const up = await supabase
        .from("timeline_events")
        .update({
          at_seconds: Math.max(0, Math.floor(editAtSeconds)),
          required: editRequired,
          title: editTitle.trim() || null,
          payload: nextPayload,
        })
        .eq("id", e.id);
      if (up.error) throw up.error;

      if (e.type === "quiz") {
        const opts = editQuizOptionsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (!editQuizQuestion.trim() || opts.length < 2) throw new Error("Quiz needs a question and at least 2 options");
        if (!Number.isFinite(editQuizCorrectIndex) || editQuizCorrectIndex < 1 || editQuizCorrectIndex > opts.length) {
          throw new Error("Correct answer must be between 1 and the number of options");
        }
        const correctIndex0 = editQuizCorrectIndex - 1;

        const existing = quizByEventId.get(e.id);
        if (existing) {
          const qUp = await supabase
            .from("quizzes")
            .update({ question: editQuizQuestion.trim(), options: opts, correct_index: correctIndex0 })
            .eq("id", existing.id);
          if (qUp.error) throw qUp.error;
        } else {
          const qIns = await supabase.from("quizzes").insert({
            event_id: e.id,
            question: editQuizQuestion.trim(),
            options: opts,
            correct_index: correctIndex0,
          });
          if (qIns.error) throw qIns.error;
        }
      }

      await eventsQuery.refetch();
      await quizzesQuery.refetch();
      setEditingId(null);
    } catch (err: any) {
      setError(err?.message ?? "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function replaceSimulationHtml(e: TimelineEvent, file: File) {
    if (!canUse) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadSimulationHtml(file);
      const up = await supabase
        .from("timeline_events")
        .update({ payload: { ...(e.payload ?? {}), simulation_url: url } })
        .eq("id", e.id);
      if (up.error) throw up.error;
      await eventsQuery.refetch();
    } catch (err: any) {
      setError(err?.message ?? "Failed to replace simulation");
    } finally {
      setBusy(false);
    }
  }

  async function createEvent(payload: any) {
    if (!session || !videoId) return;
    setBusy(true);
    setError(null);
    try {
      const insertRes = await supabase
        .from("timeline_events")
        .insert({
          video_id: videoId,
          owner_id: session.user.id,
          type,
          at_seconds: Math.max(0, Math.floor(atSeconds)),
          required,
          title: title.trim() || null,
          payload,
        })
        .select("id")
        .maybeSingle();
      if (insertRes.error) throw insertRes.error;
      const eventId = insertRes.data?.id as string | undefined;
      if (!eventId) throw new Error("Failed to create event");

      if (type === "quiz") {
        const opts = quizOptionsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (!quizQuestion.trim() || opts.length < 2) throw new Error("Quiz needs a question and at least 2 options");
        if (!Number.isFinite(quizCorrectIndex) || quizCorrectIndex < 1 || quizCorrectIndex > opts.length) {
          throw new Error("Correct answer must be between 1 and the number of options");
        }
        const correctIndex0 = quizCorrectIndex - 1;

        const qRes = await supabase.from("quizzes").insert({
          event_id: eventId,
          question: quizQuestion.trim(),
          options: opts,
          correct_index: correctIndex0,
        });
        if (qRes.error) throw qRes.error;
      }

      // reset
      setTitle("");
      setAtSeconds(0);
      setRequired(true);
      setExamUrl("");
      setQuizQuestion("");

      await eventsQuery.refetch();
      await quizzesQuery.refetch();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create event");
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent(e: TimelineEvent) {
    setBusy(true);
    setError(null);
    try {
      if (e.type === "quiz") {
        const delQuiz = await supabase.from("quizzes").delete().eq("event_id", e.id);
        if (delQuiz.error) throw delQuiz.error;
      }
      const del = await supabase.from("timeline_events").delete().eq("id", e.id);
      if (del.error) throw del.error;
      await eventsQuery.refetch();
      await quizzesQuery.refetch();
    } catch (err: any) {
      setError(err?.message ?? "Failed to delete event");
    } finally {
      setBusy(false);
    }
  }

  const v = videoQuery.data;
  const videoUrl = v?.video_url ?? "";

  // Keep duration/current time synced
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const onLoaded = () => {
      const d = Number.isFinite(el.duration) ? el.duration : 0;
      durationRef.current = d;
      setDuration(d);
    };
    const onTime = () => {
      setCurrentTime(el.currentTime || 0);

      if (!previewEnabled) return;
      if (previewEventId) return;

      const events = (eventsQuery.data ?? []).slice().sort((a, b) => a.at_seconds - b.at_seconds);
      if (events.length === 0) return;

      const t = el.currentTime;
      const next = events.find((ev) => t >= ev.at_seconds && ev.at_seconds > lastTriggeredAtRef.current + 0.25);
      if (next) {
        lastTriggeredAtRef.current = next.at_seconds;
        el.pause();
        setPreviewEventId(next.id);
      }
    };
    const onSeeking = () => {
      // If teacher seeks around, allow re-triggering from earlier points
      lastTriggeredAtRef.current = Math.min(lastTriggeredAtRef.current, el.currentTime - 0.5);
    };

    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("seeking", onSeeking);
    return () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("seeking", onSeeking);
    };
  }, [eventsQuery.data, previewEnabled, previewEventId]);

  async function updateEventTimestamp(eventId: string, atSecondsNext: number) {
    if (!canUse) return;
    setBusy(true);
    setError(null);
    try {
      const up = await supabase
        .from("timeline_events")
        .update({ at_seconds: Math.max(0, Math.floor(atSecondsNext)) })
        .eq("id", eventId);
      if (up.error) throw up.error;
      await eventsQuery.refetch();
    } catch (e: any) {
      setError(e?.message ?? "Failed to update timestamp");
    } finally {
      setBusy(false);
    }
  }

  function secondsFromClientX(clientX: number) {
    const el = timelineRef.current;
    const d = durationRef.current || duration;
    if (!el || !d) return 0;
    const rect = el.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, clientX - rect.left));
    return (x / rect.width) * d;
  }

  return (
    <AppShell title="Teacher Studio · Timeline">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" asChild>
            <Link to={courseId ? `/studio/courses/${courseId}` : "/studio"}>Back to course</Link>
          </Button>
          {courseId && videoId ? (
            <Button variant="secondary" asChild>
              <Link to={`/courses/${courseId}/videos/${videoId}`}>View video page</Link>
            </Button>
          ) : null}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Timeline Editor v2</CardTitle>
            <CardDescription>Preview video, click-to-seek, drag events to new timestamps, and preview overlays.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {v?.video_url ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">
                    {fmt(Math.floor(currentTime))} / {duration ? fmt(Math.floor(duration)) : "0:00"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant={previewEnabled ? "default" : "secondary"}
                      size="sm"
                      onClick={() => setPreviewEnabled((s) => !s)}
                      disabled={busy}
                    >
                      {previewEnabled ? "Preview overlays: On" : "Preview overlays: Off"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const el = videoRef.current;
                        if (!el) return;
                        void el.play().catch(() => {});
                      }}
                      disabled={busy}
                    >
                      Play
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        videoRef.current?.pause();
                      }}
                      disabled={busy}
                    >
                      Pause
                    </Button>
                  </div>
                </div>

                <video ref={videoRef} src={v.video_url ?? undefined} controls className="w-full rounded-md border" />

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-muted-foreground">Zoom</div>
                      <div className="w-44">
                        <Slider
                          value={[zoomPxPerSecond]}
                          min={4}
                          max={40}
                          step={1}
                          onValueChange={(v) => setZoomPxPerSecond(v[0] ?? 10)}
                          disabled={busy}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">{zoomPxPerSecond}px/s</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Snap (s)</Label>
                      <Input
                        className="h-8 w-24"
                        type="number"
                        min={0}
                        step={0.25}
                        value={snapSeconds}
                        disabled={busy}
                        onChange={(e) => setSnapSeconds(Number(e.target.value))}
                      />
                      <div className="text-xs text-muted-foreground">0 = off</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-md border">
                    <div
                      ref={(node) => {
                        timelineRef.current = node;
                      }}
                      className="relative h-12 bg-muted"
                      style={{ width: Math.max(600, Math.floor((duration || 0) * zoomPxPerSecond)) }}
                      onClick={(e) => {
                        const el = videoRef.current;
                        if (!el) return;
                        const raw = secondsFromClientX(e.clientX);
                        const next = snapTime(raw);
                        el.currentTime = next;
                        setCurrentTime(next);
                      }}
                    >
                      {/* Playhead */}
                      <div
                        className="absolute top-0 h-full w-0.5 bg-primary"
                        style={{ left: `${Math.max(0, Math.floor(currentTime * zoomPxPerSecond))}px` }}
                      />

                      {/* Event markers */}
                      {(eventsQuery.data ?? []).map((ev) => {
                        const leftPx = Math.max(0, Math.floor(ev.at_seconds * zoomPxPerSecond));
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            title={`${fmt(ev.at_seconds)} · ${ev.type}`}
                            className="absolute top-1/2 h-6 w-2 -translate-y-1/2 rounded-full border bg-background"
                            style={{ left: `${leftPx}px` }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const el = videoRef.current;
                              if (el) {
                                el.currentTime = ev.at_seconds;
                                setCurrentTime(ev.at_seconds);
                              }
                              // Quick preview overlay
                              setPreviewEventId(ev.id);
                              videoRef.current?.pause();
                            }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              if (!canUse || busy) return;
                              draggingIdRef.current = ev.id;
                              (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={(e) => {
                              if (draggingIdRef.current !== ev.id) return;
                              // Live scrub while dragging (snapped)
                              const raw = secondsFromClientX(e.clientX);
                              const next = snapTime(raw);
                              const el = videoRef.current;
                              if (el) {
                                el.currentTime = next;
                                setCurrentTime(next);
                              }
                            }}
                            onPointerUp={async (e) => {
                              if (draggingIdRef.current !== ev.id) return;
                              draggingIdRef.current = null;
                              const raw = secondsFromClientX(e.clientX);
                              const next = snapTime(raw);
                              await updateEventTimestamp(ev.id, next);
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Tip: click marker to preview; drag marker to change timestamp. Use Zoom + Snap for precise placement.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Add a video URL (or upload a video) to enable preview + timeline editor.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{videoQuery.isLoading ? "Loading…" : `Timeline · ${v?.title ?? "Video"}`}</CardTitle>
            <CardDescription>Add quiz, exam, and simulation events at timestamps.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex flex-wrap gap-2">
                  {(["quiz", "simulation", "exam"] as TimelineEventType[]).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      variant={type === t ? "default" : "secondary"}
                      disabled={!canUse || busy}
                      onClick={() => setType(t)}
                    >
                      {t}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Timestamp (seconds)</Label>
                <Input
                  type="number"
                  min={0}
                  value={atSeconds}
                  disabled={!canUse || busy}
                  onChange={(e) => setAtSeconds(Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">{fmt(Math.max(0, Math.floor(atSeconds || 0)))}</p>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Title (optional)</Label>
                <Input value={title} disabled={!canUse || busy} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                <div>
                  <div className="text-sm font-medium">Required</div>
                  <div className="text-xs text-muted-foreground">Used later for seek-lock / completion gating.</div>
                </div>
                <Switch checked={required} disabled={!canUse || busy} onCheckedChange={setRequired} />
              </div>
            </div>

            <Separator />

            {type === "quiz" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Question</Label>
                  <Input value={quizQuestion} disabled={!canUse || busy} onChange={(e) => setQuizQuestion(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Options (one per line)</Label>
                  <Textarea
                    value={quizOptionsText}
                    disabled={!canUse || busy}
                    onChange={(e) => setQuizOptionsText(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Correct answer (1,2,3…)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={quizCorrectIndex}
                    disabled={!canUse || busy}
                    onChange={(e) => setQuizCorrectIndex(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">Example: enter 1 for the first option, 2 for the second, etc.</p>
                </div>
                <Button disabled={!canUse || busy || !quizQuestion.trim()} onClick={() => createEvent({})}>
                  Add quiz event
                </Button>
              </div>
            ) : type === "exam" ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Exam URL (testmoz.com or rayvila.com only)</Label>
                  <Input value={examUrl} disabled={!canUse || busy} onChange={(e) => setExamUrl(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Enforced by the backend.</p>
                </div>
                <Button disabled={!canUse || busy || !examUrl.trim()} onClick={() => createEvent({ url: examUrl.trim() })}>
                  Add exam event
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Upload simulation HTML (.html)</Label>
                  <Input
                    type="file"
                    accept="text/html,.html"
                    disabled={!canUse || busy}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setBusy(true);
                      setError(null);
                      try {
                        const url = await uploadSimulationHtml(file);
                        await createEvent({ simulation_url: url });
                      } catch (err: any) {
                        setError(err?.message ?? "Failed to upload simulation");
                      } finally {
                        setBusy(false);
                        e.target.value = "";
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">The file is stored and linked to the event payload.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exam analytics</CardTitle>
            <CardDescription>Launch counts are aggregated from student exam opens (last 14 days).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {examEventIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No exam events in this video yet.</p>
            ) : examLaunchesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading analytics…</p>
            ) : examLaunchesQuery.isError ? (
              <p className="text-sm text-destructive">Failed to load analytics.</p>
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">Total launches</div>
                    <div className="text-2xl font-semibold">{examAnalytics.total}</div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <div className="text-xs text-muted-foreground">Unique students</div>
                    <div className="text-2xl font-semibold">{examAnalytics.uniqueStudents}</div>
                  </div>
                </div>

                <div className="h-56 rounded-lg border p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={examAnalytics.series} margin={{ top: 10, left: 0, right: 10, bottom: 0 }}>
                      <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                      <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                          color: "hsl(var(--foreground))",
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                      />
                      <Line type="monotone" dataKey="launches" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing events</CardTitle>
            <CardDescription>Ordered by timestamp.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {eventsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : eventsQuery.isError ? (
              <p className="text-sm text-destructive">Failed to load events.</p>
            ) : (eventsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            ) : (
              <div className="space-y-3">
                {(eventsQuery.data ?? []).map((e) => {
                  const quiz = e.type === "quiz" ? quizByEventId.get(e.id) : undefined;
                  const exam = e.type === "exam" ? (e.payload?.url as string | undefined) : undefined;
                  const sim = e.type === "simulation" ? (e.payload?.simulation_url as string | undefined) : undefined;
                  const isEditing = editingId === e.id;
                  return (
                    <div key={e.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            {fmt(e.at_seconds)} · {e.type}
                            {e.required ? "" : " (optional)"}
                          </div>
                          {e.title ? <div className="text-sm text-muted-foreground">{e.title}</div> : null}
                          {quiz ? (
                            <div className="text-xs text-muted-foreground">Quiz: {quiz.question}</div>
                          ) : null}
                          {exam ? <div className="text-xs text-muted-foreground">Exam: {exam}</div> : null}
                          {e.type === "exam" ? (
                            <div className="text-xs text-muted-foreground">
                              Launches: {examLaunchCountByEventId.get(e.id) ?? 0}
                            </div>
                          ) : null}
                          {sim ? <div className="text-xs text-muted-foreground">Simulation: {sim}</div> : null}
                        </div>
                        <div className="flex gap-2">
                          {isEditing ? (
                            <>
                              <Button size="sm" variant="secondary" disabled={!canUse || busy} onClick={() => saveEdit(e)}>
                                Save
                              </Button>
                              <Button size="sm" variant="secondary" disabled={!canUse || busy} onClick={cancelEdit}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="secondary" disabled={!canUse || busy} onClick={() => beginEdit(e)}>
                              Edit
                            </Button>
                          )}
                          <Button variant="destructive" size="sm" disabled={!canUse || busy} onClick={() => deleteEvent(e)}>
                            Delete
                          </Button>
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Timestamp (seconds)</Label>
                            <Input
                              type="number"
                              min={0}
                              value={editAtSeconds}
                              disabled={!canUse || busy}
                              onChange={(ev) => setEditAtSeconds(Number(ev.target.value))}
                            />
                            <p className="text-xs text-muted-foreground">{fmt(Math.max(0, Math.floor(editAtSeconds || 0)))}</p>
                          </div>
                          <div className="space-y-2">
                            <Label>Title (optional)</Label>
                            <Input value={editTitle} disabled={!canUse || busy} onChange={(ev) => setEditTitle(ev.target.value)} />
                          </div>
                          <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
                            <div>
                              <div className="text-sm font-medium">Required</div>
                              <div className="text-xs text-muted-foreground">Used later for seek-lock / completion gating.</div>
                            </div>
                            <Switch checked={editRequired} disabled={!canUse || busy} onCheckedChange={setEditRequired} />
                          </div>

                          {e.type === "exam" ? (
                            <div className="space-y-2 md:col-span-2">
                              <Label>Exam URL (testmoz.com or rayvila.com only)</Label>
                              <Input
                                value={editExamUrl}
                                disabled={!canUse || busy}
                                onChange={(ev) => setEditExamUrl(ev.target.value)}
                              />
                              <p className="text-xs text-muted-foreground">Validated by the backend on save.</p>
                            </div>
                          ) : null}

                          {e.type === "simulation" ? (
                            <div className="space-y-2 md:col-span-2">
                              <Label>Replace simulation HTML (.html)</Label>
                              <Input
                                type="file"
                                accept="text/html,.html"
                                disabled={!canUse || busy}
                                onChange={async (ev) => {
                                  const file = ev.target.files?.[0];
                                  if (!file) return;
                                  await replaceSimulationHtml(e, file);
                                  ev.target.value = "";
                                }}
                              />
                            </div>
                          ) : null}

                          {e.type === "quiz" ? (
                            <div className="space-y-3 md:col-span-2">
                              <div className="space-y-2">
                                <Label>Question</Label>
                                <Input
                                  value={editQuizQuestion}
                                  disabled={!canUse || busy}
                                  onChange={(ev) => {
                                    setEditQuizDirty(true);
                                    setEditQuizQuestion(ev.target.value);
                                  }}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Options (one per line)</Label>
                                <Textarea
                                  value={editQuizOptionsText}
                                  disabled={!canUse || busy}
                                  onChange={(ev) => {
                                    setEditQuizDirty(true);
                                    setEditQuizOptionsText(ev.target.value);
                                  }}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Correct answer (1,2,3…)</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={editQuizCorrectIndex}
                                  disabled={!canUse || busy}
                                  onChange={(ev) => {
                                    setEditQuizDirty(true);
                                    setEditQuizCorrectIndex(Number(ev.target.value));
                                  }}
                                />
                                <p className="text-xs text-muted-foreground">Example: enter 1 for the first option, 2 for the second, etc.</p>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {previewEvent ? (
        <VideoEventOverlay
          event={previewEvent}
          quiz={previewQuiz}
          previewOnly
          busy={busy || eventsQuery.isLoading || quizzesQuery.isLoading}
          completed={false}
          onSubmitQuiz={async () => ({ ok: true, isCorrect: true })}
          onOpenExam={async (url) => {
            window.open(url, "_blank", "noopener,noreferrer");
          }}
          onComplete={async () => ({ ok: true })}
          onClose={() => {
            setPreviewEventId(null);
            setTimeout(() => {
              void videoRef.current?.play().catch(() => {});
            }, 0);
          }}
        />
      ) : null}
    </AppShell>
  );
}
