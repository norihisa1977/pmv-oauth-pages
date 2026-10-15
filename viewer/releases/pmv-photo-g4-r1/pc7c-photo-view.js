const MODULE_HASHES = {"session-lifecycle.mjs":"9ff2335cc590c54f74b6579d3d90e4941084f991b1e5360bc1c30ab4c7a7380e","photo-catalog-contract.js":"dc09f913103891a79ad67b3df6130179548472f905908f2a357e1f9e0e866063"};
const OAUTH_HANDOFF_KEY = "pmv_g4_pc7c_photo_handoff";
const photoCatalogScriptUrl = document.currentScript?.src || [...document.scripts].find(s => s.src && new URL(s.src).pathname.endsWith("/pc7c-photo-view.js"))?.src;
if (!photoCatalogScriptUrl) throw new Error("PHOTO_CATALOG_ASSET_SCRIPT_MISSING");
const photoCatalogAssetBase = new URL(".", photoCatalogScriptUrl);
const WRAPPER_NAME =
  "pmv-pwa-wrapped-kek-v1.json";

const CATALOG_RELEASE_DESCRIPTOR_SHA256 = "d403e64781c9a3fe21dec5afeeb3e067519ea9ad749ffba1ac4999734c18eab6";
let catalogRelease = null;
let CATALOG_FILE_ID, CATALOG_EXPECTED_BYTES, CATALOG_EXPECTED_SHA256, EXPECTED_CATALOG_GENERATION, EXPECTED_PHOTO_COUNT;
const CATALOG_FORMAT = "PMV-PHOTO-CATALOG-V1";
const CATALOG_ENVELOPE_FORMAT = "PMV-PHOTO-CATALOG-ENCRYPTED-V1";
const THUMBNAIL_FORMAT = "PMV-PHOTO-THUMBNAIL-V0";

const EXPECTED_VAULT_ID =
  "pmv-v1-production";

const EXPECTED_KEY_GENERATION = 1;

const reportEl =
  document.getElementById("report");

const button =
  document.getElementById("run");

const clearButton =
  document.getElementById("clear");

const passwordEl =
  document.getElementById("password");

const photoEl = document.getElementById("photo");
const photoGridEl = document.getElementById("photoGrid");

let gallerySodium = null;
let galleryToken = null;
let galleryKek = null;
let galleryCatalog = null;
let thumbnailUrls = [];
let galleryEpoch = 0;
let selectionEpoch = 0;
const imageCancellations = new WeakMap();
function cancelImage(img) { imageCancellations.get(img)?.(); }

function displayImage(img, url) {
  cancelImage(img);
  return new Promise((resolve, reject) => {
    const finish = error => { img.onload = img.onerror = null; imageCancellations.delete(img); error ? reject(error) : resolve(); };
    imageCancellations.set(img, () => finish(new Error("IMAGE_DISPLAY_CANCELLED")));
    img.onload = () => finish();
    img.onerror = () => finish(new Error("IMAGE_DISPLAY_FAILED"));
    img.src = url;
  });
}

const lines = [];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let photoUrl = null;

function add(line) {
  lines.push(line);

  reportEl.textContent =
    lines.join("\n");
}

function b64ToBytes(value) {
  return Uint8Array.from(
    atob(value),
    c => c.charCodeAt(0)
  );
}

function hexToBytes(value) {
  if (
    typeof value !== "string" ||
    value.length % 2 !== 0
  ) {
    throw new Error(
      "HEX_FORMAT_INVALID"
    );
  }

  const out =
    new Uint8Array(
      value.length / 2
    );

  for (
    let i = 0;
    i < out.length;
    i++
  ) {
    out[i] =
      Number.parseInt(
        value.slice(
          i * 2,
          i * 2 + 2
        ),
        16
      );
  }

  return out;
}

function bytesToHex(bytes) {
  return Array.from(
    bytes,
    b =>
      b.toString(16).padStart(2, "0")
  ).join("");
}

async function sha256Hex(bytes) {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      bytes
    );

  return bytesToHex(
    new Uint8Array(digest)
  );
}

