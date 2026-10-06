const WRAPPER_NAME =
  "pmv-pwa-wrapped-kek-v1.json";

const RECORD_FILE_ID =
  "1Gy7RwaNTMrNRMjTED474i_dhHT5L-oqx";

const MANIFEST_FILE_ID =
  "1LEhe3RCD54ev6L3BPWEUMirtyx1xOc49";

const VIDEO_FILE_ID =
  "1XXTNdwiZ0Eat37mecOhhzYsqBcFf8y-4";

const EXPECTED_VAULT_ID =
  "pmv-v1-production";

const EXPECTED_MEDIA_ID =
  "video-1790512590050-3c3970b5ea1cb8e5";

const EXPECTED_KEY_GENERATION = 1;

const EXPECTED_MANIFEST_OBJECT =
  "049cd24365bb7dfc890a883dfe814ef7.manifest";

const EXPECTED_VIDEO_OBJECT =
  "c25b9f6d47d8fbff1bf8ed526b052899.blob";

const reportEl =
  document.getElementById("report");

const button =
  document.getElementById("run");

const passwordEl =
  document.getElementById("password");

const videoEl =
  document.getElementById("video");

const clearButton =
  document.getElementById("clear");

let currentObjectUrl = null;
let currentPlaybackParts = null;
let activeSodium = null;

const lines = [];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function add(line) {
  lines.push(line);
  reportEl.textContent = lines.join("\n");
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
    throw new Error("HEX_FORMAT_INVALID");
  }

  const out = new Uint8Array(value.length / 2);

  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(
      value.slice(i * 2, i * 2 + 2),
      16
    );
  }

  return out;
}

