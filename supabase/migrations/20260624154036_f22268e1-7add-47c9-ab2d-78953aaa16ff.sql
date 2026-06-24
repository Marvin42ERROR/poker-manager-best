
-- 1. Guarantee non-empty, bounded club names.
ALTER TABLE public.clubs
  ADD CONSTRAINT clubs_name_nonblank_chk
  CHECK (char_length(btrim(name)) BETWEEN 1 AND 80);

-- 2. Case-insensitive lookup index for search_public_clubs (ILIKE prefix/substring).
CREATE INDEX IF NOT EXISTS clubs_name_lower_idx
  ON public.clubs (lower(name));

-- 3. Index the creator reference for owner/creator lookups.
CREATE INDEX IF NOT EXISTS clubs_created_by_idx
  ON public.clubs (created_by);