async function fetchBytes(path) {
  const response =
    await guardedFetch(
      path,
      {
        cache: "no-store",
        credentials: "omit"
      }
    );

  if (!response.ok) {
    throw new Error(
      "FETCH_FAILED:" +
      path +
      ":" +
      response.status
    );
  }

  return new Uint8Array(
    await response.arrayBuffer()
  );
}

async function loadVerifiedSodium() {
  const manifestResponse =
    await guardedFetch(
      "./release-manifest.json",
      {
        cache: "no-store",
        credentials: "omit"
      }
    );

  if (!manifestResponse.ok) {
    throw new Error(
      "RELEASE_MANIFEST_LOAD_FAILED"
    );
  }

  const releaseManifest =
    await manifestResponse.json();

  if (
    releaseManifest.release_id !==
    "pmv-photo-g4-r1"
  ) {
    throw new Error(
      "RELEASE_ID_MISMATCH"
    );
  }

  const wrapperPath =
    "vendor/libsodium-0.8.4/libsodium-wrappers.mjs";

  const sumoPath =
    "vendor/libsodium-0.8.4/libsodium-sumo.mjs";

  const wrapperExpected =
    releaseManifest.assets?.[
      wrapperPath
    ]?.sha256;

  const sumoExpected =
    releaseManifest.assets?.[
      sumoPath
    ]?.sha256;

  if (
    !wrapperExpected ||
    !sumoExpected
  ) {
    throw new Error(
      "RELEASE_MANIFEST_ASSET_MISSING"
    );
  }

  const [
    wrapperBytes,
    sumoBytes
  ] =
    await Promise.all([
      fetchBytes(
        "./" + wrapperPath
      ),
      fetchBytes(
        "./" + sumoPath
      )
    ]);

  const [
    wrapperActual,
    sumoActual
  ] =
    await Promise.all([
      sha256Hex(wrapperBytes),
      sha256Hex(sumoBytes)
    ]);

  if (
    wrapperActual !==
    wrapperExpected
  ) {
    throw new Error(
      "LIBSODIUM_WRAPPER_HASH_MISMATCH"
    );
  }

  if (
    sumoActual !==
    sumoExpected
  ) {
    throw new Error(
      "LIBSODIUM_SUMO_HASH_MISMATCH"
    );
  }

  add(
    "LIBSODIUM_WRAPPER_HASH=PASS"
  );

  add(
    "LIBSODIUM_SUMO_HASH=PASS"
  );

  const sumoText =
    decoder.decode(
      sumoBytes
    );

  const wrapperText =
    decoder.decode(
      wrapperBytes
    );

  const sumoUrl =
    URL.createObjectURL(
      new Blob(
        [sumoText],
        {
          type:
            "text/javascript"
        }
      )
    );

  const originalImport =
    'import e from"./libsodium-sumo.mjs";';

  const rewrittenImport =
    'import e from"' +
    sumoUrl +
    '";';

  const rewrittenWrapper =
    wrapperText.replace(
      originalImport,
      rewrittenImport
    );

  if (
    rewrittenWrapper ===
    wrapperText
  ) {
    URL.revokeObjectURL(
      sumoUrl
    );

    throw new Error(
      "WRAPPER_IMPORT_REWRITE_FAILED"
    );
  }

  const wrapperUrl =
    URL.createObjectURL(
      new Blob(
        [rewrittenWrapper],
        {
          type:
            "text/javascript"
        }
      )
    );

  try {
    const module =
      await import(
        wrapperUrl
      );

    const sodium =
      module.default;

    await sodium.ready;

    if (
      typeof sodium.crypto_pwhash !==
        "function" ||
      typeof sodium
        .crypto_aead_xchacha20poly1305_ietf_decrypt !==
        "function" ||
      typeof sodium.memzero !==
        "function"
    ) {
      throw new Error(
        "REQUIRED_SODIUM_API_MISSING"
      );
    }

    add(
      "VERIFIED_LIBSODIUM_IMPORT=PASS"
    );

    return sodium;
  }
  finally {
    URL.revokeObjectURL(
      wrapperUrl
    );

    URL.revokeObjectURL(
      sumoUrl
    );
  }
}