function bytesToHex(bytes) {
  return Array.from(
    bytes,
    b => b.toString(16).padStart(2, "0")
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

  if (releaseManifest.release_id !== "pmv-pwa-r1") {
    throw new Error("RELEASE_ID_MISMATCH");
  }

  const wrapperPath =
    "vendor/libsodium-0.8.4/libsodium-wrappers.mjs";

  const sumoPath =
    "vendor/libsodium-0.8.4/libsodium-sumo.mjs";

  const wrapperExpected =
    releaseManifest.assets?.[wrapperPath]?.sha256;

  const sumoExpected =
    releaseManifest.assets?.[sumoPath]?.sha256;

  if (!wrapperExpected || !sumoExpected) {
    throw new Error("RELEASE_MANIFEST_ASSET_MISSING");
  }

  const [wrapperBytes, sumoBytes] =
    await Promise.all([
      fetchBytes("./" + wrapperPath),
      fetchBytes("./" + sumoPath)
    ]);

  const [wrapperActual, sumoActual] =
    await Promise.all([
      sha256Hex(wrapperBytes),
      sha256Hex(sumoBytes)
    ]);

  if (wrapperActual !== wrapperExpected) {
    throw new Error("LIBSODIUM_WRAPPER_HASH_MISMATCH");
  }

  if (sumoActual !== sumoExpected) {
    throw new Error("LIBSODIUM_SUMO_HASH_MISMATCH");
  }

  add("LIBSODIUM_WRAPPER_HASH=PASS");
  add("LIBSODIUM_SUMO_HASH=PASS");

  const sumoText =
    decoder.decode(sumoBytes);

  const wrapperText =
    decoder.decode(wrapperBytes);

  const sumoUrl =
    URL.createObjectURL(
      new Blob(
        [sumoText],
        {type: "text/javascript"}
      )
    );

  const originalImport =
    'import e from"./libsodium-sumo.mjs";';

  const rewrittenImport =
    'import e from"' + sumoUrl + '";';

  const rewrittenWrapper =
    wrapperText.replace(
      originalImport,
      rewrittenImport
    );

  if (rewrittenWrapper === wrapperText) {
    URL.revokeObjectURL(sumoUrl);
    throw new Error("WRAPPER_IMPORT_REWRITE_FAILED");
  }

  const wrapperUrl =
    URL.createObjectURL(
      new Blob(
        [rewrittenWrapper],
        {type: "text/javascript"}
      )
    );

  try {
    const module =
      await import(wrapperUrl);

    const sodium =
      module.default;

    await sodium.ready;

    if (
      typeof sodium.crypto_pwhash !== "function" ||
      typeof sodium
        .crypto_aead_xchacha20poly1305_ietf_decrypt !== "function" ||
      typeof sodium.memzero !== "function"
    ) {
      throw new Error("REQUIRED_SODIUM_API_MISSING");
    }

    add("VERIFIED_LIBSODIUM_IMPORT=PASS");
    return sodium;
  }
  finally {
    URL.revokeObjectURL(wrapperUrl);
    URL.revokeObjectURL(sumoUrl);
  }
}

function consumeOAuthHandoff() {
  const raw =
    sessionStorage.getItem(
      "pmv_r1_pc7c_video_handoff"
    );

  if (!raw) {
    throw new Error("OAUTH_HANDOFF_MISSING");
  }

  const handoff =
    JSON.parse(raw);

  sessionStorage.removeItem(
    "pmv_r1_pc7c_video_handoff"
  );

  if (!handoff.token) {
    throw new Error("ACCESS_TOKEN_MISSING");
  }

  add("OAUTH_HANDOFF_RECEIVED=PASS");

  add(
    "OAUTH_HANDOFF_DESTROYED_AFTER_READ=" +
    (
      sessionStorage.getItem(
        "pmv_r1_pc7c_video_handoff"
      ) === null
    )
  );

  add(
    "GOOGLE_GIS_PRESENT=" +
    Boolean(window.google?.accounts?.oauth2)
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
      encodeURIComponent(fileId) +
      "?alt=media",
      {
        headers: {
          Authorization:
            "Bearer " + accessToken
        },
        cache: "no-store",
        credentials: "omit"
      }
    );

  add(label + "_HTTP=" + response.status);

  if (!response.ok) {
    throw new Error(label + "_DOWNLOAD_FAILED");
  }

  return new Uint8Array(
    await response.arrayBuffer()
  );
}

async function driveRange(
  accessToken,
  fileId,
  start,
  end
) {
  const response =
    await fetch(
      "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(fileId) +
      "?alt=media",
      {
        headers: {
          Authorization:
            "Bearer " + accessToken,
          Range:
            "bytes=" + start + "-" + end
        },
        cache: "no-store",
        credentials: "omit"
      }
    );

  add(
    "VIDEO_RANGE_HTTP=" +
    response.status
  );

  if (response.status !== 206) {
    throw new Error(
      "VIDEO_RANGE_HTTP_NOT_206"
    );
  }

  const contentRange =
    response.headers.get("content-range");

  add(
    "VIDEO_CONTENT_RANGE_EXPOSED=" +
    Boolean(contentRange)
  );

  const bytes =
    new Uint8Array(
      await response.arrayBuffer()
    );

  const expectedLength =
    end - start + 1;

  if (bytes.length !== expectedLength) {
    throw new Error(
      "VIDEO_RANGE_RESPONSE_LENGTH_MISMATCH"
    );
  }

  add("VIDEO_RANGE_RESPONSE_LENGTH_MATCH=PASS");

  return bytes;
}

async function downloadWrapper(accessToken) {
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
            "Bearer " + accessToken
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
    throw new Error("DRIVE_WRAPPER_LIST_FAILED");
  }

  const list =
    await listResponse.json();

  if (list.files.length !== 1) {
    throw new Error("DRIVE_WRAPPER_LOOKUP_COUNT_NOT_ONE");
  }

  const bytes =
    await driveDownload(
      accessToken,
      list.files[0].id,
      "DRIVE_WRAPPER_DOWNLOAD"
    );

  add("DRIVE_WRAPPER_DOWNLOAD=PASS");

  return JSON.parse(
    decoder.decode(bytes)
  );
}

