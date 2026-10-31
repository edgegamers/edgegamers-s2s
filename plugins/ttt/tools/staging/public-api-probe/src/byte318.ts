import type {EntityRef} from '@s2script/sdk/entity';
/** Installed ELF audit's unnamed pawn byte, not a schema field or portable layout promise. */
export function readPawnByte318(ref:EntityRef):number|null {
 if(!ref.isValid())return null;
 const value=ref.readUInt8(0x318);
 return ref.isValid()&&typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=255?value:null;
}
