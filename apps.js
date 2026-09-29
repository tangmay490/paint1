// ลงทะเบียน Service Worker + ปุ่มติดตั้งแอป + แสดงสถานะออฟไลน์
export function initPWA() {
  if ("serviceWorker" in navigator) {
    addEventListener("load", () =>
      navigator.serviceWorker.register("sw.js").catch(err => console.warn("SW ลงทะเบียนไม่สำเร็จ", err)));
  }

  const installBtn = document.getElementById("install");
  let deferred = null;
  addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferred = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    installBtn.hidden = true;
  });
  addEventListener("appinstalled", () => (installBtn.hidden = true));

  const badge = document.getElementById("netStatus");
  const update = () => { badge.textContent = navigator.onLine ? "🟢 ออนไลน์" : "🔴 ออฟไลน์ (ยังใช้งานได้)"; };
  addEventListener("online", update); addEventListener("offline", update); update();
}

// แต่ละเครื่องมือมี 3 เมธอด: down / move / up
// ต้องการเพิ่มเครื่องมือใหม่? เพิ่ม object ใน TOOLS แล้วเพิ่มปุ่มใน index.html
function stroke(ctx, s) {
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.lineWidth = s.size;
  ctx.strokeStyle = s.color;
}

const freehand = (erase) => ({
  down(ctx, p, s) { stroke(ctx, { ...s, color: erase ? "#ffffff" : s.color });
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.01, p.y); ctx.stroke(); },
  move(ctx, p) { ctx.lineTo(p.x, p.y); ctx.stroke(); },
  up() {},
});

// เครื่องมือรูปทรง: วาดพรีวิวโดยคืนภาพเดิมก่อนทุกครั้ง
const shape = (draw) => ({
  down(ctx, p, s) { this.start = p; this.base = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height); },
  move(ctx, p, s) { ctx.putImageData(this.base, 0, 0); stroke(ctx, s); ctx.beginPath(); draw(ctx, this.start, p); ctx.stroke(); },
  up() {},
});

// เทสีแบบ flood fill (scanline อย่างง่ายด้วย stack)
function floodFill(ctx, sx, sy, hex) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  sx = Math.floor(sx); sy = Math.floor(sy);
  const idx = (x, y) => (y * w + x) * 4;
  const t = d.slice(idx(sx, sy), idx(sx, sy) + 4);
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  if (t[0] === c[0] && t[1] === c[1] && t[2] === c[2] && t[3] === 255) return;
  const match = i => d[i] === t[0] && d[i+1] === t[1] && d[i+2] === t[2] && d[i+3] === t[3];
  const stack = [[sx, sy]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = idx(x, y);
    if (!match(i)) continue;
    d[i] = c[0]; d[i+1] = c[1]; d[i+2] = c[2]; d[i+3] = 255;
    stack.push([x+1, y], [x-1, y], [x, y+1], [x, y-1]);
  }
  ctx.putImageData(img, 0, 0);
}

export const TOOLS = {
  pen: freehand(false),
  eraser: freehand(true),
  line: shape((ctx, a, b) => { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }),
  rect: shape((ctx, a, b) => ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y)),
  ellipse: shape((ctx, a, b) => ctx.ellipse((a.x+b.x)/2, (a.y+b.y)/2,
            Math.abs(b.x-a.x)/2, Math.abs(b.y-a.y)/2, 0, 0, Math.PI * 2)),
  fill: { down(ctx, p, s) { floodFill(ctx, p.x, p.y, s.color); }, move() {}, up() {} },
};

// คลาสหลักของ canvas: รับ pointer event แล้วส่งต่อให้เครื่องมือที่เลือก
import { TOOLS } from "./tools.js";
import { History } from "./history.js";

export class Drawing {
  constructor(canvas, onChange = () => {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { willReadFrequently: true });
    this.history = new History(this.ctx);
    this.state = { tool: "pen", color: "#222222", size: 4 };
    this.onChange = onChange;
    this.drawing = false;
    this.clear(false);
    this.bind();
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * this.canvas.width / r.width,
             y: (e.clientY - r.top) * this.canvas.height / r.height };
  }
  bind() {
    const c = this.canvas;
    c.addEventListener("pointerdown", e => {
      c.setPointerCapture(e.pointerId);
      this.history.save();
      this.drawing = true;
      TOOLS[this.state.tool].down(this.ctx, this.point(e), this.state);
    });
    c.addEventListener("pointermove", e => {
      if (this.drawing) TOOLS[this.state.tool].move(this.ctx, this.point(e), this.state);
    });
    const end = e => {
      if (!this.drawing) return;
      this.drawing = false;
      TOOLS[this.state.tool].up(this.ctx, this.point(e), this.state);
      this.onChange();
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }
  set(key, value) { this.state[key] = value; }
  clear(saveHistory = true) {
    if (saveHistory) this.history.save();
    this.ctx.fillStyle = "#fff";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.onChange();
  }
  undo() { this.history.undo(); this.onChange(); }
  redo() { this.history.redo(); this.onChange(); }
}

// บันทึกไฟล์ / บันทึกอัตโนมัติ / โหลดงานเดิม
const KEY = "mini-paint-autosave";

export function exportPNG(canvas) {
  const a = document.createElement("a");
  a.download = `drawing-${Date.now()}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

export function autosave(canvas) {
  try { localStorage.setItem(KEY, canvas.toDataURL()); } catch { /* เต็มหรือถูกปิด */ }
}

export function restore(ctx) {
  let data; try { data = localStorage.getItem(KEY); } catch { return; }
  if (!data) return;
  const img = new Image();
  img.onload = () => ctx.drawImage(img, 0, 0);
  img.src = data;
}

// จุดเริ่มต้นโปรแกรม: เชื่อม UI (ปุ่ม/สไลเดอร์) เข้ากับ Drawing
import { Drawing } from "./drawing.js";
import { exportPNG, autosave, restore } from "./storage.js";
import { initPWA } from "./pwa.js";

const $ = id => document.getElementById(id);
const canvas = $("board");
const app = new Drawing(canvas, () => autosave(canvas));
restore(app.ctx);

document.querySelectorAll("#tools button").forEach(btn =>
  btn.addEventListener("click", () => {
    document.querySelector("#tools .active")?.classList.remove("active");
    btn.classList.add("active");
    app.set("tool", btn.dataset.tool);
  }));

$("color").addEventListener("input", e => app.set("color", e.target.value));
$("size").addEventListener("input", e => { app.set("size", +e.target.value); $("sizeLabel").textContent = e.target.value; });
$("undo").onclick = () => app.undo();
$("redo").onclick = () => app.redo();
$("clear").onclick = () => confirm("ล้างภาพทั้งหมด?") && app.clear();
$("save").onclick = () => exportPNG(canvas);

addEventListener("keydown", e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  if (e.key === "z") { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); }
  if (e.key === "y") { e.preventDefault(); app.redo(); }
});

initPWA();

// จัดการ Undo/Redo โดยเก็บภาพ snapshot ของ canvas
export class History {
  constructor(ctx, limit = 30) {
    this.ctx = ctx; this.limit = limit;
    this.undoStack = []; this.redoStack = [];
  }
  snapshot() {
    const { width, height } = this.ctx.canvas;
    return this.ctx.getImageData(0, 0, width, height);
  }
  save() {                       // เรียกก่อนเริ่มวาดทุกครั้ง
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }
  undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    this.ctx.putImageData(this.undoStack.pop(), 0, 0);
  }
  redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.ctx.putImageData(this.redoStack.pop(), 0, 0);
  }
}
