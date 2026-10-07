const video=document.getElementById("video");
let readyPromise=null;

function send(type,extra={}){
  parent.postMessage({source:"PMV_PC7C_PLAYBACK_R7",type,...extra},location.origin);
}

async function ready(){
  if(readyPromise)return readyPromise;
  readyPromise=(async()=>{
    if(!("serviceWorker" in navigator))throw new Error("VIDEO_SW_UNAVAILABLE");
    await navigator.serviceWorker.register("./sw-r7.js?v=chunk3",{scope:"./"});
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller){
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error("VIDEO_SW_CONTROLLER_TIMEOUT")),5000);
        const changed=()=>{
          if(navigator.serviceWorker.controller){
            clearTimeout(timer);
            navigator.serviceWorker.removeEventListener("controllerchange",changed);
            resolve();
          }
        };
        navigator.serviceWorker.addEventListener("controllerchange",changed);
        changed();
      });
    }
    if(!navigator.serviceWorker.controller)throw new Error("VIDEO_SW_CONTROLLER_MISSING");
    send("READY");
  })();
  return readyPromise;
}

function swRequest(message,transfer=[],timeoutMs=15000){
  return new Promise((resolve,reject)=>{
    const sw=navigator.serviceWorker.controller;
    if(!sw){reject(new Error("VIDEO_SW_CONTROLLER_MISSING"));return;}
    const channel=new MessageChannel();
    const timer=setTimeout(()=>{
      try{channel.port1.close();}catch(_){}
      reject(new Error("VIDEO_SW_REQUEST_TIMEOUT:"+message.type));
    },timeoutMs);
    channel.port1.onmessage=ev=>{
      clearTimeout(timer);
      try{channel.port1.close();}catch(_){}
      resolve(ev.data||{});
    };
    sw.postMessage(message,[...transfer,channel.port2]);
  });
}

window.addEventListener("message",async e=>{
  if(e.origin!==location.origin||e.source!==parent)return;
  try{
    await ready();

    if(e.data?.type==="PMV_VIDEO_SET"){
      const buffers=e.data.parts||[];
      let r=await swRequest({
        type:"PMV_VIDEO_SET_BEGIN",
        partCount:buffers.length,
        totalLength:e.data.totalLength,
        mime:e.data.mime
      });
      if(!r.ok)throw new Error("VIDEO_SW_SET_BEGIN_FAILED");

      for(let i=0;i<buffers.length;i++){
        const buffer=buffers[i];
        r=await swRequest(
          {type:"PMV_VIDEO_SET_PART",index:i,buffer},
          [buffer],
          15000
        );
        if(!r.ok||r.index!==i)throw new Error("VIDEO_SW_SET_PART_FAILED:"+i);
      }

      r=await swRequest({type:"PMV_VIDEO_SET_COMMIT"});
      send("SET_RESULT",r);
    }
    else if(e.data?.type==="PMV_VIDEO_CLEAR"){
      video.pause();
      video.removeAttribute("src");
      video.load();
      const r=await swRequest({type:"PMV_VIDEO_CLEAR"});
      send("CLEAR_RESULT",r);
    }
    else if(e.data?.type==="PMV_VIDEO_PLAY"){
      video.src="./virtual-r7.mp4?v="+Date.now();
      video.load();
      send("SOURCE_ACTIVE");
    }
  }catch(err){
    send("ERROR",{message:String(err?.message||err)});
  }
});

function clearOnExit(){
  try{
    video.pause();
    video.removeAttribute("src");
    video.load();
    navigator.serviceWorker.controller?.postMessage({type:"PMV_VIDEO_CLEAR"});
  }catch(_){}
}

window.addEventListener("pagehide",clearOnExit);
video.addEventListener("loadedmetadata",()=>send("LOADEDMETADATA",{duration:video.duration}));
video.addEventListener("canplay",()=>send("CANPLAY"));
video.addEventListener("playing",()=>send("PLAYING"));
video.addEventListener("seeked",()=>send("SEEKED",{currentTime:video.currentTime}));
video.addEventListener("error",()=>send("VIDEO_ERROR",{code:video.error?.code??"UNKNOWN"}));
ready().catch(e=>send("ERROR",{message:String(e?.message||e)}));