function validateWrapper(wrapper) {
  const expectedAad =
    "PMV-PWA-WRAPPED-KEK-V1" +
    "|vault_id=" +
    wrapper.vault_id +
    "|key_generation=" +
    wrapper.key_generation;

  const valid =
    wrapper.format_id === "PMV-PWA-WRAPPED-KEK-V1" &&
    wrapper.format_version === 1 &&
    wrapper.vault_id === EXPECTED_VAULT_ID &&
    wrapper.key_generation === EXPECTED_KEY_GENERATION &&
    wrapper.kdf === "Argon2id13" &&
    wrapper.kdf_opslimit === 3 &&
    wrapper.kdf_memlimit_bytes === 536870912 &&
    wrapper.kdf_output_bytes === 32 &&
    wrapper.aead === "XChaCha20-Poly1305-IETF" &&
    b64ToBytes(wrapper.salt_b64).length === 16 &&
    b64ToBytes(wrapper.nonce_b64).length === 24 &&
    b64ToBytes(wrapper.wrapped_kek_ciphertext_b64).length === 48 &&
    wrapper.aad === expectedAad;

  if (!valid) {
    throw new Error("WRAPPER_FORMAT_INVALID");
  }

  add("WRAPPER_FORMAT_VALID=PASS");
  return expectedAad;
}

function validateRecord(record) {
  const valid =
    record.format_version === 1 &&
    record.vault_id === EXPECTED_VAULT_ID &&
    record.media_id === EXPECTED_MEDIA_ID &&
    record.key_generation === EXPECTED_KEY_GENERATION &&
    record.manifest_object_name === EXPECTED_MANIFEST_OBJECT &&
    record.video_object_name === EXPECTED_VIDEO_OBJECT &&
    typeof record.wrapped_media_dek?.nonce_hex === "string" &&
    record.wrapped_media_dek.nonce_hex.length === 48 &&
    typeof record.wrapped_media_dek?.ciphertext_hex === "string" &&
    record.wrapped_media_dek.ciphertext_hex.length === 96;

  if (!valid) {
    throw new Error("PRODUCTION_VIDEO_RECORD_INVALID");
  }

  add("PRODUCTION_VIDEO_RECORD_VALID=PASS");
}

function validateManifest(manifest) {
  if (
    manifest.format_version !== 1 ||
    manifest.cipher_suite !== "XChaCha20-Poly1305-IETF" ||
    manifest.stream_algorithm !== null ||
    manifest.nonce_length !== 24 ||
    manifest.tag_length !== 16 ||
    manifest.vault_id !== EXPECTED_VAULT_ID ||
    manifest.media_id !== EXPECTED_MEDIA_ID ||
    !Number.isSafeInteger(manifest.segment_count) ||
    manifest.segment_count < 1 ||
    !Array.isArray(manifest.segments) ||
    manifest.segments.length !== manifest.segment_count
  ) {
    throw new Error("VIDEO_MANIFEST_INVALID");
  }

  let expectedOffset = 0;
  let totalPlain = 0;
  let totalCipher = 0;

  for (let i = 0; i < manifest.segments.length; i++) {
    const seg = manifest.segments[i];

    if (
      seg.segment_index !== i ||
      seg.offset !== expectedOffset ||
      !Number.isSafeInteger(seg.plaintext_length) ||
      seg.plaintext_length < 1 ||
      seg.plaintext_length > manifest.segment_size_bytes ||
      seg.ciphertext_length !== seg.plaintext_length + 16 ||
      typeof seg.nonce_hex !== "string" ||
      seg.nonce_hex.length !== 48
    ) {
      throw new Error("VIDEO_MANIFEST_SEGMENT_INVALID");
    }

    expectedOffset += seg.ciphertext_length;
    totalPlain += seg.plaintext_length;
    totalCipher += seg.ciphertext_length;
  }

  if (
    totalPlain !== manifest.total_plaintext_length ||
    totalCipher !== manifest.total_ciphertext_length ||
    manifest.source_plaintext_length !== manifest.total_plaintext_length
  ) {
    throw new Error("VIDEO_MANIFEST_TOTAL_INVALID");
  }

  add("VIDEO_MANIFEST_VALID=PASS");
}