async function driveDownload(
  accessToken,
  fileId,
  label
) {
  const response =
    await guardedFetch(
      "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(
        fileId
      ) +
      "?alt=media",
      {
        headers: {
          Authorization:
            "Bearer " +
            accessToken
        },
        cache: "no-store",
        credentials: "omit"
      }
    );

  if (!label.startsWith("THUMBNAIL_") || !response.ok) {
    add(
      label +
      "_HTTP=" +
      response.status
    );
  }

  if (!response.ok) {
    throw new Error(
      label +
      "_DOWNLOAD_FAILED"
    );
  }

  return new Uint8Array(
    await response.arrayBuffer()
  );
}

async function downloadWrapper(
  accessToken
) {
  const query =
    encodeURIComponent(
      "name='" +
      WRAPPER_NAME +
      "' and trashed=false"
    );

  const listResponse =
    await guardedFetch(
      "https://www.googleapis.com/drive/v3/files?q=" +
      query +
      "&fields=files(id,name,size)",
      {
        headers: {
          Authorization:
            "Bearer " +
            accessToken
        },
        cache: "no-store",
        credentials: "omit"
      }
    );

  add(
    "DRIVE_WRAPPER_LIST_HTTP=" +
    listResponse.status
  );

  if (!listResponse.ok) {
    throw new Error(
      "DRIVE_WRAPPER_LIST_FAILED"
    );
  }

  const list =
    await listResponse.json();

  if (
    list.files.length !== 1
  ) {
    throw new Error(
      "DRIVE_WRAPPER_LOOKUP_COUNT_NOT_ONE"
    );
  }

  const bytes =
    await driveDownload(
      accessToken,
      list.files[0].id,
      "DRIVE_WRAPPER_DOWNLOAD"
    );

  add(
    "DRIVE_WRAPPER_DOWNLOAD=PASS"
  );

  return JSON.parse(
    decoder.decode(bytes)
  );
}

function validateWrapper(
  wrapper
) {
  const expectedAad =
    "PMV-PWA-WRAPPED-KEK-V1" +
    "|vault_id=" +
    wrapper.vault_id +
    "|key_generation=" +
    wrapper.key_generation;

  const valid =
    wrapper.format_id ===
      "PMV-PWA-WRAPPED-KEK-V1" &&
    wrapper.format_version === 1 &&
    wrapper.vault_id ===
      EXPECTED_VAULT_ID &&
    wrapper.key_generation ===
      EXPECTED_KEY_GENERATION &&
    wrapper.kdf ===
      "Argon2id13" &&
    wrapper.kdf_opslimit === 3 &&
    wrapper.kdf_memlimit_bytes ===
      536870912 &&
    wrapper.kdf_output_bytes ===
      32 &&
    wrapper.aead ===
      "XChaCha20-Poly1305-IETF" &&
    b64ToBytes(
      wrapper.salt_b64
    ).length === 16 &&
    b64ToBytes(
      wrapper.nonce_b64
    ).length === 24 &&
    b64ToBytes(
      wrapper
        .wrapped_kek_ciphertext_b64
    ).length === 48 &&
    wrapper.aad ===
      expectedAad;

  if (!valid) {
    throw new Error(
      "WRAPPER_FORMAT_INVALID"
    );
  }

  add(
    "WRAPPER_FORMAT_VALID=PASS"
  );

  return expectedAad;
}

function validateRecord(record) {
  const valid =
    record.format_version === 1 &&
    record.vault_id ===
      EXPECTED_VAULT_ID &&
    record.media_id ===
      EXPECTED_MEDIA_ID &&
    record.key_generation ===
      EXPECTED_KEY_GENERATION &&
    record.manifest_object_name ===
      EXPECTED_MANIFEST_OBJECT &&
    record.photo_object_name ===
      EXPECTED_PHOTO_OBJECT &&
    typeof record.wrapped_media_dek
      ?.nonce_hex === "string" &&
    record.wrapped_media_dek
      .nonce_hex.length === 48 &&
    typeof record.wrapped_media_dek
      ?.ciphertext_hex === "string" &&
    record.wrapped_media_dek
      .ciphertext_hex.length === 96;

  if (!valid) {
    throw new Error(
      "PRODUCTION_RECORD_INVALID"
    );
  }

  add(
    "PRODUCTION_RECORD_VALID=PASS"
  );
}

