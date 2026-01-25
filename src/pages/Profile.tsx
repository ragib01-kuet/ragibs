import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";

export default function Profile() {
  const navigate = useNavigate();
  const { session, profile, refresh, loading } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarUrl = profile?.avatar_url ?? null;
  const userId = session?.user?.id ?? null;

  const canEdit = useMemo(() => Boolean(session && profile && userId), [session, profile, userId]);

  if (!loading && !session) {
    navigate("/login");
    return null;
  }

  return (
    <AppShell title="Profile">
      <div className="grid gap-6 md:grid-cols-5">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Avatar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Profile avatar"
                className="h-28 w-28 rounded-full border object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-full border bg-muted text-sm text-muted-foreground">
                No avatar
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="avatar">Upload image</Label>
              <Input
                id="avatar"
                type="file"
                accept="image/*"
                disabled={!canEdit || busy}
                onChange={async (e) => {
                  setError(null);
                  const file = e.target.files?.[0];
                  if (!file || !userId) return;
                  setBusy(true);
                  try {
                    const path = `${userId}/${Date.now()}-${file.name}`;
                    const upload = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
                    if (upload.error) throw upload.error;

                    const pub = supabase.storage.from("avatars").getPublicUrl(path);
                    const publicUrl = pub.data.publicUrl;

                    const upd = await supabase
                      .from("profiles")
                      .update({ avatar_url: publicUrl })
                      .eq("user_id", userId);
                    if (upd.error) throw upd.error;

                    await refresh();
                  } catch (err: any) {
                    setError(err?.message ?? "Failed to upload avatar");
                  } finally {
                    setBusy(false);
                    // allow re-uploading same file
                    e.target.value = "";
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">Images are stored in file storage; only the URL is saved.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={profile?.email ?? ""} readOnly />
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                disabled={!canEdit || busy}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea id="bio" value={bio} disabled={!canEdit || busy} onChange={(e) => setBio(e.target.value)} />
            </div>

            <Button
              disabled={!canEdit || busy}
              onClick={async () => {
                if (!userId) return;
                setError(null);
                setBusy(true);
                try {
                  const upd = await supabase
                    .from("profiles")
                    .update({ display_name: displayName.trim() || profile?.display_name, bio })
                    .eq("user_id", userId);
                  if (upd.error) throw upd.error;
                  await refresh();
                } catch (err: any) {
                  setError(err?.message ?? "Failed to save profile");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
