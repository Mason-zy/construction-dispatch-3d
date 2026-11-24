import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DURATION, CAPACITY, MAP, FLEET_SIZE, clamp, detailsFor, entities, stages, stateAt, sweepCollisions } from "./simulation.js";
import { createWorld, overviewCamera, setFrustum } from "./world.js";

const get = id => document.getElementById(id);
const canvas = get("scene-canvas");
const seek = get("seek");
const play = get("play");
const search = get("search");
const searchResults = get("search-results");
const siteSelect = get("site-select");
const scanDialog = get("scan-dialog");
const fleet = get("fleet-items");
const stageButtons = [...document.querySelectorAll(".step")];
const ui = new Map();
const icons = {
  "MX-07": '<path d="M3 8h10v7H3zm10 2h4l4 4v2h-8"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  "EX-12": '<path d="M3 13h9v4H3zm3-3V7h4v6m0 0 4-7 4 1 2 7m0 0 2 1-2 3h-3l1-4h2m-17 6h10"/>',
  "PL-01": '<path d="M4 19V8l4-3 4 3v11m0-8 4-3 4 3v8M3 19h18M7 10h2m-2 4h2m6-1h2m-2 3h2"/>',
  "ST-02": '<path d="m3 10 9-5 9 5-9 5-9-5Zm0 4.5 9 5 9-5M8 7.5l9 5"/>',
  "FL-04": '<path d="M3 15h9v-4H3zm3-4V6h6v9m3-12v14h6"/><circle cx="5" cy="18" r="1.6"/><circle cx="11" cy="18" r="1.6"/>',
  "GC-02": '<path d="M3 7h18M5 7v12m14-12v12M3 19h4m10 0h4M12 7v7a2 2 0 1 0 2 2"/>',
  "DV-05": '<path d="M3 8h10v7H3zm10 2h4l4 4v2h-8"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  "YD-03": '<path d="M4 5h7v7H4zm9 0h7v7h-7zM4 14h7v5H4zm9 0h7v5h-7z"/>',
  "AS-04": '<path d="M3 18V6h18v12M5 9h14m-8 0v5m0 0 2 2m-10 3h18"/>',
  "WH-05": '<path d="M3 19V8l9-4 9 4v11Zm4 0v-6h10v6M6 9h12"/>'
};
const entityById = new Map(entities.map(entity => [entity.id, entity]));
let time = 0;
let state = stateAt(0);
let selected = "MX-07";
let view = "overview";
let world;
let camera;
let controls;
let animation = 0;
let playing = false;
let last = 0;
let drawRequested = false;
let cssWidth = 0;
let cssHeight = 0;
let searchMatches = [];
let activeResult = -1;
let captureAbort;
let pointerStart;

function setText(element, value) {
  const text = String(value);
  if (element.textContent !== text) element.textContent = text;
}

setText(get("metric-fleet-total"), FLEET_SIZE);
seek.max = DURATION;
setText(get("duration"), DURATION);
for (const entity of entities) {
  if (entity.kind === "site") siteSelect.add(new Option(entity.name, entity.id));
  const button = document.createElement("button");
  button.type = "button";
  button.className = "fleet-row";
  button.dataset.entity = entity.id;
  button.style.setProperty("--entity", entity.color);
  button.innerHTML = `<span class="symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">${icons[entity.id]}</svg></span>
    <span><b>${entity.name}</b><span class="fleet-id">${entity.id}</span></span><span class="fleet-status"></span>`;
  button.addEventListener("click", () => selectEntity(entity.id, true));
  ui.set(entity.id, { button, status: button.querySelector(".fleet-status") });
  fleet.append(button);
}

function updateDetails() {
  const entity = entityById.get(selected);
  const detail = detailsFor(selected, state);
  setText(get("detail-type"), entity.type);
  setText(get("detail-id"), entity.id);
  setText(get("detail-title"), entity.name);
  setText(get("detail-location"), detail.location);
  get("detail-status").lastChild.nodeValue = detail.status;
  setText(get("detail-value-label"), detail.label);
  setText(get("detail-value"), detail.value);
  setText(get("detail-unit"), detail.unit);
  get("detail-progress").value = detail.progress;
  get("detail-progress").setAttribute("aria-valuetext", Math.round(detail.progress * 100) + "%");
  get("scene-tag").firstElementChild.textContent = selected;
  for (const [id, row] of ui) {
    row.button.setAttribute("aria-pressed", String(id === selected));
    setText(row.status, detailsFor(id, state).status);
  }
}

