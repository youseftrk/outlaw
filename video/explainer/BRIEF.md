---
workflow: faceless-explainer
flow: automation
storyboard: no
message: "One switch that grants — and instantly takes back — an AI agent's power."
destination: web
aspect: 1920x1080
language: en
audience: governments and large enterprises running many AI agents (UAE first)
length: 75s
angle: concept
mode: autonomous
---

## Intent

A calm, confident explainer for Qalaa: an emergency shows why cross-organisation
agent permission is unanswered (who says yes, for how long, who can stop it), then
Qalaa's five-step answer. Eloquent, no hype. On-screen kinetic type carries every
word — no voiceover; Cuelume cues are the only sound.

## Assets

- `public/brand/*` (repo root) — Qalaa logo/wordmark/lockup, copied unmodified into `assets/brand/`.
- `fonts/space-grotesk-vf.woff2`, `fonts/jetbrains-mono-vf.woff2` — local variable woff2 (OFL).
- `audio/*.wav` — Cuelume cues rendered locally (only SFX source).

## Customizations

- Paper Shaders GrainGradient (vanilla `@paper-design/shaders`) as the ambient backdrop —
  wave shape, exact params from the brief, driven deterministically by the timeline.
- arlan.me/vault motion patterns reproduced: typer, ghosty-reveal, color-depth,
  liquid-ui, vector-editor, kinetic-typography.
- No real voice (tooling not trivially available signed-out); SCRIPT.md carries the
  timed on-screen copy.

## Notes

- Verified claims only — never "thousands of AI agents" (unverifiable). Sources:
  mediaoffice.ae (Apr 2026 two-year goal), dge.gov.ae (AED 13B AI-native 2027),
  Dubai Chief AI Officers (230+), Gartner (40%+ agentic projects cancelled by 2027).
- Vocabulary: permission, owner, switch, record, refused/allowed, agent, incident.
  Never: lease, receipt, token, RBAC, policy engine, middleware, 403/200.
- Demo entities: National Emergency Response Authority asks National Data Authority
  for permission to contain one system for one hour.
- Red #ff6b5c is used only for "Refused".
