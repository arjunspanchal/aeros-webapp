// LIFESTYLE SCENES for the 3D view - "set scenes where, using arithmetic, we just change the product" (Arjun 21-Nov-2026).
// The BACKGROUND of each scene is an empty plate made once in Higgsfield (no product, no people, no text). The PRODUCT is
// never generated: it is the tool's own measured 3D model, drawn with a camera that matches the plate and laid over it.
//   fov    vertical field of view of the plate's camera, degrees (a 50 mm lens on a 16 : 9 frame = 22.9)
//   pitch  how far the camera looks down, degrees
//   anchor where the product stands on the surface, as a fraction of the picture height from the top
//   fill   how tall the product stands in the view at "Size in scene" 1 (a plate has no ruler in it, so the camera's
//          height above the surface is worked out from the product; the plate's perspective is kept exactly)
//   light  where the key light comes from, as seen from the camera: [right, up, towards the camera]
// Calibrated once by eye from each plate (far edge of the surface: cafe 0.585, marble 0.645, slate 0.565 of the height).
export const SCENES = [
  { key: "plain", label: "Plain" },
  { key: "studio", label: "Studio floor with shadow" },
  { key: "cafe", label: "Cafe counter (light wood)", src: "/house/scenes/cafe.jpg", aspect: 1920 / 1074, fov: 22.9, pitch: 15, anchor: 0.8, fill: 0.36, light: [-1.2, 1.4, 0.9], shadow: 0.3 },
  { key: "marble", label: "Marble table (bright)", src: "/house/scenes/marble.jpg", aspect: 1920 / 1074, fov: 22.9, pitch: 15, anchor: 0.84, fill: 0.36, light: [-1.2, 1.5, 0.8], shadow: 0.22 },
  { key: "slate", label: "Dark slate (moody)", src: "/house/scenes/slate.jpg", aspect: 1920 / 1074, fov: 22.9, pitch: 15, anchor: 0.8, fill: 0.36, light: [-1.3, 1.2, 0.9], shadow: 0.45 },
];
export const sceneOf = (key) => SCENES.find((s) => s.key === key) || SCENES[0];
