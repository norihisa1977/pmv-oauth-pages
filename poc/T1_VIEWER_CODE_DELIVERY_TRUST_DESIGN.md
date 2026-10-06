# PMV iPhone PWA — T1 Viewer Code-Delivery Trust Design

Status: NON-NORMATIVE DESIGN CANDIDATE
Date: 2026-10-06
Production change: NONE
Canonical change: NONE
Production media access: NONE

## 1. Objective

Close T1: prevent mutable third-party or unverified remote code from executing in the same trust context as:
- PMV Normal Access Password
- Normal Access Wrapping Key
- Production KEK
- Media DEK
- plaintext photo/video data

The Production PWA MUST NOT be promoted while T1 remains open.

## 2. Threat model

T1 assumes an attacker may compromise or replace:
- a third-party CDN script;
- a mutable JavaScript dependency;
- a repository publishing credential;
- a GitHub Pages deployment;
- DNS / custom-domain configuration;
- any script loaded dynamically into the key-handling page.

If such code executes in the key-handling page, it can read secrets directly from JavaScript memory. Therefore the Production design must minimize executable remote trust roots and isolate OAuth/network code from key-handling code.

## 3. Production trust model

### T1-A — No third-party executable code in key-handling context

The Production vault page MUST NOT load executable JavaScript or WASM from:
- jsDelivr;
- unpkg;
- Google Identity Services;
- analytics;
- tag managers;
- advertising;
- remote UI libraries;
- any other third-party origin.

All cryptographic JavaScript/WASM MUST be vendored into the PMV release and served from the PMV origin as immutable release assets.

### T1-B — Self-hosted cryptographic runtime

libsodium JS/WASM used by Production MUST:
- be vendored into the PMV repository;
- be pinned to an exact release;
- have SHA-256 hashes recorded in the Production release manifest;
- be served from a versioned immutable path;
- never be auto-upgraded;
- fail closed if the expected asset set is incomplete or mismatched.

### T1-C — OAuth separation

Google OAuth MUST NOT execute in the same document that handles PMV password / KEK / DEK.

Preferred design:
1. A dedicated OAuth bootstrap page obtains a short-lived `drive.file` access token.
2. The vault page is opened without an opener relationship.
3. The access token is transferred only through an explicit, one-time same-origin handoff mechanism that carries no PMV password or key material.
4. The OAuth page is destroyed/closed before any PMV password is entered.
5. The vault page itself contains no Google executable script.

If an OAuth design can be implemented without loading Google JavaScript at all, that is preferred.

### T1-D — Strict Content Security Policy

The Production key-handling page MUST use a restrictive CSP equivalent in effect to:
- default-src 'none'
- script-src only the exact PMV release assets
- connect-src only the minimum Google Drive/API endpoints required
- img-src/blob/media-src only what the Viewer requires
- object-src 'none'
- base-uri 'none'
- frame-ancestors 'none'
- form-action 'none'

No `unsafe-eval`.
No `unsafe-inline` except where replaced by nonces/hashes and justified.
No third-party script origins.

### T1-E — Release immutability

Each Production Viewer release MUST have:
- release_id;
- Git commit SHA;
- exact asset list;
- SHA-256 for every executable JS/WASM/CSS asset;
- build timestamp;
- canonical release manifest;
- deployment evidence.

Production files MUST be published under an immutable versioned path, for example:
`/viewer/releases/<release_id>/...`

A stable launcher may select an explicitly approved release but MUST NOT silently switch versions while secrets are live.

### T1-F — Update activation rule

A new Viewer release MUST NOT become active merely because a new GitHub commit exists.

Required release sequence:
1. build;
2. hash;
3. review;
4. record evidence;
5. explicit release approval;
6. publish immutable release;
7. explicitly promote stable pointer.

No auto-deploy-to-Production from arbitrary repository commits.

### T1-G — Browser storage prohibition

The Production key-handling page MUST NOT persist:
- PMV password;
- password-derived keys;
- Production KEK;
- Media DEKs;
- plaintext media;
- Drive access token.

