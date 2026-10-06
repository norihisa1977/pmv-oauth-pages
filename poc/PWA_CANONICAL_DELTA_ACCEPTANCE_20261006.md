# PMV v1 — iPhone PWA Canonical Delta Acceptance Record

Status: ACCEPTED
Date: 2026-10-06
Authority: User explicit acceptance in PMV project conversation
Production implementation: NOT YET STARTED
Production data access: NONE

## Accepted items

The following iPhone PWA Canonical Delta candidate items are accepted as the approved design direction:

- D53 — iPhone PWA Viewer permitted as a Normal Access implementation
- D54-A — browser/key-storage model with no persistent PMV Password / wrapping key / Production KEK / Media DEK / plaintext media
- D54-B — browser OAuth token model using short-lived memory-only drive.file access tokens and explicit user-gesture renewal
- D54-C — DPoP-bound refresh-token requirement is NOT_APPLICABLE to the PWA browser path because no browser refresh token is used; no claim is made for DPoP-bound browser access tokens
- DA — Google authorization alone is not decrypt authority; Normal Access requires Viewer integrity + Drive authorization + PMV password unwrap + vault/key_generation binding + media AEAD validity
- T1 — remote PWA code-delivery Trust Root is accepted WITH CONTROLS

## Explicit Trust Root acceptance

Accepted Trust Roots for the iPhone PWA path:
- GitHub repository publishing authority
- GitHub Pages delivery infrastructure
- DNS authority for the PMV domain
- TLS / certificate infrastructure serving the PMV origin

This acceptance is conditioned on mandatory Production controls:
1. no third-party cryptographic runtime in the key-handling context;
2. self-hosted exact-version libsodium JS/WASM;
3. executable asset SHA-256 manifest;
4. immutable versioned Production release path;
5. restrictive CSP;
6. no Google GIS or other third-party executable script in the password/KEK/DEK handling document;
7. OAuth/key-context isolation;
8. arbitrary repository commits do not automatically become active Production Viewer releases;
9. explicit release promotion after evidence review;
10. strong MFA/passkey protection and least privilege for publishing authority;
11. integrity mismatch fails closed.

## Invariants preserved

The acceptance does NOT alter the following existing authorities:

- Windows Production Normal Access remains unchanged.
- Existing Production encrypted media remains unchanged.
- Existing media cryptographic format remains unchanged.
- Existing Recovery Authority remains unchanged and independent.
- Recovery is not replaced by the PWA wrapper.
- No plaintext migration is authorized.
- No Production KEK / Media DEK has been exposed to the PWA.
- No Production media access occurred during P0-P5 PoC.

## Feasibility evidence relied upon

- P0 Browser Capability = PASS
- P1 Argon2id13 512 MiB = PASS
- P2 Synthetic Photo Crypto = PASS
- P3 Synthetic Video / Managed Media Source = PASS
- P4 Browser OAuth / Drive token model = PASS
- P5 Loss / Recovery = PASS

Classification:
PWA_FEASIBILITY = FEASIBLE_WITH_DELTA

## Authority transition

Before acceptance:
PWA Production implementation = NOT AUTHORIZED because Canonical Delta was unaccepted.

After this acceptance:
PWA DESIGN DIRECTION = ACCEPTED.
Production implementation remains subject to separate Production Change Control.

## Next required gate

The next stage is Production Change Control design.

No Production implementation may begin until the Production Change Control defines and accepts:
- Production release architecture
- T1 control implementation sequence
- OAuth/key-context isolation mechanism
- Production wrapped-KEK package format and creation procedure
- rollback procedure
- no-plaintext-migration invariant
- Production photo acceptance
- Production video acceptance
- idle-timeout acceptance
- loss/reconstruction drill
- release-integrity evidence
- browser-persisted-secret regression checks

CANONICAL_DELTA_ACCEPTANCE = PASS
PRODUCTION_CHANGE_CONTROL = NOT_YET_ACCEPTED
PRODUCTION_IMPLEMENTATION = NOT_STARTED
