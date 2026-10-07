const video=document.getElementById("video");
let readyPromise=null;
function send(type,extra={}){parent.postMessage({source:"PMV_PC7C_PLAYBACK_V5",type,...extra},location.origin);}
async function ready(){
 if(readyPromise)return readyPromise;
 readyPromise=(async()=>{
  if(!("serviceWorker" in navigator))throw new Error("VIDEO_SW_UNAVAILABLE");
  await navigator.serviceWorker.register("./sw-v5.js?v=5",{scope:"./"});
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller){
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error("VIDEO_SW_CONTROLLER_TIMEOUT")),5000);
    const changed=()=>{if(navigator.serviceWorker.controller){clearTimeout(timer);navigator.serviceWorker.removeEventListener("controllerchange",changed);resolve();}};
    navigator.serviceWorker.addEventListener("controllerchange",changed);changed();
   });
  }
  if(!navigator.serviceWorker.controller)throw new Error("VIDEO_SW_CONTROLLER_MISSING");
  send("READY");
 })();
 return readyPromise;
}
navigator.serviceWorker.addEventListener("message",e=>{
 if(e.data?.type==="PMV_VIDEO_SET_RESULT")send("SET_RESULT",e.data);
 if(e.data?.type==="PMV_VIDEO_CLEAR_RESULT")send("CLEAR_RESULT",e.data);
});
window.addEventListener("message",async e=>{
 if(e.origin!==location.origin||e.source!==parent)return;
 try{
  await ready(); const sw=navigator.serviceWorker.controller;
  if(e.data?.type==="PMV_VIDEO_SET")sw.postMessage(e.data,e.data.parts);
  else if(e.data?.type==="PMV_VIDEO_CLEAR"){video.pause();video.removeAttribute("src");video.load();sw.postMessage({type:"PMV_VIDEO_CLEAR"});}
  else if(e.data?.type==="PMV_VIDEO_PLAY"){video.src="./virtual-v5.mp4?v="+Date.now();video.load();send("SOURCE_ACTIVE");}
 }catch(err){send("ERROR",{message:String(err?.message||err)});}
});
function clearOnExit(){try{video.pause();video.removeAttribute("src");video.load();navigator.serviceWorker.controller?.postMessage({type:"PMV_VIDEO_CLEAR"});}catch(_){}}
window.addEventListener("pagehide",clearOnExit);
video.addEventListener("loadedmetadata",()=>send("LOADEDMETADATA",{duration:video.duration}));
video.addEventListener("canplay",()=>send("CANPLAY"));
video.addEventListener("playing",()=>send("PLAYING"));
video.addEventListener("seeked",()=>send("SEEKED",{currentTime:video.currentTime}));
video.addEventListener("error",()=>send("VIDEO_ERROR",{code:video.error?.code??"UNKNOWN"}));
ready().catch(e=>send("ERROR",{message:String(e?.message||e)}));