function updateTimeline() {
  const displayed = (Math.floor(time * 10 + 1e-7) / 10).toFixed(1);
  const stage = stages[state.stage];
  const milestone = time === DURATION ? "施工完成" : stage.name;
  seek.value = displayed;
  seek.style.setProperty("--fill", (time / DURATION * 100) + "%");
  seek.setAttribute("aria-valuetext", displayed + " 秒");
  get("elapsed").value = displayed.padStart(4, "0");
  setText(get("metric-soil"), state.removed);
  setText(get("metric-concrete"), (state.poured * CAPACITY).toFixed(1));
  setText(get("metric-wall"), state.completedCourses);
  setText(get("metric-fleet"), state.workingVehicles);
  setText(get("process-state"), milestone);
  const phase = get("scene-phase");
  setText(phase.lastElementChild, milestone);
  phase.style.setProperty("--phase", stage.color);
  for (const [index, button] of stageButtons.entries()) {
    if (index === state.stage) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  }
}

function updatePlayButton() {
  setText(get("play-text"), playing ? "暂停" : time === DURATION ? "重播" : "播放");
  get("play-icon").classList.toggle("pausing", playing);
}

function setTime(value) {
  time = clamp(value, 0, DURATION);
  state = stateAt(time);
  updateTimeline();
  updateDetails();
  requestDraw();
}

function pause() {
  playing = false;
  last = 0;
  updatePlayButton();
}

function seekTo(value) {
  pause();
  setTime(value);
  updatePlayButton();
}

function draw(now) {
  animation = 0;
  if (playing) {
    if (last) setTime(time + (now - last) / 1000);
    last = now;
    if (time === DURATION) pause();
  }
  if (world && cssWidth && cssHeight) {
    world.render(state, camera);
    const position = world.project(selected, camera);
    const x = (position.x + 1) * cssWidth / 2;
    const y = (1 - position.y) * cssHeight / 2;
    const tag = get("scene-tag");
    tag.hidden = x < 26 || x > cssWidth - 26 || y < 32 || y > cssHeight - 30 || Math.abs(position.z) > 1;
    if (!tag.hidden) {
      tag.style.left = x + "px";
      tag.style.top = y + "px";
    }
  }
  drawRequested = false;
  if (playing) requestDraw();
}

function requestDraw() {
  if (drawRequested) return;
  drawRequested = true;
  animation = requestAnimationFrame(draw);
}

play.addEventListener("click", () => {
  if (playing) {
    pause();
    if (animation) cancelAnimationFrame(animation);
    animation = 0;
    drawRequested = false;
    requestDraw();
  } else {
    if (time === DURATION) setTime(0);
    playing = true;
    updatePlayButton();
    requestDraw();
  }
});
seek.addEventListener("input", () => seekTo(Number(seek.value)));
get("reset").addEventListener("click", () => seekTo(0));
for (const button of stageButtons) {
  button.addEventListener("click", () => seekTo(stages[Number(button.dataset.stage)].start));
}

function cameraPosition(target, zoom) {
  if (!controls) return;
  controls.target.copy(target);
  camera.position.copy(target).add(new THREE.Vector3(42, 48.87, 64.5));
  camera.zoom = zoom;
  camera.updateProjectionMatrix();
  controls.update();
  requestDraw();
}

function focusEntity(id) {
  if (!world) return;
  const entity = entityById.get(id);
  const position = world.anchorFor(id);
  position.y = entity.focusY ?? (id === "GC-02" ? 3.0 : .93);
  const zoom = { "WH-05": 2.21, "AS-04": 2.75, "YD-03": 2.65, "GC-02": 3.1 };
  cameraPosition(position, zoom[id] ?? (entity.kind === "site" ? 3 : 3.65));
}

function setView(value, selectZone = false) {
  view = value;
  siteSelect.value = value;
  setText(get("scene-title"), value === "overview" ? "园区全景" : entityById.get(value).name);
  if (value === "overview") {
    cameraPosition(new THREE.Vector3(0, .43, MAP.centerZ), 1);
  } else {
    focusEntity(value);
    if (selectZone) selectEntity(value, false);
  }
}

