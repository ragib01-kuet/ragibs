import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
}: {
  event: OverlayEvent;
  quiz?: OverlayQuiz;
  busy: boolean;
  onSubmitQuiz: (selectedIndex: number) => Promise<{ ok: boolean; isCorrect: boolean }>;
  onOpenExam: (url: string) => Promise<void>;
  onComplete: () => Promise<{ ok: boolean }>;
  completed: boolean;
  onClose: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<{ ok: boolean; isCorrect: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [simulationLoaded, setSimulationLoaded] = useState(false);
  const [showSimulationFallbackHint, setShowSimulationFallbackHint] = useState(false);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="text-base">
            {fmt(event.at_seconds)} · {event.type}
            {event.required ? "" : " (optional)"}
          </CardTitle>
          <CardDescription>{event.title ?? ""}</CardDescription>
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
                        onChange={() => setSelectedIndex(idx)}
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
                    {submitting ? "Submitting…" : "Submit"}
                  </Button>
                  <Button variant="secondary" disabled={busy || submitting} onClick={onClose}>
                    Close
                  </Button>
                </div>
                {result ? (
                  <p className={result.ok && result.isCorrect ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>
                    {result.ok ? (result.isCorrect ? "Correct." : "Incorrect.") : "Submit failed."}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Quiz not found for this event.</p>
            )
          ) : null}

          {event.type === "exam" ? (
            <div className="flex flex-wrap items-center gap-2">
              {examUrl ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    await onOpenExam(examUrl);
                  }}
                >
                  Open exam
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Exam URL missing.</p>
              )}
              {event.required ? (
                <Button
                  onClick={async () => {
                    const r = await onComplete();
                    if (r.ok) onClose();
                  }}
                  disabled={busy || completed}
                >
                  {completed ? "Completed" : "Mark complete"}
                </Button>
              ) : (
                <Button onClick={onClose} disabled={busy}>
                  Continue
                </Button>
              )}
            </div>
          ) : null}

          {event.type === "simulation" ? (
            <div className="flex flex-wrap items-center gap-2">
              {simulationUrl ? (
                <div className="w-full space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="secondary">
                      <a href={simulationUrl} target="_blank" rel="noreferrer">
                        Open in new tab
                      </a>
                    </Button>
                    {event.required ? (
                      <Button
                        onClick={async () => {
                          const r = await onComplete();
                          if (r.ok) onClose();
                        }}
                        disabled={busy || completed}
                      >
                        {completed ? "Completed" : "Mark complete"}
                      </Button>
                    ) : (
                      <Button onClick={onClose} disabled={busy}>
                        Continue
                      </Button>
                    )}
                  </div>

                  {!simulationLoaded ? (
                    <p className="text-sm text-muted-foreground">Loading simulation…</p>
                  ) : null}
                  {showSimulationFallbackHint && !simulationLoaded ? (
                    <p className="text-sm text-muted-foreground">
                      If it doesn’t load here, use “Open in new tab”.
                    </p>
                  ) : null}

                  <div className="overflow-hidden rounded-md border">
                    <iframe
                      key={simulationUrl}
                      title={event.title ? `Simulation: ${event.title}` : "Simulation"}
                      src={simulationUrl}
                      className="h-[60vh] w-full"
                      sandbox="allow-scripts allow-forms allow-same-origin"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onLoad={() => setSimulationLoaded(true)}
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
