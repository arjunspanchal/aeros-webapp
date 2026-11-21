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
function cupMeshes(g, blank, mats, caliper = 0.3) {
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
  out.push(new THREE.Mesh(wall(g.rFold, g.rRim, 0, true), mats[0])); // printed outside, bottom fold .. rim line
  out.push(new THREE.Mesh(wall(g.rFold, g.rRim, t, false), mats[1])); // inside skin, one caliper in
  out.push(new THREE.Mesh(wall(g.rFold, g.rFold + skirt, 3 * t, false), mats[1])); // bottom strip folded up inside (wall + base skirt between)
  const yBase = skirt * g.cosB, rBase = (g.rFold + skirt) * g.sinB - t;
  if (g.hasRim) { const base = new THREE.Mesh(new THREE.CircleGeometry(rBase, 96), mats[1]); base.rotation.x = -Math.PI / 2; base.position.y = yBase; out.push(base); } // a double-wall wrap has no base of its own
  const foot = new THREE.Mesh(new THREE.RingGeometry(g.rFold * g.sinB - 3 * t, g.rFold * g.sinB, 96), mats[2]); foot.rotation.x = Math.PI / 2; out.push(foot); // the fold the cup stands on
  const yRim = (g.rRim - g.rFold) * g.cosB, rBody = g.rRim * g.sinB, tube = Math.max(0.6, (g.spec.TD - 2 * rBody) / 4);
  if (g.hasRim) { const rim = new THREE.Mesh(new THREE.TorusGeometry(rBody + tube, tube, 16, 144), mats[1]); rim.rotation.x = Math.PI / 2; rim.position.y = yRim; out.push(rim); } // the wrap ends at its top cut
  return out;
}

const SolidViewer = forwardRef(function SolidViewer({ model, colours, texture, blank, cone, caliper, lieFlat = false }, ref) {
  const host = useRef(null), st = useRef({});

  useEffect(() => {
    const el = host.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#eef0f3");
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(400, 700, 500);
    scene.add(sun);
    const group = new THREE.Group();
    scene.add(group);
    const size = () => { const w = el.clientWidth, h = Math.max(320, Math.round(w * 0.62)); renderer.setSize(w, h, false); renderer.domElement.style.width = "100%"; renderer.domElement.style.height = `${h}px`; renderer.domElement.style.display = "block"; camera.aspect = w / h; camera.updateProjectionMatrix(); };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(el);
    let raf;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    st.current = { renderer, scene, camera, controls, group, framed: false };
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);

  useEffect(() => {
    const s = st.current;
    if (!s.group || (!cone && (!model || !model.world))) return;
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
    if (cone) for (const m of cupMeshes(cone, blank, mats, caliper)) s.group.add(m);
    const panels = cone ? [] : model.geom.panels;
    for (const w of cone ? [] : model.world) {
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
    const key = cone ? `cup-${cone.id}` : model.key;
    if (!s.framed || s.lastKey !== key) {
      s.camera.position.set(d * 1.1, d * 0.7, d * 1.5);
      s.controls.target.set(0, 0, 0);
      s.camera.near = d / 100; s.camera.far = d * 20; s.camera.updateProjectionMatrix();
      s.framed = true; s.lastKey = key;
    }
  }, [model, colours, texture, blank, cone, caliper, lieFlat]);

  useImperativeHandle(ref, () => ({
    exportStl() { return new STLExporter().parse(st.current.group, { binary: false }); },
    exportObj() { return new OBJExporter().parse(st.current.group); },
    snapshot() { return st.current.renderer.domElement.toDataURL("image/png"); },
  }));

  return <div ref={host} className="w-full overflow-hidden rounded-md" />;
});

export default SolidViewer;
