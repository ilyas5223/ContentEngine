-- Enable Supabase Realtime for research_results so the frontend
-- can receive live updates as the worker inserts topics.
ALTER PUBLICATION supabase_realtime ADD TABLE public.research_results;
