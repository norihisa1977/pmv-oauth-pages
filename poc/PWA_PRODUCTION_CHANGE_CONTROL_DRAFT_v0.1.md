# PMV v1 — iPhone PWA Production Change Control Draft v0.1

Status: DRAFT / NOT YET ACCEPTED
Date: 2026-10-06
Canonical delta: ACCEPTED
Production implementation: NOT STARTED
Production data access: PROHIBITED until execution authorization

## 1. Objective

Promote the accepted iPhone PWA design into a Production Normal Access path without changing:
- existing Windows Normal Access;
- existing Production encrypted media;
- existing Recovery Authority;
- canonical vault/media encryption format.

## 2. Production invariants

MUST:
- recurring cost remain 0;
- no periodic re-sign/reinstall;
- no plaintext migration;
- no persistent plaintext media;
- no persistent PMV Password;
- no persistent password-derived key;
- no persistent Production KEK;
- no persistent Media DEK;
- no browser-persisted Drive access token;
- Recovery Authority remain unchanged;
- rollback leave existing Windows Production fully operational.

## 3. Proposed implementation stages

### PC-1 — Production release isolation
- create immutable versioned Production viewer path;
- separate /poc from /viewer/releases/<release_id>/;
- disable arbitrary auto-promotion;
- define stable launcher/promoted-release pointer.

Acceptance:
PRODUCTION_RELEASE_PATH_IMMUTABLE=PASS
POC_PRODUCTION_SEPARATION=PASS
EXPLICIT_PROMOTION_REQUIRED=PASS

### PC-2 — Self-host crypto runtime
- vendor exact libsodium JS/WASM;
- remove jsDelivr/runtime CDN crypto;
- record SHA-256 for executable assets.

Acceptance:
THIRD_PARTY_CRYPTO_RUNTIME=REMOVED
LIBSODIUM_SELF_HOSTED=PASS
EXECUTABLE_ASSET_HASH_MANIFEST=PASS

### PC-3 — CSP and T1 hardening
- strict CSP for key-handling page;
- no analytics/tag managers;
- no third-party script in key context;
- fail closed on unexpected release/assets.

Acceptance:
CSP_KEY_CONTEXT=PASS
THIRD_PARTY_SCRIPT_IN_KEY_CONTEXT=NONE
RELEASE_INTEGRITY_FAIL_CLOSED=PASS

### PC-4 — OAuth/key-context isolation
- dedicated OAuth bootstrap page;
- obtain short-lived drive.file token;
- destroy/close OAuth execution context before PMV Password entry;
- key-handling page contains no Google GIS executable script;
- one-time same-origin token handoff only.

Acceptance:
GOOGLE_GIS_IN_KEY_CONTEXT=REMOVED
OAUTH_KEY_CONTEXT_ISOLATION=PASS
ACCESS_TOKEN_MEMORY_ONLY=PASS

### PC-5 — Production Normal Access wrapper format
Define ciphertext-only package bound to:
- format_version
- vault_id
- key_generation
- KDF algorithm/parameters
- salt
- AEAD
- nonce
- AAD/context version
- wrapped Production KEK ciphertext

Acceptance before any Production wrapper is created:
WRAPPER_FORMAT_FIXED=PASS
AAD_BINDING_FIXED=PASS
KEY_GENERATION_BINDING_FIXED=PASS
RECOVERY_AUTHORITY_INDEPENDENCE=PASS

### PC-6 — Production wrapper creation
Only after explicit execution authorization:
- derive Normal Access Wrapping Key from PMV password with Canonical Argon2id13 parameters;
- unwrap existing Production KEK through approved authority;
- create PWA ciphertext-only wrapped Production KEK package;
- verify same Production KEK without changing it;
- store wrapper in approved ciphertext-only location.

Acceptance:
PRODUCTION_KEK_IDENTITY_MATCH=PASS
PWA_WRAPPER_CREATED=PASS
PLAINTEXT_KEK_PERSISTED=NO
RECOVERY_AUTHORITY_CHANGED=NO

### PC-7 — Production read-only media path
- retrieve encrypted manifest/blob from Drive;
- photo decrypt/display memory-only;
- video independent AEAD decrypt + Managed Media Source;
- no write/update/delete of Production media.

Acceptance:
PRODUCTION_PHOTO_VIEW=PASS
PRODUCTION_VIDEO_VIEW=PASS
PRODUCTION_MEDIA_WRITE_COUNT=0
PLAINTEXT_PERSISTENCE=NONE

### PC-8 — Lock / lifecycle
- 300s idle timeout;
- explicit lock;
- pagehide/fatal error cleanup;
- access token drop;
- require fresh PMV password after lock.

Acceptance:
PWA_IDLE_TIMEOUT_SECONDS=300
PWA_IDLE_TIMEOUT=PASS
KEY_BUFFER_RELEASE=PASS
TOKEN_RELEASE=PASS
REUNLOCK_REQUIRED=PASS

### PC-9 — Loss / reconstruction drill
- remove PWA/browser state;
- reinstall/reopen approved release;
- Google reauth;
- retrieve ciphertext wrapper;
- PMV password unwrap;
- verify same Production KEK;
- confirm Recovery Authority untouched.

Acceptance:
PWA_LOSS_RECONSTRUCTION=PASS
PRODUCTION_KEK_IDENTITY_MATCH=PASS
BROWSER_LOCAL_SOLE_RECOVERY_SECRET=false
RECOVERY_AUTHORITY_CHANGED=NO

### PC-10 — Final Production acceptance
Require all PC-1..PC-9 PASS and release evidence record.

Final acceptance:
PWA_NORMAL_ACCESS_PRODUCTION=PASS
WINDOWS_REGRESSION=PASS
RECOVERY_REGRESSION=PASS
T1=CLOSED
PRODUCTION_CHANGE_CONTROL=CLOSED

## 4. Rollback

Rollback MUST require only:
- deactivate PWA stable release pointer / remove PWA Production exposure;
- leave Windows Production unchanged;
- leave encrypted media unchanged;
- leave Recovery Authority unchanged;
- optionally retain or delete ciphertext-only PWA wrapper after review.

Rollback MUST NOT require media re-encryption or KEK rotation solely because the PWA path is disabled.

## 5. Current state

PC-1 = NOT_STARTED
PC-2 = NOT_STARTED
PC-3 = NOT_STARTED
PC-4 = NOT_STARTED
PC-5 = NOT_STARTED
PC-6 = BLOCKED_PENDING_EXECUTION_AUTHORIZATION
PC-7 = BLOCKED_PENDING_PC-6
PC-8 = NOT_STARTED
PC-9 = BLOCKED_PENDING_PC-6
PC-10 = BLOCKED

PRODUCTION_IMPLEMENTATION = NOT_STARTED
