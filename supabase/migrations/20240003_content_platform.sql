-- Add platform and research_result_id to content_items
-- and enable Realtime for live frontend updates

ALTER TABLE public.content_items
  ADD COLUMN platform text,
  ADD COLUMN research_result_id uuid REFERENCES public.research_results(id) ON DELETE SET NULL;

CREATE INDEX idx_content_items_research_result_id
  ON public.content_items(research_result_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.content_items;
