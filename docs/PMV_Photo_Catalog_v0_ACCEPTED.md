# PMV Photo Catalog v0 — ACCEPTED SPEC

Status: ACCEPTED
Scope: iPhone photo-only Normal Path extension
Production mutation: PROHIBITED until explicit Change Control acceptance

## 1. Purpose

Provide scalable iPhone photo browsing for the canonical 392 Production photos without decrypting all full-resolution photos for list rendering, broadening OAuth beyond drive.file, changing Recovery Authority, or changing the existing one-media/one-DEK cryptographic model.

## 2. Preconditions already satisfied

- Canonical Production photo count = 392.
- Canonical photo Drive target count = 784:
  - 392 protected manifests
  - 392 encrypted photo blobs
- Exact intended OAuth client + drive.file:
  - VISIBLE = 784
  - NOT_VISIBLE = 0
  - ERROR = 0
  - ALL_TARGETS_VISIBLE = YES
- Representative photo decrypt/display on iPhone = PASS.

These facts remove Drive visibility as a blocker for the photo scope.

## 3. Architecture

### 3.1 Catalog object

Create one encrypted catalog describing the canonical photo set.

Logical plaintext schema:

~~~json
{
  "format": "PMV-PHOTO-CATALOG-V0",
  "vault_id": "pmv-v1-production",
  "generation": 1,
  "photo_count": 392,
  "created_at": "...",
  "entries": [
    {
      "ordinal": 0,
      "media_id": "photo-...",
      "manifest_file_id": "...",
      "photo_file_id": "...",
      "thumbnail_file_id": "...",
      "capture_time": null
    }
  ]
}
~~~

Rules:
- photo_count MUST equal the number of entries.
- ordinal MUST be unique and contiguous from 0.
- media_id MUST be unique.
- manifest_file_id, photo_file_id, and thumbnail_file_id MUST be non-empty.
- Catalog ordering is canonical display order for v0.
- capture_time is optional; UNKNOWN must remain null, never inferred.

### 3.2 Catalog cryptography

Catalog plaintext is sensitive metadata and MUST be encrypted at rest.

Candidate construction:
- fresh random Catalog DEK;
- Catalog DEK wrapped by Production KEK using the same accepted wrapped-key primitive family;
- catalog body protected with AEAD;
- AAD binds vault_id, catalog format, and catalog generation.

No plaintext catalog may be persisted to Drive.

### 3.3 Thumbnail objects

Each canonical photo receives one encrypted thumbnail object.

Rules:
- generated once during controlled backfill;
- thumbnail plaintext exists only transiently during generation;
- encrypted before cloud persistence;
- no thumbnail generation on iPhone during browsing;
- no plaintext thumbnail persisted on Drive;
- no plaintext thumbnail retained after backfill.

Recommended v0 target:
- max dimension: 320 px
- preserve aspect ratio
- output format: JPEG for display compatibility
- EXIF/metadata stripped before encryption

Thumbnail keying decision (ACCEPTED):
- reuse the existing photo Media DEK for that photo's thumbnail;
- thumbnail encryption MUST use a fresh independent XChaCha20-Poly1305 nonce;
- thumbnail AAD MUST bind vault_id, media_id, object role "thumbnail", thumbnail format version, and key_generation;
- nonce reuse between photo blob / manifest / thumbnail is prohibited.

Rationale:
- Canonical already defines one random Media DEK per photo/video;
- the thumbnail is a protected representation of the same photo and confidentiality domain;
- reusing the photo Media DEK preserves the existing key hierarchy and avoids introducing a second DEK authority per photo;
- cryptographic separation is provided by independent nonces and role-bound AAD.

### 3.4 Full photo access

Catalog browsing MUST NOT alter the full photo cryptographic path.

On selection:
1. read selected entry;
2. fetch protected manifest by exact fileId;
3. fetch encrypted full photo blob by exact fileId;
4. unwrap selected media DEK;
5. authenticate/decrypt selected photo only;
6. display via transient blob URL;
7. zeroize key/plaintext buffers and revoke blob URL.

No prefetch of full-resolution photo bodies in v0.

## 4. Bootstrap

Catalog fileId bootstrap remains a separate authority problem.

v0 bootstrap (ACCEPTED):
- one small bootstrap descriptor distributed with the PWA release containing:
  - catalog_file_id
  - expected vault_id
  - exact expected catalog_generation

The descriptor MUST NOT contain secrets.

