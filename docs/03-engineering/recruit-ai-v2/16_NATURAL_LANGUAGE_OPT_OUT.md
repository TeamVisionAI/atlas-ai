# Natural-Language Communication Opt-Out (BR-086)

## Root cause

`no more messages` was not recognized as opt-out.  
`looksLikeLocationCorrection` matches `/^no[,:]?\s+/i`, and `parseLocationAnswer` treated **More Messages** as a city → `correct_location`.

## Fix

- Expand `looksLikeCommunicationOptOut` (EN/ES stop-contact phrases).
- Keep cancel / withdraw / opt-out taxonomy separate; combined cancel+opt-out proposes both denied side effects.
- Opt-out intent remains early in the interpreter (before location/name/FAQ/scheduling).

## Customer copy

Acknowledge only — no follow-up question, no scheduling resume.
