import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
      const res = await supabase.from("videos").select("id,title,course_id").eq("id", videoId!).maybeSingle();
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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAtSeconds, setEditAtSeconds] = useState<number>(0);
  const [editRequired, setEditRequired] = useState(true);
  const [editTitle, setEditTitle] = useState("");
  const [editExamUrl, setEditExamUrl] = useState("");
  const [editQuizQuestion, setEditQuizQuestion] = useState("");
  const [editQuizOptionsText, setEditQuizOptionsText] = useState("");
  const [editQuizCorrectIndex, setEditQuizCorrectIndex] = useState(0);

  // Add form
  const [type, setType] = useState<TimelineEventType>("quiz");
  const [atSeconds, setAtSeconds] = useState<number>(0);
  const [required, setRequired] = useState(true);
  const [title, setTitle] = useState("");

  const [examUrl, setExamUrl] = useState("");
  const [quizQuestion, setQuizQuestion] = useState("");
  const [quizOptionsText, setQuizOptionsText] = useState("Option A\nOption B\nOption C\nOption D");
  const [quizCorrectIndex, setQuizCorrectIndex] = useState(0);

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
      setEditQuizQuestion(q?.question ?? "");
      setEditQuizOptionsText((q?.options ?? []).join("\n"));
      setEditQuizCorrectIndex(q?.correct_index ?? 0);
    } else {
      setEditQuizQuestion("");
      setEditQuizOptionsText("");
      setEditQuizCorrectIndex(0);
    }
  }

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
        if (editQuizCorrectIndex < 0 || editQuizCorrectIndex >= opts.length) throw new Error("Correct option index is out of range");

        const existing = quizByEventId.get(e.id);
        if (existing) {
          const qUp = await supabase
            .from("quizzes")
            .update({ question: editQuizQuestion.trim(), options: opts, correct_index: editQuizCorrectIndex })
            .eq("id", existing.id);
          if (qUp.error) throw qUp.error;
        } else {
          const qIns = await supabase.from("quizzes").insert({
            event_id: e.id,
            question: editQuizQuestion.trim(),
            options: opts,
            correct_index: editQuizCorrectIndex,
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
        if (quizCorrectIndex < 0 || quizCorrectIndex >= opts.length) throw new Error("Correct option index is out of range");

        const qRes = await supabase.from("quizzes").insert({
          event_id: eventId,
          question: quizQuestion.trim(),
          options: opts,
          correct_index: quizCorrectIndex,
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
                  <Label>Correct option index (0-based)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={quizCorrectIndex}
                    disabled={!canUse || busy}
                    onChange={(e) => setQuizCorrectIndex(Number(e.target.value))}
                  />
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
                                  onChange={(ev) => setEditQuizQuestion(ev.target.value)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Options (one per line)</Label>
                                <Textarea
                                  value={editQuizOptionsText}
                                  disabled={!canUse || busy}
                                  onChange={(ev) => setEditQuizOptionsText(ev.target.value)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Correct option index (0-based)</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={editQuizCorrectIndex}
                                  disabled={!canUse || busy}
                                  onChange={(ev) => setEditQuizCorrectIndex(Number(ev.target.value))}
                                />
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
    </AppShell>
  );
}
