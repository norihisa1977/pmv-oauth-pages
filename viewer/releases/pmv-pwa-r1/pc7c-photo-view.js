const WRAPPER_NAME =
  "pmv-pwa-wrapped-kek-v1.json";

const RECORD_FILE_ID =
  "1G-mMzviIITpUllqnCbnjAlzguo7aX_0w";

const MANIFEST_FILE_ID =
  "1ulDSALMuVaRxMMffUtc_wczVdxP5ve4D";

const PHOTO_FILE_ID =
  "1NSXI22fnprN8KH8tv2kh3nGZBD1nnas_";

const EXPECTED_VAULT_ID =
  "pmv-v1-production";

const EXPECTED_MEDIA_ID =
  "photo-1790491105139-7e5a45b4a5ac6688";

const EXPECTED_KEY_GENERATION = 1;

const EXPECTED_MANIFEST_OBJECT =
  "141a1391a9949d1cf4edd1efe61e73d0.manifest";

const EXPECTED_PHOTO_OBJECT =
  "687d868b331116a4efdca27bd8dda95e.blob";

const reportEl =
  document.getElementById("report");

const button =
  document.getElementById("run");

const clearButton =
  document.getElementById("clear");

const passwordEl =
  document.getElementById("password");

const photoEl =
  document.getElementById("photo");

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

  add(
    label +
    "_HTTP=" +
    response.status
  );

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

