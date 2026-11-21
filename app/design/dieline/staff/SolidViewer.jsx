"use client";
// 3D view of the FOLDED DIE: each panel is the exact die polygon, extruded to the board's caliper, placed by the fold
// engine (lib/dieline/solid). 1 unit = 1 mm. Exports STL / OBJ in mm for Fusion 360 / SolidWorks.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";

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
  const wall = (rIn, rOut, shrink, uv, yOf = (R) => (R - g.rFold) * g.cosB) => {
    const pos = [], uvs = [], idx = [];
    for (let j = 0; j <= nR; j++) for (let i = 0; i <= nA; i++) {
      const a = g.aLeft + (g.wrap * i) / nA, R = rIn + ((rOut - rIn) * j) / nR, psi = 2 * Math.PI * (i / nA - 0.5);
      const r3 = R * g.sinB - shrink, y = yOf(R);
      pos.push(r3 * Math.sin(psi), y, r3 * Math.cos(psi));
      const fx = g.cx + R * Math.sin(a), fy = g.cy - R * Math.cos(a);
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
  out.push(new THREE.Mesh(wall(g.rFold, g.rFold + skirt, asWrap ? t : 3 * t, false), mats[1])); // bottom strip / hem folded up inside
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

const SolidViewer = forwardRef(function SolidViewer({ model, colours, texture, blank, cone, coneInner = null, pet = null, caliper, lieFlat = false, background = "#f3f4f6", scene: sceneKind = "plain" }, ref) {
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
    const group = new THREE.Group();
    scene.add(group);
    // full screen: the 3D panel (its buttons included) fills the screen and the view takes all the height that is left
    const size = () => { const fs = !!document.fullscreenElement && document.fullscreenElement.contains(el), w = el.clientWidth, h = fs ? Math.max(320, window.innerHeight - 190) : Math.max(320, Math.round(w * 0.62)); renderer.setSize(w, h, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = `${h}px`; renderer.domElement.style.display = "block"; camera.aspect = w / h; camera.updateProjectionMatrix(); };
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
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    st.current = { renderer, scene, camera, controls, group, framed: false, sun, floor, blob };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("fullscreenchange", size); window.removeEventListener("resize", size); controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);

  useEffect(() => { if (st.current.scene) st.current.scene.background = new THREE.Color(background); }, [background]);
  useEffect(() => {
    const s = st.current;
    if (!s.group || (!cone && !pet && (!model || !model.world))) return;
    for (const c of [...s.group.children]) { s.group.remove(c); c.geometry?.dispose(); }
    s.tex?.dispose();
    s.tex = null;
    if (texture) { s.tex = new THREE.CanvasTexture(texture); s.tex.colorSpace = THREE.SRGBColorSpace; s.tex.anisotropy = 8; }
    const mats = [
      new THREE.MeshStandardMaterial({ color: s.tex ? "#ffffff" : colours?.top || "#f4f2ec", map: s.tex, roughness: 0.85, side: THREE.DoubleSide }), // printed outside
      new THREE.MeshStandardMaterial({ color: colours?.back || "#e8e4da", roughness: 0.9, side: THREE.DoubleSide }), // inside
      new THREE.MeshStandardMaterial({ color: "#c9c3b5", roughness: 0.9, side: THREE.DoubleSide }), // cut edges
    ];
    LIE_FLAT = !!lieFlat && !cone;
    if (pet) {
      // PET CUP: the moulded cup turned from its measured profile (clear), with the print band wrapped a full 360 deg.
      // The artwork rectangle is stretched round the cup at every height, as the printer's cone distortion does.
      const body = new THREE.Mesh(new THREE.LatheGeometry(pet.profile.map(([d, z]) => new THREE.Vector2(d / 2, z)), 128),
        new THREE.MeshStandardMaterial({ color: "#cfe3ee", transparent: true, opacity: 0.3, roughness: 0.08, metalness: 0, side: THREE.DoubleSide, depthWrite: false }));
      const floor = new THREE.Mesh(new THREE.CircleGeometry(pet.profile[0][0] / 2, 96), body.material); floor.rotation.x = -Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(pet.td / 2, 0.9, 12, 128), new THREE.MeshStandardMaterial({ color: "#dbe9f1", transparent: true, opacity: 0.55, roughness: 0.1 })); rim.rotation.x = Math.PI / 2; rim.position.y = pet.h;
      s.group.add(body, floor, rim);
      if (s.tex) {
        const nA = 192, nZ = 32, pos = [], uvs = [], idx = [];
        for (let j = 0; j <= nZ; j++) for (let i = 0; i <= nA; i++) {
          const z = pet.zFoot + ((pet.zTop - pet.zFoot) * j) / nZ, r = pet.diaAt(z) / 2 + 0.06, psi = 2 * Math.PI * (i / nA - 0.5);
          pos.push(r * Math.sin(psi), z, r * Math.cos(psi)); uvs.push(i / nA, j / nZ);
        }
        for (let j = 0; j < nZ; j++) for (let i = 0; i < nA; i++) { const a = j * (nA + 1) + i, b = a + 1, c = a + nA + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
        const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
        s.group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: s.tex, transparent: true, alphaTest: 0.03, roughness: 0.6, side: THREE.DoubleSide })));
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
    s.group.position.set(0, 0, 0);
    s.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s.group), c = box.getCenter(new THREE.Vector3()), d = box.getSize(new THREE.Vector3()).length();
    s.group.position.set(-c.x, -c.y, -c.z);
    // studio floor under the model + the key light's shadow sized to it
    s.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const sz = box.getSize(new THREE.Vector3());
    s.floor.visible = sceneKind === "studio"; s.floor.scale.set(d * 6, d * 6, 1); s.floor.position.set(0, -sz.y / 2 - 0.05, 0);
    s.blob.visible = sceneKind === "studio"; s.blob.scale.set(sz.x * 1.7, sz.z * 1.7, 1); s.blob.position.set(0, -sz.y / 2 - 0.03, 0);
    s.sun.position.set(d * 0.5, d * 1.3, d * 0.8); const sc = s.sun.shadow.camera; sc.left = -d; sc.right = d; sc.top = d; sc.bottom = -d; sc.near = 0.1; sc.far = d * 5; sc.updateProjectionMatrix();
    const key = pet ? `pet-${pet.id}` : cone ? `cup-${cone.id}-${coneInner ? "full" : "alone"}` : model.key;
    if (!s.framed || s.lastKey !== key) {
      s.camera.position.set(d * 1.1, d * 0.7, d * 1.5);
      s.controls.target.set(0, 0, 0);
      s.camera.near = d / 100; s.camera.far = d * 20; s.camera.updateProjectionMatrix();
      s.framed = true; s.lastKey = key;
    }
  }, [model, colours, texture, blank, cone, coneInner, pet, caliper, lieFlat, sceneKind]);

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
    spinTo(frac) { const { camera, controls, renderer, scene, spin0: s0 } = st.current, a = s0.a + frac * 2 * Math.PI; camera.position.set(controls.target.x + s0.r * Math.sin(a), controls.target.y + s0.y, controls.target.z + s0.r * Math.cos(a)); camera.lookAt(controls.target); renderer.render(scene, camera); },
    spinEnd() { const { controls, renderer, spin0 } = st.current; renderer.setPixelRatio(spin0.pr); this.spinTo(0); controls.enabled = true; controls.update(); },
    // standard views, as in a CAD program: the camera goes straight onto that side, same distance, looking at the model's centre
    view(name) {
      const { camera, controls } = st.current, r = camera.position.distanceTo(controls.target) || 500;
      const dir = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0.0005], bottom: [0, -1, 0.0005], iso: [0.55, 0.35, 0.75] }[name] || [0.55, 0.35, 0.75], l = Math.hypot(...dir);
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