function decryptEnvelope(
  sodium,
  key,
  envelope,
  aadText
) {
  if (
    !(envelope instanceof Uint8Array) ||
    envelope.length < 40
  ) {
    throw new Error(
      "AEAD_ENVELOPE_INVALID"
    );
  }

  const nonce =
    envelope.slice(0, 24);

  const ciphertext =
    envelope.slice(24);

  return sodium
    .crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      encoder.encode(
        aadText
      ),
      nonce,
      key
    );
}

function detectMime(bytes) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand =
      String.fromCharCode(
        bytes[8],
        bytes[9],
        bytes[10],
        bytes[11]
      );

    if (
      [
        "heic",
        "heix",
        "hevc",
        "hevx",
        "mif1",
        "msf1"
      ].includes(brand)
    ) {
      return "image/heic";
    }
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(
      bytes[0],
      bytes[1],
      bytes[2],
      bytes[3]
    ) === "RIFF" &&
    String.fromCharCode(
      bytes[8],
      bytes[9],
      bytes[10],
      bytes[11]
    ) === "WEBP"
  ) {
    return "image/webp";
  }

  return "application/octet-stream";
}

function clearPhoto() {
  cancelImage(photoEl);
  if (photoUrl) {
    URL.revokeObjectURL(
      photoUrl
    );

    photoUrl = null;

    add(
      "PHOTO_OBJECT_URL_REVOKED=PASS"
    );
  }

  photoEl.removeAttribute(
    "src"
  );

  photoEl.hidden = true;

  clearButton.disabled = !galleryCatalog;
}

clearButton.onclick =
  clearPhoto;




function galleryDecryptAead(key, nonce, ciphertext, aadText) {
  return gallerySodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null, ciphertext, encoder.encode(aadText), nonce, key
  );
}

function catalogWrapAad() {
  return "pmv:v1:key-wrap\npurpose=photo-catalog-dek\nvault_id=" +
    EXPECTED_VAULT_ID + "\nsubject_id=" + CATALOG_FORMAT +
    ":generation:" + EXPECTED_CATALOG_GENERATION +
    "\nkey_generation=" + EXPECTED_KEY_GENERATION + "\n";
}

function catalogBodyAad() {
  return "pmv:photo-catalog:v1\nvault_id=" + EXPECTED_VAULT_ID +
    "\nformat=" + CATALOG_FORMAT +
    "\ngeneration=" + EXPECTED_CATALOG_GENERATION + "\n";
}

function mediaDekAad(entry) {
  return "pmv:v1:key-wrap\npurpose=media-dek\nvault_id=" +
    EXPECTED_VAULT_ID + "\nsubject_id=" + entry.media_id +
    "\nkey_generation=" + EXPECTED_KEY_GENERATION + "\n";
}

function thumbnailAad(entry) {
  return "pmv:photo-thumbnail:v0\nvault_id=" + EXPECTED_VAULT_ID +
    "\nmedia_id=" + entry.media_id +
    "\nobject_role=thumbnail\nthumbnail_format=" + THUMBNAIL_FORMAT +
    "\nkey_generation=" + EXPECTED_KEY_GENERATION + "\n";
}

function unwrapGalleryMediaDek(entry) {
  const w = entry.wrapped_media_dek;
  if (!w?.nonce_hex || !w?.ciphertext_hex) throw new Error("CATALOG_WRAPPED_MEDIA_DEK_INVALID");
  const dek = galleryDecryptAead(
    galleryKek,
    hexToBytes(w.nonce_hex),
    hexToBytes(w.ciphertext_hex),
    mediaDekAad(entry)
  );
  if (!(dek instanceof Uint8Array) || dek.length !== 32) throw new Error("MEDIA_DEK_LENGTH_INVALID");
  return dek;
}