function clearVideo() {
  try {
    videoEl.pause();
    videoEl.removeAttribute("src");
    videoEl.load();

    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
      add("VIDEO_OBJECT_URL_RELEASED=PASS");
    }

    if (
      activeSodium &&
      Array.isArray(currentPlaybackParts)
    ) {
      for (const part of currentPlaybackParts) {
        if (part instanceof Uint8Array) {
          activeSodium.memzero(part);
        }
      }

      currentPlaybackParts = null;
      add("VIDEO_SOURCE_BUFFERS_ZEROIZED=PASS");
    }

    clearButton.disabled = true;
  }
  catch (e) {
    add("VIDEO_CLEAR=FAIL");
    add("VIDEO_CLEAR_ERROR=" + String(e?.message || e));
  }
}

clearButton.onclick = clearVideo;

videoEl.addEventListener("loadedmetadata", () => {
  add("VIDEO_LOADEDMETADATA=PASS");
  add("VIDEO_DURATION_SECONDS=" + videoEl.duration);
});

videoEl.addEventListener("canplay", () => {
  add("VIDEO_CANPLAY=PASS");
});

videoEl.addEventListener("playing", () => {
  add("VIDEO_PLAY_EVENT=PASS");
});

videoEl.addEventListener("seeked", () => {
  add("VIDEO_SEEK_EVENT=PASS");
  add("VIDEO_CURRENT_TIME=" + videoEl.currentTime);
});

videoEl.addEventListener("error", () => {
  add("VIDEO_ELEMENT_ERROR=FAIL");
  add("VIDEO_ELEMENT_ERROR_CODE=" + (videoEl.error?.code ?? "UNKNOWN"));
});

