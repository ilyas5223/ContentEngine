-- Allow narration MP3 uploads in the `videos` bucket. Remotion's Chromium
-- fetches the audio over HTTPS during render, so it lives alongside the final
-- MP4 in the same public bucket.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'audio/mpeg']
WHERE id = 'videos';
