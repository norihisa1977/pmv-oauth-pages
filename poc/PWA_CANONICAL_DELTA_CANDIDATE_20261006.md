# PMV v1 — iPhone PWA Canonical Specification Delta Candidate

Status: NON-NORMATIVE CANDIDATE
Date: 2026-10-06
Production change: NONE
Canonical change: NONE
Production media access: NONE

Purpose: define the exact candidate wording required to add an iPhone PWA Normal Access path after P0-P5 feasibility PASS and selection of the remote-PWA trust model for drafting. This file does NOT amend the Canonical Specification and does NOT authorize Production implementation.

---

## Decision context

Feasibility:
- P0 Browser Capability = PASS
- P1 Argon2id13 512 MiB = PASS
- P2 Synthetic Photo Crypto = PASS
- P3 Synthetic Video / Managed Media Source = PASS
- P4 Browser OAuth / Drive token model = PASS
- P5 Loss / Recovery = PASS

Classification:
- PWA_FEASIBILITY = FEASIBLE_WITH_DELTA

Trust direction selected for this candidate:
- T1_OPTION = ACCEPT_REMOTE_PWA_TRUST_ROOT_WITH_CONTROLS

This remains a candidate until explicit Canonical acceptance.

---

# D53 — §5.3 Viewer Core Delta

## Candidate replacement / addition

### iPhone PWA Viewer

In addition to the existing native Viewer implementations, PMV v1 MAY provide an iPhone PWA Viewer as a Normal Access client.

The iPhone PWA Viewer MUST:

1. implement the same PMV vault cryptographic formats as the Canonical Vault format;
2. use Argon2id13 with the Canonical Normal Access KDF parameters;
3. use XChaCha20-Poly1305-IETF for Production KEK wrapping/unwrapping;
4. decrypt photo plaintext only in volatile memory;
5. decrypt video as independent authenticated segments/parts and provide them to the browser media pipeline without persistent plaintext storage;
6. never persist PMV Password, password-derived keys, Production KEK, Media DEKs, or plaintext media;
7. require a secure HTTPS context;
8. fail closed on authentication failure, AEAD failure, manifest mismatch, unsupported format, or release-integrity failure;
9. enforce the Canonical idle timeout of 300 seconds unless changed by separate Change Control;
10. destroy reachable plaintext/key buffers, revoke object URLs, detach media buffers, and drop access tokens on explicit lock, timeout, fatal error, or page lifecycle termination where technically possible.

For the iPhone PWA path, use of native Swift UI + Rust static library is NOT REQUIRED. The PWA path is an explicitly approved alternative Viewer implementation and does not modify the Windows Viewer authority.

---

# D54-A — §5.4 Credential / Key Storage Delta

## Candidate addition

### iPhone PWA Normal Access Key Protection

The iPhone PWA MUST NOT persist:
- PMV Normal Access Password;
- Normal Access Wrapping Key;
- Production KEK;
- Media DEK;
- plaintext media;
- Google Drive access token.

The iPhone PWA MAY persist or remotely retrieve a ciphertext-only Normal Access wrapper package for the Production KEK.

The wrapper package MUST contain authenticated immutable metadata sufficient to reconstruct the unwrap operation, including at minimum:
- format/version;
- vault_id;
- key_generation;
- KDF algorithm;
- KDF parameters;
- salt;
- AEAD algorithm;
- nonce;
- AAD/versioned context;
- wrapped Production KEK ciphertext.

The wrapper package MUST NOT:
- contain the PMV Password;
- contain the password-derived key;
- contain plaintext Production KEK;
- become Recovery Authority;
- depend on a browser-local secret as its sole protection.

Required unwrap path:

PMV Normal Access Password
  -> Argon2id13
  -> Normal Access Wrapping Key
  -> XChaCha20-Poly1305-IETF unwrap
  -> Production KEK

Loss of the iPhone, PWA installation, browser storage, Cache Storage, IndexedDB, localStorage, sessionStorage, or Service Worker state MUST NOT invalidate the existing Recovery Authority.

The iPhone PWA Normal Access wrapper is a platform-specific Normal Access representation analogous in purpose, but not storage mechanism, to the Windows Normal Access wrapper.

---

# D54-B — §5.4 OAuth Token Model Delta

## Candidate replacement for iPhone PWA path only

For the iPhone PWA Viewer, Google Drive authorization MUST use the Google browser OAuth token model with:

- scope = `https://www.googleapis.com/auth/drive.file`;
- short-lived access token only;
- access token held in volatile memory only;
- no client secret in browser code;
- no browser-persisted refresh token;
- no refresh token dependency for Normal Access;
- explicit user gesture required to acquire or renew an expired access token.

The iPhone PWA MUST NOT store Drive access tokens in:
- localStorage;
- sessionStorage;
- IndexedDB;
- Cache Storage;
- OPFS;
- cookies;
- application files.

