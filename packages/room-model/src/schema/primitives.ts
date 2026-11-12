import * as z from 'zod';

/** A point in plan view: `[x, z]` in meters. */
export const Vec2Schema = z.tuple([z.number(), z.number()]);
export type Vec2 = z.infer<typeof Vec2Schema>;

/** A point in space: `[x, y, z]` in meters. Right-handed, +Y up. */
export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof Vec3Schema>;

/** A rotation quaternion: `[x, y, z, w]`. */
export const QuatSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type Quat = z.infer<typeof QuatSchema>;

/** A 4x4 matrix as 16 numbers in column-major order (same layout as three.js and ARKit). */
export const Mat4Schema = z.array(z.number()).length(16);
export type Mat4 = z.infer<typeof Mat4Schema>;

/** Element identifier. RoomPlan UUIDs for scans; any short string for hand-made models. */
export const IdSchema = z.string().min(1).max(64);

/**
 * Gravity-aligned placement.
 * `position` is the center of the element's bounding box.
 * `yaw` is a right-handed rotation about +Y in radians, identical to three.js `rotation.y`:
 * the element's local +X axis points along `[cos(yaw), 0, -sin(yaw)]`.
 */
export const TransformSchema = z.object({
  position: Vec3Schema,
  yaw: z.number(),
});
export type Transform = z.infer<typeof TransformSchema>;

/** Size along the element's local X (width), Y (height) and Z (depth) axes, in meters. */
export const DimensionsSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  depth: z.number().nonnegative(),
});
export type Dimensions = z.infer<typeof DimensionsSchema>;

export const ConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type Confidence = z.infer<typeof ConfidenceSchema>;
