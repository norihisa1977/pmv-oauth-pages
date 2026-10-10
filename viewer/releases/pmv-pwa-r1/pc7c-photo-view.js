const WRAPPER_NAME =
  "pmv-pwa-wrapped-kek-v1.json";

const CATALOG_FILE_ID = "1_D0cwTQu6zmqQnL2MVUTjo2NtmD-I2Ol";
const CATALOG_EXPECTED_BYTES = 453029;
const CATALOG_EXPECTED_SHA256 = "819216c9de8d94662346ad9ac2bd32a82d634b5a3ebbe17c387a3e71d362ab1e";
const EXPECTED_CATALOG_GENERATION = 2;
const EXPECTED_PHOTO_COUNT = 392;
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
    await fetch(
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
    await fetch(
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
    "pmv-pwa-r1"
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

function consumeOAuthHandoff() {
  const raw =
    sessionStorage.getItem(
      "pmv_r1_pc7c_photo_handoff"
    );

  if (!raw) {
    throw new Error(
      "OAUTH_HANDOFF_MISSING"
    );
  }

  const handoff =
    JSON.parse(raw);

  sessionStorage.removeItem(
    "pmv_r1_pc7c_photo_handoff"
  );

  if (!handoff.token) {
    throw new Error(
      "ACCESS_TOKEN_MISSING"
    );
  }

  add(
    "OAUTH_HANDOFF_RECEIVED=PASS"
  );

  add(
    "OAUTH_HANDOFF_DESTROYED_AFTER_READ=" +
    (
      sessionStorage.getItem(
        "pmv_r1_pc7c_photo_handoff"
      ) === null
    )
  );

  add(
    "GOOGLE_GIS_PRESENT=" +
    Boolean(
      window.google?.accounts?.oauth2
    )
  );

  return handoff.token;
}

async function driveDownload(
  accessToken,
  fileId,
  label
) {
  const response =
    await fetch(
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
    await fetch(
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

  clearButton.disabled =
    true;
}

clearButton.onclick =
  clearPhoto;

window.addEventListener(
  "pagehide",
  clearPhoto,
  {
    once: true
  }
);


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

async function loadG2Catalog() {
  const bytes = await driveDownload(galleryToken, CATALOG_FILE_ID, "G2_CATALOG_DOWNLOAD");
  if (bytes.length !== CATALOG_EXPECTED_BYTES) throw new Error("G2_CATALOG_SIZE_MISMATCH");
  if (await sha256Hex(bytes) !== CATALOG_EXPECTED_SHA256) throw new Error("G2_CATALOG_SHA256_MISMATCH");
  const p = JSON.parse(decoder.decode(bytes));
  if (
    p.format !== CATALOG_ENVELOPE_FORMAT ||
    p.vault_id !== EXPECTED_VAULT_ID ||
    p.generation !== EXPECTED_CATALOG_GENERATION ||
    p.key_generation !== EXPECTED_KEY_GENERATION ||
    p.cipher_suite !== "XChaCha20-Poly1305-IETF"
  ) throw new Error("G2_CATALOG_ENVELOPE_INVALID");

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
    if (
      c.format !== CATALOG_FORMAT ||
      c.vault_id !== EXPECTED_VAULT_ID ||
      c.generation !== EXPECTED_CATALOG_GENERATION ||
      c.source_generation !== 1 ||
      c.photo_count !== EXPECTED_PHOTO_COUNT ||
      !Array.isArray(c.entries) ||
      c.entries.length !== EXPECTED_PHOTO_COUNT
    ) throw new Error("G2_CATALOG_PLAINTEXT_INVALID");
    const seen = new Set();
    c.entries.forEach((e,i) => {
      if (
        e.ordinal !== i || !e.media_id || !e.manifest_file_id || !e.photo_file_id ||
        !e.thumbnail_file_id || !e.manifest_object_name || !e.photo_object_name ||
        !e.wrapped_media_dek || seen.has(e.media_id)
      ) throw new Error("G2_CATALOG_ENTRY_INVALID=" + i);
      seen.add(e.media_id);
    });
    return c;
  } finally {
    if (catalogDek instanceof Uint8Array) gallerySodium.memzero(catalogDek);
    if (plain instanceof Uint8Array) gallerySodium.memzero(plain);
  }
}

async function loadThumbnail(entry, img) {
  let dek = null;
  let plain = null;
  try {
    dek = unwrapGalleryMediaDek(entry);
    const envelope = await driveDownload(
      galleryToken, entry.thumbnail_file_id, "THUMBNAIL_" + entry.ordinal
    );
    plain = decryptEnvelope(gallerySodium, dek, envelope, thumbnailAad(entry));
    const url = URL.createObjectURL(new Blob([plain], {type:"image/jpeg"}));
    thumbnailUrls.push(url);
    img.src = url;
    return true;
  } catch (_) {
    img.alt = "Unavailable " + (entry.ordinal + 1);
    return false;
  } finally {
    if (dek instanceof Uint8Array) gallerySodium.memzero(dek);
    if (plain instanceof Uint8Array) gallerySodium.memzero(plain);
  }
}

async function openCatalogPhoto(entry) {
  clearPhoto();
  let dek = null;
  let manifestPlain = null;
  let photoPlain = null;
  try {
    dek = unwrapGalleryMediaDek(entry);
    const manifestEnvelope = await driveDownload(
      galleryToken, entry.manifest_file_id, "MANIFEST_" + entry.ordinal
    );
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
    photoPlain = decryptEnvelope(
      gallerySodium, dek, photoEnvelope,
      "pmv:v1:photo\nvault_id=" + EXPECTED_VAULT_ID +
      "\nmedia_id=" + entry.media_id + "\n"
    );
    if (photoPlain.length !== manifest.photo_plaintext_length) {
      throw new Error("PHOTO_PLAINTEXT_LENGTH_MISMATCH");
    }
    const mime = detectMime(photoPlain);
    photoUrl = URL.createObjectURL(new Blob([photoPlain], {type:mime}));
    photoEl.src = photoUrl;
    photoEl.hidden = false;
    clearButton.disabled = false;
    add("SELECTED_PHOTO_DISPLAY=PASS;ORDINAL=" + entry.ordinal);
  } catch (e) {
    add("SELECTED_PHOTO_DISPLAY=FAIL;ORDINAL=" + entry.ordinal);
    add("ERROR=" + String(e?.message || e));
  } finally {
    if (dek instanceof Uint8Array) gallerySodium.memzero(dek);
    if (manifestPlain instanceof Uint8Array) gallerySodium.memzero(manifestPlain);
    if (photoPlain instanceof Uint8Array) gallerySodium.memzero(photoPlain);
  }
}

async function renderGallery() {
  photoGridEl.replaceChildren();
  for (const entry of galleryCatalog.entries) {
    const b = document.createElement("button");
    b.type = "button";
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
      if (i >= galleryCatalog.entries.length) return;
      if (await loadThumbnail(galleryCatalog.entries[i], buttons[i].firstElementChild)) ok++;
      done++;
      if (done % 25 === 0 || done === EXPECTED_PHOTO_COUNT) {
        add("THUMBNAIL_PROGRESS=" + done + "/" + EXPECTED_PHOTO_COUNT);
      }
    }
  }
  await Promise.all(Array.from({length:6}, worker));
  add("THUMBNAIL_DECRYPT_COMPLETE=" + ok + "/" + EXPECTED_PHOTO_COUNT);
  if (ok !== EXPECTED_PHOTO_COUNT) throw new Error("THUMBNAIL_SET_INCOMPLETE=" + ok);
}

function clearGallery() {
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
  clearGallery();
  lines.length = 0;
  let wrappingKey = null;
  try {
    add("PRODUCTION_MEDIA_ACCESS=READ_ONLY");
    galleryToken = consumeOAuthHandoff();
    add("OAUTH_HANDOFF_RECEIVED=PASS");

    const wrapper = await downloadWrapper(galleryToken);
    const wrapperAad = validateWrapper(wrapper);
    add("WRAPPER_FORMAT_VALID=PASS");

    const password = passwordEl.value;
    passwordEl.value = "";
    if (!password) throw new Error("PMV_PASSWORD_EMPTY");

    gallerySodium = await loadVerifiedSodium();
    add("VERIFIED_LIBSODIUM_IMPORT=PASS");

    wrappingKey = gallerySodium.crypto_pwhash(
      32, password, b64ToBytes(wrapper.salt_b64), 3, 536870912,
      gallerySodium.crypto_pwhash_ALG_ARGON2ID13
    );
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

    galleryCatalog = await loadG2Catalog();
    add("G2_CATALOG_SHA256=PASS");
    add("G2_CATALOG_AUTHENTICATED=PASS");
    add("CATALOG_GENERATION=2");
    add("CATALOG_ENTRY_COUNT=392");

    await renderGallery();
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
    button.disabled = false;
  }
};

photoEl.onclick = () => {
  if (!photoEl.hidden) clearPhoto();
};

clearButton.onclick = clearGallery;
window.addEventListener("pagehide", clearGallery, { once: true });
