const video=document.getElementById("video");
let readyPromise=null;
function send(type,extra={}){parent.postMessage({source:"PMV_PC7C_PLAYBACK_R7",type,...extra},location.origin);}
async function ready(){
 if(readyPromise)return readyPromise;
 readyPromise=(async()=>{
  if(!("serviceWorker" in navigator))throw new Error("VIDEO_SW_UNAVAILABLE");
  await navigator.serviceWorker.register("./sw-r7.js?v=ack2",{scope:"./"});
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
window.addEventListener("message",async e=>{
 if(e.origin!==location.origin||e.source!==parent)return;
 try{
  await ready(); const sw=navigator.serviceWorker.controller;
  if(e.data?.type==="PMV_VIDEO_SET"){
   const channel=new MessageChannel();
   const timer=setTimeout(()=>{try{channel.port1.close();}catch(_){} send("ERROR",{message:"VIDEO_SW_ACK_TIMEOUT"});},15000);
   channel.port1.onmessage=ev=>{
    clearTimeout(timer);
    const d=ev.data||{};
    if(d.type==="PMV_VIDEO_SET_RESULT")send("SET_RESULT",d);
    else send("ERROR",{message:"VIDEO_SW_ACK_INVALID"});
    try{channel.port1.close();}catch(_){}
   };
   sw.postMessage(e.data,[...e.data.parts,channel.port2]);
  }
  else if(e.data?.type==="PMV_VIDEO_CLEAR"){
   video.pause();video.removeAttribute("src");video.load();
   const channel=new MessageChannel();
   channel.port1.onmessage=ev=>{send("CLEAR_RESULT",ev.data||{});try{channel.port1.close();}catch(_){}};
   sw.postMessage({type:"PMV_VIDEO_CLEAR"},[channel.port2]);
  }
  else if(e.data?.type==="PMV_VIDEO_PLAY"){
   video.src="./virtual-r7.mp4?v="+Date.now();video.load();send("SOURCE_ACTIVE");
  }
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