-- BR-237 — Per-conversation leased lock for Recruit V2 inbound processing.
-- Distributed across Railway instances. Lease expiry prevents deadlock.

BEGIN;

CREATE TABLE IF NOT EXISTS public.atlas_conversation_turn_locks (
  organization_id uuid NOT NULL,
  prospect_id uuid NOT NULL,
  lock_token text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  provider_message_id text,
  PRIMARY KEY (organization_id, prospect_id)
);

COMMENT ON TABLE public.atlas_conversation_turn_locks IS
  'BR-237 leased lock: one Recruit V2 decision pipeline per organization_id + prospect_id';

CREATE INDEX IF NOT EXISTS idx_atlas_conversation_turn_locks_expires
  ON public.atlas_conversation_turn_locks (expires_at);

CREATE OR REPLACE FUNCTION public.acquire_atlas_conversation_turn_lock(
  p_organization_id uuid,
  p_prospect_id uuid,
  p_lock_token text,
  p_ttl_ms integer DEFAULT 45000,
  p_provider_message_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ttl integer;
  v_expires timestamptz;
  v_token text;
BEGIN
  IF p_organization_id IS NULL OR p_prospect_id IS NULL OR p_lock_token IS NULL THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'MISSING_SCOPE');
  END IF;

  v_ttl := GREATEST(1000, LEAST(COALESCE(p_ttl_ms, 45000), 120000));
  v_expires := now() + make_interval(secs => v_ttl / 1000.0);

  INSERT INTO public.atlas_conversation_turn_locks (
    organization_id,
    prospect_id,
    lock_token,
    locked_at,
    expires_at,
    provider_message_id
  )
  VALUES (
    p_organization_id,
    p_prospect_id,
    p_lock_token,
    now(),
    v_expires,
    p_provider_message_id
  )
  ON CONFLICT (organization_id, prospect_id)
  DO UPDATE SET
    lock_token = EXCLUDED.lock_token,
    locked_at = now(),
    expires_at = EXCLUDED.expires_at,
    provider_message_id = EXCLUDED.provider_message_id
  WHERE public.atlas_conversation_turn_locks.expires_at <= now()
     OR public.atlas_conversation_turn_locks.lock_token = EXCLUDED.lock_token
  RETURNING lock_token INTO v_token;

  IF v_token IS NULL THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'HELD');
  END IF;

  RETURN jsonb_build_object(
    'acquired', true,
    'lockToken', v_token,
    'expiresAt', v_expires
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_atlas_conversation_turn_lock(
  p_organization_id uuid,
  p_prospect_id uuid,
  p_lock_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_organization_id IS NULL OR p_prospect_id IS NULL OR p_lock_token IS NULL THEN
    RETURN jsonb_build_object('released', false, 'reason', 'MISSING_SCOPE');
  END IF;

  DELETE FROM public.atlas_conversation_turn_locks
  WHERE organization_id = p_organization_id
    AND prospect_id = p_prospect_id
    AND lock_token = p_lock_token;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('released', v_deleted > 0);
END;
$$;

COMMENT ON FUNCTION public.acquire_atlas_conversation_turn_lock(uuid, uuid, text, integer, text) IS
  'BR-237 acquire leased conversation turn lock (steal only when expired)';
COMMENT ON FUNCTION public.release_atlas_conversation_turn_lock(uuid, uuid, text) IS
  'BR-237 release conversation turn lock by token';

REVOKE ALL ON FUNCTION public.acquire_atlas_conversation_turn_lock(uuid, uuid, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_atlas_conversation_turn_lock(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acquire_atlas_conversation_turn_lock(uuid, uuid, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_atlas_conversation_turn_lock(uuid, uuid, text) TO service_role;

ALTER TABLE public.atlas_conversation_turn_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_conversation_turn_locks_deny_anon
  ON public.atlas_conversation_turn_locks;
CREATE POLICY atlas_conversation_turn_locks_deny_anon
  ON public.atlas_conversation_turn_locks
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_conversation_turn_locks_deny_authenticated
  ON public.atlas_conversation_turn_locks;
CREATE POLICY atlas_conversation_turn_locks_deny_authenticated
  ON public.atlas_conversation_turn_locks
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_conversation_turn_locks FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_conversation_turn_locks TO service_role;

COMMIT;
