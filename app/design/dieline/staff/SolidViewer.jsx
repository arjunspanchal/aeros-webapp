"use client";
// 3D view of the FOLDED DIE: each panel is the exact die polygon, extruded to the board's caliper, placed by the fold
// engine (lib/dieline/solid). 1 unit = 1 mm. Exports STL / OBJ in mm for Fusion 360 / SolidWorks.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { sceneOf } from "@/lib/dieline/designer/scenes";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

// die frame (x right, y down, z into the box) -> three (y up): (x, -y, -z) is a proper rotation, no mirror
// Bags stand up (the die's top is the bag's top): (x, -y, -z). Boxes lie on their base (the die plane is the table, the
// box rises out of it): (x, z, -y). Both are proper rotations (determinant +1), so nothing is ever mirrored.
let LIE_FLAT = false;
const P = (p) => (LIE_FLAT ? new THREE.Vector3(p[0], p[2], -p[1]) : new THREE.Vector3(p[0], -p[1], -p[2]));

function panelGeometry(w, outline2d, holes2d, blank) {
  const tris = THREE.ShapeUtils.triangulateShape(outline2d.map(([x, y]) => new THREE.Vector2(x, y)), holes2d.map((h) => h.map(([x, y]) => new THREE.Vector2(x, y))));
  const inner = [...w.inner, ...w.holes.flatMap((h) => h.inner)], outer = [...w.outer, ...w.holes.flatMap((h) => h.outer)];
  const pos = [], groupsIn = [], groupsOut = [], side = [], uvOut = [];
  const pts2d = [...outline2d, ...holes2d.flat()];
  const uv = (k) => (blank ? [pts2d[k][0] / blank.w, 1 - pts2d[k][1] / blank.h] : [0, 0]);
  const push = (arr, a, b, c) => arr.push(...P(a).toArray(), ...P(b).toArray(), ...P(c).toArray());
  for (const [a, b, c] of tris) { push(groupsIn, inner[a], inner[c], inner[b]); push(groupsOut, outer[a], outer[b], outer[c]); uvOut.push(...uv(a), ...uv(b), ...uv(c)); }
  const ring = (I, O) => { for (let k = 0; k < I.length; k++) { const n = (k + 1) % I.length; push(side, I[k], I[n], O[n]); push(side, I[k], O[n], O[k]); } };
  ring(w.inner, w.outer);
  for (const h of w.holes) ring(h.inner, h.outer);
  pos.push(...groupsOut, ...groupsIn, ...side);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute([...uvOut, ...new Array(((groupsIn.length + side.length) / 3) * 2).fill(0)], 2));
  g.addGroup(0, groupsOut.length / 3, 0);
  g.addGroup(groupsOut.length / 3, groupsIn.length / 3, 1);
  g.addGroup((groupsOut.length + groupsIn.length) / 3, side.length / 3, 2);
  g.computeVertexNormals();
  return g;
}

