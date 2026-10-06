let parts=[]; let offsets=[]; let total=0; let mime="video/mp4";
function wipe(){for(const p of parts)p.fill(0);parts=[];offsets=[];total=0;}
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("message",e=>{
 const d=e.data;
 if(d?.type==="PMV_VIDEO_CLEAR"){wipe();e.source?.postMessage({type:"PMV_VIDEO_CLEAR_RESULT",ok:true});return;}
 if(d?.type!=="PMV_VIDEO_SET")return;
 wipe(); let at=0;
 for(const b of d.parts||[]){const p=new Uint8Array(b);offsets.push(at);parts.push(p);at+=p.length;}
 total=at; mime=d.mime||"video/mp4";
 e.source?.postMessage({type:"PMV_VIDEO_SET_RESULT",ok:total===d.totalLength,totalLength:total});
});
function slice(start,end){const out=new Uint8Array(end-start+1);let pos=0;
 for(let i=0;i<parts.length;i++){const ps=offsets[i],pe=ps+parts[i].length-1;if(pe<start||ps>end)continue;
 const a=Math.max(start,ps)-ps,b=Math.min(end,pe)-ps+1;out.set(parts[i].subarray(a,b),pos);pos+=b-a;} return out;}
self.addEventListener("fetch",e=>{
 const u=new URL(e.request.url); if(!u.pathname.endsWith("/pc7c-video-playback/virtual.mp4"))return;
 e.respondWith((async()=>{if(!total)return new Response("not ready",{status:503});
 const r=e.request.headers.get("range");
 if(!r)return new Response(slice(0,total-1),{status:200,headers:{"Content-Type":mime,"Content-Length":String(total),"Accept-Ranges":"bytes","Cache-Control":"no-store"}});
 const m=/bytes=(\d*)-(\d*)/.exec(r); if(!m)return new Response(null,{status:416});
 let s=m[1]?Number(m[1]):null,en=m[2]?Number(m[2]):null;
 if(s===null){const n=en;s=Math.max(0,total-n);en=total-1;} else if(en===null||en>=total)en=total-1;
 if(!Number.isFinite(s)||!Number.isFinite(en)||s<0||s>en||s>=total)return new Response(null,{status:416,headers:{"Content-Range":"bytes */"+total}});
 const body=slice(s,en); return new Response(body,{status:206,headers:{"Content-Type":mime,"Content-Length":String(body.length),"Accept-Ranges":"bytes","Content-Range":"bytes "+s+"-"+en+"/"+total,"Cache-Control":"no-store"}});
 })());
});