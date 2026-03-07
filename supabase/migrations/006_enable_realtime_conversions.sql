-- Enable Realtime for conversions so the notes page can subscribe to row updates
-- (replaces polling for status/markdown/progress).
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversions;