async function loadPhotoCatalog() {
  if (!/^[a-f0-9]{64}$/.test(CATALOG_RELEASE_DESCRIPTOR_SHA256)) throw new Error("NEW_RELEASE_NOT_CONFIGURED");
  await verifiedModule("photo-catalog-contract.js");
  const response = await guardedFetch(new URL("photo-catalog-release.json", photoCatalogAssetBase).href, { cache: "no-store" });
  if (!response.ok) throw new Error("PHOTO_CATALOG_RELEASE_HTTP=" + response.status);
  const releaseBytes = new Uint8Array(await response.arrayBuffer());
  if (await sha256Hex(releaseBytes) !== CATALOG_RELEASE_DESCRIPTOR_SHA256) throw new Error("PHOTO_CATALOG_RELEASE_HASH_MISMATCH");
  catalogRelease = globalThis.PmvPhotoCatalogContract.validateRelease(JSON.parse(decoder.decode(releaseBytes)));
  CATALOG_FILE_ID = catalogRelease.catalog_file_id;
  CATALOG_EXPECTED_BYTES = catalogRelease.catalog_bytes;
  CATALOG_EXPECTED_SHA256 = catalogRelease.catalog_sha256;
  EXPECTED_CATALOG_GENERATION = catalogRelease.generation;
  EXPECTED_PHOTO_COUNT = catalogRelease.photo_count;
  const bytes = await driveDownload(galleryToken, CATALOG_FILE_ID, "PHOTO_CATALOG_DOWNLOAD");
  if (bytes.length !== CATALOG_EXPECTED_BYTES) throw new Error("PHOTO_CATALOG_SIZE_MISMATCH");
  if (await sha256Hex(bytes) !== CATALOG_EXPECTED_SHA256) throw new Error("PHOTO_CATALOG_SHA256_MISMATCH");
  const p = JSON.parse(decoder.decode(bytes));
  if (
    p.format !== CATALOG_ENVELOPE_FORMAT ||
    p.vault_id !== EXPECTED_VAULT_ID ||
    p.generation !== EXPECTED_CATALOG_GENERATION ||
    p.key_generation !== EXPECTED_KEY_GENERATION ||
    p.cipher_suite !== "XChaCha20-Poly1305-IETF"
  ) throw new Error("PHOTO_CATALOG_ENVELOPE_INVALID");

  let catalogDek = null;
  let plain = null;
  try {
    catalogDek = galleryDecryptAead(
      galleryKek,
      hexToBytes(p.wrapped_catalog_dek.nonce_hex),
      hexToBytes(p.wrapped_catalog_dek.ciphertext_hex),
      catalogWrapAad()
    );
    if (catalogDek.length !== 32) throw new Error("CATALOG_DEK_LENGTH_INVALID");
    plain = galleryDecryptAead(
      catalogDek,
      hexToBytes(p.catalog_nonce_hex),
      hexToBytes(p.catalog_ciphertext_hex),
      catalogBodyAad()
    );
    const c = JSON.parse(decoder.decode(plain));
    await globalThis.PmvPhotoCatalogContract.validateCatalog(c, catalogRelease, sha256Hex);
    return c;
  } finally {
    if (catalogDek instanceof Uint8Array) gallerySodium.memzero(catalogDek);
    if (plain instanceof Uint8Array) gallerySodium.memzero(plain);
  }
}

async function loadThumbnail(entry, img, epoch) {
  let dek = null;
  let plain = null;
  let url = null;
  try {
    dek = unwrapGalleryMediaDek(entry);
    const envelope = await driveDownload(
      galleryToken, entry.thumbnail_file_id, "THUMBNAIL_" + entry.ordinal
    );
    if (epoch !== galleryEpoch) throw new Error("GALLERY_CLEARED");
    plain = decryptEnvelope(gallerySodium, dek, envelope, thumbnailAad(entry));
    if (plain.length < 3 || plain[0] !== 255 || plain[1] !== 216 || plain[2] !== 255) throw new Error("THUMBNAIL_NOT_JPEG");
    url = URL.createObjectURL(new Blob([plain], {type:"image/jpeg"}));
    thumbnailUrls.push(url);
    await displayImage(img, url);
    if (epoch !== galleryEpoch) throw new Error("GALLERY_CLEARED");
    return true;
  } catch (_) {
    if (url) { URL.revokeObjectURL(url); thumbnailUrls = thumbnailUrls.filter(v => v !== url); }
    img.removeAttribute("src");
    img.alt = "Unavailable " + (entry.ordinal + 1);
    return false;
  } finally {
    if (dek instanceof Uint8Array) gallerySodium.memzero(dek);
    if (plain instanceof Uint8Array) gallerySodium.memzero(plain);
  }
}

