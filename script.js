'use strict';

// =========================
// CẤU HÌNH — chỉnh nhanh ở đây
// =========================
const CONFIG = {
  passcode: '',              // Để rỗng = không cần mã. Đặt chữ bất kỳ (vd 'matcha') để bật ô nhập mã ở màn setup.
  defaultName: 'matcha latte',
  defaultSender: 'Anh',
  storageKey: 'love-2010-setup'
};

const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// =========================
// STARFIELD
// Tối ưu: dùng typed array (không tạo object mỗi frame), gom vẽ theo 4 mức sáng
// (4 lần fill/stroke thay vì hàng trăm lần), vệt warp dùng màu đặc thay vì gradient,
// warp tăng/giảm mượt bằng lerp, tự dừng khi tab bị ẩn.
// =========================
const canvas = $('starfield');
const ctx = canvas.getContext('2d');
const MAX_STARS = 240;
const TAU = Math.PI * 2;
const sx = new Float32Array(MAX_STARS), sy = new Float32Array(MAX_STARS), sz = new Float32Array(MAX_STARS);
const sp = new Float32Array(MAX_STARS), sa = new Float32Array(MAX_STARS);
const px = new Float32Array(MAX_STARS), py = new Float32Array(MAX_STARS);
const rx = new Float32Array(MAX_STARS), ry = new Float32Array(MAX_STARS), rr = new Float32Array(MAX_STARS);
const hasPrev = new Uint8Array(MAX_STARS), bucket = new Uint8Array(MAX_STARS);
const STAR_FILL = [0, 1, 2, 3].map((k) => `rgba(235,247,255,${(.25 + k * .25).toFixed(2)})`);
const STAR_STROKE = [0, 1, 2, 3].map((k) => `rgba(190,225,255,${(.25 + k * .25).toFixed(2)})`);

let starCount = 0, cw = 0, ch = 0, focal = 0;
const IDLE_WARP = .16;
let warp = IDLE_WARP, warpTarget = IDLE_WARP;
let lastT = 0, rafId = 0;

function resetStar(i) {
  const z = rand(.1, 1);
  sx[i] = (Math.random() * 2 - 1) * z;
  sy[i] = (Math.random() * 2 - 1) * z;
  sz[i] = z;
  sp[i] = rand(.18, .6);
  sa[i] = rand(.45, 1);
  hasPrev[i] = 0;
}

function resizeStars() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cw = window.innerWidth;
  ch = window.innerHeight;
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  focal = ch * .62;
  starCount = Math.min(MAX_STARS, Math.max(100, Math.floor(cw * ch / 4500)));
  for (let i = 0; i < starCount; i++) resetStar(i);
}

function frame(t) {
  rafId = requestAnimationFrame(frame);
  const dt = Math.min((t - (lastT || t)) / 1000, .05);
  lastT = t;

  warp += (warpTarget - warp) * Math.min(1, dt * 3.5);
  const w = reduceMotion.matches ? 0 : warp;
  const streak = w > 1.4;
  const cx = cw / 2, cy = ch / 2;

  ctx.clearRect(0, 0, cw, ch);

  for (let i = 0; i < starCount; i++) {
    let z = sz[i] - sp[i] * dt * w;
    let x = cx + sx[i] * focal / z;
    let y = cy + sy[i] * focal / z;
    if (z <= .08 || x < -40 || x > cw + 40 || y < -40 || y > ch + 40) {
      resetStar(i);
      z = sz[i];
      x = cx + sx[i] * focal / z;
      y = cy + sy[i] * focal / z;
    }
    sz[i] = z;
    rx[i] = x; ry[i] = y;
    rr[i] = Math.max(.55, (1.15 - z) * 1.7);
    bucket[i] = Math.min(3, (sa[i] * Math.min(1, .35 + (1 - z) * .8) * 4) | 0);
  }

  for (let k = 0; k < 4; k++) {
    if (streak) {
      ctx.strokeStyle = STAR_STROKE[k];
      ctx.lineWidth = 1.2 + k * .5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < starCount; i++) {
        if (bucket[i] === k && hasPrev[i]) { ctx.moveTo(px[i], py[i]); ctx.lineTo(rx[i], ry[i]); }
      }
      ctx.stroke();
    }
    ctx.fillStyle = STAR_FILL[k];
    ctx.beginPath();
    for (let i = 0; i < starCount; i++) {
      if (bucket[i] === k) { ctx.moveTo(rx[i] + rr[i], ry[i]); ctx.arc(rx[i], ry[i], rr[i], 0, TAU); }
    }
    ctx.fill();
  }

  for (let i = 0; i < starCount; i++) { px[i] = rx[i]; py[i] = ry[i]; hasPrev[i] = 1; }

  applyTilt(dt);
}

