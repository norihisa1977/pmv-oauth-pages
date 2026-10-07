let parts=[],offsets=[],total=0,mime="video/mp4";
let expectedParts=0,expectedTotal=0;

function wipe(){
  for(const p of parts)p.fill(0);
  parts=[]; offsets=[]; total=0; expectedParts=0; expectedTotal=0;
}

function reply(event,payload){
  const port=event.ports&&event.ports[0];
  if(port) port.postMessage(payload);
  else event.source?.postMessage(payload);
}

self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));

self.addEventListener("message",e=>{
  const d=e.data||{};

  if(d.type==="PMV_VIDEO_CLEAR"){
    wipe();
    reply(e,{type:"PMV_VIDEO_CLEAR_RESULT",ok:true});
    return;
  }

  if(d.type==="PMV_VIDEO_SET_BEGIN"){
    wipe();
    expectedParts=Number(d.partCount||0);
    expectedTotal=Number(d.totalLength||0);
    mime=String(d.mime||"video/mp4");
    const ok=Number.isSafeInteger(expectedParts)&&expectedParts>0&&Number.isSafeInteger(expectedTotal)&&expectedTotal>0;
    if(!ok) wipe();
    reply(e,{type:"PMV_VIDEO_SET_BEGIN_RESULT",ok,partCount:expectedParts,totalLength:expectedTotal});
    return;
  }

  if(d.type==="PMV_VIDEO_SET_PART"){
    const index=Number(d.index);
    const okIndex=Number.isSafeInteger(index)&&index===parts.length&&index<expectedParts;
    if(!okIndex||!(d.buffer instanceof ArrayBuffer)){
      reply(e,{type:"PMV_VIDEO_SET_PART_RESULT",ok:false,index});
      return;
    }
    const part=new Uint8Array(d.buffer);
    offsets.push(total);
    parts.push(part);
    total+=part.length;
    reply(e,{type:"PMV_VIDEO_SET_PART_RESULT",ok:true,index,totalLength:total});
    return;
  }

  if(d.type==="PMV_VIDEO_SET_COMMIT"){
    const ok=parts.length===expectedParts&&total===expectedTotal;
    if(!ok) wipe();
    reply(e,{type:"PMV_VIDEO_SET_RESULT",ok,totalLength:ok?total:0,partCount:ok?parts.length:0});
    return;
  }
});

function range(v){
  if(!v)return null;
  const m=/^bytes=(\d*)-(\d*)$/.exec(v.trim());
  if(!m)return false;
  let s,en;
  if(m[1]===""){
    const n=Number(m[2]);
    if(!Number.isSafeInteger(n)||n<=0)return false;
    s=Math.max(0,total-n); en=total-1;
  }else{
    s=Number(m[1]);
    en=m[2]===""?total-1:Number(m[2]);
  }
  if(!Number.isSafeInteger(s)||!Number.isSafeInteger(en)||s<0||en<s||s>=total)return false;
  return {s,en:Math.min(en,total-1)};
}

function copy(s,en){
  const out=new Uint8Array(en-s+1); let w=0;
  for(let i=0;i<parts.length&&w<out.length;i++){
    const ps=offsets[i],pe=ps+parts[i].length-1;
    if(en<ps)break;
    if(s>pe)continue;
    const a=Math.max(s,ps)-ps,b=Math.min(en,pe)-ps+1;
    const piece=parts[i].subarray(a,b);
    out.set(piece,w); w+=piece.length;
  }
  if(w!==out.length)throw new Error("VIDEO_SW_RANGE_COPY_MISMATCH");
  return out;
}

function headers(n){
  return {"Content-Type":mime,"Content-Length":String(n),"Accept-Ranges":"bytes","Cache-Control":"no-store"};
}

self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(!u.pathname.endsWith("/pc7c-video-playback-r7/virtual-r7.mp4"))return;
  e.respondWith((async()=>{
    if(!total||!parts.length)return new Response("unavailable",{status:503});
    if(e.request.method==="HEAD")return new Response(null,{status:200,headers:headers(total)});
    if(e.request.method!=="GET")return new Response(null,{status:405});
    const h=e.request.headers.get("range"),r=range(h);
    if(h&&!r)return new Response(null,{status:416,headers:{"Content-Range":"bytes */"+total,"Accept-Ranges":"bytes","Cache-Control":"no-store"}});
    if(!h){
      const body=copy(0,total-1);
      return new Response(body,{status:200,headers:headers(body.length)});
    }
    const body=copy(r.s,r.en);
    return new Response(body,{status:206,headers:{...headers(body.length),"Content-Range":"bytes "+r.s+"-"+r.en+"/"+total}});
  })());
});