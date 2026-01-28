import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";

type TeacherRequest = {
  id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  message: string | null;
};

export default function Profile() {
  const navigate = useNavigate();
  const { session, profile, refresh, loading, roles } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [publicHeadline, setPublicHeadline] = useState("");
  const [publicBio, setPublicBio] = useState("");
  const [publicBusy, setPublicBusy] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);

  const [publicLoadedOnce, setPublicLoadedOnce] = useState(false);
  const [teacherRequest, setTeacherRequest] = useState<TeacherRequest | null>(null);
  const [teacherRequestMessage, setTeacherRequestMessage] = useState("");
  const [teacherBusy, setTeacherBusy] = useState(false);
  const [teacherError, setTeacherError] = useState<string | null>(null);

  const avatarUrl = profile?.avatar_url ?? null;
  const userId = session?.user?.id ?? null;

  const canEdit = useMemo(() => Boolean(session && profile && userId), [session, profile, userId]);
  const isTeacher = roles.includes("teacher") || roles.includes("admin");

  // Keep local form state in sync with the global profile (without overwriting user edits mid-typing).
  useEffect(() => {
    if (!profile) return;
    if (detailsDirty) return;
    setDisplayName(profile.display_name ?? "");
    setBio(profile.bio ?? "");
  }, [profile, detailsDirty]);

  // Load public teacher card (only relevant for teachers/admins)
  useEffect(() => {
    if (!userId || !isTeacher) return;
    void (async () => {
      try {
        const res = await supabase
          .from("teacher_public_profiles")
          .select("display_name,headline,bio")
          .eq("user_id", userId)
          .maybeSingle();
        if (res.error) throw res.error;

        // Prefill: public values if present, otherwise fall back to profile fields
        const nextHeadline = res.data?.headline ?? "";
        const nextBio = res.data?.bio ?? profile?.bio ?? "";
        setPublicHeadline(nextHeadline);
        setPublicBio(nextBio);
      } catch {
        // best-effort
      } finally {
        setPublicLoadedOnce(true);
      }
    })();
  }, [userId, isTeacher]);

  // Keep the default public bio in sync if profile loads later (but don't overwrite user edits)
  useEffect(() => {
    if (!publicLoadedOnce) return;
    // Only backfill if still empty
    if (!publicBio.trim() && profile?.bio) setPublicBio(profile.bio);
  }, [profile?.bio, publicLoadedOnce]);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      try {
        const res = await supabase
          .from("teacher_role_requests")
          .select("id,status,created_at,message")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (res.error) throw res.error;
        setTeacherRequest(((res.data ?? [])[0] as TeacherRequest | undefined) ?? null);
      } catch {
        // best-effort
      }
    })();
  }, [userId]);

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

                    if (isTeacher) {
                      const pubUp = await supabase.from("teacher_public_profiles").upsert(
                        {
                          user_id: userId,
                          display_name: displayName.trim() || profile?.display_name || "Teacher",
                          avatar_url: publicUrl,
                        },
                        { onConflict: "user_id" },
                      );
                      if (pubUp.error) throw pubUp.error;
                    }

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
                  onChange={(e) => {
                    setDetailsDirty(true);
                    setDisplayName(e.target.value);
                  }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  disabled={!canEdit || busy}
                  onChange={(e) => {
                    setDetailsDirty(true);
                    setBio(e.target.value);
                  }}
                />
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

                  // Keep teacher-facing public card in sync globally (Course/Video pages read from teacher_public_profiles).
                  if (isTeacher) {
                    const pubUp = await supabase.from("teacher_public_profiles").upsert(
                      {
                        user_id: userId,
                        display_name: displayName.trim() || profile?.display_name || "Teacher",
                        avatar_url: profile?.avatar_url ?? null,
                      },
                      { onConflict: "user_id" },
                    );
                    if (pubUp.error) throw pubUp.error;
                  }

                  await refresh();
                  setDetailsDirty(false);
                } catch (err: any) {
                  setError(err?.message ?? "Failed to save profile");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save
            </Button>

            {isTeacher ? (
              <div className="pt-6">
                <div className="text-sm font-medium">Public teacher card</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  This is what students see on your courses and videos.
                </div>

                {publicError ? <p className="mt-2 text-sm text-destructive">{publicError}</p> : null}

                <div className="mt-3 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="publicHeadline">Headline</Label>
                    <Input
                      id="publicHeadline"
                      value={publicHeadline}
                      disabled={!canEdit || publicBusy}
                      onChange={(e) => setPublicHeadline(e.target.value)}
                      placeholder="e.g., Physics Teacher · KUET"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="publicBio">Public bio</Label>
                    <Textarea
                      id="publicBio"
                      value={publicBio}
                      disabled={!canEdit || publicBusy}
                      onChange={(e) => setPublicBio(e.target.value)}
                      placeholder="Short bio shown to students…"
                    />
                  </div>

                  <Button
                    variant="secondary"
                    disabled={!canEdit || publicBusy}
                    onClick={async () => {
                      if (!userId || !profile) return;
                      setPublicBusy(true);
                      setPublicError(null);
                      try {
                        const res = await supabase.from("teacher_public_profiles").upsert(
                          {
                            user_id: userId,
                            display_name: displayName.trim() || profile.display_name,
                            headline: publicHeadline.trim() || null,
                            bio: publicBio.trim() || null,
                            avatar_url: profile.avatar_url,
                          },
                          { onConflict: "user_id" },
                        );
                        if (res.error) throw res.error;
                      } catch (e: any) {
                        setPublicError(e?.message ?? "Failed to save public teacher card");
                      } finally {
                        setPublicBusy(false);
                      }
                    }}
                  >
                    {publicBusy ? "Saving…" : "Save public teacher card"}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="pt-4">
              <div className="text-sm font-medium">Teacher access</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {isTeacher
                  ? "You already have teacher access."
                  : teacherRequest?.status === "pending"
                    ? "Your request is pending review."
                    : teacherRequest?.status === "approved"
                      ? "Approved. Sign out and sign back in if the Studio hasn’t appeared yet."
                      : teacherRequest?.status === "rejected"
                        ? "Your request was rejected. You can request again."
                        : "Request access to create and manage courses."}
              </div>

              {teacherError ? <p className="mt-2 text-sm text-destructive">{teacherError}</p> : null}

              {!isTeacher ? (
                <div className="mt-3 space-y-2">
                  <Label htmlFor="teacherReq">Message (optional)</Label>
                  <Textarea
                    id="teacherReq"
                    value={teacherRequestMessage}
                    disabled={!canEdit || teacherBusy || teacherRequest?.status === "pending"}
                    onChange={(e) => setTeacherRequestMessage(e.target.value)}
                    placeholder="Tell the admin why you need teacher access…"
                  />
                  <Button
                    disabled={!canEdit || teacherBusy || teacherRequest?.status === "pending"}
                    onClick={async () => {
                      if (!userId) return;
                      setTeacherBusy(true);
                      setTeacherError(null);
                      try {
                        const ins = await supabase
                          .from("teacher_role_requests")
                          .insert({ user_id: userId, message: teacherRequestMessage.trim() || null });
                        if (ins.error) throw ins.error;
                        const res = await supabase
                          .from("teacher_role_requests")
                          .select("id,status,created_at,message")
                          .eq("user_id", userId)
                          .order("created_at", { ascending: false })
                          .limit(1);
                        if (res.error) throw res.error;
                        setTeacherRequest(((res.data ?? [])[0] as TeacherRequest | undefined) ?? null);
                        setTeacherRequestMessage("");
                      } catch (e: any) {
                        setTeacherError(e?.message ?? "Failed to request teacher access");
                      } finally {
                        setTeacherBusy(false);
                      }
                    }}
                  >
                    Request Teacher Access
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