function startLoop() {
  if (!rafId && !document.hidden) { lastT = 0; rafId = requestAnimationFrame(frame); }
}
function stopLoop() { cancelAnimationFrame(rafId); rafId = 0; }

window.addEventListener('resize', resizeStars, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden || $('memeStorm').classList.contains('active')) stopLoop();
  else startLoop();
});
resizeStars();
startLoop();

// =========================
// NGHIÊNG 3D THEO CON TRỎ / NGÓN TAY
// Một vòng lặp dùng chung (nằm trong frame), chỉ ghi style khi giá trị thực sự đổi.
// =========================
const pointer = { x: 0, y: 0 };
const tilt = { x: 0, y: 0 };
let tiltEl = null, tiltMax = { rx: 0, ry: 0 }, lastTilt = '';

window.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
}, { passive: true });
document.addEventListener('pointerleave', () => { pointer.x = 0; pointer.y = 0; });

function setTiltTarget(el, maxRx = 0, maxRy = 0) {
  if (tiltEl) tiltEl.style.transform = '';
  tiltEl = el;
  tiltMax = { rx: maxRx, ry: maxRy };
  lastTilt = '';
}

function applyTilt(dt) {
  tilt.x += (pointer.x - tilt.x) * Math.min(1, dt * 6);
  tilt.y += (pointer.y - tilt.y) * Math.min(1, dt * 6);
  if (!tiltEl || reduceMotion.matches) return;
  const value = `rotateX(${(-tilt.y * tiltMax.rx).toFixed(2)}deg) rotateY(${(tilt.x * tiltMax.ry).toFixed(2)}deg)`;
  if (value !== lastTilt) { tiltEl.style.transform = value; lastTilt = value; }
}

// =========================
// ẢNH BAY TRONG CƠN BÃO (có thể chọn nhiều ảnh)
// Tối ưu: thu nhỏ ảnh về 360×360 trước khi dùng → nhẹ RAM/GPU khi có 100 thẻ bay.
// =========================
let personalPhotoUrls = [];
const photoStatus = $('photoStatus');
const setupPhotoName = $('setupPhotoName');

async function downscalePhoto(file, size = 360) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  if (bitmap.close) bitmap.close();
  const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', .88));
  if (!blob) throw new Error('toBlob failed');
  return URL.createObjectURL(blob);
}

async function setPersonalPhotos(files) {
  if (!files.length) return false;
  if (files.some((file) => !file.type.startsWith('image/'))) {
    photoStatus.textContent = 'Có tệp không phải ảnh. Vui lòng chỉ chọn ảnh.';
    return false;
  }

  const newUrls = [];
  try {
    for (const file of files) newUrls.push(await downscalePhoto(file));
  } catch (error) {
    newUrls.forEach((url) => URL.revokeObjectURL(url));
    photoStatus.textContent = 'Không thể xử lý ảnh đã chọn. Vui lòng thử ảnh khác.';
    console.error('Unable to prepare storm photos:', error);
    return false;
  }

  personalPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
  personalPhotoUrls = newUrls;
  const count = personalPhotoUrls.length;
  photoStatus.textContent = `Đã chọn ${count} ảnh. Các ảnh sẽ lần lượt xuất hiện trong cơn bão!`;
  setupPhotoName.textContent = `✅ Đã chọn ${count} ảnh để bay trong cơn bão`;
  return true;
}

// =========================
// SETUP → TRANG CHÍNH
// =========================
const body = document.body;
const setup = $('setup');
const setupForm = $('setupForm');
const setupCard = setupForm;
const nameInput = $('nameInput');
const senderInput = $('senderInput');
const codeField = $('codeField');
const codeInput = $('codeInput');
const setupError = $('setupError');
const mainPage = $('mainPage');
const scene = $('scene');
const flash = $('flash');
let entering = false;

// Khôi phục lần nhập trước (nếu có)
try {
  const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) || 'null');
  if (saved) { nameInput.value = saved.name || ''; senderInput.value = saved.sender || ''; }
} catch { /* bỏ qua nếu bị chặn */ }

if (CONFIG.passcode) codeField.hidden = false;
setTiltTarget($('setupTilt'), 8, 12);
nameInput.focus({ preventScroll: true });

$('setupPhotoInput').addEventListener('change', async (e) => {
  await setPersonalPhotos(Array.from(e.target.files));
  e.target.value = '';
});

