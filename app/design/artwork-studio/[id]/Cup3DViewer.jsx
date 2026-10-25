"use client";

// Free in-browser 3D preview of a Studio artwork: the job's __WRAP.png (the
// print unrolled to a rectangle — x once round the cup from the seam, y from
// the top of the print down) wrapped onto a lathe of the formed cup. Shape
// numbers come from the job's RESULT.json (cup3d), else per-product defaults.
// Illustrative only — the proof and curve check are the placement truth.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const MATERIALS = {
  "paper-white": { color: "#f5f5f2", roughness: 0.85 },
  "paper-kraft": { color: "#b98b5e", roughness: 0.9 },
  clear: { color: "#ffffff", roughness: 0.05, transmission: 0.92, thickness: 0.4, ior: 1.45 },
};

// Wall profile as [radius, y] from the base (y = 0) to the rim (y = h), mm.
function profile({ shape, top_d_mm, bottom_d_mm, height_mm }, n = 48) {
  const rt = top_d_mm / 2;
  const rb = bottom_d_mm / 2;
  const h = height_mm;
  const pts = [];
  if (shape === "u") {
    // Near-straight taper over the top 78 %, then a quarter-ellipse into
    // the flat base — close enough to the moulded U for a preview.
    const yk = 0.22 * h;
    const rk = rb + 0.82 * (rt - rb);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = t * h;
      if (y >= yk) pts.push([rk + (rt - rk) * ((y - yk) / (h - yk)), y]);
      else {
        const a = (y / yk) * (Math.PI / 2);
        pts.push([rb + (rk - rb) * Math.sin(a), yk - yk * Math.cos(a)]);
      }
    }
  } else {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([rb + (rt - rb) * t, t * h]);
    }
  }
  return pts;
}

function radiusAt(pts, y) {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][1] >= y) {
      const [r0, y0] = pts[i - 1];
      const [r1, y1] = pts[i];
      return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0);
    }
  }
  return pts[pts.length - 1][0];
}

const Cup3DViewer = forwardRef(function Cup3DViewer({ wrapUrl, cup }, ref) {
  const mountRef = useRef(null);
  const st = useRef({});

  useImperativeHandle(ref, () => ({
    // HD PNG of the current view (transparent background).
    toPng(scale = 2) {
      const { renderer, scene, camera } = st.current;
      if (!renderer) return null;
      const size = renderer.getSize(new THREE.Vector2());
      renderer.setPixelRatio(scale * (window.devicePixelRatio || 1));
      renderer.setSize(size.x, size.y, false);
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL("image/png");
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setSize(size.x, size.y, false);
      renderer.render(scene, camera);
      return url;
    },
  }));

  useEffect(() => {
    const el = mountRef.current;
    const w = el.clientWidth;
    const hgt = el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(w, hgt, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(150, 260, 220);
    scene.add(key, new THREE.AmbientLight(0xffffff, 0.25));

    const camera = new THREE.PerspectiveCamera(30, w / hgt, 1, 5000);
    const group = new THREE.Group();
    scene.add(group);
    st.current = { renderer, scene, camera, group, pmrem, yaw: 0.35, pitch: 0.18 };

    const place = () => {
      const { yaw, pitch, dist = 400, target = 50 } = st.current;
      camera.position.set(
        dist * Math.cos(pitch) * Math.sin(yaw),
        target + dist * Math.sin(pitch),
        dist * Math.cos(pitch) * Math.cos(yaw),
      );
      camera.lookAt(0, target, 0);
      renderer.render(scene, camera);
    };
    st.current.place = place;

    // Drag = turn the cup / tilt the view; wheel = zoom.
    let drag = null;
    const down = (e) => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture?.(e.pointerId); };
    const move = (e) => {
      if (!drag) return;
      st.current.yaw -= (e.clientX - drag.x) * 0.01;
      st.current.pitch = Math.max(-0.6, Math.min(1.2, st.current.pitch + (e.clientY - drag.y) * 0.006));
      drag = { x: e.clientX, y: e.clientY };
      place();
    };
    const up = () => { drag = null; };
    const wheel = (e) => {
      e.preventDefault();
      st.current.dist = Math.max(120, Math.min(1200, (st.current.dist || 400) * (1 + e.deltaY * 0.001)));
      place();
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });

    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
      group.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
      pmrem.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  // (Re)build the cup whenever the shape or the artwork changes.
  useEffect(() => {
    const s = st.current;
    if (!s.group || !cup) return;
    s.group.traverse((o) => { if (o !== s.group) { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); } });
    s.group.clear();

    const pts = profile(cup);
    const h = cup.height_mm;
    const SEG = 160;
    const mat = MATERIALS[cup.material] || MATERIALS["paper-white"];
    const body = new THREE.Mesh(
      new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), SEG),
      new THREE.MeshPhysicalMaterial({ ...mat, side: THREE.DoubleSide, transparent: cup.material === "clear" }),
    );
    s.group.add(body);
    const base = new THREE.Mesh(
      new THREE.CircleGeometry(cup.bottom_d_mm / 2, 64).rotateX(-Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ ...mat, side: THREE.DoubleSide, transparent: cup.material === "clear" }),
    );
    base.position.y = 0.4;
    s.group.add(base);
    // Rolled rim (paper) / moulded lip (plastic).
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(cup.top_d_mm / 2 + 0.6, cup.material === "clear" ? 0.9 : 1.6, 12, 96).rotateX(Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ ...mat, transparent: cup.material === "clear" }),
    );
    rim.position.y = h;
    s.group.add(rim);

    if (wrapUrl) {
      // Band from the print top to the print bottom, bottom → top so the
      // lathe's v runs up the image the way the texture expects.
      const yTop = h - (cup.print_top_mm || 0);
      const yBot = Math.max(0, h - (cup.print_bottom_mm ?? h));
      const n = 40;
      const band = [];
      for (let i = 0; i <= n; i++) {
        const y = yBot + ((yTop - yBot) * i) / n;
        band.push(new THREE.Vector2(radiusAt(pts, y) * 1.004 + 0.15, y));
      }
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      loader.load(wrapUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = s.renderer.capabilities.getMaxAnisotropy();
        // Lathe u already runs "outside, left to right" (checked visually).
        const geo = new THREE.LatheGeometry(band, SEG);
        const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, roughness: 0.6, side: THREE.FrontSide }));
        s.group.add(m);
        s.place();
      });
    }

    s.target = h * 0.5;
    s.dist = Math.max(h, cup.top_d_mm) * 3.6;
    s.place();
  }, [wrapUrl, cup]);

  return <div ref={mountRef} className="h-[420px] w-full cursor-grab touch-none active:cursor-grabbing" />;
});

export default Cup3DViewer;
