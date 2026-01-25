import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Index = () => {
  return (
    <AppShell title="Courses">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Published courses</CardTitle>
            <CardDescription>Public browsing is enabled. Sign in to manage your profile.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Course listing UI will be wired next.</p>
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
