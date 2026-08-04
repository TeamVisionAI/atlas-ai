-- Rollback Policy Intelligence foundation (migration 021)

DROP TABLE IF EXISTS atlas_policy_documents;
DROP TABLE IF EXISTS atlas_policy_reviews;

DELETE FROM role_permissions
WHERE permission_code IN ('policy:read', 'policy:write');

DELETE FROM permissions
WHERE code IN ('policy:read', 'policy:write');
