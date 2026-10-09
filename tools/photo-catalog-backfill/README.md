# PMV Photo Catalog Backfill

Current state: DRY-RUN ONLY.

`Prepare-PmvPhotoCatalogBackfill.ps1` is a fail-closed Production inventory validator for the accepted Photo Catalog v0 design.

It does not decrypt photo bodies, generate thumbnails, upload files, or mutate Production. The script refuses to run unless `-DryRun` is explicitly supplied.

Dry-run checks:
- Production vault id = `pmv-v1-production`
- key generation = 1
- canonical cloud-state source exists
- exactly 392 deduplicated `CLOUD_VERIFIED / PHOTO` records
- manifest and photo Drive file IDs are present and unique
- local production record exists for every media_id
- record vault/media/key generation match
- wrapped media DEK exists
- referenced local manifest and encrypted photo blob exist
- local encrypted object sizes equal the canonical cloud-state sizes
- SHA-256 inventory is written to TEMP only

No generated evidence or Production fileId inventory should be committed to GitHub.

## Run on the Windows Production host

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\photo-catalog-backfill\Prepare-PmvPhotoCatalogBackfill.ps1 -DryRun
~~~

Expected terminal markers include:

~~~text
PHOTO_CATALOG_BACKFILL_DRYRUN=PASS
PHOTO_COUNT=392
UNIQUE_MANIFEST_FILE_ID_COUNT=392
UNIQUE_PHOTO_FILE_ID_COUNT=392
MEDIA_BODY_DECRYPTED=NO
THUMBNAIL_GENERATED=NO
CLOUD_UPLOAD_PERFORMED=NO
PRODUCTION_MUTATION=NO
~~~

The mutating backfill implementation is intentionally not enabled until this dry-run passes on the actual Production host.
