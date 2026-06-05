"use client";
import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from "react";

// Lightweight canvas signature. Exposes getBlob() + clear() via ref.
const SignaturePad = forwardRef(function SignaturePad({ height = 180 }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, rect.width, height);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0A0A0A";
  }, [height]);

  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function start(e) {
    e.preventDefault();
    drawing.current = true;
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setDirty(true);
  }
  function end() { drawing.current = false; }

  useImperativeHandle(ref, () => ({
    isDirty: () => dirty,
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const rect = canvas.getBoundingClientRect();
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, rect.width, height);
      setDirty(false);
    },
    getBlob: () =>
      new Promise((resolve) => {
        if (!dirty) return resolve(null);
        canvasRef.current.toBlob((b) => resolve(b), "image/png");
      }),
  }));

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height, border: "1px solid var(--em-g200)", borderRadius: 4, touchAction: "none", background: "#fff" }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span className="em-label" style={{ textTransform: "none", letterSpacing: "0.04em" }}>Sign above</span>
        <button type="button" className="em-link em-label" style={{ background: "none", border: 0, textTransform: "none", letterSpacing: "0.04em" }}
          onClick={() => ref.current?.clear()}>
          Clear
        </button>
      </div>
    </div>
  );
});

export default SignaturePad;
