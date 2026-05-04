-- Add progress_step to content_items for granular video generation status
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS progress_step text;

-- Create public videos storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  true,
  104857600,  -- 100 MB
  ARRAY['video/mp4', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Allow service_role to upload (used by the API worker via supabaseAdmin)
-- Public read is handled by bucket public = true
CREATE POLICY "videos: service role insert"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'videos');

CREATE POLICY "videos: service role update"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'videos');