function showSetupError(message) {
  setupError.textContent = message;
  setupCard.classList.remove('invalid');
  void setupCard.offsetWidth;
  setupCard.classList.add('invalid');
}

function popFlash() {
  flash.classList.remove('pop');
  void flash.offsetWidth;
  flash.classList.add('pop');
}

function applyContent(name, sender) {
  $('recipientName').textContent = name + ' ✨';
  $('senderName').textContent = sender;
  document.title = `Gửi ${name} — 20/10 💗`;
}

function enterMain() {
  entering = true;
  body.classList.add('warping');
  warpTarget = 10;          // hyperspace
  setTiltTarget(null);

  setTimeout(() => {
    body.classList.remove('is-setup', 'warping');
    body.classList.add('is-main');
    setup.hidden = true;
    mainPage.hidden = false;
    warpTarget = IDLE_WARP;  // lerp giúp giảm tốc mượt
    popFlash();
    setTiltTarget(scene, 16, 24);
    $('openLetter').focus({ preventScroll: true });
    entering = false;
  }, reduceMotion.matches ? 0 : 1300);
}

setupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (entering) return;

  if (CONFIG.passcode && codeInput.value.trim().toLowerCase() !== CONFIG.passcode.toLowerCase()) {
    showSetupError('Mã chưa đúng, thử lại nhé 💫');
    codeInput.focus();
    return;
  }

  const name = nameInput.value.trim() || CONFIG.defaultName;
  const sender = senderInput.value.trim() || CONFIG.defaultSender;
  setupError.textContent = '';
  applyContent(name, sender);
  try { localStorage.setItem(CONFIG.storageKey, JSON.stringify({ name: nameInput.value.trim(), sender: senderInput.value.trim() })); } catch { /* ignore */ }
  enterMain();
});

// =========================
// LETTER OPEN/CLOSE
// =========================
const overlay = $('letterOverlay');
const openLetter = $('openLetter');
const closeLetter = $('closeLetter');
const letterTilt = $('letterTilt');

function showLetter() {
  warpTarget = 3.4;
  body.classList.add('zooming');
  overlay.classList.add('open');
  setTiltTarget(letterTilt, 7, 10);
  closeLetter.focus({ preventScroll: true });
}
function hideLetter() {
  warpTarget = IDLE_WARP;
  body.classList.remove('zooming');
  overlay.classList.remove('open');
  setTiltTarget(scene, 16, 24);
  openLetter.focus({ preventScroll: true });
}
openLetter.addEventListener('click', showLetter);
closeLetter.addEventListener('click', hideLetter);
overlay.addEventListener('click', (e) => { if (e.target === overlay) hideLetter(); });

// =========================
// MEME STORM — bay 3D xuyên không gian
// Tối ưu: dựng bằng DocumentFragment (1 lần chèn DOM), 1 lần gán cssText mỗi thẻ,
// tự xóa node khi animation kết thúc, số lượng thẻ tự giảm trên máy yếu/di động.
// =========================
const storm = $('memeStorm');
const shockwave = $('shockwave');
const pandaFaces = ['🐼', '🤣', '🥹', '😎', '🤡', '🐸', '🫠', '😈', '🙈', '💘'];
const hearts = ['💗', '💖', '💕', '💘', '💝', '❤️'];
const captions = ['YÊU NHA!', '20/10 VUI VẺ', 'HẾT CỨU 😂', 'MÃI ĐỈNH', 'ÔM CÁI NÈ', 'HONG THOÁT ĐÂU', 'BÉ ƠI 💗'];
let stormTimer = 0;

function particleCount() {
  if (reduceMotion.matches) return 28;
  const weak = (navigator.hardwareConcurrency || 4) <= 4 || window.innerWidth < 600;
  return weak ? 64 : 110;
}

function makeParticle() {
  const isHeart = Math.random() < .34;
  const el = document.createElement('div');
  const hasPhotos = personalPhotoUrls.length > 0;
  const size = isHeart ? rand(18, 52) : hasPhotos ? rand(96, 150) : rand(48, 106);

  el.style.cssText =
    `--x:${rand(0, 100).toFixed(1)}vw;--size:${size.toFixed(0)}px;` +
    `--duration:${rand(3.4, 7.6).toFixed(2)}s;--delay:${rand(0, 2.2).toFixed(2)}s;` +
    `--drift:${rand(-21, 21).toFixed(1)}vw;--z0:${rand(-1500, -700).toFixed(0)}px;--z1:${(hasPhotos && !isHeart ? rand(250, 520) : rand(100, 420)).toFixed(0)}px;` +
    `--rx:${rand(-80, 80).toFixed(0)}deg;--spin:${rand(-540, 540).toFixed(0)}deg;--roll:${rand(-40, 40).toFixed(0)}deg`;

  if (isHeart) {
    el.className = 'heart-particle';
    el.textContent = pick(hearts);
  } else {
    el.className = 'meme';
    if (hasPhotos) {
      const img = document.createElement('img');
      img.src = pick(personalPhotoUrls);
      img.alt = '';
      img.decoding = 'async';
      el.appendChild(img);
    } else {
      el.textContent = pick(pandaFaces);
    }
    const cap = document.createElement('span');
    cap.className = 'caption';
    cap.textContent = pick(captions);
    el.appendChild(cap);
  }
  el.addEventListener('animationend', () => el.remove(), { once: true });
  return el;
}

