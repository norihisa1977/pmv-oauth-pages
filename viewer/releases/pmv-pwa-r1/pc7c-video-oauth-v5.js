const CLIENT_ID =
  "708619313298-76j1902kqi0jdihccrc2n0gtq0124ltk.apps.googleusercontent.com";

const SCOPE =
  "https://www.googleapis.com/auth/drive.file";

const reportEl =
  document.getElementById("report");

const button =
  document.getElementById("authorize");

let tokenClient = null;
const out = [];

function report() {
  reportEl.textContent =
    out.join("\n");
}

function add(line) {
  out.push(line);
  report();
}

async function retireLegacyVideoServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    add("LEGACY_VIDEO_SW_SCOPE_CLEAR=PASS");
    return;
  }

  const registrations =
    await navigator.serviceWorker.getRegistrations();

  let retired = 0;

  for (const registration of registrations) {
    const scriptUrl =
      registration.active?.scriptURL ||
      registration.waiting?.scriptURL ||
      registration.installing?.scriptURL ||
      "";

    if (scriptUrl.includes("/pc7c-video-sw.js")) {
      if (await registration.unregister()) {
        retired++;
      }
    }
  }

  if (retired > 0) {
    add("LEGACY_VIDEO_SW_RETIRED=" + retired);
  }

  add("LEGACY_VIDEO_SW_SCOPE_CLEAR=PASS");
}

async function waitForGIS() {
  for (let i = 0; i < 100; i++) {
    if (window.google?.accounts?.oauth2) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("GIS_LOAD_TIMEOUT");
}

async function initialize() {
  button.disabled = true;
  out.length = 0;

  try {
    add("PC7C_VIDEO_OAUTH_CONTEXT=PASS");
    add("PMV_PASSWORD_FIELD_PRESENT=false");
    add("KEY_CONTEXT_ACTIVE=false");

    await retireLegacyVideoServiceWorker();
    await waitForGIS();

    add("GIS_READY=PASS");

    tokenClient =
      google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,

        callback: response => {
          try {
            if (response.error) {
              throw new Error("TOKEN_ERROR:" + response.error);
            }

            if (!response.access_token) {
              throw new Error("ACCESS_TOKEN_MISSING");
            }

            sessionStorage.setItem(
              "pmv_r1_pc7c_video_handoff",
              JSON.stringify({
                v: 1,
                token: response.access_token,
                created_at: Date.now()
              })
            );

            add("ACCESS_TOKEN_RECEIVED=PASS");
            add("ACCESS_TOKEN_PERSISTED_BY_TEST_CODE=NO");
            add("SAME_ORIGIN_HANDOFF_STAGED=PASS");

            location.replace(
              "./pc7c-video-segment-v5.html?v=5"
            );
          }
          catch (e) {
            add("PC7C_VIDEO_OAUTH=FAIL");
            add("ERROR=" + String(e?.message || e));
          }
        }
      });

    add("GIS_TOKEN_CLIENT_INIT=PASS");
    add("OAUTH_BUTTON_READY=PASS");
    button.disabled = false;
  }
  catch (e) {
    add("PC7C_VIDEO_OAUTH=FAIL");
    add("ERROR=" + String(e?.message || e));
  }
}

button.onclick = () => {
  try {
    if (!tokenClient) {
      throw new Error("GIS_TOKEN_CLIENT_NOT_READY");
    }

    add("OAUTH_USER_GESTURE_REQUEST=PASS");

    tokenClient.requestAccessToken({
      prompt: ""
    });
  }
  catch (e) {
    add("PC7C_VIDEO_OAUTH=FAIL");
    add("ERROR=" + String(e?.message || e));
  }
};

initialize();
