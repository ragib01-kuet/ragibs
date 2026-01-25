import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { session, roles, refresh } = useAuth();
  const isAdmin = roles.includes("admin");
  const [busy, setBusy] = useState(false);
  const [bootstrapBusy, setBootstrapBusy] = useState(false);

  const signInSchema = useMemo(
    () =>
      z.object({
        email: z.string().trim().email("Enter a valid email").max(255),
        password: z.string().min(8, "Password must be at least 8 characters").max(72),
      }),
    [],
  );

  const bootstrapSchema = useMemo(
    () =>
      z.object({
        token: z.string().trim().min(8, "Token is required").max(256),
      }),
    [],
  );

  const signInForm = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  const bootstrapForm = useForm<z.infer<typeof bootstrapSchema>>({
    resolver: zodResolver(bootstrapSchema),
    defaultValues: { token: "" },
    mode: "onSubmit",
  });

  useEffect(() => {
    if (isAdmin) navigate("/admin");
  }, [isAdmin, navigate]);

  return (
    <AppShell title="Admin Login">
      <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use your email/password to access admin tools.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="space-y-3"
              onSubmit={signInForm.handleSubmit(async (values) => {
                setBusy(true);
                try {
                  const { error } = await supabase.auth.signInWithPassword({
                    email: values.email,
                    password: values.password,
                  });
                  if (error) throw error;
                  await refresh();
                  toast({ title: "Signed in" });
                } catch (e: any) {
                  toast({
                    title: "Sign in failed",
                    description: e?.message ?? "Please try again.",
                    variant: "destructive",
                  });
                } finally {
                  setBusy(false);
                }
              })}
            >
              <div className="space-y-2">
                <Label htmlFor="admin-email">Email</Label>
                <Input id="admin-email" type="email" autoComplete="email" disabled={busy} {...signInForm.register("email")} />
                {signInForm.formState.errors.email ? (
                  <p className="text-xs text-destructive">{signInForm.formState.errors.email.message}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">Password</Label>
                <Input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  disabled={busy}
                  {...signInForm.register("password")}
                />
                {signInForm.formState.errors.password ? (
                  <p className="text-xs text-destructive">{signInForm.formState.errors.password.message}</p>
                ) : null}
              </div>

              <Button className="w-full" disabled={busy} type="submit">
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            {session ? (
              <p className="text-xs text-muted-foreground">Signed in as {session.user.email ?? ""}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Not signed in.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bootstrap first admin</CardTitle>
            <CardDescription>
              This only works once (when no admins exist). It promotes the currently signed-in user.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="space-y-3"
              onSubmit={bootstrapForm.handleSubmit(async (values) => {
                if (!session) {
                  toast({
                    title: "Sign in first",
                    description: "Please sign in before bootstrapping admin.",
                    variant: "destructive",
                  });
                  return;
                }
                setBootstrapBusy(true);
                try {
                  const res = await supabase.functions.invoke("bootstrap-admin", {
                    body: { token: values.token },
                  });
                  if (res.error) throw res.error;
                  await refresh();
                  toast({ title: "Admin granted" });
                  navigate("/admin");
                } catch (e: any) {
                  toast({
                    title: "Bootstrap failed",
                    description: e?.message ?? "Please verify the token.",
                    variant: "destructive",
                  });
                } finally {
                  setBootstrapBusy(false);
                }
              })}
            >
              <div className="space-y-2">
                <Label htmlFor="bootstrap-token">Bootstrap token</Label>
                <Input id="bootstrap-token" type="password" disabled={bootstrapBusy} {...bootstrapForm.register("token")} />
                {bootstrapForm.formState.errors.token ? (
                  <p className="text-xs text-destructive">{bootstrapForm.formState.errors.token.message}</p>
                ) : null}
              </div>

              <Button className="w-full" disabled={bootstrapBusy || !session} type="submit">
                {bootstrapBusy ? "Granting…" : "Make me admin"}
              </Button>
            </form>

            <Separator />
            <p className="text-xs text-muted-foreground">
              If you already have an admin, use the Admin area to manage teacher invites and requests.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
