-- BR-135 down — remove atomic workflow_state merge helper.

DROP FUNCTION IF EXISTS public.merge_prospect_workflow_state(uuid, uuid, jsonb);