An expired or missing access token MUST NOT silently broaden authentication authority. The Viewer MUST require a new explicit browser authorization gesture before further Drive access.

This delta applies only to the iPhone PWA path. Existing Windows OAuth behavior is unchanged.

---

# D54-C — §5.4 DPoP Disposition Delta

## Candidate disposition

For the iPhone PWA path:

- DPoP-bound refresh-token protection is NOT_APPLICABLE because the approved browser token model does not use or persist a refresh token.
- The P0-P5 PoC did NOT establish DPoP-bound browser access tokens.
- PMV v1 SHALL NOT claim browser DPoP protection unless separately implemented and evidenced.
- Absence of browser access-token DPoP is accepted only together with:
  - memory-only access token handling;
  - narrow `drive.file` scope;
  - explicit user-gesture renewal;
  - no refresh token;
  - T1 isolation controls.

Existing Canonical DPoP guidance for non-browser paths remains unchanged.

---

# DA — Authority / Recovery Model Delta

## Candidate addition

### iPhone PWA Normal Access Authority

The iPhone PWA Normal Access path requires all applicable authorities to be valid before Production media plaintext may be produced:

1. Viewer release integrity = VALID;
2. Google Drive authorization = VALID;
3. PMV Normal Access Password unwrap = VALID;
4. Vault metadata / key_generation binding = VALID;
5. media AEAD authentication = VALID.

Google authorization alone MUST NOT grant decrypt authority.

Possession of the ciphertext-only wrapped Production KEK package alone MUST NOT grant decrypt authority.

Browser-local state MUST NOT be Recovery Authority.

### Reconstruction after device/browser loss

After iPhone loss, PWA removal, or browser-state loss, the Normal Access path MAY be reconstructed using:

- an approved PMV Viewer release;
- Google reauthorization;
- the ciphertext-only wrapped Production KEK package;
- the remembered PMV Normal Access Password.

If the PMV Normal Access Password is forgotten, reconstruction MUST fall back to the existing Recovery Authority. The PWA path MUST NOT modify, replace, weaken, or become a prerequisite for Recovery Authority.

Recovery Authority remains continuously valid and independent of PWA state.

---

# T1 — Remote PWA Code-Delivery Trust Root

## Candidate Canonical addition

The iPhone PWA introduces a remote code-delivery Trust Root.

The following are explicit Production Trust Roots for the PWA path:
- GitHub repository publishing authority for the approved Viewer release;
- GitHub Pages delivery infrastructure;
- DNS authority for the PMV domain;
- TLS/certificate infrastructure serving the PMV origin.

Production acceptance of the PWA path requires explicit acceptance of these Trust Roots with the following mandatory controls:

1. no third-party cryptographic runtime in the key-handling context;
2. libsodium JS/WASM self-hosted and pinned to an exact approved release;
3. SHA-256 manifest for every executable Production asset;
4. immutable versioned Production release path;
5. restrictive Content Security Policy;
6. no Google GIS or other third-party executable script in the PMV password / KEK / DEK handling document;
7. OAuth execution isolated from key-handling execution;
8. arbitrary repository commits MUST NOT automatically become active Production Viewer releases;
9. Production release activation requires explicit promotion after evidence review;
10. repository publishing authority MUST use strong MFA/passkey protection and least privilege;
11. release-integrity failure MUST fail closed.

A PWA release delivered from an unapproved or unhashed asset set MUST NOT handle PMV Password or Production key material.

---

# §5.5 Cloud Access / Client Identity addition

The iPhone PWA MAY use a platform-specific Web OAuth Client ID within the same Google Cloud Project / application family as the existing PMV OAuth clients.

The Web OAuth client:
- MUST use the approved PMV HTTPS origin;
- MUST use `drive.file`;
- MUST NOT embed a client secret;
- MUST NOT broaden Drive scope;
- MUST NOT alter the Windows OAuth client or Windows refresh-token authority.

Cross-platform access to the same PMV Drive-hosted ciphertext objects is permitted only where object/file authority is already granted by the approved `drive.file` model.

---

# Production acceptance criteria

No Production implementation may begin until the following are explicitly accepted:

- D53 = ACCEPTED
- D54-A = ACCEPTED
- D54-B = ACCEPTED
- D54-C = ACCEPTED
- DA = ACCEPTED
- T1_REMOTE_PWA_TRUST_ROOT = ACCEPTED

After acceptance, implementation MUST proceed under a separate Production Change Control with:
- no plaintext migration;
- no replacement of existing Recovery Authority;
- rollback path;
- release integrity evidence;
- Production wrapper creation evidence;
- photo regression;
- video regression;
- idle-timeout regression;
- loss/reconstruction drill;
- no browser-persisted secret regression.

---

# Current authority

CANONICAL_SPECIFICATION = UNCHANGED
WINDOWS_PRODUCTION = UNCHANGED
RECOVERY_AUTHORITY = UNCHANGED
PWA_PRODUCTION_IMPLEMENTATION = NOT_AUTHORIZED
