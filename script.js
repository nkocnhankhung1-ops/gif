'use strict';

// =========================
// CẤU HÌNH — chỉnh nhanh ở đây
// =========================
const CONFIG = {
  passcode: '',              // Để rỗng = không cần mã. Đặt chữ bất kỳ (vd 'matcha') để bật ô nhập mã ở màn setup.
  defaultName: 'matcha latte',
  defaultSender: 'Anh',
  storageKey: 'love-2010-setup',
  photoExt: 'jpg',           // Ảnh người nhận: photos/1.jpg ... photos/12.jpg (đổi sang png/webp nếu cần)
  photoMax: 12
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
const messageInput = $('messageInput');
const mainPage = $('mainPage');
const scene = $('scene');
const flash = $('flash');
let entering = false;

// Khôi phục lần nhập trước (nếu có)
try {
  const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) || 'null');
  if (saved) { nameInput.value = saved.name || ''; senderInput.value = saved.sender || ''; messageInput.value = saved.message || ''; }
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

function applyContent(name, sender, message = '') {
  $('recipientName').textContent = name + ' ✨';
  $('senderName').textContent = sender;
  document.title = `Gửi ${name} — 20/10 💗`;

  // Lời nhắn riêng: thay các đoạn của lá thư mẫu (textContent → an toàn, không chạy HTML)
  const lines = message.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (lines.length) {
    const letter = document.querySelector('.letter');
    const signature = letter.querySelector('.signature');
    letter.querySelectorAll('p:not(.signature)').forEach((p) => p.remove());
    lines.forEach((text) => {
      const p = document.createElement('p');
      p.textContent = text;
      letter.insertBefore(p, signature);
    });
  }
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
  applyContent(name, sender, messageInput.value);
  saveDraft();
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

// Màn kết: bộ sưu tập ~10 ảnh khác nhau, bảng màu 5 sắc dịu, mỗi ảnh trôi lên nhẹ.
// Ít hơn 10 ảnh → xoay vòng (xáo trộn, tránh 2 ảnh giống nhau đứng cạnh). Nhiều hơn 10 → bốc ngẫu nhiên 10 ảnh.
const finale = $('finale');
const finaleFrame = $('finaleFrame');
const FINALE_COUNT = 10;
const FRAME_COLORS = ['#ff9ad5', '#b79cff', '#7be7ff', '#ffc2a8', '#a8f0d0'];
const FRAME_ROTATIONS = [-2.5, 1.5, -1, 2.5, -2, 2, -1.5, 1, -2.5, 2];
const FINALE_EMOJI = ['💗', '💖', '💕', '💘', '💝', '🩷', '💓', '💞', '💜', '🌸'];
let finaleTimer = 0;

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const k = (Math.random() * (i + 1)) | 0;
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
}

function pickFinalePhotos() {
  if (!personalPhotoUrls.length) return Array(FINALE_COUNT).fill(null);
  const result = [];
  while (result.length < FINALE_COUNT) {
    const batch = shuffle(personalPhotoUrls);
    if (result.length && batch.length > 1 && batch[0] === result[result.length - 1]) batch.push(batch.shift());
    result.push(...batch);
  }
  return result.slice(0, FINALE_COUNT);
}

function buildFinale() {
  const fragment = document.createDocumentFragment();
  pickFinalePhotos().forEach((url, i) => {
    const tile = document.createElement('figure');
    tile.className = 'tile';
    tile.style.cssText =
      `--i:${i};--c:${FRAME_COLORS[i % FRAME_COLORS.length]};--rot:${FRAME_ROTATIONS[i]}deg;` +
      `--dur:${(4 + (i % 4) * .6).toFixed(1)}s;--dl:${(-((i * 0.83) % 4)).toFixed(2)}s`;
    const inner = document.createElement('div');
    inner.className = 'tile-inner';
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.decoding = 'async';
      inner.appendChild(img);
    } else {
      inner.textContent = FINALE_EMOJI[i];
    }
    tile.appendChild(inner);
    fragment.appendChild(tile);
  });
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
  if (ok && storm.classList.contains('active')) refreshParticles();
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

