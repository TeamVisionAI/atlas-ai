-- BR-147 — RLS patch for campaign_intake_codes (idempotent; safe when tables already exist).

ALTER TABLE public.campaign_intake_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_intake_codes_deny_anon ON public.campaign_intake_codes;
CREATE POLICY campaign_intake_codes_deny_anon
  ON public.campaign_intake_codes
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS campaign_intake_codes_deny_authenticated ON public.campaign_intake_codes;
CREATE POLICY campaign_intake_codes_deny_authenticated
  ON public.campaign_intake_codes
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.campaign_intake_codes FROM anon, authenticated;
GRANT ALL ON TABLE public.campaign_intake_codes TO service_role;

ALTER TABLE public.campaign_intake_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_intake_attributions_deny_anon ON public.campaign_intake_attributions;
CREATE POLICY campaign_intake_attributions_deny_anon
  ON public.campaign_intake_attributions
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS campaign_intake_attributions_deny_authenticated ON public.campaign_intake_attributions;
CREATE POLICY campaign_intake_attributions_deny_authenticated
  ON public.campaign_intake_attributions
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.campaign_intake_attributions FROM anon, authenticated;
GRANT ALL ON TABLE public.campaign_intake_attributions TO service_role;