// Màn kết chỉ hiển thị một ảnh được chọn ngẫu nhiên trong số ảnh đã tải lên.
const finale = $('finale');
const finaleFrame = $('finaleFrame');
const FRAME_COLOR = '#ff9ad5';
const FINALE_EMOJI = '💗';
let finaleTimer = 0;

function pickFinalePhoto() {
  if (!personalPhotoUrls.length) return null;
  return personalPhotoUrls[Math.floor(Math.random() * personalPhotoUrls.length)];
}

function buildFinale() {
  const fragment = document.createDocumentFragment();
  const tile = document.createElement('figure');
  tile.className = 'tile';
  tile.style.cssText = `--i:0;--c:${FRAME_COLOR};--rot:-2deg;--dur:4s;--dl:0s`;
  const inner = document.createElement('div');
  inner.className = 'tile-inner';
  const url = pickFinalePhoto();
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.decoding = 'async';
    inner.appendChild(img);
  } else {
    inner.textContent = FINALE_EMOJI;
  }
  tile.appendChild(inner);
  fragment.appendChild(tile);
  finaleFrame.replaceChildren(fragment);
}

function scheduleFinale() {
  clearTimeout(finaleTimer);
  finale.classList.remove('show');
  storm.classList.remove('finale-on');
  buildFinale();
  finaleTimer = setTimeout(() => {
    finale.classList.add('show');
    storm.classList.add('finale-on');
  }, reduceMotion.matches ? 600 : 7000);
}

function refreshParticles() {
  storm.querySelectorAll('.meme, .heart-particle').forEach((n) => n.remove());
  const fragment = document.createDocumentFragment();
  const count = particleCount();
  for (let i = 0; i < count; i++) fragment.appendChild(makeParticle());
  storm.appendChild(fragment);
}

$('personalPhotoInput').addEventListener('change', async (e) => {
  const ok = await setPersonalPhotos(Array.from(e.target.files));
  e.target.value = '';
  if (ok && storm.classList.contains('active')) {
    refreshParticles();
    buildFinale();
  }
});

function launchStorm() {
  warpTarget = IDLE_WARP;
  body.classList.remove('zooming');
  overlay.classList.remove('open');
  setTiltTarget(null);

  // Gỡ rồi thêm lại class để mọi animation (tiêu đề, sóng xung kích) chạy lại từ đầu
  storm.classList.remove('active', 'shake', 'finale-on');
  shockwave.classList.remove('go');
  void storm.offsetWidth;
  storm.classList.add('active', 'shake');
  // The opaque storm covers the starfield canvas, so pause its render loop.
  stopLoop();
  shockwave.classList.add('go');
  popFlash();

  refreshParticles();
  scheduleFinale();
  clearTimeout(stormTimer);
  stormTimer = setTimeout(() => storm.classList.remove('shake'), 1800);
}

function closeStorm() {
  clearTimeout(stormTimer);
  clearTimeout(finaleTimer);
  finale.classList.remove('show');
  storm.classList.remove('active', 'shake', 'finale-on');
  shockwave.classList.remove('go');
  storm.querySelectorAll('.meme, .heart-particle').forEach((n) => n.remove());
  startLoop();
  setTiltTarget(scene, 16, 24);
  openLetter.focus({ preventScroll: true });
}

$('giftButton').addEventListener('click', launchStorm);
$('replayButton').addEventListener('click', launchStorm);
$('backButton').addEventListener('click', closeStorm);

// Bàn phím: Esc đóng thư / thoát bão; Enter chơi lại bão
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (storm.classList.contains('active')) closeStorm();
    else if (overlay.classList.contains('open')) hideLetter();
  } else if (e.key === 'Enter' && storm.classList.contains('active') && e.target === document.body) {
    launchStorm();
  }
});
