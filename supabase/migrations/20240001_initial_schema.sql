-- ============================================================
-- ContentEngine: Initial Schema
-- ============================================================

-- -------------------------------------------------------
-- 1. USERS (extends Supabase auth.users)
-- -------------------------------------------------------
CREATE TABLE public.users (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  plan        text NOT NULL DEFAULT 'free'
                   CHECK (plan IN ('free', 'pro', 'agency')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read their own row
CREATE POLICY "users: select own"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own row
CREATE POLICY "users: update own"
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Auto-create user row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, full_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -------------------------------------------------------
-- 2. PROJECTS
-- -------------------------------------------------------
CREATE TABLE public.projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  niche       text NOT NULL,
  status      text NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects: select own"
  ON public.projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "projects: insert own"
  ON public.projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "projects: update own"
  ON public.projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "projects: delete own"
  ON public.projects FOR DELETE
  USING (auth.uid() = user_id);

-- -------------------------------------------------------
-- 3. RESEARCH RESULTS
-- -------------------------------------------------------
CREATE TABLE public.research_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform    text NOT NULL,
  topic       text NOT NULL,
  summary     text,
  raw_data    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.research_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "research_results: select own"
  ON public.research_results FOR SELECT
  USING (
    auth.uid() = (
      SELECT user_id FROM public.projects WHERE id = project_id
    )
  );

CREATE POLICY "research_results: insert own"
  ON public.research_results FOR INSERT
  WITH CHECK (
    auth.uid() = (
      SELECT user_id FROM public.projects WHERE id = project_id
    )
  );

CREATE POLICY "research_results: update own"
  ON public.research_results FOR UPDATE
  USING (
    auth.uid() = (
      SELECT user_id FROM public.projects WHERE id = project_id
    )
  );

CREATE POLICY "research_results: delete own"
  ON public.research_results FOR DELETE
  USING (
    auth.uid() = (
      SELECT user_id FROM public.projects WHERE id = project_id
    )
  );

-- -------------------------------------------------------
-- 4. CONTENT ITEMS
-- -------------------------------------------------------
CREATE TABLE public.content_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('video', 'post', 'article')),
  title       text NOT NULL,
  content     text,
  status      text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  output_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_items: select own"
  ON public.content_items FOR SELECT
  USING (
    auth.uid() = (
      SELECT user_id FROM public.projects WHERE id = project_id
    )
  );

CREATE POLICY "content_items: insert own"
  ON public.content_items FOR INSERT
  WITH CHECK (
    auth.uid() = (
      SELECT user_id FROM public.projects WHERE id = project_id
    )
  );

CREATE POLICY "content_items: update own"
  ON public.content_items FOR UPDATE
  USING (
    auth.uid() = (
      SELECT user_id FROM public.projects WHERE id = project_id
    )
  );

CREATE POLICY "content_items: delete own"
  ON public.content_items FOR DELETE
  USING (
    auth.uid() = (
      SELECT user_id FROM public.projects WHERE id = project_id
    )
  );

-- -------------------------------------------------------
-- Indexes
-- -------------------------------------------------------
CREATE INDEX idx_projects_user_id ON public.projects(user_id);
CREATE INDEX idx_research_results_project_id ON public.research_results(project_id);
CREATE INDEX idx_content_items_project_id ON public.content_items(project_id);
CREATE INDEX idx_content_items_status ON public.content_items(status);
