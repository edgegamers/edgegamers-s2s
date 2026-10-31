/**
 * Colours. On the interop wire a colour is a string: `"#rrggbb"`, `"rainbow"`, or `""` for "use
 * the default". Parse it with {@link parseColor} at the point of use.
 */
export interface Rgb {
    r: number;
    g: number;
    b: number;
}
export declare const Colors: {
    readonly White: {
        readonly r: 255;
        readonly g: 255;
        readonly b: 255;
    };
    readonly Red: {
        readonly r: 255;
        readonly g: 0;
        readonly b: 0;
    };
    readonly Green: {
        readonly r: 0;
        readonly g: 255;
        readonly b: 0;
    };
    readonly Blue: {
        readonly r: 0;
        readonly g: 0;
        readonly b: 255;
    };
    readonly Yellow: {
        readonly r: 255;
        readonly g: 255;
        readonly b: 0;
    };
    readonly Magenta: {
        readonly r: 255;
        readonly g: 0;
        readonly b: 255;
    };
    readonly Cyan: {
        readonly r: 0;
        readonly g: 255;
        readonly b: 255;
    };
    readonly Orange: {
        readonly r: 255;
        readonly g: 165;
        readonly b: 0;
    };
    readonly Purple: {
        readonly r: 128;
        readonly g: 0;
        readonly b: 128;
    };
    readonly Pink: {
        readonly r: 255;
        readonly g: 192;
        readonly b: 203;
    };
    readonly LightBlue: {
        readonly r: 173;
        readonly g: 216;
        readonly b: 230;
    };
    readonly Gray: {
        readonly r: 128;
        readonly g: 128;
        readonly b: 128;
    };
};
export declare const RAINBOW = "rainbow";
/** `"#rrggbb"` (lower-case). */
export declare function toHex(c: Rgb): string;
/**
 * Parse a wire colour: `"#rrggbb"`/`"rrggbb"`, `"r,g,b"`, a {@link Colors} name (any case), or
 * `"rainbow"`. Returns null for `""` or anything unparseable (callers fall back to their default).
 */
export declare function parseColor(s: string): Rgb | typeof RAINBOW | null;
/** Resolve a wire colour to a concrete RGB now (rainbow is sampled at `nowMs`). */
export declare function resolveColor(s: string, fallback: Rgb, nowMs: number): Rgb;
/** A smoothly cycling hue (one full cycle per `periodMs`, default 3s). */
export declare function rainbow(nowMs: number, periodMs?: number): Rgb;
export declare function hsvToRgb(h: number, s: number, v: number): Rgb;
/** Linear blend from `a` (t=0) to `b` (t=1). */
export declare function lerpColor(a: Rgb, b: Rgb, t: number): Rgb;
/**
 * Pack for a `Color32`-style value: little-endian RGBA, `r | g<<8 | b<<16 | a<<24`, unsigned.
 * This is the format of `pawn.render` (`m_clrRender`) and of `Fade.to({ color })`
 * (the cs2 package's own blind uses `0xFF000000` = opaque black).
 */
export declare function packColor32(c: Rgb, alpha?: number): number;
