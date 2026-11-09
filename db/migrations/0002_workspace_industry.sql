-- Earlier workspaces used the cleaning template implicitly. Make that choice
-- explicit without changing service rates, enquiry snapshots, or amounts.
UPDATE donekite.workspaces
SET state = jsonb_set(state, '{settings,industry}', '"cleaning"'::jsonb),
    revision = revision + 1
WHERE jsonb_typeof(state->'settings') = 'object'
  AND NOT (state->'settings' ? 'industry');
