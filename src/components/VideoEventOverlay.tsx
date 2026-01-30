import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SimulationFrame } from "@/components/overlays/SimulationFrame";

type TimelineEventType = "quiz" | "exam" | "simulation";

export type OverlayEvent = {
  id: string;
  type: TimelineEventType;
  at_seconds: number;
  required: boolean;
  title: string | null;
  payload: any;
};

export type OverlayQuiz = {
  id: string;
  event_id: string;
  question: string;
  options: string[];
};

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VideoEventOverlay({
  event,
  quiz,
  busy,
  onSubmitQuiz,
  onOpenExam,
  onComplete,
  completed,
  onClose,
  previewOnly,
}: {
  event: OverlayEvent;
  quiz?: OverlayQuiz;
  busy: boolean;
  onSubmitQuiz: (selectedIndex: number) => Promise<{ ok: boolean; isCorrect: boolean }>;
  onOpenExam: (url: string) => Promise<void>;
  onComplete: () => Promise<{ ok: boolean }>;
  completed: boolean;
  onClose: () => void;
  previewOnly?: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<{ ok: boolean; isCorrect: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [simulationLoaded, setSimulationLoaded] = useState(false);
  const [showSimulationFallbackHint, setShowSimulationFallbackHint] = useState(false);
  const [examLoaded, setExamLoaded] = useState(false);
  const [showExamFallbackHint, setShowExamFallbackHint] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  const isQuizRequired = event.type === "quiz" && event.required;

  const examUrl = useMemo(() => (event.type === "exam" ? (event.payload?.url as string | undefined) : undefined), [event]);
  const simulationUrl = useMemo(
    () => (event.type === "simulation" ? (event.payload?.simulation_url as string | undefined) : undefined),
    [event],
  );

  useEffect(() => {
    if (event.type !== "simulation") return;
    setSimulationLoaded(false);
    setShowSimulationFallbackHint(false);

    const t = window.setTimeout(() => {
      setShowSimulationFallbackHint(true);
    }, 9000);
    return () => window.clearTimeout(t);
  }, [event.id, event.type, simulationUrl]);

  useEffect(() => {
    if (event.type !== "exam") return;
    setExamLoaded(false);
    setShowExamFallbackHint(false);

    const t = window.setTimeout(() => {
      setShowExamFallbackHint(true);
    }, 9000);
    return () => window.clearTimeout(t);
  }, [event.id, event.type, examUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-base">
            {fmt(event.at_seconds)} · {event.type}
            {event.required ? "" : " (optional)"}
          </CardTitle>
          <CardDescription>
            {event.title ?? ""}
            {previewOnly ? " · Preview mode" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {event.type === "quiz" ? (
            quiz ? (
              <div className="space-y-3">
                <div className="text-sm font-medium">{quiz.question}</div>
                <div className="space-y-2">
                  {quiz.options.map((opt, idx) => (
                    <label key={idx} className="flex cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name={`overlay-q-${event.id}`}
                        checked={selectedIndex === idx}
                        disabled={busy || submitting}
                        onChange={() => {
                          setSelectedIndex(idx);
                          // If they change their selection, clear prior feedback.
                          setResult(null);
                        }}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    disabled={busy || submitting || selectedIndex === null}
                    onClick={async () => {
                      if (selectedIndex === null) return;
                      if (previewOnly) {
                        onClose();
                        return;
                      }
                      setSubmitting(true);
                      setResult(null);
                      try {
                        const r = await onSubmitQuiz(selectedIndex);
                        setResult(r);
                        // Auto-close on correct
                        if (r.ok && r.isCorrect) onClose();
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    {previewOnly ? "Close" : submitting ? "Checking…" : "Submit"}
                  </Button>
                  {/* Avoid double-close in preview mode */}
                  {!previewOnly ? (
                    <Button
                      variant="secondary"
                      disabled={busy || submitting || (isQuizRequired && !(result?.ok && result.isCorrect))}
                      onClick={onClose}
                    >
                      {isQuizRequired ? "Back" : "Close"}
                    </Button>
                  ) : null}
                </div>
                {!previewOnly && result ? (
                  <p className={result.ok && result.isCorrect ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
                    {result.ok
                      ? result.isCorrect
                        ? "Correct. Continuing…"
                        : "Wrong answer — try again."
                      : "Submit failed. Please try again."}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Quiz not found for this event.</p>
            )
          ) : null}

          {event.type === "exam" ? (
            <div className="w-full space-y-3">
              {examUrl ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={async () => {
                        await onOpenExam(examUrl);
                      }}
                    >
                      Open in new tab
                    </Button>

                    {previewOnly ? (
                      <Button onClick={onClose} disabled={busy}>
                        Close
                      </Button>
                    ) : event.required ? (
                      <Button
                        onClick={async () => {
                          setCompleteError(null);
                          setCompleting(true);
                          try {
                            const r = await onComplete();
                            if (r.ok) {
                              onClose();
                              return;
                            }
                            setCompleteError("Could not mark complete. Please try again.");
                          } catch (e: any) {
                            setCompleteError(e?.message ?? "Could not mark complete. Please try again.");
                          } finally {
                            setCompleting(false);
                          }
                        }}
                        disabled={busy || completing || completed}
                      >
                        {completed ? "Completed" : completing ? "Saving…" : "Mark complete"}
                      </Button>
                    ) : (
                      <Button onClick={onClose} disabled={busy}>
                        Back to video
                      </Button>
                    )}
                  </div>

                  {completeError ? <p className="text-sm text-destructive">{completeError}</p> : null}

                  {!examLoaded ? <p className="text-sm text-muted-foreground">Loading exam…</p> : null}
                  {showExamFallbackHint && !examLoaded ? (
                    <p className="text-sm text-muted-foreground">If it doesn’t load here, use “Open in new tab”.</p>
                  ) : null}

                  <div className="overflow-hidden rounded-md border">
                    <iframe
                      key={examUrl}
                      title={event.title ? `Exam: ${event.title}` : "Exam"}
                      src={examUrl}
                      className="h-[60vh] w-full"
                      sandbox="allow-scripts allow-forms allow-same-origin"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onLoad={() => setExamLoaded(true)}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Exam URL missing.</p>
              )}
            </div>
          ) : null}

          {event.type === "simulation" ? (
            <div className="flex flex-wrap items-center gap-2">
              {simulationUrl ? (
                <div className="w-full space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="secondary">
                      <a href={`/simulations/view?url=${encodeURIComponent(simulationUrl)}`} target="_blank" rel="noreferrer">
                        Open in new tab
                      </a>
                    </Button>
                    {previewOnly ? (
                      <Button onClick={onClose} disabled={busy}>
                        Close
                      </Button>
                    ) : event.required ? (
                      <Button
                        onClick={async () => {
                          setCompleteError(null);
                          setCompleting(true);
                          try {
                            const r = await onComplete();
                            if (r.ok) {
                              onClose();
                              return;
                            }
                            setCompleteError("Could not mark complete. Please try again.");
                          } catch (e: any) {
                            setCompleteError(e?.message ?? "Could not mark complete. Please try again.");
                          } finally {
                            setCompleting(false);
                          }
                        }}
                        disabled={busy || completing || completed}
                      >
                        {completed ? "Completed" : completing ? "Saving…" : "Mark complete"}
                      </Button>
                    ) : (
                      <Button onClick={onClose} disabled={busy}>
                        Continue
                      </Button>
                    )}
                  </div>

                  {completeError ? <p className="text-sm text-destructive">{completeError}</p> : null}

                  {!simulationLoaded ? (
                    <p className="text-sm text-muted-foreground">Loading simulation…</p>
                  ) : null}
                  {showSimulationFallbackHint && !simulationLoaded ? (
                    <p className="text-sm text-muted-foreground">
                      If it doesn’t load here, use “Open in new tab”.
                    </p>
                  ) : null}

                  <div className="overflow-hidden rounded-md border">
                    <SimulationFrame
                      url={simulationUrl}
                      title={event.title ? `Simulation: ${event.title}` : "Simulation"}
                      className="h-[60vh] w-full"
                      onLoaded={() => setSimulationLoaded(true)}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Simulation URL missing.</p>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