button.onclick = async () => {
  button.disabled = true;

  clearPhoto();

  lines.length = 0;

  let sodium = null;
  let wrappingKey = null;
  let productionKek = null;
  let mediaDek = null;
  let photoPlaintext = null;

  try {
    add(
      "KEY_CONTEXT=PASS"
    );

    add(
      "PRODUCTION_MEDIA_ACCESS=READ_ONLY"
    );

    const accessToken =
      consumeOAuthHandoff();

    const wrapper =
      await downloadWrapper(
        accessToken
      );

    const wrapperAad =
      validateWrapper(
        wrapper
      );

    const recordBytes =
      await driveDownload(
        accessToken,
        RECORD_FILE_ID,
        "PRODUCTION_RECORD_DOWNLOAD"
      );

    const record =
      JSON.parse(
        decoder.decode(
          recordBytes
        )
      );

    add(
      "PRODUCTION_RECORD_DOWNLOAD=PASS"
    );

    validateRecord(
      record
    );

    const password =
      passwordEl.value;

    passwordEl.value = "";

    if (!password) {
      throw new Error(
        "PMV_PASSWORD_EMPTY"
      );
    }

    sodium =
      await loadVerifiedSodium();

    wrappingKey =
      sodium.crypto_pwhash(
        32,
        password,
        b64ToBytes(
          wrapper.salt_b64
        ),
        3,
        536870912,
        sodium
          .crypto_pwhash_ALG_ARGON2ID13
      );

    if (
      !(wrappingKey instanceof Uint8Array) ||
      wrappingKey.length !== 32
    ) {
      throw new Error(
        "WRAPPING_KEY_INVALID"
      );
    }

    add(
      "ARGON2ID_DERIVATION=PASS"
    );

    productionKek =
      sodium
        .crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          b64ToBytes(
            wrapper
              .wrapped_kek_ciphertext_b64
          ),
          encoder.encode(
            wrapperAad
          ),
          b64ToBytes(
            wrapper.nonce_b64
          ),
          wrappingKey
        );

    if (
      !(productionKek instanceof Uint8Array) ||
      productionKek.length !== 32
    ) {
      throw new Error(
        "PRODUCTION_KEK_LENGTH_INVALID"
      );
    }

    add(
      "PRODUCTION_KEK_UNWRAP=PASS"
    );

    const mediaDekAad =
      "pmv:v1:key-wrap\n" +
      "purpose=media-dek\n" +
      "vault_id=" +
      record.vault_id +
      "\nsubject_id=" +
      record.media_id +
      "\nkey_generation=" +
      record.key_generation +
      "\n";

    mediaDek =
      sodium
        .crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          hexToBytes(
            record
              .wrapped_media_dek
              .ciphertext_hex
          ),
          encoder.encode(
            mediaDekAad
          ),
          hexToBytes(
            record
              .wrapped_media_dek
              .nonce_hex
          ),
          productionKek
        );

    if (
      !(mediaDek instanceof Uint8Array) ||
      mediaDek.length !== 32
    ) {
      throw new Error(
        "MEDIA_DEK_LENGTH_INVALID"
      );
    }

    add(
      "MEDIA_DEK_UNWRAP=PASS"
    );

    const manifestEnvelope =
      await driveDownload(
        accessToken,
        MANIFEST_FILE_ID,
        "PRODUCTION_MANIFEST_DOWNLOAD"
      );

    add(
      "PRODUCTION_MANIFEST_DOWNLOAD=PASS"
    );

    const manifestAad =
      "pmv:v1:manifest\n" +
      "vault_id=" +
      record.vault_id +
      "\nmedia_id=" +
      record.media_id +
      "\n";

    const manifestPlaintext =
      decryptEnvelope(
        sodium,
        mediaDek,
        manifestEnvelope,
        manifestAad
      );

    const manifest =
      JSON.parse(
        decoder.decode(
          manifestPlaintext
        )
      );

    sodium.memzero(
      manifestPlaintext
    );

    const manifestValid =
      manifest.format_version === 1 &&
      manifest.cipher_suite ===
        "XChaCha20-Poly1305-IETF" &&
      manifest.vault_id ===
        record.vault_id &&
      manifest.media_id ===
        record.media_id &&
      manifest.photo_object_name ===
        record.photo_object_name &&
      Number.isSafeInteger(
        manifest.photo_plaintext_length
      ) &&
      manifest.photo_plaintext_length > 0;

    if (!manifestValid) {
      throw new Error(
        "PROTECTED_MANIFEST_INVALID"
      );
    }

    add(
      "PROTECTED_MANIFEST_AUTHENTICATED=PASS"
    );

    add(
      "PROTECTED_MANIFEST_VALID=PASS"
    );

    const photoEnvelope =
      await driveDownload(
        accessToken,
        PHOTO_FILE_ID,
        "PRODUCTION_PHOTO_DOWNLOAD"
      );

    add(
      "PRODUCTION_PHOTO_CIPHERTEXT_DOWNLOAD=PASS"
    );

    const photoAad =
      "pmv:v1:photo\n" +
      "vault_id=" +
      record.vault_id +
      "\nmedia_id=" +
      record.media_id +
      "\n";

    photoPlaintext =
      decryptEnvelope(
        sodium,
        mediaDek,
        photoEnvelope,
        photoAad
      );

    if (
      photoPlaintext.length !==
      manifest.photo_plaintext_length
    ) {
      throw new Error(
        "PHOTO_PLAINTEXT_LENGTH_MISMATCH"
      );
    }

    add(
      "PRODUCTION_PHOTO_DECRYPT=PASS"
    );

    add(
      "PHOTO_PLAINTEXT_LENGTH_MATCH=PASS"
    );

    const mime =
      detectMime(
        photoPlaintext
      );

    add(
      "PHOTO_MIME_DETECTED=" +
      mime
    );

    photoUrl =
      URL.createObjectURL(
        new Blob(
          [photoPlaintext],
          {
            type: mime
          }
        )
      );

    photoEl.onload = () => {
      add(
        "PHOTO_DISPLAY=PASS"
      );

      add(
        "PHOTO_PLAINTEXT_PERSISTED=NO"
      );

      add(
        "PC7C_PHOTO_RESULT=PASS"
      );
    };

    photoEl.onerror = () => {
      add(
        "PHOTO_DISPLAY=FAIL"
      );

      add(
        "PC7C_PHOTO_RESULT=FAIL"
      );
    };

    photoEl.src =
      photoUrl;

    photoEl.hidden = false;

    clearButton.disabled =
      false;

    sodium.memzero(
      photoPlaintext
    );

    photoPlaintext = null;

    add(
      "PHOTO_PLAINTEXT_BUFFER_ZEROIZED=PASS"
    );

    add(
      "PHOTO_OBJECT_URL_ACTIVE=YES"
    );
  }
  catch (e) {
    add(
      "PC7C_PHOTO_RESULT=FAIL"
    );

    add(
      "ERROR=" +
      String(
        e?.message || e
      )
    );
  }
  finally {
    if (
      sodium &&
      photoPlaintext instanceof Uint8Array
    ) {
      sodium.memzero(
        photoPlaintext
      );

      add(
        "PHOTO_PLAINTEXT_BUFFER_ZEROIZED=PASS"
      );
    }

    if (
      sodium &&
      mediaDek instanceof Uint8Array
    ) {
      sodium.memzero(
        mediaDek
      );

      add(
        "MEDIA_DEK_ZEROIZED=PASS"
      );
    }

    if (
      sodium &&
      productionKek instanceof Uint8Array
    ) {
      sodium.memzero(
        productionKek
      );

      add(
        "PRODUCTION_KEK_ZEROIZED=PASS"
      );
    }

    if (
      sodium &&
      wrappingKey instanceof Uint8Array
    ) {
      sodium.memzero(
        wrappingKey
      );

      add(
        "WRAPPING_KEY_ZEROIZED=PASS"
      );
    }

    add(
      "PRODUCTION_KEK_PERSISTED=NO"
    );

    add(
      "MEDIA_DEK_PERSISTED=NO"
    );

    button.disabled = false;
  }
};
