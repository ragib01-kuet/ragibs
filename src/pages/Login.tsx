import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthProvider";

export default function Login() {
  const navigate = useNavigate();
  const { session, signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate("/");
  }, [session, navigate]);

  return (
    <AppShell title="Sign in">
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Continue with Google</CardTitle>
            <CardDescription>Use your Google account to sign in.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              className="w-full"
              disabled={busy}
              onClick={async () => {
                setError(null);
                setBusy(true);
                try {
                  await signInWithGoogle();
                } catch (e: any) {
                  setError(e?.message ?? "Failed to sign in");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Sign in with Google
            </Button>
            <p className="text-xs text-muted-foreground">
              If you were invited as a teacher, signing in with the same email will unlock Teacher Studio access.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