button.onclick = async () => {
  button.disabled = true;
  lines.length = 0;

  let sodium = null;
  let wrappingKey = null;
  let productionKek = null;
  let mediaDek = null;
  let segmentPlaintext = null;

  try {
    add("KEY_CONTEXT=PASS");
    add("PRODUCTION_VIDEO_ACCESS=READ_ONLY");

    const accessToken =
      consumeOAuthHandoff();

    const wrapper =
      await downloadWrapper(accessToken);

    const wrapperAad =
      validateWrapper(wrapper);

    const recordBytes =
      await driveDownload(
        accessToken,
        RECORD_FILE_ID,
        "PRODUCTION_VIDEO_RECORD_DOWNLOAD"
      );

    const record =
      JSON.parse(
        decoder.decode(recordBytes)
      );

    add("PRODUCTION_VIDEO_RECORD_DOWNLOAD=PASS");
    validateRecord(record);

    const password =
      passwordEl.value;

    passwordEl.value = "";

    if (!password) {
      throw new Error("PMV_PASSWORD_EMPTY");
    }

    sodium =
      await loadVerifiedSodium();

    activeSodium = sodium;

    wrappingKey =
      sodium.crypto_pwhash(
        32,
        password,
        b64ToBytes(wrapper.salt_b64),
        3,
        536870912,
        sodium.crypto_pwhash_ALG_ARGON2ID13
      );

    if (
      !(wrappingKey instanceof Uint8Array) ||
      wrappingKey.length !== 32
    ) {
      throw new Error("WRAPPING_KEY_INVALID");
    }

    add("ARGON2ID_DERIVATION=PASS");

    productionKek =
      sodium
        .crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          b64ToBytes(
            wrapper.wrapped_kek_ciphertext_b64
          ),
          encoder.encode(wrapperAad),
          b64ToBytes(wrapper.nonce_b64),
          wrappingKey
        );

    if (
      !(productionKek instanceof Uint8Array) ||
      productionKek.length !== 32
    ) {
      throw new Error("PRODUCTION_KEK_LENGTH_INVALID");
    }

    add("PRODUCTION_KEK_UNWRAP=PASS");

    const mediaDekAad =
      "pmv:v1:key-wrap\n" +
      "purpose=media-dek\n" +
      "vault_id=" + record.vault_id + "\n" +
      "subject_id=" + record.media_id + "\n" +
      "key_generation=" + record.key_generation + "\n";

    mediaDek =
      sodium
        .crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          hexToBytes(
            record.wrapped_media_dek.ciphertext_hex
          ),
          encoder.encode(mediaDekAad),
          hexToBytes(
            record.wrapped_media_dek.nonce_hex
          ),
          productionKek
        );

    if (
      !(mediaDek instanceof Uint8Array) ||
      mediaDek.length !== 32
    ) {
      throw new Error("MEDIA_DEK_LENGTH_INVALID");
    }

    add("MEDIA_DEK_UNWRAP=PASS");

    const manifestEnvelope =
      await driveDownload(
        accessToken,
        MANIFEST_FILE_ID,
        "PRODUCTION_VIDEO_MANIFEST_DOWNLOAD"
      );

    add("PRODUCTION_VIDEO_MANIFEST_DOWNLOAD=PASS");

    if (manifestEnvelope.length < 40) {
      throw new Error("VIDEO_MANIFEST_ENVELOPE_INVALID");
    }

    const manifestNonce =
      manifestEnvelope.slice(0, 24);

    const manifestCiphertext =
      manifestEnvelope.slice(24);

    const manifestAad =
      "pmv:v1:manifest\n" +
      "vault_id=" + record.vault_id + "\n" +
      "media_id=" + record.media_id + "\n";

    let manifestPlaintext = null;

    try {
      manifestPlaintext =
        sodium
          .crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,
            manifestCiphertext,
            encoder.encode(manifestAad),
            manifestNonce,
            mediaDek
          );

      add("PRODUCTION_VIDEO_MANIFEST_AEAD_AUTH=PASS");

      const manifest =
        JSON.parse(
          decoder.decode(manifestPlaintext)
        );

      add("PRODUCTION_VIDEO_MANIFEST_JSON=PASS");

      validateManifest(manifest);

      const seg =
        manifest.segments[0];

      const start =
        seg.offset;

      const end =
        seg.offset +
        seg.ciphertext_length -
        1;

      add("VIDEO_SEGMENT_INDEX=0");
      add("VIDEO_RANGE_START=" + start);
      add("VIDEO_RANGE_END=" + end);

      const segmentCiphertext =
        await driveRange(
          accessToken,
          VIDEO_FILE_ID,
          start,
          end
        );

      if (
        segmentCiphertext.length !==
        seg.ciphertext_length
      ) {
        throw new Error("VIDEO_RANGE_LENGTH_MISMATCH");
      }

      add("VIDEO_RANGE_LENGTH_MATCH=PASS");

      const segmentAad =
        "vault_id=" + manifest.vault_id + "\n" +
        "media_id=" + manifest.media_id + "\n" +
        "format_version=" + manifest.format_version + "\n" +
        "segment_index=" + seg.segment_index + "\n" +
        "segment_count=" + manifest.segment_count + "\n" +
        "plaintext_length=" + seg.plaintext_length + "\n";

      segmentPlaintext =
        sodium
          .crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,
            segmentCiphertext,
            encoder.encode(segmentAad),
            hexToBytes(seg.nonce_hex),
            mediaDek
          );

      if (
        segmentPlaintext.length !==
        seg.plaintext_length
      ) {
        throw new Error("VIDEO_SEGMENT_PLAINTEXT_LENGTH_MISMATCH");
      }

      add("VIDEO_SEGMENT_AEAD_DECRYPT=PASS");
      add("VIDEO_SEGMENT_PLAINTEXT_LENGTH_MATCH=PASS");

      const maxTransientBytes =
        256 * 1024 * 1024;

      add("VIDEO_TOTAL_PLAINTEXT_BYTES=" + manifest.total_plaintext_length);
      add("VIDEO_SEGMENT_COUNT=" + manifest.segment_count);

      if (manifest.total_plaintext_length > maxTransientBytes) {
        throw new Error("VIDEO_PLAYBACK_TRANSIENT_MEMORY_CAP_EXCEEDED");
      }

      const playbackParts = [segmentPlaintext];

      for (let i = 1; i < manifest.segments.length; i++) {
        const s = manifest.segments[i];

        const ctext =
          await driveRange(
            accessToken,
            VIDEO_FILE_ID,
            s.offset,
            s.offset + s.ciphertext_length - 1
          );

        if (ctext.length !== s.ciphertext_length) {
          throw new Error("VIDEO_PLAYBACK_RANGE_LENGTH_MISMATCH:" + i);
        }

        const aad =
          "vault_id=" + manifest.vault_id + "\n" +
          "media_id=" + manifest.media_id + "\n" +
          "format_version=" + manifest.format_version + "\n" +
          "segment_index=" + s.segment_index + "\n" +
          "segment_count=" + manifest.segment_count + "\n" +
          "plaintext_length=" + s.plaintext_length + "\n";

        const p =
          sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
            null,
            ctext,
            encoder.encode(aad),
            hexToBytes(s.nonce_hex),
            mediaDek
          );

        if (p.length !== s.plaintext_length) {
          throw new Error("VIDEO_PLAYBACK_SEGMENT_LENGTH_MISMATCH:" + i);
        }

        playbackParts.push(p);
      }

      add("VIDEO_ALL_SEGMENTS_AEAD_DECRYPT=PASS");

      const sourceName =
        String(manifest.source_file_name || "").toLowerCase();

      const extMatch =
        sourceName.match(/\.([a-z0-9]+)$/);

      const sourceExt =
        extMatch ? extMatch[1] : "unknown";

      add("VIDEO_SOURCE_EXTENSION=" + sourceExt);

      const probeParts =
        playbackParts.slice(0, Math.min(playbackParts.length, 4));

      let probeLength = 0;
      for (const part of probeParts) {
        probeLength += Math.min(part.length, 1024 * 1024);
      }

      const probe =
        new Uint8Array(probeLength);

      let probeOffset = 0;
      for (const part of probeParts) {
        const take =
          part.subarray(0, Math.min(part.length, 1024 * 1024));
        probe.set(take, probeOffset);
        probeOffset += take.length;
      }

      const ascii =
        Array.from(
          probe,
          b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : "."
        ).join("");

      const tags = [
        "ftyp",
        "qt  ",
        "isom",
        "mp41",
        "mp42",
        "avc1",
        "hvc1",
        "hev1",
        "av01",
        "vp09",
        "mp4a",
        "ac-3",
        "ec-3"
      ].filter(tag => ascii.includes(tag));

      add("VIDEO_CONTAINER_CODEC_TAGS=" + (tags.length ? tags.join(",") : "NONE"));

      function findAscii(bytes, text) {
        const target = Array.from(text, ch => ch.charCodeAt(0));
        outer:
        for (let i = 0; i <= bytes.length - target.length; i++) {
          for (let j = 0; j < target.length; j++) {
            if (bytes[i + j] !== target[j]) continue outer;
          }
          return i;
        }
        return -1;
      }

      function findAsciiAcrossParts(parts, text) {
        const target = Array.from(text, ch => ch.charCodeAt(0));
        let globalOffset = 0;

        for (let pIndex = 0; pIndex < parts.length; pIndex++) {
          const part = parts[pIndex];

          outer:
          for (let i = 0; i <= part.length - target.length; i++) {
            for (let j = 0; j < target.length; j++) {
              if (part[i + j] !== target[j]) continue outer;
            }

            return {
              partIndex: pIndex,
              localOffset: i,
              globalOffset: globalOffset + i
            };
          }

          globalOffset += part.length;
        }

        return null;
      }

      const topLevelTags = ["ftyp","moov","mdat","free","wide","uuid"];
      for (const tag of topLevelTags) {
        const hit = findAsciiAcrossParts(playbackParts, tag);
        add(
          "VIDEO_BOX_" + tag.toUpperCase() + "_OFFSET=" +
          (hit ? hit.globalOffset : "NOT_FOUND")
        );
      }

      const avcCHit =
        findAsciiAcrossParts(playbackParts, "avcC");

      if (avcCHit) {
        const part = playbackParts[avcCHit.partIndex];
        const i = avcCHit.localOffset;

        if (i + 8 <= part.length) {
          const profile = part[i + 5];
          const compat = part[i + 6];
          const level = part[i + 7];

          const codec =
            "avc1." +
            [profile, compat, level]
              .map(v => v.toString(16).padStart(2, "0"))
              .join("")
              .toUpperCase();

          add("VIDEO_AVCC_OFFSET=" + avcCHit.globalOffset);
          add("VIDEO_AVC_CODEC=" + codec);
          add("VIDEO_AVC_PROFILE_IDC=" + profile);
          add("VIDEO_AVC_LEVEL_IDC=" + level);
          add(
            "VIDEO_CANPLAYTYPE_EXACT=" +
            videoEl.canPlayType('video/mp4; codecs="' + codec + ', mp4a.40.2"')
          );
        }
        else {
          add("VIDEO_AVC_CODEC=CROSSES_SEGMENT_BOUNDARY");
        }
      }
      else {
        add("VIDEO_AVC_CODEC=NOT_FOUND");
      }

      let mime = "application/octet-stream";

      if (
        tags.includes("qt  ") ||
        sourceExt === "mov"
      ) {
        mime = "video/quicktime";
      }
      else if (
        tags.includes("ftyp") ||
        ["mp4","m4v"].includes(sourceExt)
      ) {
        mime = "video/mp4";
      }

      add("VIDEO_MIME_CANDIDATE=" + mime);
      add("VIDEO_CANPLAYTYPE=" + videoEl.canPlayType(mime));

      sodium.memzero(probe);

      const blob =
        new Blob(
          playbackParts,
          {type: mime}
        );

      if (blob.size !== manifest.total_plaintext_length) {
        throw new Error("VIDEO_BLOB_LENGTH_MISMATCH");
      }

      add("VIDEO_TRANSIENT_BLOB_LENGTH_MATCH=PASS");
      add("VIDEO_MIME=" + mime);

      clearVideo();

      currentObjectUrl =
        URL.createObjectURL(blob);

      currentPlaybackParts =
        playbackParts;

      videoEl.src =
        currentObjectUrl;

      clearButton.disabled = false;

      add("VIDEO_OBJECT_URL_ACTIVE=YES");
      add("VIDEO_PLAINTEXT_FILE_CREATED=NO");
      add("VIDEO_PLAINTEXT_PERSISTED=NO");
      add("VIDEO_SOURCE_BUFFERS_HELD_UNTIL_CLEAR=YES");
      add("PC7C_VIDEO_SEGMENT_RESULT=PASS");
      add("PC7C_VIDEO_PLAYBACK_PREP=PASS");

      segmentPlaintext = null;
    }
    finally {
      if (
        manifestPlaintext instanceof Uint8Array
      ) {
        sodium.memzero(manifestPlaintext);
        add("VIDEO_MANIFEST_PLAINTEXT_ZEROIZED=PASS");
      }
    }

  }
  catch (e) {
    add("PC7C_VIDEO_SEGMENT_RESULT=FAIL");
    add("ERROR=" + String(e?.message || e));
  }
  finally {
    if (
      sodium &&
      segmentPlaintext instanceof Uint8Array
    ) {
      sodium.memzero(segmentPlaintext);
      add("VIDEO_SEGMENT_PLAINTEXT_ZEROIZED=PASS");
    }

    if (
      sodium &&
      mediaDek instanceof Uint8Array
    ) {
      sodium.memzero(mediaDek);
      add("MEDIA_DEK_ZEROIZED=PASS");
    }

    if (
      sodium &&
      productionKek instanceof Uint8Array
    ) {
      sodium.memzero(productionKek);
      add("PRODUCTION_KEK_ZEROIZED=PASS");
    }

    if (
      sodium &&
      wrappingKey instanceof Uint8Array
    ) {
      sodium.memzero(wrappingKey);
      add("WRAPPING_KEY_ZEROIZED=PASS");
    }

    add("PRODUCTION_KEK_PERSISTED=NO");
    add("MEDIA_DEK_PERSISTED=NO");

    button.disabled = false;
  }
};
