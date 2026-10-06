# PMV iPhone PWA T1 Production Trust Design

STATUS = NON-NORMATIVE DESIGN PROPOSAL
DATE = 2026-10-06
PRODUCTION_CHANGE = NONE
CANONICAL_CHANGE = NONE

## 1. Problem statement

A PWA that receives the PMV Normal Access Password or handles unwrapped Production KEK / Media DEK necessarily trusts the executable code delivered to the browser.

Therefore:
T1_REMOTE_CODE_DELIVERY_TRUST_ROOT = REAL

A pure remotely hosted PWA cannot cryptographically eliminate trust in its own initial code delivery by using verifier code delivered by that same origin.

## 2. PoC T1 status

POC_T1 = NOT_ACCEPTABLE_FOR_PRODUCTION_AS_IS

Reasons:
- PoC crypto pages import libsodium from jsDelivr.
- OAuth pages load Google Identity Services JavaScript.
- GitHub Pages / DNS / TLS / repository publishing authority are mutable remote delivery dependencies.

## 3. Production architecture proposal

### 3.1 Split security contexts

Production must use two separate browser security contexts:

A. PMV Viewer Origin/Context
- handles PMV password
- runs Argon2id
- unwraps Production KEK
- decrypts Media DEKs/media
- MUST load no third-party runtime JavaScript
- MUST not embed Google Identity Services
- MUST not embed analytics, ads, tag managers, fonts, or third-party frames

B. OAuth Broker Context
- performs Google Identity Services Token Model
- never receives PMV password
- never receives Production KEK
- never receives Media DEKs
- obtains short-lived drive.file access token
- returns only the access token and expiry metadata to the Viewer using an explicit narrow postMessage contract
- validates exact origin on both sender and receiver

The OAuth context must be incapable by design of reading Viewer key material.

### 3.2 Cryptographic runtime

Production Viewer:
- vendor exact libsodium JS/WASM artifacts into the PMV repository
- no jsDelivr/unpkg/npm CDN at runtime
- release-pinned content hashes for every executable asset
- no dynamic eval / Function constructor
- no remote module imports
- no inline executable code unless covered by a fixed CSP hash

### 3.3 Content Security Policy

Viewer CSP target:
- default-src 'none'
- script-src only self-hosted pinned assets
- connect-src only the exact PMV-required Google Drive/API endpoints
- img-src only self/blob as required for decrypted in-memory image display
- media-src only blob as required by the selected video path
- object-src 'none'
- frame-src 'none'
- base-uri 'none'
- form-action 'none'
- frame-ancestors 'none'

No Google GIS script is permitted in the key-handling Viewer context.

### 3.4 Release immutability

Each Production Viewer release must have:
- immutable release version
- Git commit SHA
- manifest of executable asset SHA-256 values
- evidence record containing those hashes
- explicit promotion from candidate to Production

The currently trusted release must not silently switch while a session is unlocked.

### 3.5 Update model

Update policy:
- check for updates only while LOCKED
- download/cache candidate assets only while LOCKED
- verify release manifest/assets before activation
- activation requires a fresh Viewer load
- never hot-swap executable code during an unlocked session
- integrity mismatch = FAIL CLOSED

### 3.6 Browser persistence rules

Persistent browser storage may contain only:
- ciphertext-only wrapped Production KEK package, if this storage location is approved
- immutable application assets
- non-secret version/integrity metadata

Persistent browser storage MUST NOT contain:
- PMV password
- password-derived wrapping key
- plaintext Production KEK
- plaintext Media DEK
- plaintext media
- Google access token
- Google refresh token

### 3.7 Publishing authority

Minimum controls:
- GitHub account protected by MFA/passkey
- repository write access limited to the user/required maintainer only
- branch protection / review where operationally practical
- no secrets committed to repository
- production deploy must reference an explicit commit SHA
- DNS registrar and GitHub account are recognized Trust Root components

## 4. Residual risk

Even after the controls above:
- compromise of the trusted publishing path before a fresh load can deliver malicious Viewer code
- compromise of the browser/OS can expose runtime secrets
- GitHub Pages/TLS/DNS remain part of the code-delivery trust boundary

These risks cannot be reduced to the same model as an independently code-signed native binary without introducing a separate signing/distribution trust anchor.

## 5. T1 closure choices

CHOICE A — ACCEPT_REMOTE_PWA_TRUST_ROOT_WITH_CONTROLS
- compatible with H1 and H2
- permits Production PWA after Canonical Delta + implementation evidence
- accepts GitHub/DNS/TLS/publishing authority as explicit Trust Roots

CHOICE B — REJECT_REMOTE_PWA_TRUST_ROOT
- PWA cannot be promoted to Production
- with current H1/H2 constraints, no currently validated iPhone Production path remains

## 6. Recommended disposition

RECOMMENDATION = CHOICE A

Reason:
The PWA PoC satisfies H1-H5, while native signing paths conflict with H1/H2. The remaining risk is not hidden; it is an explicit remote-code delivery Trust Root that can be materially reduced through isolation, self-hosted cryptographic runtime, CSP, immutable releases, locked-state-only updates, and strict publishing controls.

This recommendation does NOT itself authorize Production.