async function openCatalogPhoto(entry) {
  const epoch = galleryEpoch, selected = ++selectionEpoch;
  clearPhoto();
  let dek = null;
  let manifestPlain = null;
  let photoPlain = null;
  try {
    dek = unwrapGalleryMediaDek(entry);
    const manifestEnvelope = await driveDownload(
      galleryToken, entry.manifest_file_id, "MANIFEST_" + entry.ordinal
    );
    if (epoch !== galleryEpoch || selected !== selectionEpoch) throw new Error("SELECTION_CANCELLED");
    manifestPlain = decryptEnvelope(
      gallerySodium, dek, manifestEnvelope,
      "pmv:v1:manifest\nvault_id=" + EXPECTED_VAULT_ID +
      "\nmedia_id=" + entry.media_id + "\n"
    );
    const manifest = JSON.parse(decoder.decode(manifestPlain));
    if (
      manifest.format_version !== 1 ||
      manifest.cipher_suite !== "XChaCha20-Poly1305-IETF" ||
      manifest.vault_id !== EXPECTED_VAULT_ID ||
      manifest.media_id !== entry.media_id ||
      manifest.photo_object_name !== entry.photo_object_name ||
      !Number.isSafeInteger(manifest.photo_plaintext_length) ||
      manifest.photo_plaintext_length <= 0
    ) throw new Error("PROTECTED_MANIFEST_INVALID");

    const photoEnvelope = await driveDownload(
      galleryToken, entry.photo_file_id, "PHOTO_" + entry.ordinal
    );
    if (epoch !== galleryEpoch || selected !== selectionEpoch) throw new Error("SELECTION_CANCELLED");
    photoPlain = decryptEnvelope(
      gallerySodium, dek, photoEnvelope,
      "pmv:v1:photo\nvault_id=" + EXPECTED_VAULT_ID +
      "\nmedia_id=" + entry.media_id + "\n"
    );
    if (photoPlain.length !== manifest.photo_plaintext_length) {
      throw new Error("PHOTO_PLAINTEXT_LENGTH_MISMATCH");
    }
    session.assert();
    const mime = detectMime(photoPlain);
    photoUrl = URL.createObjectURL(new Blob([photoPlain], {type:mime}));
    await displayImage(photoEl, photoUrl);
    if (epoch !== galleryEpoch || selected !== selectionEpoch) throw new Error("SELECTION_CANCELLED");
    photoEl.hidden = false;
    clearButton.disabled = false;
    add("SELECTED_PHOTO_DISPLAY=PASS;ORDINAL=" + entry.ordinal);
  } catch (e) {
    if (epoch !== galleryEpoch || selected !== selectionEpoch) return;
    clearPhoto();
    add("SELECTED_PHOTO_DISPLAY=FAIL;ORDINAL=" + entry.ordinal);
    add("ERROR=" + String(e?.message || e));
  } finally {
    if (dek instanceof Uint8Array) gallerySodium.memzero(dek);
    if (manifestPlain instanceof Uint8Array) gallerySodium.memzero(manifestPlain);
    if (photoPlain instanceof Uint8Array) gallerySodium.memzero(photoPlain);
  }
}

async function renderGallery() {
  const epoch = galleryEpoch;
  const entries = galleryCatalog.entries;
  photoGridEl.replaceChildren();
  for (const entry of galleryCatalog.entries) {
    const b = document.createElement("button");
    b.type = "button";
    b.disabled = true;
    b.setAttribute("aria-label", "Photo " + (entry.ordinal + 1));
    const img = document.createElement("img");
    img.alt = "Photo " + (entry.ordinal + 1);
    b.appendChild(img);
    b.onclick = () => openCatalogPhoto(entry);
    photoGridEl.appendChild(b);
  }
  photoGridEl.hidden = false;

  const buttons = [...photoGridEl.querySelectorAll("button")];
  let next = 0, done = 0, ok = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (epoch !== galleryEpoch || i >= entries.length) return;
      if (await loadThumbnail(entries[i], buttons[i].firstElementChild, epoch)) ok++;
      if (epoch !== galleryEpoch) return;
      done++;
      if (done % 25 === 0 || done === EXPECTED_PHOTO_COUNT) {
        add("THUMBNAIL_PROGRESS=" + done + "/" + EXPECTED_PHOTO_COUNT);
      }
    }
  }
  await Promise.all(Array.from({length:6}, worker));
  if (epoch !== galleryEpoch) throw new Error("GALLERY_CLEARED");
  add("THUMBNAIL_DECRYPT_COMPLETE=" + ok + "/" + EXPECTED_PHOTO_COUNT);
  if (ok !== EXPECTED_PHOTO_COUNT) throw new Error("THUMBNAIL_SET_INCOMPLETE=" + ok);
  for (const b of buttons) b.disabled = false;
}

