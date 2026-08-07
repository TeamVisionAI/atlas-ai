# Playground Feedback Fix #5 — Date Resolution, Cancellation, Meeting-Mode Confirmation (BR-085)

## Root causes

1. **Weekday → 12:00 AM** — `formatTimeEntity` used `Number(null) === 0` when `parseScheduleRequest` returned a day hint with no clock time, so `lunes` / `martes` became `requestedTime=00:00` and rendered as “prefieres 12:00 AM”.
2. **Cancellation miss** — `looksLikeCancelRequest` required a confirmed appointment and only matched `cancel|cancelar…`. Phrases like `cancelalo` / `cambié de idea` fell through to location/name → generic clarification.
3. **Immediate Orlando → in-person** — `PROVIDE_MEETING_PREFERENCE` applied `in_person` with no travel confirmation despite OUTSIDE/Zoom coverage and a Doral-only office.

## Deterministic date behavior

- Date-only intent: `scheduling_date_proposal`
- With prior active time: template `confirm_date_with_time` (“Claro. ¿El lunes a las 7:00 PM te funciona?”)
- Without prior time: `acknowledge_date_ask_time`
- Calendar resolution via `dateResolution.js` + org timezone (default `America/New_York`)

## Cancellation taxonomy

| Intent | Examples | Side-effect proposal (denied) |
|--------|----------|-------------------------------|
| `cancel_request` | cancelalo, cancela la cita, cancel it | `cancel_appointment` |
| `withdraw_interest` | cambié de idea, ya no me interesa, cancelalo + cambié de idea | `withdraw_prospect` (+ cancel when both) |
| `opt_out_request` | STOP, unsubscribe | `communication_opt_out` |

## Meeting modality confirmation

| State | Fields |
|-------|--------|
| Coverage default Zoom | `preferredMeetingType=zoom`, `meetingPreferenceSource=coverage_default` |
| In-person requested (OUTSIDE) | `meetingTypeRequested=in_person`, `meetingTypeConfirmed=false`, active modality stays Zoom |
| Travel confirmed | `preferredMeetingType=in_person`, `meetingPreferenceSource=prospect_confirmed` |
| Explicit Zoom again | Zoom immediately; office location cleared |

## Scenario

`orlando-scheduling-date-change-cancellation`

## Production posture (unchanged)

- Context capture 100% Team Vision only  
- Shadow 10% Team Vision only  
- Execution / cutover OFF  
- Live CE authoritative  
- SideEffectAuthorizer deny-all  
