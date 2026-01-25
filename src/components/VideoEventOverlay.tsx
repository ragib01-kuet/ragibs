import { useMemo, useState } from "react";
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
  onClose,
}: {
  event: OverlayEvent;
  quiz?: OverlayQuiz;
  busy: boolean;
  onSubmitQuiz: (selectedIndex: number) => Promise<{ ok: boolean; isCorrect: boolean }>;
  onOpenExam: (url: string) => Promise<void>;
  onClose: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<{ ok: boolean; isCorrect: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const examUrl = useMemo(() => (event.type === "exam" ? (event.payload?.url as string | undefined) : undefined), [event]);
  const simulationUrl = useMemo(
    () => (event.type === "simulation" ? (event.payload?.simulation_url as string | undefined) : undefined),
    [event],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
      <Card className="w-full max-w-2xl">
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
              <Button onClick={onClose} disabled={busy}>
                Continue
              </Button>
            </div>
          ) : null}

          {event.type === "simulation" ? (
            <div className="flex flex-wrap items-center gap-2">
              {simulationUrl ? (
                <Button asChild variant="secondary">
                  <a href={simulationUrl} target="_blank" rel="noreferrer">
                    Open simulation
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Simulation URL missing.</p>
              )}
              <Button onClick={onClose} disabled={busy}>
                Continue
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
