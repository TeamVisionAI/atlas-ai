-- Sprint 20.1.4 — Grant org:read to Regional Leader for Settings/Integrations access.

INSERT INTO role_permissions (role_code, permission_code)
SELECT 'REGIONAL_LEADER', p.code
FROM permissions p
WHERE p.code IN ('org:read', 'dashboard:executive', 'mission_control:access', 'prospect:assign', 'reports:access')
ON CONFLICT DO NOTHING;
