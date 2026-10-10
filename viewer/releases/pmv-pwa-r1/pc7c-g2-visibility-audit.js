const targets = [
  { label: "G2_CATALOG", id: "1_D0cwTQu6zmqQnL2MVUTjo2NtmD-I2Ol", expectedSize: "453029" },
  { label: "G2_THUMBNAIL_CONTROL", id: "1GYJP7xRpE7CVaRy09nXdrtn_tLVB_3eJ", expectedSize: "11701" }
];

const button = document.getElementById("g2");
const report = document.getElementById("report");

async function probe(token, target) {
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files/" +
      encodeURIComponent(target.id) +
      "?fields=id,size",
    {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
      credentials: "omit"
    }
  );

  if (response.status === 403 || response.status === 404) {
    return { ...target, classification: "NOT_VISIBLE", http: response.status, size: null };
  }
  if (!response.ok) {
    return { ...target, classification: "ERROR", http: response.status, size: null };
  }

  const data = await response.json();
  return {
    ...target,
    classification: data.id === target.id ? "VISIBLE" : "ERROR",
    http: 200,
    size: data.size || null
  };
}

button.onclick = async () => {
  button.disabled = true;
  const out = [
    "G2_CONTROL_TARGET_COUNT=2",
    "MEDIA_BODY_DOWNLOADED=NO",
    "PRODUCTION_MUTATION=NO",
    "FILES_LIST_USED=NO",
    "SCOPE_FALLBACK_USED=NO"
  ];

  try {
    const raw = sessionStorage.getItem("pmv_r1_pc7c_photo_handoff");
    if (!raw) throw new Error("OAUTH_HANDOFF_MISSING");
    const handoff = JSON.parse(raw);
    sessionStorage.removeItem("pmv_r1_pc7c_photo_handoff");
    if (!handoff.token) throw new Error("ACCESS_TOKEN_MISSING");

    let visible = 0;
    let notVisible = 0;
    let error = 0;
    let sizeMismatch = 0;

    for (const target of targets) {
      const result = await probe(handoff.token, target);
      const sizeMatch = String(result.size || "") === target.expectedSize;

      if (result.classification === "VISIBLE") visible++;
      else if (result.classification === "NOT_VISIBLE") notVisible++;
      else error++;
      if (result.classification === "VISIBLE" && !sizeMatch) sizeMismatch++;

      out.push(
        result.label + "=" + result.classification +
        ";HTTP=" + result.http +
        ";SIZE=" + (result.size ?? "") +
        ";SIZE_MATCH=" + (sizeMatch ? "YES" : "NO")
      );
    }

    out.push("VISIBLE=" + visible);
    out.push("NOT_VISIBLE=" + notVisible);
    out.push("ERROR=" + error);
    out.push("SIZE_MISMATCH=" + sizeMismatch);
    out.push("ALL_G2_TARGETS_VISIBLE=" + (visible === 2 && sizeMismatch === 0 ? "YES" : "NO"));
    out.push(
      "G2_DRIVE_VISIBILITY_CONTROL_AUDIT=" +
      (visible === 2 && notVisible === 0 && error === 0 && sizeMismatch === 0 ? "PASS" : "FAIL")
    );
  } catch (e) {
    out.push("G2_DRIVE_VISIBILITY_CONTROL_AUDIT=FAIL");
    out.push("ERROR=" + String(e?.message || e));
  }

  report.textContent = out.join("\n");
  button.disabled = false;
};