Permitted persistent object:
- ciphertext-only wrapped Production KEK package;
- non-secret release metadata;
- non-secret file identifiers / manifest metadata when required.

Any persistent ciphertext package MUST remain reconstructible without browser-local secrets.

### T1-H — Lock / destruction

On:
- explicit lock;
- pagehide;
- visibility loss beyond policy threshold;
- fatal crypto error;
- idle timeout;
- account/token invalidation;

the Viewer MUST:
- zero reachable key buffers where technically possible;
- revoke object URLs;
- detach media source buffers;
- drop plaintext buffers;
- drop access token;
- require fresh PMV password entry before reopening encrypted content.

Idle timeout remains 300 seconds unless Canonical Change Control changes it.

## 4. GitHub Pages trust-root decision

A remotely hosted PWA cannot prove the integrity of its own first-loaded verifier if both verifier and application arrive from the same compromised origin.

Therefore GitHub Pages + DNS/TLS + repository publishing authority remain part of the Production Trust Root.

This cannot be eliminated by SRI alone when the verifier itself is delivered by that same origin.

T1 can therefore close only if one of these two authority decisions is explicitly accepted:

### Option A — ACCEPT_REMOTE_PWA_TRUST_ROOT_WITH_CONTROLS

Accept:
- GitHub account/repository publishing authority;
- GitHub Pages infrastructure;
- DNS authority for `ishida-cpa.jp`;
- TLS termination / certificate infrastructure;

as Production Viewer code-delivery Trust Roots, with the controls in this document.

### Option B — REJECT_REMOTE_PWA_TRUST_ROOT

If remote origin trust is rejected, the PWA path MUST NOT be promoted to Production and a distribution model with an independent code-signing trust anchor is required.

## 5. Recommended decision

Recommended: Option A — ACCEPT_REMOTE_PWA_TRUST_ROOT_WITH_CONTROLS.

Rationale:
- H1 requires zero additional recurring cost.
- H2 rejects periodic re-signing/reinstallation.
- Native Personal Team failed H2.
- Paid native distribution fails H1.
- P0-P5 established functional feasibility on the actual iPhone path.
- The remaining risk is explicit remote code-delivery trust, which can be materially reduced through self-hosting, CSP, immutable releases, controlled promotion, MFA/passkey, and OAuth isolation.

This is a security trade-off, not a claim that remote PWA delivery is equivalent to native signed-code distribution.

## 6. Acceptance criteria for T1 closure

T1 may be marked CLOSED only after all of the following pass:

1. THIRD_PARTY_CRYPTO_RUNTIME = REMOVED
2. LIBSODIUM_SELF_HOSTED = PASS
3. EXECUTABLE_ASSET_HASH_MANIFEST = PASS
4. PRODUCTION_RELEASE_PATH_IMMUTABLE = PASS
5. CSP_KEY_CONTEXT = PASS
6. GOOGLE_GIS_IN_KEY_CONTEXT = REMOVED
7. OAUTH_KEY_CONTEXT_ISOLATION = PASS
8. ACCESS_TOKEN_MEMORY_ONLY = PASS
9. PMV_PASSWORD_MEMORY_ONLY = PASS
10. KEK_DEK_MEMORY_ONLY = PASS
11. PLAINTEXT_MEDIA_PERSISTENCE = NONE
12. UPDATE_REQUIRES_EXPLICIT_PROMOTION = PASS
13. REPOSITORY_PUBLISHING_AUTHORITY_MFA_PASSKEY = CONFIRMED
14. PRODUCTION_RELEASE_EVIDENCE = RECORDED
15. REMOTE_PWA_TRUST_ROOT = EXPLICITLY_ACCEPTED

## 7. Next implementation-neutral step

Before any Production implementation:
- decide Option A or Option B;
- if Option A, freeze D53 / D54-A / D54-B / D54-C / DA wording;
- produce Canonical Specification Delta;
- obtain explicit acceptance;
- only then create a Production migration plan.