// =========================
// TẠO LINK CHIA SẺ (người gửi) — dữ liệu nằm sau dấu # nên không gửi lên máy chủ
// =========================
const linkButton = $('linkButton');
const shareBox = $('shareBox');
const shareLink = $('shareLink');
const shareNote = $('shareNote');

function encodeGift(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeGift(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function saveDraft() {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify({
      name: nameInput.value.trim(), sender: senderInput.value.trim(), message: messageInput.value
    }));
  } catch { /* ignore */ }
}

async function copyShareLink() {
  shareLink.focus();
  shareLink.select();
  let ok = false;
  try { await navigator.clipboard.writeText(shareLink.value); ok = true; } catch { /* thử cách cũ */ }
  if (!ok) { try { ok = document.execCommand('copy'); } catch { /* ignore */ } }
  const local = location.protocol === 'file:'
    ? ' ⚠️ Bạn đang mở file trên máy nên link chỉ chạy trên máy này. Hãy đăng web lên hosting (Netlify, GitHub Pages…) rồi tạo link lại.'
    : '';
  shareNote.textContent = (ok ? '✅ Đã sao chép link, gửi cho người nhận nhé!' : 'Hãy bấm giữ vào ô link để sao chép.') + local;
}

linkButton.addEventListener('click', () => {
  if (CONFIG.passcode && codeInput.value.trim().toLowerCase() !== CONFIG.passcode.toLowerCase()) {
    showSetupError('Mã chưa đúng, thử lại nhé 💫');
    codeInput.focus();
    return;
  }
  setupError.textContent = '';
  const payload = {
    v: 1,
    n: nameInput.value.trim() || CONFIG.defaultName,
    s: senderInput.value.trim() || CONFIG.defaultSender,
    m: messageInput.value.trim()
  };
  shareLink.value = `${location.href.split('#')[0]}#g=${encodeGift(payload)}`;
  shareBox.hidden = false;
  saveDraft();
  copyShareLink();
});
$('copyLink').addEventListener('click', copyShareLink);

// =========================
// CHẾ ĐỘ NGƯỜI NHẬN — mở link là vào thẳng món quà, không có form hay công cụ chỉnh sửa
// Ảnh lấy từ thư mục photos/ trên web, được thu nhỏ trước khi bay.
// =========================
function readGiftFromHash() {
  const match = location.hash.match(/^#g=([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  try {
    const data = decodeGift(match[1]);
    if (!data || data.v !== 1 || typeof data.n !== 'string') return null;
    return {
      name: data.n.slice(0, 30) || CONFIG.defaultName,
      sender: String(data.s || CONFIG.defaultSender).slice(0, 20),
      message: String(data.m || '').slice(0, 600)
    };
  } catch { return null; }
}

function probeImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadHostedPhotos() {
  const tasks = Array.from({ length: CONFIG.photoMax }, async (_, k) => {
    const url = `photos/${k + 1}.${CONFIG.photoExt}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await downscalePhoto(await res.blob());
    } catch {
      return probeImage(url);   // fetch bị chặn (vd mở từ file://) → dùng ảnh gốc
    }
  });
  const urls = (await Promise.all(tasks)).filter(Boolean);
  if (urls.length) personalPhotoUrls = urls;
}

function bootViewer(gift) {
  body.classList.remove('is-setup');
  body.classList.add('is-viewer', 'is-main');
  setup.remove();
  mainPage.hidden = false;
  applyContent(gift.name, gift.sender, gift.message);
  setTiltTarget(scene, 16, 24);
  warpTarget = 10;                                   // lướt vào thiên hà rồi giảm tốc mượt
  setTimeout(() => { warpTarget = IDLE_WARP; }, 900);
  loadHostedPhotos();
}

const incomingGift = readGiftFromHash();
if (incomingGift) bootViewer(incomingGift);
