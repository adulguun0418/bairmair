// RoomModel v1: schema and types
export * from './schema/primitives';
export * from './schema/model';

// Geometry shared by the 3D viewer, the floor plan, and the converter
export * from './geometry/polygon';
export * from './geometry/wall';
export * from './geometry/layout';

// 2D floor plan as an SVG string
export * from './floorplan/render';

// Areas and user annotations
export * from './metrics';
export * from './annotations';

// RoomPlan export -> RoomModel
export * from './roomplan/capture';
export * from './roomplan/convert';