// THE FORMED CUP from its fan. A point of the fan at (radius R, angle a about the cone centre) lands on the cone at
// 3D radius R * sinB (sinB = wrap angle / 2pi) and height (R - Rfold) * cosB above the bottom fold; texture coordinates
// are the fan itself, so artwork sits on the cup exactly where it sits on the die. What is exact (from the KLD lines):
// the wall between the bottom fold and the rim line - diameters, height, taper. What is derived: wall thickness = the
// board caliper; the bottom strip (bottom cut .. bottom fold) turned up inside the wall; the base disc on top of that
// strip; the rolled rim as a tube whose size makes the finished rim equal the KLD's TD.
// asWrap: the piece is a double-wall OUTER WRAP standing round an inner cup - the fan's radius is its INSIDE skin (it
// sits on the cup), so the printed skin is one caliper further out and the hem turns up between wrap and cup.
function cupMeshes(g, blank, mats, caliper = 0.3, asWrap = false) {
  const out = [], nA = 144, nR = 32, t = caliper;
  // mirror = a fan radius the strip is folded about: the picture on it is then taken from the fan BELOW the fold
  const wall = (rIn, rOut, shrink, uv, yOf = (R) => (R - g.rFold) * g.cosB, mirror = null) => {
    const pos = [], uvs = [], idx = [];
    for (let j = 0; j <= nR; j++) for (let i = 0; i <= nA; i++) {
      const a = g.aLeft + (g.wrap * i) / nA, R = rIn + ((rOut - rIn) * j) / nR, psi = 2 * Math.PI * (i / nA - 0.5);
      const r3 = R * g.sinB - shrink, y = yOf(R);
      pos.push(r3 * Math.sin(psi), y, r3 * Math.cos(psi));
      const Rf = mirror == null ? R : 2 * mirror - R, fx = g.cx + Rf * Math.sin(a), fy = g.cy - Rf * Math.cos(a);
      uvs.push(uv ? fx / blank.w : 0, uv ? 1 - fy / blank.h : 0);
    }
    for (let j = 0; j < nR; j++) for (let i = 0; i < nA; i++) { const a = j * (nA + 1) + i, b = a + 1, c = a + nA + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  };
  const skirt = g.rFold - g.rBot; // the strip below the fold: it turns up inside and grips the base disc
  out.push(new THREE.Mesh(wall(g.rFold, g.rRim, asWrap ? -t : 0, true), mats[0])); // printed outside, bottom fold .. rim line
  out.push(new THREE.Mesh(wall(g.rFold, g.rRim, asWrap ? 0 : t, false), mats[1])); // inside skin, one caliper in
  // bottom strip / hem folded up inside. It carries its own print: the strip of the fan below the fold (bottom cut .. fold),
  // which is where the Aeros mark sits - on a single-wall cup it reads from underneath, in the foot recess (Arjun 21-Nov-2026)
  out.push(new THREE.Mesh(wall(g.rFold, g.rFold + skirt, asWrap ? t : 3 * t, true, undefined, g.rFold), mats[0]));
  const yBase = skirt * g.cosB, rBase = (g.rFold + skirt) * g.sinB - t;
  if (g.hasRim) { const base = new THREE.Mesh(new THREE.CircleGeometry(rBase, 96), mats[1]); base.rotation.x = -Math.PI / 2; base.position.y = yBase; out.push(base); } // a double-wall wrap has no base of its own
  const foot = new THREE.Mesh(new THREE.RingGeometry(g.rFold * g.sinB - 3 * t, g.rFold * g.sinB, 96), mats[2]); foot.rotation.x = Math.PI / 2; out.push(foot); // the fold the cup stands on
  const yRim = (g.rRim - g.rFold) * g.cosB, rBody = g.rRim * g.sinB, tube = Math.max(0.6, (g.spec.TD - 2 * rBody) / 4);
  if (g.hasRim) { const rim = new THREE.Mesh(new THREE.TorusGeometry(rBody + tube, tube, 16, 144), mats[1]); rim.rotation.x = Math.PI / 2; rim.position.y = yRim; out.push(rim); } // the wrap ends at its top cut
  return out;
}

// how far above the inner cup's bottom fold the wrap's hem fold sits: the wrap's top edge tucks under the rolled rim
// (one rim-tube radius below the rim line)
export function wrapLift(wrap, inner) {
  const tube = Math.max(0.6, (inner.spec.TD - inner.formed.rimDia) / 4);
  return inner.formed.wallHeight - tube - wrap.formed.wallHeight;
}

const SolidViewer = forwardRef(function SolidViewer({ model, colours, texture, blank, cone, coneInner = null, pet = null, caliper, lieFlat = false, background = "#f3f4f6", scene: sceneKind = "plain", sceneScale = 1 }, ref) {
  const host = useRef(null), st = useRef({});

  useEffect(() => {
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f3f4f6");
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    // STUDIO LIGHT (Arjun 21-Nov-2026: "it is too dark"). Light from all round so no face falls into shadow, a key light
    // for shape, a fill from the other side, and a lamp that travels with the camera so whatever is turned towards you is
    // lit. No tone mapping: a printed colour is shown as it is, not graded. Intensities are in three's physical units
    // (a surface shows albedo x intensity / pi per light), sized so white board facing you reads as white, not grey.
    renderer.toneMapping = THREE.NoToneMapping;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe2e2e2, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(400, 700, 500);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(-500, 250, -400);
    scene.add(fill);
    const lamp = new THREE.DirectionalLight(0xffffff, 0.6); // head lamp: sits on the camera, points where it looks
    lamp.position.set(0, 0, 1);
    camera.add(lamp);
    scene.add(camera);
    // the model hangs on a pivot at the centre of the view, so it can be turned on the spot (lifestyle scenes, turntable)
    const pivot = new THREE.Group(), group = new THREE.Group();
    pivot.add(group); scene.add(pivot);
    // in a lifestyle scene the camera is fixed to the plate: a sideways drag turns the PRODUCT instead of the view
    let dragX = null;
    const pd = (e) => { if (st.current.plate) dragX = e.clientX; }, pu = () => { dragX = null; };
    const pm = (e) => { if (st.current.plate && dragX != null) { pivot.rotation.y += (e.clientX - dragX) * 0.012; dragX = e.clientX; } };
    renderer.domElement.addEventListener("pointerdown", pd); window.addEventListener("pointermove", pm); window.addEventListener("pointerup", pu);
    // full screen: the 3D panel (its buttons included) fills the screen and the view takes all the height that is left
    const size = () => { setTimeout(() => st.current.applyPlate?.(), 0); const fs = !!document.fullscreenElement && document.fullscreenElement.contains(el), w = el.clientWidth, h = fs ? Math.max(320, window.innerHeight - 190) : Math.max(320, Math.round(w * 0.62)); renderer.setSize(w, h, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = `${h}px`; renderer.domElement.style.display = "block"; camera.aspect = w / h; camera.updateProjectionMatrix(); };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    document.addEventListener("fullscreenchange", size); window.addEventListener("resize", size);
    // STUDIO SET: a floor that only shows the model's shadow, so the product stands on something on any background colour
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.radius = 6;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.22 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.visible = false; scene.add(floor);
    // + a soft contact shadow right under the model (the cast shadow of a low box falls behind it, out of sight)
    const bc = document.createElement("canvas"); bc.width = bc.height = 256;
    const bg2 = bc.getContext("2d"), grad = bg2.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, "rgba(0,0,0,0.42)"); grad.addColorStop(0.55, "rgba(0,0,0,0.16)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    bg2.fillStyle = grad; bg2.fillRect(0, 0, 256, 256);
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.visible = false; scene.add(blob);
    let raf;
    const loop = () => { if (!st.current.plate) controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); }; // a scene's camera is fixed to its plate
    loop();
    st.current = { renderer, scene, camera, controls, group, framed: false, sun, floor, blob, pivot, plates: {} };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("fullscreenchange", size); window.removeEventListener("resize", size); window.removeEventListener("pointermove", pm); window.removeEventListener("pointerup", pu); controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);

  useEffect(() => { if (st.current.scene && !st.current.plate) st.current.scene.background = new THREE.Color(background); }, [background]);
  useEffect(() => {
    const s = st.current;
    if (!s.group || (!cone && !pet && (!model || !model.world))) return;
    for (const c of [...s.group.children]) { s.group.remove(c); c.geometry?.dispose(); }
    s.tex?.dispose();
    s.tex = null;
    let texSrc = texture;
    if (texture && pet) { // on a clear cup, white in the artwork is NO INK (as the vendor sheet says): it is left clear, not painted white
      texSrc = document.createElement("canvas"); texSrc.width = texture.width; texSrc.height = texture.height;
      const g2 = texSrc.getContext("2d"); g2.drawImage(texture, 0, 0);
      const im = g2.getImageData(0, 0, texSrc.width, texSrc.height), px = im.data;
      for (let i = 0; i < px.length; i += 4) if (px[i] > 244 && px[i + 1] > 244 && px[i + 2] > 244) px[i + 3] = 0;
      g2.putImageData(im, 0, 0);
    }
    if (texture) { s.tex = new THREE.CanvasTexture(texSrc); s.tex.colorSpace = THREE.SRGBColorSpace; s.tex.anisotropy = 8; }
    const mats = [
      new THREE.MeshStandardMaterial({ color: s.tex ? "#ffffff" : colours?.top || "#f4f2ec", map: s.tex, roughness: 0.85, side: THREE.DoubleSide }), // printed outside
      new THREE.MeshStandardMaterial({ color: colours?.back || "#e8e4da", roughness: 0.9, side: THREE.DoubleSide }), // inside
      new THREE.MeshStandardMaterial({ color: "#c9c3b5", roughness: 0.9, side: THREE.DoubleSide }), // cut edges
    ];
    LIE_FLAT = !!lieFlat && !cone;
    if (pet) {
      // PET CUP: the moulded cup turned from its measured profile (clear), with the print band wrapped a full 360 deg.
      // The artwork rectangle is stretched round the cup at every height, as the printer's cone distortion does.
      // PET AS A MATERIAL (Arjun 21-Nov-2026: "improve the PET material"): clear plastic that lets the scene through and
      // bends it (PET's refractive index 1.57), a glossy skin that picks up a soft studio reflection, a faint cool tint
      // where the wall is seen edge-on, a rolled rim and a heavier base. The reflection map is used by the PET only -
      // paper and board stay lit as before, so a printed colour is still shown as it is.
      if (!s.env) { const pm = new THREE.PMREMGenerator(s.renderer); s.env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); }
      const clear = (extra = {}) => new THREE.MeshPhysicalMaterial({ color: "#ffffff", transmission: 1, ior: 1.57, thickness: 0.5, roughness: 0.03, metalness: 0, envMap: s.env, envMapIntensity: 0.85,
        clearcoat: 0.5, clearcoatRoughness: 0.04, attenuationColor: new THREE.Color("#d5e9f0"), attenuationDistance: 22, side: THREE.DoubleSide, ...extra });
      const body = new THREE.Mesh(new THREE.LatheGeometry(pet.profile.map(([d, z]) => new THREE.Vector2(d / 2, z)), 160), clear());
      const floor = new THREE.Mesh(new THREE.CircleGeometry(pet.profile[0][0] / 2, 96), clear({ thickness: 1.4, roughness: 0.07 })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.05; // the base is the thickest part of the cup
      const rim = new THREE.Mesh(new THREE.TorusGeometry(pet.td / 2, 1.15, 16, 160), clear({ thickness: 2.3, attenuationDistance: 10 })); rim.rotation.x = Math.PI / 2; rim.position.y = pet.h; // rolled rim
      s.group.add(body, floor, rim);
      if (s.tex) {
        const nA = 192, nZ = 32, pos = [], uvs = [], idx = [];
        for (let j = 0; j <= nZ; j++) for (let i = 0; i <= nA; i++) {
          const z = pet.zFoot + ((pet.zTop - pet.zFoot) * j) / nZ, r = pet.diaAt(z) / 2 + 0.06, psi = 2 * Math.PI * (i / nA - 0.5);
          pos.push(r * Math.sin(psi), z, r * Math.cos(psi)); uvs.push(i / nA, j / nZ);
        }
        for (let j = 0; j < nZ; j++) for (let i = 0; i < nA; i++) { const a = j * (nA + 1) + i, b = a + 1, c = a + nA + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
        const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
        s.group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: s.tex, alphaTest: 0.5, alphaToCoverage: true, roughness: 0.38, envMap: s.env, envMapIntensity: 0.25, side: THREE.DoubleSide }))); // dry-offset ink: solid, with a slight sheen
      }
    } else if (cone && coneInner) {
      // FULL DOUBLE-WALL CUP: the plain inner cup stands on its bottom fold; the wrap hangs just under its rolled rim
      const white = [0, 1, 2].map((k) => new THREE.MeshStandardMaterial({ color: k === 2 ? "#d9d6cc" : "#f6f5f0", roughness: 0.85, side: THREE.DoubleSide }));
      for (const m of cupMeshes(coneInner, blank, white, caliper)) s.group.add(m);
      const lift = wrapLift(cone, coneInner);
      for (const m of cupMeshes(cone, blank, mats, caliper, true)) { m.position.y += lift; s.group.add(m); }
    } else if (cone) for (const m of cupMeshes(cone, blank, mats, caliper, !cone.hasRim)) s.group.add(m);
    const panels = cone || pet ? [] : model.geom.panels;
    for (const w of cone || pet ? [] : model.world) {
      const P0 = panels[w.panel];
      const g = panelGeometry(w, P0.outline, P0.holes, texture ? blank : null);
      const mesh = new THREE.Mesh(g, mats);
      s.group.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: "#6b6b6b" }));
      s.group.add(edges);
    }
    // centre the model; frame the camera once per template/size
    const turn = s.pivot.rotation.y; s.pivot.rotation.y = 0; // measured square to the axes, whatever way it is turned now
    s.group.position.set(0, 0, 0);
    s.pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s.group), c = box.getCenter(new THREE.Vector3()), d = box.getSize(new THREE.Vector3()).length();
    s.group.position.set(-c.x, -c.y, -c.z);
    // studio floor under the model + the key light's shadow sized to it
    s.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const sz = box.getSize(new THREE.Vector3());
    const plate = sceneOf(sceneKind).src ? sceneOf(sceneKind) : null;
    s.pivot.rotation.y = plate ? turn : 0;
    s.floor.visible = sceneKind === "studio" || !!plate; s.floor.scale.set(d * 6, d * 6, 1); s.floor.position.set(0, -sz.y / 2 - 0.05, 0);
    s.blob.visible = sceneKind === "studio" || !!plate; s.blob.material.opacity = (plate ? Math.min(1, plate.shadow / 0.3) : 1) * (pet ? 0.45 : 1); s.floor.material.opacity = pet ? 0.1 : 0.22; // a clear cup throws a light shadow s.blob.scale.set(sz.x * 1.7, sz.z * 1.7, 1); s.blob.position.set(0, -sz.y / 2 - 0.03, 0);
    s.sun.position.set(d * (plate ? plate.light[0] : 0.5), d * (plate ? plate.light[1] : 1.3), d * (plate ? plate.light[2] : 0.8)); const sc = s.sun.shadow.camera; sc.left = -d; sc.right = d; sc.top = d; sc.bottom = -d; sc.near = 0.1; sc.far = d * 5; sc.updateProjectionMatrix();
    // LIFESTYLE SCENE: the plate is the background; the camera is put where the plate's own camera was, so the product
    // stands on the plate's surface in the plate's perspective. On a wider or narrower view the plate is cropped to fit
    // and the camera's angle of view follows the crop, so the product never slides off the surface.
    s.plate = plate; s.controls.enabled = !plate;
    s.applyPlate = !plate ? null : () => {
      const el2 = s.renderer.domElement, Ac = el2.clientWidth / Math.max(1, el2.clientHeight), tex = s.plates[plate.key];
      const v = Math.min(1, plate.aspect / Ac), u = Math.min(1, Ac / plate.aspect); // share of the plate's height / width that shows
      if (tex) { tex.repeat.set(u, v); tex.offset.set((1 - u) / 2, (1 - v) / 2); }
      const half = Math.tan((plate.fov * Math.PI) / 360) * v, anchor = (plate.anchor - (1 - v) / 2) / v, p = (plate.pitch * Math.PI) / 180;
      // the plate has no ruler in it, so the camera's height is set from the product: it stands (plate.fill) of the view
      // tall at "Size in scene" 1. Moving the camera along its own ray keeps the plate's perspective exactly.
      const ray = p + Math.atan((anchor - 0.5) * 2 * half), big = Math.max(sz.y, 0.75 * Math.max(sz.x, sz.z) / Math.max(0.6, Ac / 1.6));
      const H = (big * Math.sin(ray)) / (2 * half * (plate.fill || 0.36)) / Math.max(0.3, sceneScale), g = H / Math.tan(ray), yb = -sz.y / 2;
      s.camera.fov = (Math.atan(half) * 360) / Math.PI; s.camera.near = 5; s.camera.far = 20000; s.camera.aspect = Ac;
      s.camera.position.set(0, yb + H, g); s.camera.lookAt(0, yb + H - Math.sin(p) * 1000, g - Math.cos(p) * 1000); s.camera.updateProjectionMatrix();
    };
    if (plate) {
      if (!s.plates[plate.key]) { const tex = new THREE.TextureLoader().load(plate.src, () => s.applyPlate?.()); tex.colorSpace = THREE.SRGBColorSpace; s.plates[plate.key] = tex; }
      s.scene.background = s.plates[plate.key]; s.applyPlate(); s.framed = false;
    } else if (s.scene.background && s.scene.background.isTexture) { s.scene.background = new THREE.Color(background); s.camera.fov = 35; s.camera.updateProjectionMatrix(); s.framed = false; }
    const key = pet ? `pet-${pet.id}` : cone ? `cup-${cone.id}-${coneInner ? "full" : "alone"}` : model.key;
    if (!plate && (!s.framed || s.lastKey !== key)) {
      s.camera.position.set(d * 1.1, d * 0.7, d * 1.5);
      s.controls.target.set(0, 0, 0);
      s.camera.near = d / 100; s.camera.far = d * 20; s.camera.updateProjectionMatrix();
      s.framed = true; s.lastKey = key;
    }
  }, [model, colours, texture, blank, cone, coneInner, pet, caliper, lieFlat, sceneKind, sceneScale]);

  useImperativeHandle(ref, () => ({
    exportStl() { return new STLExporter().parse(st.current.group, { binary: false }); },
    exportObj() { return new OBJExporter().parse(st.current.group); },
    // TURNTABLE: the camera goes once round the model at its present height and distance. spinStart() notes where it is,
    // spinTo(0..1) puts it that fraction of a turn further round and draws the frame, spinEnd() hands the view back.
    canvas() { return st.current.renderer.domElement; },
    spinStart(targetW = 1920) { // the view is drawn sharper while it is recorded (about targetW pixels wide), then put back
      const { camera, controls, renderer } = st.current, o = camera.position.clone().sub(controls.target), cssW = host.current.clientWidth || 640;
      controls.enabled = false; st.current.spin0 = { r: Math.hypot(o.x, o.z), y: o.y, a: Math.atan2(o.x, o.z), pr: renderer.getPixelRatio() };
      renderer.setPixelRatio(Math.max(1, Math.min(4, targetW / cssW)));
    },
    spinTo(frac) { const { camera, controls, renderer, scene, spin0: s0 } = st.current, a = s0.a + frac * 2 * Math.PI;
      if (st.current.plate) { if (s0.turn == null) s0.turn = st.current.pivot.rotation.y; st.current.pivot.rotation.y = s0.turn + frac * 2 * Math.PI; renderer.render(scene, camera); return; } // in a scene the product turns, the camera stays
      camera.position.set(controls.target.x + s0.r * Math.sin(a), controls.target.y + s0.y, controls.target.z + s0.r * Math.cos(a)); camera.lookAt(controls.target); renderer.render(scene, camera); },
    spinEnd() { const { controls, renderer, spin0 } = st.current; renderer.setPixelRatio(spin0.pr); this.spinTo(0); controls.enabled = !st.current.plate; if (!st.current.plate) controls.update(); st.current.applyPlate?.(); },
    // standard views, as in a CAD program: the camera goes straight onto that side, same distance, looking at the model's centre
    view(name) {
      if (st.current.plate) { st.current.pivot.rotation.y = { front: 0, back: Math.PI, left: Math.PI / 2, right: -Math.PI / 2, iso: -Math.PI / 5 }[name] ?? st.current.pivot.rotation.y; return; } // a scene's camera is fixed: turn the product
      const { camera, controls } = st.current, r = camera.position.distanceTo(controls.target) || 500;
      const dir = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0.0005], bottom: [0, -1, 0.0005], iso: [0.55, 0.35, 0.75], under: [0.5, -0.62, 0.6] }[name] || [0.55, 0.35, 0.75], l = Math.hypot(...dir);
      controls.target.set(0, 0, 0); camera.position.set((dir[0] / l) * r, (dir[1] / l) * r, (dir[2] / l) * r); camera.lookAt(0, 0, 0); controls.update();
    },
    // the view exactly as it is turned now; scale > 1 re-renders it sharper (proof shots)
    snapshot(scale = 1) {
      const { renderer, scene, camera } = st.current;
      if (scale <= 1) return renderer.domElement.toDataURL("image/png");
      const pr = renderer.getPixelRatio();
      renderer.setPixelRatio(Math.min(4, pr * scale)); renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL("image/png");
      renderer.setPixelRatio(pr); renderer.render(scene, camera);
      return url;
    },
  }));

  return <div ref={host} className="w-full overflow-hidden rounded-md" />;
});

export default SolidViewer;