function clearGallery() {
  session?.invalidate();
  passwordEl.value = "";
  galleryEpoch++;
  selectionEpoch++;
  for (const img of photoGridEl.querySelectorAll("img")) cancelImage(img);
  clearPhoto();
  for (const url of thumbnailUrls) URL.revokeObjectURL(url);
  thumbnailUrls = [];
  photoGridEl.replaceChildren();
  photoGridEl.hidden = true;
  if (gallerySodium && galleryKek instanceof Uint8Array) gallerySodium.memzero(galleryKek);
  galleryKek = null;
  galleryCatalog = null;
  galleryToken = null;
  clearButton.disabled = true;
}

button.onclick = async () => {
  button.disabled = true;
  let password = passwordEl.value;
  clearGallery();
  lines.length = 0;
  let wrappingKey = null;
  try {
    add("PRODUCTION_MEDIA_ACCESS=READ_ONLY");
    await assertDeliveryContext();
    const handoff = consumeOAuthHandoff();
    await ensureSessionModule();
    session.begin(handoff.expires_at);
    const runEpoch = session.epoch;
    galleryToken = handoff.token;
    handoff.token = null;
    session.assert(runEpoch);
    session.authorized = true;
    add("OAUTH_HANDOFF_RECEIVED=PASS");

    const wrapper = await downloadWrapper(galleryToken);
    session.assert(runEpoch);
    const wrapperAad = validateWrapper(wrapper);
    add("WRAPPER_FORMAT_VALID=PASS");

    // Password captured before clearing the DOM field.
    passwordEl.value = "";
    if (!password) throw new Error("PMV_PASSWORD_EMPTY");

    gallerySodium = await loadVerifiedSodium();
    session.assert(runEpoch);
    add("VERIFIED_LIBSODIUM_IMPORT=PASS");

    wrappingKey = gallerySodium.crypto_pwhash(
      32, password, b64ToBytes(wrapper.salt_b64), 3, 536870912,
      gallerySodium.crypto_pwhash_ALG_ARGON2ID13
    );
    session.assert(runEpoch);
    add("ARGON2ID_DERIVATION=PASS");

    galleryKek = galleryDecryptAead(
      wrappingKey,
      b64ToBytes(wrapper.nonce_b64),
      b64ToBytes(wrapper.wrapped_kek_ciphertext_b64),
      wrapperAad
    );
    if (!(galleryKek instanceof Uint8Array) || galleryKek.length !== 32) {
      throw new Error("PRODUCTION_KEK_LENGTH_INVALID");
    }
    add("PRODUCTION_KEK_UNWRAP=PASS");

    const authenticatedCatalog = await loadPhotoCatalog();
    session.assert(runEpoch);
    galleryCatalog = authenticatedCatalog;
    add("PHOTO_CATALOG_SHA256=PASS");
    add("PHOTO_CATALOG_AUTHENTICATED=PASS");
    add("CATALOG_GENERATION=" + EXPECTED_CATALOG_GENERATION);
    add("CATALOG_ENTRY_COUNT=" + EXPECTED_PHOTO_COUNT);

    await renderGallery();
    session.assert(runEpoch);
    clearButton.disabled = false;
    add("PHOTO_GRID_READY=PASS");
    add("FULL_PHOTO_DOWNLOAD_POLICY=SELECTED_ONLY");
    add("PLAINTEXT_PERSISTED=NO");
    add("PC7C_MULTI_PHOTO_RESULT=PASS");
  } catch (e) {
    add("PC7C_MULTI_PHOTO_RESULT=FAIL");
    add("ERROR=" + String(e?.message || e));
    clearGallery();
  } finally {
    if (wrappingKey instanceof Uint8Array && gallerySodium) gallerySodium.memzero(wrappingKey);
    password = null;
    button.disabled = false;
  }
};

