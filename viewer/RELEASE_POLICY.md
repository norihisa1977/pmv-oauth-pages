# PMV iPhone PWA — Production Release Isolation Policy

Status: ACTIVE CHANGE-CONTROL POLICY
Date: 2026-10-06
Production media access: NONE
Production secrets access: NONE

## Purpose

Separate all PoC material under /poc/ from any future Production Viewer release.

## Path model

PoC:
- /poc/**

Production release candidates:
- /viewer/releases/<release_id>/**

Stable entry point:
- /viewer/

## Rules

1. Files under /poc/ MUST NEVER be treated as Production Viewer assets.
2. Every Production Viewer release MUST have a unique release_id.
3. A release_id path MUST be treated as immutable after approval. If any executable byte changes, a new release_id MUST be created.
4. Arbitrary commits to main MUST NOT activate a new Production release.
5. /viewer/ MUST fail closed unless an explicitly approved active release has been promoted.
6. Promotion MUST record:
   - release_id
   - source commit SHA
   - executable asset SHA-256 manifest
   - approval timestamp
   - approval authority
7. Rollback MUST only change the promoted release pointer/state; it MUST NOT require media re-encryption, KEK rotation, or Recovery changes.
8. No Production PMV Password, Production KEK, Media DEK, plaintext media, or Drive access token may be embedded in release files.

## Current state

ACTIVE_RELEASE = NONE
PRODUCTION_VIEWER_ENABLED = NO
POC_PRODUCTION_SEPARATION = PASS
EXPLICIT_PROMOTION_REQUIRED = PASS

