# Journey #1 — First-Time User Onboarding

**Status:** LOCKED (Journey #1)  
**Change policy:** Bug fixes and usability improvements only. No new features.

Atlas v1.0 Journey #1 delivers a complete first-time setup flow:

Welcome → Sign Up / Login → Organization → Connect Meta → Connect Google Calendar → Meeting Preferences → Activate Atlas → Dashboard

## Routes

| Screen | Frontend route | Backend API |
|--------|----------------|-------------|
| Welcome | `/onboarding` | — |
| Sign Up | `/onboarding/signup` | `POST /api/auth/signup` |
| Login | `/onboarding/login` | `POST /api/auth/login` |
| Organization | `/onboarding/organization` | `POST /api/onboarding/organization` |
| Connect Meta | `/onboarding/meta` | Meta Embedded Signup + `POST /api/onboarding/meta/complete` |
| Connect Calendar | `/onboarding/calendar` | `GET /api/onboarding/calendar/connect` |
| Meeting Preferences | `/onboarding/meeting-preferences` | `PUT /api/onboarding/meeting-preferences` |
| Activate | `/onboarding/activate` | `POST /api/onboarding/activate` |
| Dashboard | `/app` | `GET /api/home/summary` |

## Architecture notes

- **Auth:** Email/password with scrypt hashing. Sessions use existing `atlas_sessions` pattern with JSON fallback for local development.
- **Organizations:** Stored in `backend/data/organizations.json` locally. Supabase migration `003_onboarding.sql` prepares production tables.
- **Meta:** Single "Connect Meta" button wraps existing Embedded Signup flow. Messenger, Instagram, and future channels are abstracted behind one integration surface.
- **Google Calendar:** OAuth redirect flow stores refresh token per organization.
- **Dashboard:** Journey #1 landing is `HomeDashboard` at `/app`. Executive Dashboard remains at `/app/executive` for later journeys.

## Local development

1. Start backend: `npm run dev`
2. Start frontend from `frontend/`: `npm run dev`
3. Open `http://localhost:5173/onboarding`
4. Complete signup and onboarding screens

Meta and Google OAuth require environment variables documented in `.env.example`.

## Verification

```bash
node backend/dev/verifyJourney1.js
```
