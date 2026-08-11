-- BR-135 — Atomic prospects.workflow_state JSONB merge (concurrent-safe).
-- Top-level || merge under row lock; omitted keys are preserved.

CREATE OR REPLACE FUNCTION public.merge_prospect_workflow_state(
  p_prospect_id uuid,
  p_organization_id uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next jsonb;
BEGIN
  IF p_prospect_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'prospectId and organizationId required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'workflow_state patch must be a jsonb object'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.prospects
  SET
    workflow_state = COALESCE(workflow_state, '{}'::jsonb) || p_patch,
    updated_at = now()
  WHERE id = p_prospect_id
    AND organization_id = p_organization_id
  RETURNING workflow_state INTO v_next;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_next;
END;
$$;

COMMENT ON FUNCTION public.merge_prospect_workflow_state(uuid, uuid, jsonb) IS
  'BR-135 atomic top-level JSONB merge into prospects.workflow_state (org scoped)';

REVOKE ALL ON FUNCTION public.merge_prospect_workflow_state(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_prospect_workflow_state(uuid, uuid, jsonb) TO service_role;
