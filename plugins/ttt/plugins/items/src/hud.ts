export {setCenterHud} from './runtime';
export const HUD_FONT_BIG='fontSize-m';
export const HUD_FONT_MID='fontSize-sm';
export const HUD_FONT_SMALL='fontSize-s';
export function hudLine(body:string,color:string,size=HUD_FONT_MID):string {return `<font class='${size}' color='${color}'>${body.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</font>`;}
