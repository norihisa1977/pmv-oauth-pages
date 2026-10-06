# PC-4 — OAuth / Key-Context Isolation Candidate

Status: IMPLEMENTED / RUNTIME EVIDENCE REQUIRED
Date: 2026-10-06
Release: pmv-pwa-r1
Production activation: NO
Production data access: NONE
Production secrets access: NONE

## Design

Two separate documents are used:

- oauth.html
  - loads Google GIS
  - obtains short-lived drive.file access token
  - performs Drive about.get only
  - does not contain PMV Password input
  - does not load libsodium
  - does not handle KEK/DEK
  - stages one-time same-origin handoff in sessionStorage

- key-context.html
  - does not load Google GIS
  - does not contact Google
  - receives the staged token
  - immediately removes the handoff item
  - keeps the token only in JavaScript memory after handoff
  - does not handle PMV Password / KEK / DEK in this test

## Acceptance

GOOGLE_GIS_IN_KEY_CONTEXT = REMOVED
OAUTH_KEY_CONTEXT_ISOLATION = PASS
ACCESS_TOKEN_MEMORY_ONLY_AFTER_HANDOFF = PASS
HANDOFF_DESTROYED_AFTER_READ = PASS

Runtime evidence on the target iPhone is required before PC-4 is CLOSED.
