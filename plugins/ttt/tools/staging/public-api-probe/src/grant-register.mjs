import {createObserver} from './grant-observer.mjs';
// Public SDK registration only. command/createScope imported by the integrating plugin.
// d.current must include plugin/map/round/provider plus retained client/controller/pawn seals.
export function registerGrantObserver({command,createScope,admit,...d}) {
  const scope=createScope(); // Must be created during the plugin load window.
  let closed=false;
  const observer=createObserver({...d,emit(value){scope.clear();d.emit(value);}});
  command('ttt_staging_grant_arm',inv=>{
    if(closed||inv.callerSlot!==-1||inv.replySource!=='server'||inv.argCount!==0||!admit())return;
    if(!observer.arm()){inv.reply('grant observer already armed');return;}
    try {
      scope.server.onGameFrame(observer.frame,{phase:'pre',priority:'monitor'});
      scope.events.on('item_pickup',ev=>observer.pickup(ev.getPlayerSlot('userid')));
      scope.server.onMapStart(()=>observer.dispose());
      inv.reply('grant observer armed: first living human, one transition, 300 seconds maximum');
    }catch{observer.dispose();}
  });
  command('ttt_staging_grant_stop',inv=>{
    if(inv.callerSlot===-1&&inv.replySource==='server'&&inv.argCount===0)observer.stop();
  });
  return {
    stop:()=>observer.dispose(), // Map end: clears active subscriptions; next map can rearm.
    close:()=>{closed=true;observer.dispose();scope.dispose();} // Plugin unload only.
  };
}