Anti-rollback decision (ACCEPTED):
- every catalog generation is a new immutable Drive object with a new fileId;
- the PWA release bootstrap contains the exact accepted catalog_file_id and exact expected catalog_generation;
- Viewer MUST require equality with the compiled expected generation, not merely >= a floor;
- Viewer MUST fail closed on generation mismatch;
- existing catalog objects are never overwritten in-place.

This makes rollback to an older catalog impossible without also rolling back the deployed PWA release/bootstrap.

## 5. Backfill boundary

Existing 392 canonical photos require a one-time backfill.

Backfill is NOT read-only.

Required Change Control before execution:
- transiently decrypt each source photo;
- generate thumbnail;
- encrypt thumbnail;
- upload encrypted thumbnail;
- create encrypted catalog;
- upload catalog;
- write Evidence.

Original encrypted photo blobs and protected manifests MUST remain byte-for-byte unchanged.

Backfill MUST NOT:
- overwrite original photo blobs;
- overwrite original protected manifests;
- rotate Production KEK;
- replace existing media DEKs;
- alter Recovery material.

## 6. Backfill input authority

The authoritative photo set MUST come from the canonical Windows Production cloud state, not Drive folder enumeration.

Source:
%LOCALAPPDATA%\PMV\production_v1\migration\full_media_cloud_state.jsonl

Selection:
- status = CLOUD_VERIFIED
- kind = PHOTO
- deduplicate by media_id
- exact count MUST be 392

This prevents accidental inclusion of non-canonical test/proof objects.

## 7. Viewer flow

~~~text
PWA start
  -> Authorize Drive (drive.file)
  -> PMV Password
  -> unwrap Production KEK
  -> fetch encrypted Catalog by exact fileId
  -> decrypt Catalog in memory
  -> render photo list using encrypted thumbnails
  -> user selects one photo
  -> fetch selected manifest + selected encrypted photo only
  -> decrypt/display selected photo
~~~

## 8. Acceptance criteria

C1 Catalog plaintext schema validates.
C2 Catalog photo_count = 392.
C3 media_id uniqueness = 392.
C4 manifest_file_id uniqueness = 392.
C5 photo_file_id uniqueness = 392.
C6 thumbnail_file_id uniqueness = 392.
C7 Catalog is encrypted at rest.
C8 All 392 thumbnails are encrypted at rest.
C9 No original photo blob modified.
C10 No original protected manifest modified.
C11 Production KEK unchanged.
C12 Recovery Authority unchanged.
C13 OAuth scope remains exactly drive.file.
C14 Catalog fetched by exact fileId; no Drive-wide listing required for browsing.
C15 List rendering decrypts thumbnails only, not all full photos.
C16 Selecting one photo decrypts only that full photo.
C17 No persistent plaintext photo/thumbnail/catalog storage on iPhone.
C18 Catalog fileId and catalog_generation must exactly match the accepted PWA bootstrap; mismatch is rejected.
C19 Backfill Evidence records counts and hashes.
C20 Post-backfill representative iPhone browse/select/display = PASS.

## 9. Explicitly unresolved before implementation

U1 CLOSED — Thumbnail keying:
- reuse the existing photo Media DEK;
- fresh nonce + role-bound AAD required.

U2 CLOSED — Catalog anti-rollback:
- immutable catalog object per generation;
- exact catalog_file_id + exact generation compiled into the accepted PWA release;
- mismatch fails closed.

U3 CLOSED — Backfill execution host:
- Windows Production host only;
- source is the canonical local Production Vault and canonical cloud-state mapping;
- plaintext thumbnail/photo intermediates are transient only.

U4 CLOSED — Catalog update model:
- rebuild the complete catalog for each accepted change;
- increment generation by exactly 1;
- upload a new encrypted catalog object with a new Drive fileId;
- never overwrite the previous catalog object;
- update the PWA bootstrap only after new catalog integrity validation passes;
- old catalog remains available until post-deployment acceptance passes, then may be retired under Change Control.

## 10. Current state

~~~text
PHOTO_VISIBILITY_AUDIT = CLOSED / PASS
PHOTO_CATALOG_V0_SPEC = ACCEPTED
PHOTO_CATALOG_V0_ACCEPTED = YES
THUMBNAIL_KEYING = EXISTING_MEDIA_DEK + FRESH_NONCE + ROLE_BOUND_AAD
CATALOG_ANTI_ROLLBACK = IMMUTABLE_OBJECT + EXACT_FILE_ID + EXACT_GENERATION
BACKFILL_HOST = WINDOWS_PRODUCTION_HOST
CATALOG_UPDATE_MODEL = REBUILD + GENERATION_INCREMENT + NEW_FILE_ID
BACKFILL = NOT STARTED
PRODUCTION_MUTATION = 0
~~~
