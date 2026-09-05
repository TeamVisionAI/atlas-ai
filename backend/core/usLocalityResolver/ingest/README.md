# Census ingest (build-time only)

Deterministic script: `buildUsLocalityIndex.js`.

- Downloads Census Places + ZCTA–Place files into `.cache/` once.
- Strips LSAD suffixes (`city`, `CDP`, `town`, …).
- Drops Puerto Rico and other territories.
- Emits `../data/usLocalities.generated.json`.
- Never runs on a WhatsApp inbound path.

Do not point production Recruit V2 at this script.
