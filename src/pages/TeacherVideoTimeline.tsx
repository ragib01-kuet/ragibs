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

  const quizByEventId = useMemo(() => {
    const map = new Map<string, Quiz>();
    for (const q of quizzesQuery.data ?? []) map.set(q.event_id, q);
    return map;
  }, [quizzesQuery.data]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                          {sim ? <div className="text-xs text-muted-foreground">Simulation: {sim}</div> : null}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="destructive" size="sm" disabled={!canUse || busy} onClick={() => deleteEvent(e)}>
                            Delete
                          </Button>
                        </div>
                      </div>
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
