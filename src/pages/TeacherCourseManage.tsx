import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";

type Course = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  published: boolean;
  tags: string[];
  featured: boolean;
  featured_rank: number;
  thumbnail_url: string | null;
};

type Video = {
  id: string;
  course_id: string;
  owner_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  lecture_sheet_url: string | null;
  exam_url: string | null;
  simulation_url: string | null;
  published: boolean;
  created_at: string;
};

export default function TeacherCourseManage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { session, roles, loading } = useAuth();
  const isTeacher = roles.includes("teacher") || roles.includes("admin");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUse = useMemo(() => Boolean(session && isTeacher && courseId), [session, isTeacher, courseId]);

  useEffect(() => {
    if (!loading && !session) navigate("/login");
  }, [loading, session, navigate]);

  useEffect(() => {
    if (!loading && session && !isTeacher) navigate("/");
  }, [loading, session, isTeacher, navigate]);

  const courseQuery = useQuery({
    queryKey: ["teacher", "course", courseId],
    enabled: canUse,
    queryFn: async () => {
      const res = await supabase
        .from("courses")
        .select("id,owner_id,title,description,published,tags,featured,featured_rank,thumbnail_url")
        .eq("id", courseId!)
        .maybeSingle();
      if (res.error) throw res.error;
      return (res.data ?? null) as Course | null;
    },
  });

  const videosQuery = useQuery({
    queryKey: ["teacher", "course", courseId, "videos"],
    enabled: canUse,
    queryFn: async () => {
      const res = await supabase
        .from("videos")
        .select(
          "id,course_id,owner_id,title,description,video_url,lecture_sheet_url,exam_url,simulation_url,published,created_at",
        )
        .eq("course_id", courseId!)
        .order("created_at", { ascending: true });
      if (res.error) throw res.error;
      return (res.data ?? []) as Video[];
    },
  });

  const [courseTitle, setCourseTitle] = useState("");
  const [courseDesc, setCourseDesc] = useState("");
  const [coursePublished, setCoursePublished] = useState(false);
  const [courseTagsText, setCourseTagsText] = useState("");
  const [courseFeatured, setCourseFeatured] = useState(false);
  const [courseFeaturedRank, setCourseFeaturedRank] = useState(0);
  const [courseThumbUrl, setCourseThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (courseQuery.data) {
      setCourseTitle(courseQuery.data.title);
      setCourseDesc(courseQuery.data.description ?? "");
      setCoursePublished(courseQuery.data.published);
      setCourseTagsText((courseQuery.data.tags ?? []).join(", "));
      setCourseFeatured(Boolean(courseQuery.data.featured));
      setCourseFeaturedRank(courseQuery.data.featured_rank ?? 0);
      setCourseThumbUrl(courseQuery.data.thumbnail_url ?? null);
    }
  }, [courseQuery.data]);

  function parseTags(text: string) {
    return Array.from(
      new Set(
        text
          .split(/[\n,]/g)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
  }

  async function uploadCourseThumbnail(file: File) {
    if (!session) throw new Error("Not signed in");
    const userId = session.user.id;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${userId}/${courseId}/${Date.now()}-${safeName}`;
    const up = await supabase.storage.from("course-thumbnails").upload(path, file, {
      upsert: true,
      cacheControl: "3600",
    });
    if (up.error) throw up.error;
    return supabase.storage.from("course-thumbnails").getPublicUrl(path).data.publicUrl;
  }

  // Video create form
  const [vTitle, setVTitle] = useState("");
  const [vDesc, setVDesc] = useState("");
  const [vUrl, setVUrl] = useState("");
  const [vLecture, setVLecture] = useState("");
  const [vExam, setVExam] = useState("");
  const [vSim, setVSim] = useState("");

  async function uploadVideoFile(file: File) {
    if (!session) throw new Error("Not signed in");
    const userId = session.user.id;
    // Keep object names predictable + policy-compatible, and avoid special characters in filenames.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${userId}/${Date.now()}-${safeName}`;
    const up = await supabase.storage.from("videos").upload(path, file, {
      upsert: true,
      cacheControl: "3600",
      contentType: file.type || undefined,
    });
    if (up.error) throw up.error;
    return supabase.storage.from("videos").getPublicUrl(path).data.publicUrl;
  }

  return (
    <AppShell title="Teacher Studio · Manage Course">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" asChild>
            <Link to="/studio">Back to studio</Link>
          </Button>
          {courseId ? (
            <Button variant="secondary" asChild>
              <Link to={`/courses/${courseId}`}>View public page</Link>
            </Button>
          ) : null}
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Card>
          <CardHeader>
            <CardTitle>Course settings</CardTitle>
            <CardDescription>Edit metadata and publish when ready.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Thumbnail (16:9)</Label>
              {courseThumbUrl ? (
                <div className="space-y-2">
                  <div className="overflow-hidden rounded-md border">
                    <img
                      src={courseThumbUrl}
                      alt="Course thumbnail"
                      className="h-40 w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Current thumbnail</Badge>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No thumbnail yet.</p>
              )}

              <Input
                type="file"
                accept="image/*"
                disabled={!canUse || busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  setError(null);
                  try {
                    const url = await uploadCourseThumbnail(file);
                    setCourseThumbUrl(url);
                    const res = await supabase.from("courses").update({ thumbnail_url: url }).eq("id", courseId!);
                    if (res.error) throw res.error;
                    await courseQuery.refetch();
                  } catch (err: any) {
                    setError(err?.message ?? "Failed to upload thumbnail");
                  } finally {
                    setBusy(false);
                    e.target.value = "";
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">Uploads to file storage; the course stores only the URL.</p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="ct">Title</Label>
              <Input id="ct" value={courseTitle} disabled={!canUse || busy} onChange={(e) => setCourseTitle(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="cd">Description</Label>
              <Textarea
                id="cd"
                value={courseDesc}
                disabled={!canUse || busy}
                onChange={(e) => setCourseDesc(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
              <div>
                <div className="text-sm font-medium">Published</div>
                <div className="text-xs text-muted-foreground">When on, this course becomes visible to everyone.</div>
              </div>
              <Switch checked={coursePublished} disabled={!canUse || busy} onCheckedChange={setCoursePublished} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Tags (comma or newline separated)</Label>
              <Textarea value={courseTagsText} disabled={!canUse || busy} onChange={(e) => setCourseTagsText(e.target.value)} />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3 md:col-span-2">
              <div>
                <div className="text-sm font-medium">Featured</div>
                <div className="text-xs text-muted-foreground">Featured courses appear first on the homepage.</div>
              </div>
              <Switch checked={courseFeatured} disabled={!canUse || busy} onCheckedChange={setCourseFeatured} />
            </div>

            {courseFeatured ? (
              <div className="space-y-2 md:col-span-2">
                <Label>Featured rank (lower = higher)</Label>
                <Input
                  type="number"
                  value={courseFeaturedRank}
                  disabled={!canUse || busy}
                  onChange={(e) => setCourseFeaturedRank(Number(e.target.value))}
                />
              </div>
            ) : null}

            <div className="md:col-span-2">
              <Button
                disabled={!canUse || busy || !courseTitle.trim()}
                onClick={async () => {
                  if (!courseId) return;
                  setBusy(true);
                  setError(null);
                  try {
                    const tags = parseTags(courseTagsText);
                    const res = await supabase
                      .from("courses")
                      .update({
                        title: courseTitle.trim(),
                        description: courseDesc || null,
                        published: coursePublished,
                        tags,
                        featured: courseFeatured,
                        featured_rank: courseFeatured ? Math.floor(courseFeaturedRank || 0) : 0,
                        thumbnail_url: courseThumbUrl,
                      })
                      .eq("id", courseId);
                    if (res.error) throw res.error;
                    await courseQuery.refetch();
                  } catch (e: any) {
                    setError(e?.message ?? "Failed to save course");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save course
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add video</CardTitle>
            <CardDescription>Use either an external URL or upload a video file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vt">Title</Label>
                <Input id="vt" value={vTitle} disabled={!canUse || busy} onChange={(e) => setVTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vurl">External video URL (optional)</Label>
                <Input id="vurl" value={vUrl} disabled={!canUse || busy} onChange={(e) => setVUrl(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="vdesc">Description</Label>
                <Textarea
                  id="vdesc"
                  value={vDesc}
                  disabled={!canUse || busy}
                  onChange={(e) => setVDesc(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ls">Lecture sheet URL (optional)</Label>
                <Input id="ls" value={vLecture} disabled={!canUse || busy} onChange={(e) => setVLecture(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ex">Exam URL (optional)</Label>
                <Input id="ex" value={vExam} disabled={!canUse || busy} onChange={(e) => setVExam(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="sim">Simulation URL (optional)</Label>
                <Input id="sim" value={vSim} disabled={!canUse || busy} onChange={(e) => setVSim(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="vfile">Upload video file (optional)</Label>
                <Input
                  id="vfile"
                  type="file"
                  accept="video/*"
                  disabled={!canUse || busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setBusy(true);
                    setError(null);
                    try {
                      const publicUrl = await uploadVideoFile(file);
                      setVUrl(publicUrl);
                    } catch (err: any) {
                      setError(err?.message ?? "Failed to upload video");
                    } finally {
                      setBusy(false);
                      e.target.value = "";
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Upload stores the file and auto-fills the URL above.
                </p>
              </div>
            </div>

            <Button
              disabled={!canUse || busy || !vTitle.trim()}
              onClick={async () => {
                if (!session || !courseId) return;
                setBusy(true);
                setError(null);
                try {
                  const res = await supabase.from("videos").insert({
                    course_id: courseId,
                    owner_id: session.user.id,
                    title: vTitle.trim(),
                    description: vDesc || null,
                    video_url: vUrl || null,
                    lecture_sheet_url: vLecture || null,
                    exam_url: vExam || null,
                    simulation_url: vSim || null,
                    published: false,
                  });
                  if (res.error) throw res.error;
                  setVTitle("");
                  setVDesc("");
                  setVUrl("");
                  setVLecture("");
                  setVExam("");
                  setVSim("");
                  await videosQuery.refetch();
                } catch (e: any) {
                  setError(e?.message ?? "Failed to create video");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add video
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Videos</CardTitle>
            <CardDescription>Publish videos when ready.</CardDescription>
          </CardHeader>
          <CardContent>
            {videosQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : videosQuery.isError ? (
              <p className="text-sm text-destructive">Failed to load videos.</p>
            ) : videosQuery.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">No videos yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {videosQuery.data.map((vid) => (
                    <TableRow key={vid.id}>
                      <TableCell className="font-medium">{vid.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{vid.published ? "Published" : "Draft"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button asChild size="sm" variant="secondary">
                            <Link to={`/studio/courses/${courseId}/videos/${vid.id}/timeline`}>Timeline</Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={!canUse || busy}
                            onClick={async () => {
                              setBusy(true);
                              setError(null);
                              try {
                                const res = await supabase
                                  .from("videos")
                                  .update({ published: !vid.published })
                                  .eq("id", vid.id);
                                if (res.error) throw res.error;
                                await videosQuery.refetch();
                              } catch (e: any) {
                                setError(e?.message ?? "Failed to update");
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {vid.published ? "Unpublish" : "Publish"}
                          </Button>
                          <Button asChild size="sm">
                            <Link to={`/courses/${courseId}/videos/${vid.id}`}>View</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