function selectEntity(id, locate) {
  selected = id;
  world?.setActive(id);
  updateDetails();
  if (locate) {
    if (entityById.get(id).kind === "site") {
      setView(id);
    } else {
      view = "overview";
      siteSelect.value = view;
      setText(get("scene-title"), "设备定位");
      focusEntity(id);
    }
  }
  requestDraw();
}

siteSelect.addEventListener("change", () => setView(siteSelect.value, true));
get("focus").addEventListener("click", () => selectEntity(selected, true));
get("camera-reset").addEventListener("click", () => setView(view));
for (const [id, factor] of [["zoom-in", 1.24], ["zoom-out", 1 / 1.24]]) {
  get(id).addEventListener("click", () => {
    if (!camera) return;
    camera.zoom = clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom);
    camera.updateProjectionMatrix();
    requestDraw();
  });
}

function setPan(on) {
  if (!controls) return;
  controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  controls.touches.ONE = on ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  canvas.classList.toggle("is-panning", on);
  get("pan").setAttribute("aria-pressed", String(on));
  get("orbit").setAttribute("aria-pressed", String(!on));
  setText(get("scene-hint"), on ? "拖动平移 · 滚轮缩放" : "拖动旋转 · 滚轮缩放 · 右键平移");
}

get("orbit").addEventListener("click", () => setPan(false));
get("pan").addEventListener("click", () => setPan(true));

function showSearch() {
  const query = search.value.trim().toLowerCase();
  searchMatches = entities.filter(entity => [entity.id, entity.name, entity.short, entity.type].some(value => value.toLowerCase().includes(query)));
  activeResult = searchMatches.length ? 0 : -1;
  searchResults.replaceChildren();
  searchResults.hidden = false;
  search.setAttribute("aria-expanded", "true");
  if (!searchMatches.length) {
    const item = document.createElement("li");
    item.className = "empty-search";
    item.setAttribute("role", "presentation");
    item.textContent = "没有匹配的设备或站点";
    searchResults.append(item);
  }
  for (const entity of searchMatches) {
    const item = document.createElement("li");
    item.id = "result-" + entity.id;
    item.setAttribute("role", "option");
    item.innerHTML = `<b>${entity.name}</b><code>${entity.id}</code>`;
    item.addEventListener("pointerdown", event => event.preventDefault());
    item.addEventListener("click", () => pickSearch(entity.id));
    searchResults.append(item);
  }
  updateSearchActive();
}

function updateSearchActive() {
  for (const [index, item] of [...searchResults.querySelectorAll("[role=option]")].entries()) {
    item.setAttribute("aria-selected", String(index === activeResult));
  }
  if (activeResult === -1) search.removeAttribute("aria-activedescendant");
  else search.setAttribute("aria-activedescendant", "result-" + searchMatches[activeResult].id);
}

function hideSearch() {
  searchResults.hidden = true;
  search.setAttribute("aria-expanded", "false");
  search.removeAttribute("aria-activedescendant");
}

function pickSearch(id) {
  search.value = "";
  hideSearch();
  selectEntity(id, true);
}

search.addEventListener("focus", showSearch);
search.addEventListener("input", showSearch);
search.addEventListener("blur", hideSearch);
search.addEventListener("keydown", event => {
  if (event.key === "Escape") hideSearch();
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (searchResults.hidden) {
      showSearch();
    } else if (searchMatches.length) {
      const direction = event.key === "ArrowDown" ? 1 : -1;
      activeResult = (activeResult + direction + searchMatches.length) % searchMatches.length;
      updateSearchActive();
    }
  }
  if (event.key === "Enter" && !searchResults.hidden && activeResult !== -1) {
    event.preventDefault();
    pickSearch(searchMatches[activeResult].id);
  }
});

