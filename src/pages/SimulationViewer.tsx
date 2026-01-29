import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimulationFrame } from "@/components/overlays/SimulationFrame";

function safeHttpUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export default function SimulationViewer() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const url = useMemo(() => safeHttpUrl(params.get("url")), [params]);

  return (
    <AppShell title="Simulation">
      <main className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Back
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Simulation</CardTitle>
          </CardHeader>
          <CardContent>
            {url ? (
              <div className="overflow-hidden rounded-md border">
                <SimulationFrame url={url} title="Simulation" className="h-[80vh] w-full" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Simulation URL is missing or invalid.</p>
            )}
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}
