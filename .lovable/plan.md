
Goal
- Add safe “Delete video” and “Delete course” actions that:
  - Remove database records
  - Remove uploaded files from file storage
  - Remove dependent learning data (timeline events, quiz attempts, progress, completions, etc.)
  - Use a strict “type DELETE to confirm” flow for course deletion

What’s currently happening (from code review)
- TeacherCourseManage currently supports:
  - Uploading a video file to the `videos` storage bucket (path: `${userId}/${Date.now()}-${safeName}`)
  - Saving a “video record” to the `videos` table via “Add video”
  - Publishing/unpublishing videos
- There is no delete UI for videos or courses.
- Client-side deletes would be incomplete because:
  - Some dependent tables (quiz_attempts, completions, exam launches, etc.) do not allow teachers to DELETE via RLS.
  - Storage object deletes may be restricted by storage policies.
- The project already uses backend functions with a service key (e.g., `event-complete`, `quiz-attempt`, `bootstrap-admin`) that validate the user and then perform privileged operations safely. We should follow this pattern for deletion.

Decisions confirmed
- Course deletion should be a full delete (course + videos + all dependent data).
- Video deletion should delete both the DB record and its uploaded file.
- Course deletion confirmation must require typing “DELETE”.

Implementation approach (high-level)
1) Add two backend functions (server-side, privileged) that perform deletions:
   - delete-video: deletes one video and all dependent rows, then removes its storage object (if present and owned)
   - delete-course: deletes a course, iterates through its videos (reusing the same cascade logic), removes course thumbnail object (if present), then deletes the course row

2) Update TeacherCourseManage UI:
   - Add a “Delete” button per video row (with confirmation dialog)
   - Add a “Delete course” button in Course settings (with “type DELETE” confirmation)
   - Optionally add a small “Remove uploaded file” button next to the upload field to delete an uploaded object that hasn’t been saved yet (this is helpful when the user uploads the wrong file before clicking “Add video”)

Backend details (technical)
A) New backend function: delete-video
- Endpoint: POST /functions/v1/delete-video
- Body: { videoId: string }
- Auth:
  - Read user from Authorization header (same as other functions)
  - Fetch user roles from `user_roles` using service client (or reuse existing role-check logic)
  - Fetch `videos` row (service client) to get owner_id, course_id, video_url
  - Authorization rule:
    - Allow if user is admin
    - OR (user is teacher AND video.owner_id === userId)
- Cascade deletion (service client, bypassing RLS but enforced by above checks):
  1. Fetch timeline_events ids + types where video_id = videoId
  2. If any events:
     - Delete from quizzes where event_id IN (quiz event ids)
     - Delete from quiz_attempts where event_id IN (event ids)
     - Delete from exam_launches where event_id IN (event ids)
     - Delete from video_event_completions where event_id IN (event ids)
     - Delete timeline_events where video_id = videoId
  3. Delete video_progress where video_id = videoId
  4. Delete the video row itself
- Storage deletion:
  - If video_url is a public URL pointing to the `videos` bucket, extract the object path and call:
    - admin.storage.from("videos").remove([path])
  - If the URL is empty or not a storage URL, skip storage removal safely.
- Response: { ok: true }

B) New backend function: delete-course
- Endpoint: POST /functions/v1/delete-course
- Body: { courseId: string }
- Auth:
  - Validate user as above
  - Fetch course row to check owner_id
  - Allow if admin OR (teacher AND course.owner_id === userId)
- Steps:
  1. Fetch all videos for that course: id, video_url
  2. For each video id, run the same cascade deletion logic as delete-video (implemented as a shared helper inside the function or duplicated carefully)
  3. Remove course thumbnail file:
     - If courses.thumbnail_url points to `course-thumbnails` bucket, extract path and remove it
  4. Delete the course row
- Response: { ok: true }

C) URL-to-storage-path extraction helper (used by both functions)
- Given a public URL, parse using URL().
- Look for pathname segment: `/storage/v1/object/public/<bucket>/`
- If present, everything after `<bucket>/` is the object path to remove.
- This avoids fragile string slicing and ensures deletes target the correct bucket.

Frontend/UI changes (TeacherCourseManage.tsx)
1) Video row “Delete” action
- Add a new column action button “Delete” (variant: destructive or outline+destructive text).
- Use the existing AlertDialog UI component:
  - Title: “Delete video?”
  - Description: “This permanently removes the video, its events, and student progress for this video.”
  - Buttons: Cancel / Delete
- On confirm:
  - Call the backend function delete-video with the videoId
  - On success: refetch videosQuery and show a success toast/message
  - On failure: display error message in existing error state

2) Course settings “Delete course” action (type-to-confirm)
- Add a destructive section at the bottom of Course settings card:
  - “Danger zone”
  - “Delete course”
- AlertDialog content includes:
  - An input field: “Type DELETE to confirm”
  - Disable the confirm button until input exactly equals “DELETE”
- On confirm:
  - Call backend function delete-course with courseId
  - On success: navigate to /studio and optionally refetch studio courses list when the studio page loads
  - On failure: show error message

3) Optional: remove uploaded-but-not-saved object
- In “Add video” form, if vUrl looks like a `videos` bucket URL, show a small button “Remove uploaded file”
- On click:
  - Call a backend function (either reuse delete-video is not applicable because no DB record exists yet), so implement a small backend function delete-storage-object:
    - Body: { bucket: "videos", path: string }
    - Authorization: user must be signed in; allow only if path starts with `${auth.uid()}/`
  - Or implement a client-side storage removal if current storage policies allow it; but to be robust, prefer server-side.
- This is optional because the user explicitly asked about removing uploaded videos; the core requirement is deleting saved videos and courses.

Error handling & UX polish
- Show clear, human-friendly errors:
  - “You don’t have permission to delete this video/course.”
  - “Video not found (it may already be deleted).”
- Ensure all destructive buttons are disabled while `busy` is true.
- After deletes, always refetch relevant queries to ensure UI consistency.

Verification checklist (deep “expert” checks)
- Permissions:
  - Teacher can delete only their own content
  - Admin can delete any teacher content
- Data integrity:
  - After deleting a video, TeacherVideoTimeline route for that video should show “Not found” rather than crashing
  - Student course page should no longer list the deleted video
- Storage:
  - The video file is actually removed from storage (no orphaned files)
  - The course thumbnail is removed when deleting the course
- Edge cases:
  - Video with no events
  - Video with events but no quiz
  - Course with zero videos
  - Deleting while another tab is open (should still behave safely)
- Performance:
  - Batch deletes using IN() where possible to reduce round trips

Files that will be changed/added (once you approve)
- Add:
  - supabase/functions/delete-video/index.ts
  - supabase/functions/delete-course/index.ts
  - (Optional) supabase/functions/delete-storage-object/index.ts
- Edit:
  - src/pages/TeacherCourseManage.tsx (add buttons + dialogs + calls)
  - Possibly src/lib/utils.ts (if we add a shared URL parsing helper for frontend display; backend will still have its own)

Rollout
- Implement backend functions first (so UI buttons work immediately).
- Implement UI changes next.
- Then run a quick end-to-end manual test:
  - Upload + save a video → delete it → confirm it disappears and no longer plays publicly
  - Create a course with 1–2 videos → delete course → confirm it disappears from Studio and public pages