get("scan").addEventListener("click", () => {
  const result = sweepCollisions();
  const findings = result.collisions.length ? `${result.collisions.length} 段碰撞，涉及 ${result.hitSamples} 个采样点` : "未发现碰撞";
  setText(get("scan-summary"), `${result.sampleCount} 个采样点 · ${findings} · ${result.intentSamples} 次正常接触采样`);
  const list = get("scan-results");
  list.replaceChildren();
  for (const collision of result.collisions) {
    const line = document.createElement("div");
    line.className = "scan-line";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = collision.from.toFixed(1) + " 秒";
    button.addEventListener("click", () => {
      seekTo(collision.from);
      scanDialog.close();
    });
    const parties = document.createElement("span");
    const interval = collision.from === collision.to ? "" : `（至 ${collision.to.toFixed(1)} 秒）`;
    parties.textContent = collision.object + " / " + collision.obstacle + interval;
    line.append(button, parties);
    list.append(line);
  }
  scanDialog.showModal();
});

function downloadFile(blob, extension) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "砼序-" + DURATION + "秒厂区全景." + extension;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

get("export-cancel").addEventListener("click", () => {
  captureAbort?.abort();
  setText(get("export-note"), "正在取消…");
  get("export-cancel").disabled = true;
});

get("export").addEventListener("click", async () => {
  if (captureAbort) return;
  const button = get("export");
  const note = get("export-note");
  const bar = get("export-progress");
  const cancel = get("export-cancel");
  const controller = new AbortController();
  captureAbort = controller;
  button.disabled = true;
  cancel.hidden = false;
  cancel.disabled = false;
  bar.hidden = false;
  bar.value = 0;
  get("export-state").hidden = false;
  setText(note, "正在准备三维全景…");
  let capture;
  try {
    const { exportVideo } = await import("./export-video.js");
    controller.signal.throwIfAborted();
    const outputCanvas = document.createElement("canvas");
    capture = createWorld(outputCanvas, { capture: true });
    capture.renderer.setSize(1280, 720, false);
    const videoCamera = overviewCamera(1280 / 720);
    let percentage = -1;
    const result = await exportVideo({
      canvas: outputCanvas,
      renderFrame: seconds => capture.render(stateAt(seconds), videoCamera),
      duration: DURATION,
      signal: controller.signal,
      onProgress: fraction => {
        if (controller.signal.aborted) return;
        bar.value = fraction;
        const current = Math.round(fraction * 100);
        if (current !== percentage) {
          percentage = current;
          setText(note, `正在导出三维全景 · ${current}%`);
        }
      }
    });
    controller.signal.throwIfAborted();
    downloadFile(result.blob, result.extension);
    setText(note, "已生成 " + DURATION + " 秒三维厂区全景视频");
  } catch (error) {
    setText(note, controller.signal.aborted ? "已取消视频导出" : "视频导出失败 · " + (error?.message || "请重试"));
  } finally {
    capture?.dispose();
    captureAbort = undefined;
    button.disabled = !world;
    cancel.hidden = true;
    bar.hidden = true;
  }
});

try {
  world = createWorld(canvas);
  camera = overviewCamera(1.6);
  controls = new OrbitControls(camera, canvas);
  controls.target.set(0, .43, MAP.centerZ);
  controls.minZoom = .62;
  controls.maxZoom = 4.5;
  controls.minPolarAngle = .16;
  controls.maxPolarAngle = Math.PI * .485;
  controls.screenSpacePanning = true;
  controls.addEventListener("change", requestDraw);
  controls.update();
  world.setActive(selected);
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    cssWidth = Math.round(rect.width);
    cssHeight = Math.round(rect.height);
    if (!cssWidth || !cssHeight) return;
    world.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    world.renderer.setSize(cssWidth, cssHeight, false);
    setFrustum(camera, cssWidth / cssHeight);
    requestDraw();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  canvas.addEventListener("pointerdown", event => {
    if (event.button === 0 && event.isPrimary) pointerStart = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointerup", event => {
    const start = pointerStart;
    pointerStart = undefined;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const id = world.pick(event.clientX, event.clientY, camera);
    if (id) selectEntity(id, false);
  });
  canvas.addEventListener("pointercancel", () => { pointerStart = undefined; });
  canvas.addEventListener("pointermove", event => {
    if (event.buttons) return;
    canvas.classList.toggle("is-pickable", Boolean(world.pick(event.clientX, event.clientY, camera)));
  });
  canvas.addEventListener("pointerleave", () => canvas.classList.remove("is-pickable"));
} catch {
  get("scene-error").hidden = false;
  setText(get("scene-error"), "三维场景启动失败。请确认浏览器启用了 WebGL 后刷新页面。");
  get("export").disabled = true;
}
setTime(0);
