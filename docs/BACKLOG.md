# Atlas Product Backlog

## UI Platform

### Reusable UI component library (Quick Capture follow-up)

**Priority:** Post v0.1.0-alpha  
**Status:** Backlog  
**Context:** Sprint 10.1 Quick Capture introduced page-specific form styling (`QuickCapture.css`) and inline patterns. Over time, Atlas should extract shared primitives to avoid page-specific UI drift.

**Scope:**

- Form field (`AtlasField`) — label, input, error
- Segmented control (`AtlasSegmentedControl`)
- Primary / secondary buttons (`AtlasButton`)
- Dialog / overlay (`AtlasDialog`)
- Banner (`AtlasBanner`) — success, error, info
- Compact form shell (`AtlasFormCard`) — mobile-first, centered desktop panel

**Acceptance:**

- Quick Capture refactored to use shared components without visual regression
- Mission Control and Executive Dashboard can adopt incrementally
- Bilingual labels continue via existing `LanguageContext`

**Out of scope:** Full design-system documentation, Storybook, or unrelated page redesigns.
