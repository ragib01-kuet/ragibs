import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";

type TeacherRequest = {
  id: string;
  user_id: string;
  message: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type ProfileLite = {
  user_id: string;
  email: string;
  display_name: string;
};

export default function AdminTeacherRequests() {
  const navigate = useNavigate();
  const { session, roles, loading } = useAuth();
  const isAdmin = roles.includes("admin");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUse = useMemo(() => Boolean(session && isAdmin), [session, isAdmin]);

  useEffect(() => {
    if (!loading && !session) navigate("/login");
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!loading && session && !isAdmin) navigate("/");
  }, [loading, session, isAdmin, navigate]);

  const requestsQuery = useQuery({
    queryKey: ["admin", "teacher-requests"],
    enabled: canUse,
    queryFn: async () => {
      const rr = await supabase
        .from("teacher_role_requests")
        .select("id,user_id,message,status,created_at,reviewed_at,reviewed_by")
        .order("created_at", { ascending: false });
      if (rr.error) throw rr.error;

      const requests = (rr.data ?? []) as TeacherRequest[];
      const userIds = Array.from(new Set(requests.map((r) => r.user_id)));

      const pr = userIds.length
        ? await supabase.from("profiles").select("user_id,email,display_name").in("user_id", userIds)
        : ({ data: [], error: null } as any);
      if (pr.error) throw pr.error;

      const profiles = (pr.data ?? []) as ProfileLite[];
      const profileByUserId = new Map(profiles.map((p) => [p.user_id, p] as const));

      return { requests, profileByUserId };
    },
  });

  async function approve(req: TeacherRequest) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      // Mark request approved
      const up = await supabase
        .from("teacher_role_requests")
        .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: session.user.id })
        .eq("id", req.id);
      if (up.error) throw up.error;

      // Grant teacher role (admins-only via RLS)
      const ins = await supabase.from("user_roles").insert({ user_id: req.user_id, role: "teacher" });
      // If already exists, ignore
      if (ins.error && !String(ins.error.message ?? "").toLowerCase().includes("duplicate")) throw ins.error;

      await requestsQuery.refetch();
    } catch (e: any) {
      setError(e?.message ?? "Failed to approve");
    } finally {
      setBusy(false);
    }
  }

  async function reject(req: TeacherRequest) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const up = await supabase
        .from("teacher_role_requests")
        .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: session.user.id })
        .eq("id", req.id);
      if (up.error) throw up.error;
      await requestsQuery.refetch();
    } catch (e: any) {
      setError(e?.message ?? "Failed to reject");
    } finally {
      setBusy(false);
    }
  }

  const pending = (requestsQuery.data?.requests ?? []).filter((r) => r.status === "pending");

  return (
    <AppShell title="Admin · Teacher Requests">
      <div className="space-y-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Pending requests</CardTitle>
          </CardHeader>
          <CardContent>
            {requestsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : requestsQuery.isError ? (
              <p className="text-sm text-destructive">Failed to load requests.</p>
            ) : pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending requests.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((r) => {
                      const p = requestsQuery.data?.profileByUserId.get(r.user_id);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-medium">{p?.display_name ?? r.user_id}</div>
                            <div className="text-xs text-muted-foreground">{p?.email ?? ""}</div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{r.message ?? ""}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" disabled={!canUse || busy} onClick={() => void approve(r)}>
                                Approve
                              </Button>
                              <Button variant="secondary" size="sm" disabled={!canUse || busy} onClick={() => void reject(r)}>
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All requests</CardTitle>
          </CardHeader>
          <CardContent>
            {requestsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : requestsQuery.isError ? (
              <p className="text-sm text-destructive">Failed to load requests.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Reviewed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(requestsQuery.data?.requests ?? []).map((r) => {
                      const p = requestsQuery.data?.profileByUserId.get(r.user_id);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <div className="font-medium">{p?.display_name ?? r.user_id}</div>
                            <div className="text-xs text-muted-foreground">{p?.email ?? ""}</div>
                          </TableCell>
                          <TableCell className="text-sm">{r.status}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
