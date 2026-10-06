const video = document.getElementById("video");
let registration = null;

function parentMessage(type, extra = {}) {
  parent.postMessage({source:"PMV_PC7C_PLAYBACK", type, ...extra}, location.origin);
}

async function ensureWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("VIDEO_SW_UNAVAILABLE");
  registration = await navigator.serviceWorker.register("./sw.js?v=pc7c-sw-scope-v2", {scope:"./"});
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("VIDEO_SW_CONTROLLER_TIMEOUT")),5000);
      const changed=()=>{if(navigator.serviceWorker.controller){clearTimeout(timer);navigator.serviceWorker.removeEventListener("controllerchange",changed);resolve();}};
      navigator.serviceWorker.addEventListener("controllerchange",changed);
      changed();
    });
  }
  if (!navigator.serviceWorker.controller) throw new Error("VIDEO_SW_CONTROLLER_MISSING");
  parentMessage("READY");
}

navigator.serviceWorker.addEventListener("message", event => {
  if (event.data?.type === "PMV_VIDEO_SET_RESULT") {
    parentMessage("SET_RESULT", event.data);
  } else if (event.data?.type === "PMV_VIDEO_CLEAR_RESULT") {
    parentMessage("CLEAR_RESULT", event.data);
  }
});

window.addEventListener("message", async event => {
  if (event.origin !== location.origin || event.source !== parent) return;
  const data=event.data;
  try {
    await ensureWorker();
    const sw=navigator.serviceWorker.controller;
    if (data?.type === "PMV_VIDEO_SET") {
      sw.postMessage(data, data.parts);
    } else if (data?.type === "PMV_VIDEO_CLEAR") {
      video.removeAttribute("src"); video.load();
      sw.postMessage({type:"PMV_VIDEO_CLEAR"});
    } else if (data?.type === "PMV_VIDEO_PLAY") {
      video.src="./virtual.mp4?v="+Date.now(); video.load();
      parentMessage("SOURCE_ACTIVE");
    }
  } catch(e) { parentMessage("ERROR",{message:String(e?.message||e)}); }
});

video.addEventListener("loadedmetadata",()=>parentMessage("LOADEDMETADATA",{duration:video.duration}));
video.addEventListener("canplay",()=>parentMessage("CANPLAY"));
video.addEventListener("playing",()=>parentMessage("PLAYING"));
video.addEventListener("seeked",()=>parentMessage("SEEKED",{currentTime:video.currentTime}));
video.addEventListener("error",()=>parentMessage("VIDEO_ERROR",{code:video.error?.code??"UNKNOWN"}));
ensureWorker().catch(e=>parentMessage("ERROR",{message:String(e?.message||e)}));
