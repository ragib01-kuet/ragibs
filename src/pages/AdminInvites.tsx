import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { toast } from "@/hooks/use-toast";

type Invite = {
  id: string;
  email: string;
  created_at: string;
  invited_by: string | null;
};

export default function AdminInvites() {
  const navigate = useNavigate();
  const { session, roles, loading } = useAuth();
  const isAdmin = roles.includes("admin");

  const [email, setEmail] = useState("");
  const [items, setItems] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seedBusy, setSeedBusy] = useState(false);

  const canUse = useMemo(() => Boolean(session && isAdmin), [session, isAdmin]);

  useEffect(() => {
    if (!loading && !session) navigate("/login");
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!loading && session && !isAdmin) navigate("/");
  }, [loading, session, isAdmin, navigate]);

  async function loadInvites() {
    const res = await supabase.from("teacher_invites").select("id,email,created_at,invited_by").order("created_at", {
      ascending: false,
    });
    if (res.error) throw res.error;
    setItems((res.data ?? []) as Invite[]);
  }

  useEffect(() => {
    if (canUse) void loadInvites().catch((e: any) => setError(e?.message ?? "Failed to load invites"));
  }, [canUse]);

  return (
    <AppShell title="Admin · Teacher Invites">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Invite a teacher</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="email">Teacher email</Label>
                <Input
                  id="email"
                  placeholder="teacher@example.com"
                  value={email}
                  disabled={!canUse || busy}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button
                disabled={!canUse || busy || !email.trim()}
                onClick={async () => {
                  setError(null);
                  setBusy(true);
                  try {
                    const cleaned = email.trim().toLowerCase();
                    const res = await supabase.from("teacher_invites").insert({ email: cleaned, invited_by: session!.user.id });
                    if (res.error) throw res.error;
                    setEmail("");
                    await loadInvites();
                  } catch (e: any) {
                    setError(e?.message ?? "Failed to create invite");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Add invite
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              When the invited user signs in with Google using the same email, they automatically receive the “teacher” role.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Demo content</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Create a published demo course + video with quiz/simulation/exam events.
            </p>
            <Button
              variant="secondary"
              disabled={!canUse || seedBusy}
              onClick={async () => {
                setSeedBusy(true);
                try {
                  const res = await supabase.functions.invoke("seed-demo-content", { body: {} });
                  if (res.error) throw res.error;
                  const courseId = (res.data as any)?.courseId as string | undefined;
                  toast({
                    title: "Demo content created",
                    description: courseId ? "Opening the course…" : "Demo course is ready.",
                  });
                  if (courseId) {
                    // lightweight navigation without adding route deps here
                    window.location.assign(`/courses/${courseId}`);
                  }
                } catch (e: any) {
                  toast({
                    title: "Failed to seed demo content",
                    description: e?.message ?? "Please try again.",
                    variant: "destructive",
                  });
                } finally {
                  setSeedBusy(false);
                }
              }}
            >
              {seedBusy ? "Creating…" : "Create demo course"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing invites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm text-muted-foreground">
                        No invites yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.email}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(inv.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!canUse || busy}
                            onClick={async () => {
                              setError(null);
                              setBusy(true);
                              try {
                                const res = await supabase.from("teacher_invites").delete().eq("id", inv.id);
                                if (res.error) throw res.error;
                                await loadInvites();
                              } catch (e: any) {
                                setError(e?.message ?? "Failed to delete invite");
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Remove
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
