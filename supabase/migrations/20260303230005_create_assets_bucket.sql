-- Create storage bucket for user assets (headshots, logos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'user-assets',
    'user-assets',
    true,
    5242880, -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
) ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
DROP POLICY IF EXISTS "Users upload own assets" ON storage.objects;
CREATE POLICY "Users upload own assets" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'user-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to update/delete their own files
DROP POLICY IF EXISTS "Users manage own assets" ON storage.objects;
CREATE POLICY "Users manage own assets" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'user-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own assets" ON storage.objects;
CREATE POLICY "Users delete own assets" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'user-assets' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Public read access (bucket is public so URLs work in proposals/PDFs)
DROP POLICY IF EXISTS "Public read assets" ON storage.objects;
CREATE POLICY "Public read assets" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'user-assets');
