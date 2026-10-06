const reportEl =
  document.getElementById("report");

const lines = [];

function add(line) {
  lines.push(line);
  reportEl.textContent =
    lines.join("\n");
}

const MANIFEST_FILE_ID =
  "1ulDSALMuVaRxMMffUtc_wczVdxP5ve4D";

const MEDIA_FILE_ID =
  "1NSXI22fnprN8KH8tv2kh3nGZBD1nnas_";

function consumeToken() {
  const raw =
    sessionStorage.getItem(
      "pmv_r1_pc7c_handoff"
    );

  if (!raw) {
    throw new Error(
      "OAUTH_HANDOFF_MISSING"
    );
  }

  const handoff =
    JSON.parse(raw);

  sessionStorage.removeItem(
    "pmv_r1_pc7c_handoff"
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
        "pmv_r1_pc7c_handoff"
      ) === null
    )
  );

  return handoff.token;
}

async function probeMetadata(
  token,
  fileId,
  label
) {
  const url =
    "https://www.googleapis.com/drive/v3/files/" +
    encodeURIComponent(fileId) +
    "?fields=id,size,mimeType,trashed";

  const response =
    await fetch(
      url,
      {
        method: "GET",
        headers: {
          Authorization:
            "Bearer " + token
        },
        cache: "no-store",
        credentials: "omit"
      }
    );

  add(
    label +
    "_METADATA_HTTP=" +
    response.status
  );

  if (response.ok) {
    const metadata =
      await response.json();

    if (
      metadata.id !== fileId ||
      metadata.trashed === true
    ) {
      throw new Error(
        label +
        "_METADATA_INVALID"
      );
    }

    add(
      label +
      "_VISIBLE=PASS"
    );

    return true;
  }

  if (
    response.status === 403 ||
    response.status === 404
  ) {
    add(
      label +
      "_VISIBLE=NO"
    );

    return false;
  }

  throw new Error(
    label +
    "_METADATA_UNEXPECTED_HTTP_" +
    response.status
  );
}

async function main() {
  try {
    add(
      "PC7C_METADATA_ONLY=true"
    );

    add(
      "PRODUCTION_MEDIA_BODY_ACCESS=NONE"
    );

    const token =
      consumeToken();

    const manifestVisible =
      await probeMetadata(
        token,
        MANIFEST_FILE_ID,
        "PRODUCTION_MANIFEST"
      );

    const mediaVisible =
      await probeMetadata(
        token,
        MEDIA_FILE_ID,
        "PRODUCTION_MEDIA"
      );

    add(
      "PRODUCTION_MEDIA_BODY_DOWNLOADED=NO"
    );

    if (
      manifestVisible &&
      mediaVisible
    ) {
      add(
        "PC7C_DRIVE_FILEID_VISIBILITY=PASS"
      );
    }
    else {
      add(
        "PC7C_DRIVE_FILEID_VISIBILITY=BLOCKED_BY_DRIVE_FILE_SCOPE"
      );
    }
  }
  catch (e) {
    add(
      "PC7C_DRIVE_FILEID_VISIBILITY=FAIL"
    );

    add(
      "ERROR=" +
      String(e?.message || e)
    );

    add(
      "PRODUCTION_MEDIA_BODY_DOWNLOADED=NO"
    );
  }
}

main();
