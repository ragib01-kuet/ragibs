import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export default function Login() {
  const navigate = useNavigate();
  const { session, signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");

  const signInSchema = useMemo(
    () =>
      z.object({
        email: z.string().trim().email("Enter a valid email").max(255),
        password: z.string().min(8, "Password must be at least 8 characters").max(72),
      }),
    [],
  );

  const signUpSchema = useMemo(
    () =>
      z
        .object({
          email: z.string().trim().email("Enter a valid email").max(255),
          password: z.string().min(8, "Password must be at least 8 characters").max(72),
          confirmPassword: z.string().min(8).max(72),
        })
        .refine((v) => v.password === v.confirmPassword, {
          message: "Passwords do not match",
          path: ["confirmPassword"],
        }),
    [],
  );

  const signInForm = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  const signUpForm = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
    mode: "onSubmit",
  });

  useEffect(() => {
    if (session) navigate("/");
  }, [session, navigate]);

  return (
    <AppShell title="Sign in">
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Sign in with email/password. Google is optional if enabled.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-4 space-y-4">
                <form
                  className="space-y-3"
                  onSubmit={signInForm.handleSubmit(async (values) => {
                    setError(null);
                    setBusy(true);
                    try {
                      const { error } = await supabase.auth.signInWithPassword({
                        email: values.email,
                        password: values.password,
                      });
                      if (error) throw error;
                      toast({ title: "Signed in" });
                      navigate("/courses");
                    } catch (e: any) {
                      setError(e?.message ?? "Failed to sign in");
                    } finally {
                      setBusy(false);
                    }
                  })}
                >
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      autoComplete="email"
                      disabled={busy}
                      {...signInForm.register("email")}
                    />
                    {signInForm.formState.errors.email ? (
                      <p className="text-xs text-destructive">{signInForm.formState.errors.email.message}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
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
              </TabsContent>

              <TabsContent value="signup" className="mt-4 space-y-4">
                <form
                  className="space-y-3"
                  onSubmit={signUpForm.handleSubmit(async (values) => {
                    setError(null);
                    setBusy(true);
                    try {
                      const { error } = await supabase.auth.signUp({
                        email: values.email,
                        password: values.password,
                        options: {
                          emailRedirectTo: window.location.origin,
                        },
                      });
                      if (error) throw error;
                      toast({
                        title: "Account created",
                        description: "You can now sign in. Teacher access requires admin approval.",
                      });
                      setActiveTab("signin");
                      signUpForm.reset();
                    } catch (e: any) {
                      setError(e?.message ?? "Failed to sign up");
                    } finally {
                      setBusy(false);
                    }
                  })}
                >
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      disabled={busy}
                      {...signUpForm.register("email")}
                    />
                    {signUpForm.formState.errors.email ? (
                      <p className="text-xs text-destructive">{signUpForm.formState.errors.email.message}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      disabled={busy}
                      {...signUpForm.register("password")}
                    />
                    {signUpForm.formState.errors.password ? (
                      <p className="text-xs text-destructive">{signUpForm.formState.errors.password.message}</p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm">Confirm password</Label>
                    <Input
                      id="signup-confirm"
                      type="password"
                      autoComplete="new-password"
                      disabled={busy}
                      {...signUpForm.register("confirmPassword")}
                    />
                    {signUpForm.formState.errors.confirmPassword ? (
                      <p className="text-xs text-destructive">{signUpForm.formState.errors.confirmPassword.message}</p>
                    ) : null}
                  </div>

                  <Button className="w-full" disabled={busy} type="submit">
                    {busy ? "Creating…" : "Create account"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Teacher access is invite-only and requires admin approval after signup.
                  </p>
                </form>
              </TabsContent>
            </Tabs>

            <div className="pt-2">
              <Button
                className="w-full"
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  setError(null);
                  setBusy(true);
                  try {
                    await signInWithGoogle();
                  } catch (e: any) {
                    setError(e?.message ?? "Failed to sign in with Google");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Continue with Google (optional)
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                If you were invited as a teacher, signing in with the same email will unlock Teacher Studio access.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
