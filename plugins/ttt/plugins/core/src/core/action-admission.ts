/** Private Core authority gate shared by copied World and UI action projections. */
let open=false;
export function isCoreActionAdmissionOpen():boolean{return open;}
export function openCoreActionAdmission():void{open=true;}
export function closeCoreActionAdmission():void{open=false;}
