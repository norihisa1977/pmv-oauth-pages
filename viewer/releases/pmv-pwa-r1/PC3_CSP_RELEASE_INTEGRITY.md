# PC-3 — CSP and Release Integrity

Status: IMPLEMENTED IN RELEASE CANDIDATE
Date: 2026-10-06
Release: pmv-pwa-r1
Production activation: NO
Production data access: NONE
Production secrets access: NONE

## Controls implemented

- CSP is embedded in the candidate document.
- default-src is none.
- executable scripts are restricted to same-origin and verified blob modules.
- connect-src is same-origin only.
- object-src is none.
- base-uri is none.
- frame-ancestors is none.
- form-action is none.
- no third-party script origin is allowed.
- libsodium source bytes are fetched same-origin with no-store.
- SHA-256 is computed with WebCrypto before execution.
- any hash mismatch fails closed.
- only verified bytes are executed by creating Blob module URLs from the already-hashed source text.
- the wrapper's local import is rewritten in memory to the verified libsodium-sumo Blob URL.
- no Production data or Production secret is accessed by the integrity test.

## Acceptance target

CSP_KEY_CONTEXT = IMPLEMENTED
THIRD_PARTY_SCRIPT_IN_KEY_CONTEXT = NONE
RELEASE_INTEGRITY_FAIL_CLOSED = IMPLEMENTED

Runtime evidence on the target iPhone is still required before PC-3 is CLOSED.
