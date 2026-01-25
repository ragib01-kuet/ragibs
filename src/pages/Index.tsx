import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthProvider";

export default function Index() {
  const { session } = useAuth();

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="relative overflow-hidden rounded-xl border bg-hero p-6 card-glow animate-fade-in md:p-8">
          <p className="text-xs font-medium tracking-widest text-muted-foreground">RAGIB’S WORLD</p>
          <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            <span className="text-gradient">Interactive courses</span> for students—learn, practice, and progress.
          </h1>
          <p className="mt-2 max-w-2xl text-pretty text-sm text-muted-foreground md:text-base">
            Start watching lessons, hit checkpoints (quiz/simulation/exam), and keep your progress saved.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button asChild className="hover-lift">
              <Link to="/courses">Explore courses</Link>
            </Button>
            <Button asChild variant="secondary" className="hover-lift">
              <Link to="/login">Teacher login / signup</Link>
            </Button>
          </div>
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          <Card className="card-elev hover-lift animate-scale-in">
            <CardHeader>
              <CardTitle className="text-base">Student area</CardTitle>
              <CardDescription>Browse courses and start learning.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Courses</Badge>
                <Badge variant="secondary">Quizzes</Badge>
                <Badge variant="secondary">Simulations</Badge>
              </div>
              <Button asChild>
                <Link to="/courses">Open courses</Link>
              </Button>
              <p className="text-xs text-muted-foreground">You can browse without signing in.</p>
            </CardContent>
          </Card>

          <Card className="card-elev hover-lift animate-scale-in">
            <CardHeader>
              <CardTitle className="text-base">Teacher login / signup</CardTitle>
              <CardDescription>Teacher access is invite-only (admin approved).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="secondary">
                <Link to="/login">{session ? "Switch account" : "Sign in / Sign up"}</Link>
              </Button>
              <p className="text-xs text-muted-foreground">
                After signing in, request teacher access from your Profile (or ask an admin for an invite).
              </p>
              <Button asChild variant="secondary">
                <Link to="/profile">Go to Profile</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
