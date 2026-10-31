// Pure bounded state machine. Dependencies perform only sealed reads; no SDK objects are emitted.
const allowed = ['alive','health','weaponCount','activePresent','activeOwned','isBeingGivenItem','disableAutoDeploy','nextAttack','playerLocked','hideHUD','deployTick','commandNumber','moveType','flags'];
function primitives(value) {
  const out={}; for(const key of allowed) { const v=value[key];
    out[key]=typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v))?v:null;
  } return out;
}
export function createObserver(d) {
  let state=null;
  function finish(reason) {
    const s=state;if(!s)return;state=null;
    const result={event:'human-inventory-transition',reason,trigger:s.trigger,
      elapsedMs:Math.max(0,s.last-s.start),lightReads:s.lightReads,detailReads:s.detailReads,
      samples:s.samples,input:s.input,limitations:['pickup-or-inventory-change-not-grant-source','sequential-server-copy','observer-overhead-unmeasured']};
    d.emit(result);
  }
  function tickClock() {
    const s=state;if(!s)return null;const t=d.now();
    if(!Number.isFinite(t)||t<s.last){finish('clock-invalid');return null;}
    s.last=t;if(s.trigger&&t>=s.end){finish('window-complete');return null;}if(t>=s.deadline){finish('arm-expired');return null;}
    return t;
  }
  function arm() {
    if(state)return false;const t=d.now();if(!Number.isFinite(t))return false;
    state={start:t,last:t,deadline:t+300000,nextPoll:t,target:null,prior:null,trigger:null,
      end:0,nextDetail:0,lightReads:0,detailReads:0,samples:[],lastDetail:null,
      input:{samples:0,buttonSamples:0,nonzeroButtons:0,maxAbsForward:0,maxAbsLeft:0,firstCommand:null,lastCommand:null,commandAdvances:0}};
    return true;
  }
  function sampleDetail(t,phase) {
    const s=state;if(!s||s.detailReads>=21)return;
    if(!d.current(s.target)||state!==s){if(state===s)finish('identity-changed');return;}
    const raw=d.detail(s.target);s.detailReads++;
    if(state!==s||!d.current(s.target)){finish('identity-changed');return;}
    s.input.samples++;
    const buttons=raw.inputButtons;
    if((typeof buttons==='number'&&Number.isFinite(buttons)&&Number.isInteger(buttons)&&buttons>=0)
      ||(typeof buttons==='bigint'&&buttons>=0n)) {
      s.input.buttonSamples++;
      if(buttons!==0&&buttons!==0n)s.input.nonzeroButtons++;
    }
    for(const [key,v] of [['maxAbsForward',raw.inputForward],['maxAbsLeft',raw.inputLeft]])
      if(typeof v==='number'&&Number.isFinite(v))s.input[key]=Math.max(s.input[key],Math.abs(v));
    if(Number.isSafeInteger(raw.commandNumber)) {
      if(s.input.firstCommand===null)s.input.firstCommand=raw.commandNumber;
      if(s.input.lastCommand!==null&&raw.commandNumber>s.input.lastCommand)s.input.commandAdvances++;
      s.input.lastCommand=raw.commandNumber;
    }
    const value=primitives(raw);const serial=JSON.stringify(value);
    if(serial!==s.lastDetail){s.samples.push({atMs:t-s.start,phase,...value});s.lastDetail=serial;}
  }
  function trigger(t,reason) {
    const s=state;if(!s||s.trigger||!s.target)return;
    s.trigger=reason;s.end=Math.min(t+2000,s.deadline);s.nextDetail=t+100;
    if(s.prior)s.samples.push({atMs:s.prior.at-s.start,phase:'previous-light',weaponCount:s.prior.count,activePresent:s.prior.active});
    sampleDetail(t,'trigger');
  }
  function frame() {
    try {
      const t=tickClock(),s=state;if(t===null||!s)return;
      if(s.trigger){if(t>=s.end){finish('window-complete');return;}
        if(t>=s.nextDetail){s.nextDetail=t+100;sampleDetail(t,'after');}return;}
      if(t<s.nextPoll)return;s.nextPoll=t+1000;
      if(!s.target)s.target=d.acquire(); // At most1Hz discovery, pin first living human and pawn.
      if(!s.target)return;
      if(!d.current(s.target)){finish('identity-changed');return;}
      const row=d.light(s.target);s.lightReads++;
      if(state!==s||!d.current(s.target)){finish('identity-changed');return;}
      if(!Number.isInteger(row.count)||row.count<0||row.count>64||typeof row.active!=='boolean'||typeof row.key!=='string') {finish('invalid-light');return;}
      if(s.prior&&row.key!==s.prior.key){trigger(t,'inventory-changed');return;}
      s.prior={at:t,count:row.count,active:row.active,key:row.key}; // key stays private.
    } catch {finish('read-failed');}
  }
  function pickup(slot) {
    try {const t=tickClock(),s=state;if(t===null||!s||!s.target||slot!==s.target.slot)return;
      // Event is post-observation only; no synchronous engine state reads on its stack.
      if(!s.trigger){s.trigger='pickup-pending';s.end=Math.min(t+2000,s.deadline);s.nextDetail=t;
        if(s.prior)s.samples.push({atMs:s.prior.at-s.start,phase:'previous-light',weaponCount:s.prior.count,activePresent:s.prior.active});}
    }catch{finish('read-failed');}
  }
  return {arm,frame,pickup,stop:()=>finish('operator-stop'),dispose:()=>finish('lifecycle-end'),isArmed:()=>state!==null};
}
