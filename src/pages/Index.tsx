import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

type Course = {
  id: string;
  title: string;
  description: string | null;
};

const Index = () => {
  const coursesQuery = useQuery({
    queryKey: ["courses", "published"],
    queryFn: async () => {
      const res = await supabase
        .from("courses")
        .select("id,title,description")
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (res.error) throw res.error;
      return (res.data ?? []) as Course[];
    },
  });

  return (
    <AppShell title="Courses">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Published courses</CardTitle>
            <CardDescription>Public browsing is enabled. Sign in to manage your profile.</CardDescription>
          </CardHeader>
          <CardContent>
            {coursesQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : coursesQuery.isError ? (
              <p className="text-sm text-destructive">Failed to load courses.</p>
            ) : coursesQuery.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No published courses yet.</p>
            ) : (
              <div className="space-y-3">
                {coursesQuery.data.map((c) => (
                  <div key={c.id} className="rounded-lg border p-3">
                    <div className="font-medium">{c.title}</div>
                    {c.description ? <div className="mt-1 text-sm text-muted-foreground">{c.description}</div> : null}
                    <div className="mt-3">
                      <Button asChild size="sm">
                        <Link to={`/courses/${c.id}`}>Open course</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Teacher Studio</CardTitle>
            <CardDescription>Invite-only for teachers. Admin manages invites.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Admin → Invites is available once you sign in as admin.</p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};

export default Index;
