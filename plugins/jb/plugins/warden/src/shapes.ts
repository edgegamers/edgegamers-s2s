/**
 * Marker shapes and colours — pure geometry (no SDK imports; unit-tested in test/shapes.test.ts).
 *
 * The C# marker was a CS2Draw particle effect per shape. Here every shape is an outline of flat
 * points in the marker's horizontal plane, drawn as a closed loop of beams (see draw.ts). Straight
 * shapes use only their corners (a triangle is three beams); curved shapes are sampled at
 * `segments` points.
 */

export type Rgb = { r: number; g: number; b: number };

export const MARKER_SHAPES = [
  { key: "circle", name: "Circle" },
  { key: "triangle", name: "Triangle" },
  { key: "square", name: "Square" },
  { key: "diamond", name: "Diamond" },
  { key: "pentagon", name: "Pentagon" },
  { key: "hexagon", name: "Hexagon" },
  { key: "heart", name: "Heart" },
  { key: "star", name: "Star" },
  { key: "jelly_bean", name: "Jelly Bean" },
  { key: "among_us", name: "Among Us" },
] as const;

export type MarkerShape = (typeof MARKER_SHAPES)[number]["key"];

/** System.Drawing values, as the C# MarkerColor used (note: .NET "Green" is 0,128,0). */
export const MARKER_COLORS = [
  { name: "Red", rgb: { r: 255, g: 0, b: 0 } },
  { name: "Green", rgb: { r: 0, g: 128, b: 0 } },
  { name: "Blue", rgb: { r: 0, g: 0, b: 255 } },
  { name: "Magenta", rgb: { r: 255, g: 0, b: 255 } },
  { name: "Yellow", rgb: { r: 255, g: 255, b: 0 } },
  { name: "Purple", rgb: { r: 128, g: 0, b: 128 } },
  { name: "Pink", rgb: { r: 255, g: 192, b: 203 } },
  { name: "Cyan", rgb: { r: 0, g: 255, b: 255 } },
  { name: "White", rgb: { r: 255, g: 255, b: 255 } },
] as const satisfies readonly { name: string; rgb: Rgb }[];

/** Parse a stored shape (display name or key, any case); unknown → circle. */
export function parseShape(value: string): MarkerShape {
  const v = value.trim().toLowerCase().replace(/\s+/g, "_");
  for (const s of MARKER_SHAPES) {
    if (s.key === v || s.name.toLowerCase().replace(/\s+/g, "_") === v) return s.key;
  }
  return "circle";
}

export function shapeName(shape: MarkerShape): string {
  return MARKER_SHAPES.find((s) => s.key === shape)?.name ?? "Circle";
}

/** Parse a stored colour name (exact display name, like the C#); unknown → White. */
export function parseMarkerColor(value: string): { name: string; rgb: Rgb } {
  const c = MARKER_COLORS.find((m) => m.name === value.trim());
  const found = c ?? MARKER_COLORS[MARKER_COLORS.length - 1];
  return { name: found.name, rgb: { ...found.rgb } };
}

export type Point2 = [number, number];

function regular(sides: number, radius: number, rotationDeg: number): Point2[] {
  const out: Point2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = ((rotationDeg + (360 * i) / sides) * Math.PI) / 180;
    out.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return out;
}

function sampled(segments: number, f: (t: number) => Point2): Point2[] {
  const n = Math.max(8, Math.floor(segments));
  const out: Point2[] = [];
  for (let i = 0; i < n; i++) out.push(f((i / n) * Math.PI * 2));
  return out;
}

function fitToRadius(points: Point2[], radius: number): Point2[] {
  const max = Math.max(...points.map(([x, y]) => Math.hypot(x, y)));
  const k = max > 0 ? radius / max : 0;
  return points.map(([x, y]) => [x * k, y * k] as Point2);
}

/** Normalised among-us outline (fits the unit circle): body, visor bump, backpack. */
const AMONG_US: Point2[] = [
  [-0.45, -0.95], [-0.15, -0.95], [-0.15, -0.6], [0.15, -0.6], [0.15, -0.95], [0.45, -0.95],
  [0.5, -0.2], [0.75, -0.05], [0.8, 0.25], [0.6, 0.4], [0.5, 0.45], [0.45, 0.75], [0.2, 0.95],
  [-0.2, 0.95], [-0.45, 0.75], [-0.5, 0.45], [-0.75, 0.4], [-0.75, -0.2], [-0.5, -0.25],
];

/**
 * The outline of `shape` at `radius`, as an ordered list of points in the horizontal plane around
 * (0, 0). Drawn as a closed loop (last point connects back to the first). Every point lies within
 * `radius` of the centre.
 */
export function shapeOutline(shape: MarkerShape, radius: number, segments: number): Point2[] {
  switch (shape) {
    case "triangle":
      return regular(3, radius, 90);
    case "square":
      return regular(4, radius, 45);
    case "diamond":
      return regular(4, radius, 0);
    case "pentagon":
      return regular(5, radius, 90);
    case "hexagon":
      return regular(6, radius, 0);
    case "star": {
      const outer = regular(5, radius, 90);
      const inner = regular(5, radius * 0.4, 90 + 36);
      const out: Point2[] = [];
      for (let i = 0; i < 5; i++) out.push(outer[i], inner[i]);
      return out;
    }
    case "heart":
      // The classic parametric heart, re-centred and scaled so its furthest point sits on the radius.
      return fitToRadius(
        sampled(segments, (t) => {
          const x = 16 * Math.sin(t) ** 3;
          const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
          return [x, y + 2.5];
        }),
        radius,
      );
    case "jelly_bean":
      // A kidney-ish bean: an ellipse whose middle is pinched on one side.
      return sampled(segments, (t) => {
        const x = Math.cos(t);
        const y = 0.55 * Math.sin(t) + 0.22 * (1 - Math.cos(2 * t)) - 0.22;
        return [x * radius * 0.95, y * radius * 0.95];
      });
    case "among_us":
      return AMONG_US.map(([x, y]) => [x * radius * 0.9, y * radius * 0.9] as Point2);
    case "circle":
    default:
      return sampled(segments, (t) => [radius * Math.cos(t), radius * Math.sin(t)]);
  }
}
