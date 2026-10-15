// No browser storage. Deadlines are checked after synchronous Argon2 as well as on events.
export class SessionLifecycle {
  constructor({expire,visible=()=>true,now=()=>Date.now(),setTimer=setInterval,clearTimer=clearInterval}) {
    Object.assign(this,{expire,visible,now,setTimer,clearTimer});
    this.epoch=0;this.active=false;this.authorized=false;this.timer=null;
  }
  begin(tokenExpires) {
    this.invalidate();
    const now=this.now();
    if(!this.visible()||!Number.isFinite(tokenExpires)||tokenExpires<=now) throw Error("SESSION_START_DENIED");
    this.active=true;this.tokenExpires=tokenExpires;this.lastActivity=now;this.lastClock=now;
    this.timer=this.setTimer(()=>{try{this.assert();}catch{}},1000);
  }
  assert(epoch=this.epoch) {
    const now=this.now();
    if(!this.active||epoch!==this.epoch)throw Error("SESSION_EXPIRED");
    if(!this.visible()||now<this.lastClock||now-this.lastActivity>=300000||now>=this.tokenExpires){
      this.invalidate();this.expire();throw Error("SESSION_EXPIRED");
    }
    this.lastClock=now;
  }
  touch(){if(!this.active)return;try{this.assert();this.lastActivity=this.now();}catch{}}
  invalidate(){this.epoch++;this.active=false;this.authorized=false;if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;}
}
