# BR-091 — Direct Lack-of-Interest Withdrawal Recognition

**Status:** Implemented in Recruit AI v2 (execution remains OFF)  
**Simulator:** `direct-no-interest-withdrawal`  
**Tests:** `backend/test/recruitAiV2DirectNoInterestWithdrawal.test.js`

## Problem

Bare Spanish `"No me interesa"` was not classified as `withdraw_interest` because withdraw patterns required modifiers such as `"ya no me interesa"`. Live recruiting then continued with clarify/scheduling pressure.

## Rules (summary)

1. Recognize clear EN/ES direct lack-of-interest phrases as `withdraw_interest` without requiring `"ya"`.
2. Keep distinct from opt-out, fixed-employment preference, current_not_fit, compensation FAQ, and appointment cancel.
3. Priority: cancel/withdraw/opt-out outranks scheduling, FAQ, location correction, name extraction, and generic clarification.
4. Terminal respectful closure; no follow-up recruiting question, handoff, or opt-out mutation unless explicitly requested.
5. Side-effect proposals remain denied while execution is OFF.

## Canonical closure

- ES: `Entiendo. Gracias por avisarnos. Te deseo mucho éxito.`
- EN: `I understand. Thanks for letting us know. I wish you every success.`
