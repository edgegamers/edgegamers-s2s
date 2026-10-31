// in_buttons.h bits (Source 2 / CS2), the low 32 bits a pawn's button state carries.
export const IN_ATTACK = 1 << 0;
export const IN_JUMP = 1 << 1;
export const IN_DUCK = 1 << 2;
export const IN_FORWARD = 1 << 3;
export const IN_BACK = 1 << 4;
export const IN_USE = 1 << 5;
export const IN_MOVELEFT = 1 << 9;
export const IN_MOVERIGHT = 1 << 10;

// m_fFlags bits.
export const FL_ONGROUND = 1 << 0;
export const FL_DUCKING = 1 << 1;

// MoveType_t.
export const MOVETYPE_NONE = 0;
export const MOVETYPE_WALK = 2;
export const MOVETYPE_NOCLIP = 7;
export const MOVETYPE_LADDER = 9;
