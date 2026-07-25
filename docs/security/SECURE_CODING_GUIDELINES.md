# Secure Coding Guidelines

## Authentication & authorization

- Every route returning or mutating prospect PII must use `requireAtlasUser`.
- Never accept `organizationId` from the client without verifying it matches the authenticated user.
- Disable bootstrap session creation when `NODE_ENV=production`.
- Never embed secrets in frontend bundles (`VITE_*` is public).

## API design

- Validate all inputs at route boundary; use allowlists for PATCH/update payloads.
- Return generic errors in production (`error.message` hidden in `server.js` error handler).
- Paginate list endpoints; avoid `select("*")` on unbounded tables.
- Apply rate limits to all public POST endpoints.

## Webhooks

- Verify Meta `x-hub-signature-256` on all webhook POST handlers.
- Require `META_APP_SECRET` in production (fail closed).
- Respond 200 quickly; process asynchronously where possible.
- Log verification failures without storing payload PII.

## Database

- Prefer Supabase RLS for defense in depth; backend currently uses anon key only.
- Never construct SQL from user input; use parameterized Supabase client.
- Use service role only on server for privileged operations; scope queries explicitly.

## Logging

- Use structured logging without PII fields (`phone`, `email`, `message`).
- Redact path parameters in production access logs (see `safeRequestLogger.js`).
- Do not log authorization codes, tokens, or bootstrap credentials.

## Frontend

- Attach auth headers on all API calls via `apiClient.js`.
- Store only session token in `localStorage`; no prospect records client-side.
- Do not cache sensitive responses in service workers.

## Dependencies

- Keep Meta, Supabase, and OpenAI SDKs updated.
- Review `cors` origin list on every new frontend deployment domain.

## Code review checklist

- [ ] Does this change expose new PII?
- [ ] Is the route authenticated and authorized?
- [ ] Are inputs validated?
- [ ] Could this log secrets or PII?
- [ ] Does production fail closed on missing env?