photoEl.onclick = () => {
  if (!photoEl.hidden) clearPhoto();
};

clearButton.onclick = expireSession;
window.addEventListener("pagehide", expireSession);
window.addEventListener("pageshow", () => { if (session && !session.active) expireSession(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) expireSession(); });
for (const event of ["pointerdown", "keydown", "touchstart"]) document.addEventListener(event, () => session?.touch(), {passive:true});

let session = null;
const pendingRequests = new Set();
async function assertDeliveryContext() {
  if (!globalThis.isSecureContext || window.top !== window.self) throw new Error("DELIVERY_CONTEXT_DENIED");
  if (navigator.serviceWorker?.controller) throw new Error("SERVICE_WORKER_CONTROLLED_CONTEXT_DENIED");
  if (navigator.serviceWorker) {
    let timer;
    try {
      const registrations = await Promise.race([navigator.serviceWorker.getRegistrations(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("SERVICE_WORKER_AUDIT_TIMEOUT")),5000);})]);
      if (registrations.some(r=>location.href.startsWith(r.scope))) throw new Error("SERVICE_WORKER_SCOPE_DENIED");
    } finally { clearTimeout(timer); }
  }
}
async function verifiedModule(name) {
  const bytes = new Uint8Array(await (await guardedFetch(new URL(name, photoCatalogAssetBase), {cache:"no-store",credentials:"omit"})).arrayBuffer());
  if (await sha256Hex(bytes) !== MODULE_HASHES[name]) throw new Error("DEPENDENCY_HASH_MISMATCH");
  const url = URL.createObjectURL(new Blob([bytes], {type:"text/javascript"}));
  try { return await import(url); } finally { URL.revokeObjectURL(url); }
}
async function ensureSessionModule() {
  if (!session) {
    const mod = await verifiedModule("session-lifecycle.mjs");
    session = new mod.SessionLifecycle({expire:expireSession, visible:()=>!document.hidden});
  }
}
function expireSession() {
  const hadActiveSession = Boolean(session?.active || galleryToken || galleryKek);
  for (const request of pendingRequests) request.abort();
  pendingRequests.clear();
  clearGallery();
  if (hadActiveSession) add("SESSION_EXPIRED_REAUTH_REQUIRED");
}
async function guardedFetch(url, init = {}) {
  if ((init.method || "GET") !== "GET") throw new Error("READ_ONLY_REQUEST_REQUIRED");
  const isDrive = new URL(url, location.href).origin === "https://www.googleapis.com";
  if (isDrive) { session?.assert(); if (!session?.authorized) throw new Error("OAUTH_SESSION_REQUIRED"); }
  const controller = new AbortController(); pendingRequests.add(controller);
  const timer = setTimeout(()=>controller.abort(),45000);
  try {
    const response = await fetch(url, {...init, signal:controller.signal, cache:"no-store",credentials:"omit",referrerPolicy:"no-referrer"});
    const bytes = await response.arrayBuffer();
    if (controller.signal.aborted) throw new Error("REQUEST_ABORTED");
    if (isDrive) session.assert();
    return {ok:response.ok,status:response.status,arrayBuffer:async()=>bytes,json:async()=>JSON.parse(new TextDecoder().decode(bytes))};
  } finally { clearTimeout(timer); pendingRequests.delete(controller); }
}
function consumeOAuthHandoff() {
  const raw=sessionStorage.getItem(OAUTH_HANDOFF_KEY);
  sessionStorage.removeItem(OAUTH_HANDOFF_KEY);
  if(!raw)throw Error("OAUTH_HANDOFF_MISSING");
  let data;
  try{data=JSON.parse(raw);}catch{throw Error("OAUTH_HANDOFF_INVALID");}
  const now=Date.now();
  if(data?.v!==1||data.scope!=="https://www.googleapis.com/auth/drive.file"||typeof data.token!=="string"||!data.token||!Number.isFinite(data.created_at)||data.created_at>now+5000||!Number.isFinite(data.expires_at)||data.expires_at<=now+5000||data.expires_at>data.created_at+3600000)throw Error("OAUTH_HANDOFF_INVALID");
  return data;
}
