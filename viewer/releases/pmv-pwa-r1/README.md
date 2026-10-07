# PMV iPhone Photo Viewer

release_id: pmv-pwa-r1
state: PRODUCTION_PHOTO_ONLY
platform: iPhone / Safari / Home Screen Web App
operational_cost: 0 JPY
apple_developer_program: NOT_REQUIRED
seven_day_signing_expiry: NONE

## Production path

1. Open the release entry point.
2. Start `pc7c-photo-oauth.html`.
3. Authorize Google Drive with `drive.file`.
4. OAuth access token is handed off through sessionStorage and removed after read.
5. Enter the PMV Password only in `pc7c-photo-view.html`.
6. Download the existing encrypted Production wrapper, record, manifest and photo.
7. Derive the wrapping key with Argon2id.
8. Unwrap Production KEK and Media DEK.
9. Authenticate and decrypt the photo in memory.
10. Display through a transient blob URL.
11. Revoke the blob URL on Clear/pagehide and zeroize key/plaintext buffers where exposed to JavaScript.

## Scope

iPhone Normal Path is PHOTO ONLY.
PC-7C video playback is retired and not part of this release.
No plaintext Production photo is intentionally written to persistent storage.
Production encrypted media and Recovery Authority are not modified by this release.
