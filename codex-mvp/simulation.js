export const DURATION = 60;
export const CAPACITY = 9;
export const MAP = { width: 104, depth: 58, centerZ: 1 };
export const SITE = { x: 8.2, z: -4.45, width: 8, depth: 4.95 };
export const STOCK = {
  z: 16.2, pickup: -20.2, delivery: -8.5, forkReach: 1.36,
  ground: .095, palletHeight: .54, loads: 3
};
export const GANTRY = {
  west: 6.8, east: 28, north: 14.65, south: 21.85, rail: 5.48,
  z: 18.2, pickup: 10.7, destinations: [25, 22.45, 19.9, 17.35],
  pad: .29, panelWidth: 2.22, panelDepth: .43, panelHeight: 2.22
};
export const FACTORY = { x: 21.5, z: -18.5, width: 29, depth: 11.2 };
export const DELIVERY = { aisle: -10.4, east: 44.5, west: -44.5, gate: 24, bay: 29.8, crates: 3 };
export const MIXER_LANE = 3.75;
export const PLANT_STOP = -14.5;
export const POUR_STOP = 11.3;
export const TILE_WIDTH = SITE.width / 4;
export const TILE_DEPTH = SITE.depth / 3;
export const entities = [
  { id: "MX-07", name: "混凝土搅拌车", short: "搅拌车", type: "运输设备", kind: "vehicle", color: "#277d70" },
  { id: "EX-12", name: "履带式挖掘机", short: "挖掘机", type: "土方设备", kind: "vehicle", color: "#a55b20" },
  { id: "FL-04", name: "材料转运叉车", short: "叉车", type: "转运设备", kind: "vehicle", color: "#955266" },
  { id: "GC-02", name: "装配龙门吊", short: "龙门吊", type: "吊装设备", kind: "vehicle", color: "#aa622c" },
  { id: "DV-05", name: "园区配送车", short: "配送车", type: "配送设备", kind: "vehicle", color: "#50758e" },
  { id: "PL-01", name: "西区拌合站", short: "拌合站", type: "供料区域", kind: "site", color: "#277d70", focusY: 2.2 },
  { id: "ST-02", name: "东区施工面", short: "施工区", type: "施工作业区域", kind: "site", color: "#a85443", focusY: 1.35 },
  { id: "YD-03", name: "南区材料堆场", short: "堆场", type: "场内物流", kind: "site", color: "#955266", focusY: 1.5 },
  { id: "AS-04", name: "南区预制装配区", short: "装配区", type: "预制装配", kind: "site", color: "#aa622c", focusY: 2.3 },
  { id: "WH-05", name: "北区生产车间", short: "生产车间", type: "车间与月台", kind: "site", color: "#50758e", focusY: 2.3 }
];
export const FLEET_SIZE = entities.filter(entity => entity.kind === "vehicle").length;
export const stages = [
  { name: "土方开挖", start: 0, stop: 16, color: "#bb712e" },
  { name: "装料与浇筑", start: 16, stop: 36, color: "#2b8879" },
  { name: "砖墙砌筑", start: 36, stop: 60, color: "#b86451" }
];

export const tiles = [];
for (let x = 0; x < 4; x++) {
  for (let row = 0; row < 3; row++) {
    const z = x % 2 ? row : 2 - row;
    tiles.push({ x: SITE.x + (x + .5) * TILE_WIDTH, z: SITE.z + (z + .5) * TILE_DEPTH });
  }
}

export const courses = [];
const brickWidth = 1.02;
const wallX = SITE.x + .32;
const wallEnd = SITE.x + SITE.width - .39;
const wallZ = SITE.z + .37;
const wallReturn = SITE.z + SITE.depth - .55;
for (let row = 0; row < 6; row++) {
  const bricks = [];
  const offset = row % 2 ? -.53 : 0;
  for (let x = wallX + offset; x < wallEnd - .09; x += brickWidth) {
    const start = Math.max(wallX, x);
    const end = Math.min(wallEnd, x + brickWidth);
    if (end - start > .09) bricks.push({ x: (start + end) / 2, z: wallZ, width: end - start - .027, depth: .48 });
  }
  for (let z = wallZ + .26 + offset; z < wallReturn - .09; z += brickWidth) {
    const start = Math.max(wallZ + .26, z);
    const end = Math.min(wallReturn, z + brickWidth);
    if (end - start > .09) bricks.push({ x: wallEnd - .24, z: (start + end) / 2, width: .48, depth: end - start - .027 });
  }
  courses.push(bricks);
}
export const BRICK_COUNT = courses.reduce((sum, row) => sum + row.length, 0);

export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function ease(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

const vehicleStates = {
  waiting: "待装料",
  loading: "装料中",
  driving: "运输中",
  pouring: "浇筑中",
  done: "已完成"
};

function excavatorAt(time, progress) {
  const stow = ease((time - 7.70) / .49);
  const advance = ease((time - 1.55) / 6.45);
  const x = 5.94 + 7.48 * advance;
  const z = 1.72;
  const indexing = Math.min(progress, tiles.length - 1e-6);
  const index = Math.floor(indexing);
  const target = tiles[index];
  const cycle = indexing - index;
  const extension = ease(cycle / .39) * (1 - ease((cycle - .67) / .33));
  const bite = ease((cycle - .24) / .23) * (1 - ease((cycle - .52) / .26));
  const tip = {
    x: lerp(lerp(x + 1.72, target.x, extension), x + 1.35, stow),
    z: lerp(lerp(z - .30, target.z, extension), z - .32, stow),
    y: lerp(1.02 - .88 * bite + .39 * ease((cycle - .58) / .26), .91, stow)
  };
  const angle = Math.atan2(tip.z - z, tip.x - x);
  const pivot = { x: x + Math.cos(angle) * .55, z: z + Math.sin(angle) * .55, y: 1.08 };
  const knee = {
    x: lerp(pivot.x, tip.x, .57),
    z: lerp(pivot.z, tip.z, .57),
    y: 2.59 - .54 * bite
  };
  return { x, z, angle, pivot, knee, tip, index, cycle, bite, carrying: cycle > .59 && cycle < .92 && stow < .44 };
}

function forkliftAt(time) {
  const start = 2.4;
  const cycle = 15;
  const duration = STOCK.loads * cycle;
  const elapsed = clamp(time - start, 0, duration);
  const index = Math.min(Math.floor(elapsed / cycle), STOCK.loads - 1);
  const phase = (elapsed - index * cycle) * 12 / cycle;
  const stagedX = STOCK.pickup - 3.8;
  const approach = ease(phase / 2);
  const move = ease((phase - 3.1) / 3.9);
  const retreat = ease((phase - 8.6) / 3.4);
  const x = lerp(lerp(lerp(stagedX, STOCK.pickup, approach), STOCK.delivery, move), stagedX, retreat);
  const carried = phase >= 2 && phase < 8.6;
  const landedHeight = index * STOCK.palletHeight + .14;
  const lift = lerp(.14, Math.max(.98, landedHeight + .34), ease((phase - 2) / 1.1));
  const lower = ease((phase - 7) / 1.6);
  const forks = lerp(lerp(lift, landedHeight, lower), .14, retreat);
  const delivered = index + Number(phase >= 8.6);
  let status = "待转运";
  if (time >= start + duration) status = "已停靠";
  else if (time >= start) {
    if (phase < 2) status = "驶向取料位";
    else if (phase < 3.1) status = "取料起升";
    else if (phase < 7) status = "运往交接位";
    else if (phase < 8.6) status = "卸料叠放";
    else status = "返回取料位";
  }
  const pallets = Array.from({ length: STOCK.loads }, (_, number) => {
    if (number < delivered) return { x: STOCK.delivery + STOCK.forkReach, y: STOCK.ground + .15 + number * STOCK.palletHeight };
    if (number !== index) return null;
    if (carried) return { x: x + STOCK.forkReach, y: STOCK.ground + forks + .01 };
    return { x: STOCK.pickup + STOCK.forkReach, y: STOCK.ground + .15 };
  });
  return { x, z: STOCK.z, forks, carried, delivered, pallets, status, active: time >= start && time < start + duration };
}

function gantryAt(time) {
  const start = 12.2;
  const cycle = 10.6;
  const duration = GANTRY.destinations.length * cycle;
  const elapsed = clamp(time - start, 0, duration);
  const index = Math.min(Math.floor(elapsed / cycle), GANTRY.destinations.length - 1);
  const phase = (elapsed - index * cycle) * 8.2 / cycle;
  const raised = 4.62;
  const lowered = GANTRY.pad + GANTRY.panelHeight + .22;
  const pickup = ease(phase / 1.3);
  const lifting = ease((phase - 1.3) / 1.17);
  const transfer = ease((phase - 2.47) / 2.7);
  const placing = ease((phase - 5.17) / 1.36);
  const returnUp = ease((phase - 6.53) / .75);
  const returning = ease((phase - 7.28) / .92);
  const finalCycle = index === GANTRY.destinations.length - 1;
  const x = lerp(lerp(GANTRY.pickup, GANTRY.destinations[index], transfer), GANTRY.pickup, finalCycle ? 0 : returning);
  const hook = lerp(lerp(lerp(lerp(raised, lowered, pickup), raised, lifting), lowered, placing), raised, returnUp);
  const carried = phase >= 1.3 && phase < 6.53;
  const installed = index + Number(phase >= 6.53);
  const panels = GANTRY.destinations.map((destination, number) => {
    if (number < installed) return { x: destination, y: GANTRY.pad };
    if (number !== index) return null;
    if (carried) return { x, y: hook - GANTRY.panelHeight - .22 };
    return { x: GANTRY.pickup, y: GANTRY.pad };
  });
  let status = "待吊装";
  if (time >= start + duration) status = "已停靠";
  else if (time >= start) {
    if (phase < 1.3) status = "准备吊挂";
    else if (phase < 2.47) status = "起升构件";
    else if (phase < 5.17) status = "跨区移运";
    else if (phase < 6.53) status = "下放安装";
    else status = finalCycle ? "收钩" : "返回取件位";
  }
  return { x, hook, carried, installed, panels, status, active: time >= start && time < start + duration };
}

function roundedCorner(start, corner, end) {
  return Array.from({ length: 9 }, (_, index) => {
    const t = index / 8;
    return start.map((value, axis) => (1 - t) ** 2 * value + 2 * t * (1 - t) * corner[axis] + t ** 2 * end[axis]);
  });
}

function measurePath(points) {
  const distances = [0];
  for (let index = 1; index < points.length; index++) {
    distances.push(distances[index - 1] + Math.hypot(
      points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]
    ));
  }
  return { points, distances, length: distances.at(-1) };
}

const inbound = measurePath([
  [DELIVERY.east, DELIVERY.gate],
  ...roundedCorner([DELIVERY.east, DELIVERY.aisle + 4], [DELIVERY.east, DELIVERY.aisle], [DELIVERY.east - 4, DELIVERY.aisle]),
  [DELIVERY.bay, DELIVERY.aisle]
]);
const outbound = measurePath([
  [DELIVERY.bay, DELIVERY.aisle],
  ...roundedCorner([DELIVERY.west + 4, DELIVERY.aisle], [DELIVERY.west, DELIVERY.aisle], [DELIVERY.west, DELIVERY.aisle + 4]),
  [DELIVERY.west, DELIVERY.gate]
]);
export const DELIVERY_ROUTE = [...inbound.points, ...outbound.points.slice(1)];

function deliveryAt(time) {
  const path = time < 37 ? inbound : outbound;
  const moving = time < 37 ? ease((time - 3) / 19) : ease((time - 37) / 21);
  const distance = moving * path.length;
  const index = path.distances.findIndex((next, index) => index > 0 && next >= distance);
  const before = path.points[index - 1];
  const after = path.points[index];
  const progress = (distance - path.distances[index - 1]) / (path.distances[index] - path.distances[index - 1]);
  const status = time < 3 ? "门岗待发" : time < 22 ? "驶往月台" : time < 37 ? "卸货交接" : time < 58 ? "驶离车间" : "完成配送";
  return {
    x: lerp(before[0], after[0], progress), z: lerp(before[1], after[1], progress),
    angle: Math.atan2(after[1] - before[1], after[0] - before[0]),
    received: Math.floor(clamp((time - 22) / 15) * DELIVERY.crates + 1e-8),
    status, active: time >= 3 && time < 58
  };
}

export function stateAt(value) {
  const elapsed = clamp(value, 0, DURATION);
  // The original construction timetable keeps its geometry and timing ratios.
  const time = elapsed / 2;
  const stage = time < 8 ? 0 : time < 18 ? 1 : 2;
  const progress = clamp(time / 8);
  const digging = (progress - .041 * Math.sin(Math.PI * progress)) * tiles.length;
  const removed = Math.min(tiles.length, Math.floor(digging + .42));
  const dumped = Math.min(tiles.length, Math.floor(digging + 1e-8));
  const loading = clamp((time - 8) / 2.35);
  const driving = ease((time - 10.35) / 3.94);
  const poured = clamp((time - 14.6) / 3.4);
  const pouring = time >= 14.6 && time < 18;
  const mode = time < 8 ? "waiting" : time < 10.35 ? "loading" : time < 14.6 ? "driving" : time < 18 ? "pouring" : "done";
  const course = clamp((time - 18) / 2, 0, courses.length);
  const completedCourses = Math.floor(course);
  const bricks = courses.reduce((sum, row, i) => sum + Math.floor(clamp(course - i) * row.length + 1e-7), 0);
  const excavator = excavatorAt(time, digging);
  const forklift = forkliftAt(elapsed);
  const gantry = gantryAt(elapsed);
  const delivery = deliveryAt(elapsed);
  return {
    time: elapsed, constructionTime: time, stage, removed, dumped, loading, driving, poured, pouring, course, completedCourses, bricks, excavator, forklift, gantry, delivery,
    localProgress: clamp((elapsed - stages[stage].start) / (stages[stage].stop - stages[stage].start)),
    mixer: { x: lerp(PLANT_STOP, POUR_STOP, driving), z: MIXER_LANE, mode, status: vehicleStates[mode], load: CAPACITY * Math.max(0, loading - poured) },
    workingVehicles: Number(time < 8) + Number(time >= 8 && time < 18) + Number(forklift.active) + Number(gantry.active) + Number(delivery.active)
  };
}

export function detailsFor(id, state) {
  const {constructionTime: time, loading, driving, removed, poured, bricks, mixer, pouring, completedCourses} = state;
  if (id === "DV-05" || id === "WH-05") {
    const { received, status } = state.delivery;
    const atBay = state.time >= 22 && state.time < 37;
    return { status: id === "DV-05" ? status : received === DELIVERY.crates ? "入库完成" : atBay ? "正在收货" : "等待配送", location: id === "WH-05" || atBay ? "北区生产车间 · 3 号月台" : "厂区环道", value: String(received), unit: "/ " + DELIVERY.crates + " 箱", label: "已验收入库", progress: received / DELIVERY.crates };
  }
  if (id === "FL-04" || id === "YD-03") {
    const { status, delivered } = state.forklift;
    return { status: id === "FL-04" ? status : delivered === STOCK.loads ? "转运完成" : delivered ? "接收中" : "待接收", location: "南区材料堆场", value: String(delivered), unit: "/ " + STOCK.loads + " 托", label: "已移交托盘", progress: delivered / STOCK.loads };
  }
  if (id === "GC-02" || id === "AS-04") {
    const { status, installed } = state.gantry;
    const total = GANTRY.destinations.length;
    return { status: id === "GC-02" ? status : installed === total ? "构件就位" : "装配作业", location: "南区预制装配区", value: String(installed), unit: "/ " + total + " 件", label: "已安装构件", progress: installed / total };
  }
  if (id === "MX-07") {
    const step = { waiting: 0, loading: loading / 3, driving: (1 + driving) / 3, pouring: (2 + poured) / 3, done: 1 };
    return { status: mixer.status, location: time < 10.35 ? "西区拌合站" : time < 14.29 ? "场内运输路" : "东区施工面", value: mixer.load.toFixed(1), unit: "/ 9 m³", label: "车载方量", progress: step[mixer.mode] };
  }
  if (id === "EX-12") {
    return { status: time < 8 ? "开挖中" : "已停靠", location: "东区施工面", value: String(removed), unit: "/ 12 块", label: "已清除土方", progress: removed / tiles.length };
  }
  if (id === "PL-01") {
    return { status: time < 8 ? "待供料" : loading < 1 ? "供料中" : "已发车", location: "西区", value: (loading * CAPACITY).toFixed(1), unit: "/ 9 m³", label: "累计出料", progress: loading };
  }
  if (time < 8) return { status: "场地开挖", location: "东区", value: String(removed), unit: "/ 12 块", label: "已清除土方", progress: removed / tiles.length };
  if (time < 18) return { status: pouring ? "地坪浇筑" : "等候配送", location: "东区", value: (poured * CAPACITY).toFixed(1), unit: "/ 9 m³", label: "累计浇筑", progress: poured };
  return { status: state.time === DURATION ? "施工完成" : "砖墙砌筑", location: "东区", value: String(completedCourses), unit: "/ 6 层", label: "已砌筑墙层", progress: bricks / BRICK_COUNT };
}

function bounds(id, label, x, z, hx, hz, bottom, top, angle = 0) {
  return { id, label, x, z, hx, hz, bottom, top, angle };
}

export const obstacles = [
  bounds("silo-west", "拌合站西侧料仓", -18.6, -3.38, 1.34, 1.35, 0, 6.85),
  bounds("silo-mid", "拌合站中间料仓", -15.55, -3.38, 1.34, 1.35, 0, 7.35),
  bounds("silo-east", "拌合站东侧料仓", -12.5, -3.38, 1.34, 1.35, 0, 6.85),
  bounds("hopper-west", "装载架西柱", -16.36, 2.07, .18, .18, 0, 4.55),
  bounds("hopper-east", "装载架东柱", -12.64, 2.07, .18, .18, 0, 4.55),
  bounds("hopper-near-west", "装载架西侧车道柱", -16.36, 5.43, .18, .18, 0, 4.55),
  bounds("hopper-near-east", "装载架东侧车道柱", -12.64, 5.43, .18, .18, 0, 4.55),
  bounds("hopper", "装料斗", -15.05, 3.75, .74, .79, 3.01, 4.63),
  bounds("plant-office", "站务控制室", -7.55, -5.2, 2.1, 1.46, 0, 2.8),
  bounds("job-container", "施工工具箱", 20.05, -4.55, 1.62, .95, 0, 1.66),
  bounds("brick-pallet", "砖料托盘", 18.64, -.45, .81, .78, 0, .75),
  bounds("spoil", "弃土堆", 5.05, -6.2, 1.48, .94, 0, .7),
  bounds("road-west", "西段路灯", -2.7, 1.30, .11, .11, 0, 3.36),
  bounds("road-mid", "中段路灯", 1.8, 1.30, .11, .11, 0, 3.36),
  bounds("road-east", "东段路灯", 22.2, 1.30, .11, .11, 0, 3.36),
  bounds("rail-west", "拌合站围挡", -18.62, -9.07, 3.41, .16, 0, .86),
  bounds("rail-job", "工地后侧围挡", 12.48, -8.15, 3.41, .16, 0, .86),
  bounds("rail-job-east", "工地东侧围挡", 20.53, .89, 1.37, .16, 0, .86),
  bounds("materials-rack", "堆场材料架", -24.0, 20.75, 3.3, 1.16, 0, 3.5),
  bounds("yard-office", "物流调度房", -12.4, 21.15, 3.15, 1.6, 0, 3.1),
  bounds("prefab-shed", "预制检修棚", 17.4, 11.35, 5.2, 1.4, 0, 3.25),
  bounds("north-factory", "北区生产车间", FACTORY.x, FACTORY.z, FACTORY.width / 2, FACTORY.depth / 2, 0, 7.6),
  ...[GANTRY.west, GANTRY.east].flatMap((x, row) =>
    [GANTRY.north, GANTRY.south].map((z, column) =>
      bounds("gantry-leg-" + row + column, "龙门轨道立柱", x, z, .37, .43, 0, GANTRY.rail)
    )
  )
];

const formwork = [
  bounds("form-near", "地坪南侧模板", SITE.x + SITE.width / 2, SITE.z + SITE.depth + .075, SITE.width / 2 + .15, .195, .06, .55),
  bounds("form-far", "地坪北侧模板", SITE.x + SITE.width / 2, SITE.z - .075, SITE.width / 2 + .15, .195, .06, .55),
  bounds("form-west", "地坪西侧模板", SITE.x - .09, SITE.z + SITE.depth / 2, .065, SITE.depth / 2, .06, .44),
  bounds("form-east", "地坪东侧模板", SITE.x + SITE.width + .09, SITE.z + SITE.depth / 2, .065, SITE.depth / 2, .06, .44)
];

function armBounds(a, b, id, label) {
  const distance = Math.hypot(b.x - a.x, b.z - a.z);
  const angle = Math.atan2(b.z - a.z, b.x - a.x);
  return Array.from({ length: 4 }, (_, i) => {
    const from = i / 4;
    const to = (i + 1) / 4;
    const middle = (from + to) / 2;
    const y = lerp(a.y, b.y, from);
    const farY = lerp(a.y, b.y, to);
    return bounds(id, label, lerp(a.x, b.x, middle), lerp(a.z, b.z, middle),
      distance / 8 + .07, .145, Math.min(y, farY) - .14, Math.max(y, farY) + .14, angle);
  });
}

export function vehicleBounds(state) {
  const { mixer, excavator, forklift, gantry, delivery } = state;
  const parts = [
    bounds("MX-07", "搅拌车车身", mixer.x, mixer.z, 2.34, .945, .04, 2.68),
    bounds("EX-12", "挖掘机底盘", excavator.x, excavator.z, 1.32, .91, .02, .65),
    bounds("EX-12", "挖掘机上车体", excavator.x, excavator.z, .98, .84, .59, 1.72, excavator.angle),
    ...armBounds(excavator.pivot, excavator.knee, "EX-12", "挖掘机主臂"),
    ...armBounds(excavator.knee, excavator.tip, "EX-12", "挖掘机斗杆"),
    bounds("EX-12", "挖掘机铲斗", excavator.tip.x, excavator.tip.z, .38, .38, excavator.tip.y - .05, excavator.tip.y + .4, excavator.angle),
    bounds("FL-04", "叉车车体", forklift.x, forklift.z, .94, .67, STOCK.ground, STOCK.ground + 1.94),
    bounds("FL-04", "叉车货叉", forklift.x + STOCK.forkReach, forklift.z, .6, .46, STOCK.ground + forklift.forks - .052, STOCK.ground + forklift.forks + .065),
    bounds("GC-02", "龙门吊吊钩", gantry.x, GANTRY.z, .22, .22, gantry.hook - .13, gantry.hook + .19),
    bounds("DV-05", "园区配送车车身", delivery.x, delivery.z, 2.15, .88, .07, 2.34, delivery.angle)
  ];
  if (forklift.carried) {
    const pallet = forklift.pallets[forklift.delivered];
    parts.push(bounds("FL-04", "转运中的托盘", pallet.x, forklift.z, .525, .5, pallet.y, pallet.y + .46));
  }
  if (gantry.carried) {
    const panel = gantry.panels[gantry.installed];
    parts.push(bounds("GC-02", "吊装中的预制构件", panel.x, GANTRY.z,
      GANTRY.panelWidth / 2, GANTRY.panelDepth / 2, panel.y, panel.y + GANTRY.panelHeight));
  }
  return parts;
}

export function intersects(a, b) {
  if (a.top <= b.bottom || b.top <= a.bottom) return false;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const maxSpan = a.hx + a.hz + b.hx + b.hz;
  if (Math.abs(dx) >= maxSpan || Math.abs(dz) >= maxSpan) return false;
  const aX = [Math.cos(a.angle ?? 0), Math.sin(a.angle ?? 0)];
  const aZ = [-aX[1], aX[0]];
  const bX = [Math.cos(b.angle ?? 0), Math.sin(b.angle ?? 0)];
  const bZ = [-bX[1], bX[0]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1];
  return [aX, aZ, bX, bZ].every(axis =>
    Math.abs(dx * axis[0] + dz * axis[1]) < a.hx * Math.abs(dot(aX, axis)) + a.hz * Math.abs(dot(aZ, axis)) + b.hx * Math.abs(dot(bX, axis)) + b.hz * Math.abs(dot(bZ, axis)));
}

export function sweepCollisions({extraObstacles = []} = {}) {
  const groups = new Map();
  let intentSamples = 0;
  let hitSamples = 0;
  for (let k = 0; k <= DURATION * 10; k++) {
    const time = k / 10;
    const state = stateAt(time);
    const vehicles = vehicleBounds(state);
    const sample = new Set();
    const check = (object, obstacle) => {
      if (object.id === obstacle.id || !intersects(object, obstacle)) return;
      const key = object.label + " / " + obstacle.label;
      if (sample.has(key)) return;
      sample.add(key);
      const intervals = groups.get(key) ?? [];
      const previous = intervals.at(-1);
      if (previous?.lastSample === k - 1) {
        previous.to = time;
        previous.lastSample = k;
      } else {
        intervals.push({ object: object.label, obstacle: obstacle.label, from: time, to: time, lastSample: k });
        groups.set(key, intervals);
      }
    };
    const installed = state.gantry.panels.slice(0, state.gantry.installed).map((panel, index) =>
      bounds("installed-panel-" + index, "就位的预制构件 " + (index + 1), panel.x, GANTRY.z,
        GANTRY.panelWidth / 2, GANTRY.panelDepth / 2, panel.y, panel.y + GANTRY.panelHeight)
    );
    const fixed = [...obstacles, ...(state.stage > 0 ? formwork : []), ...installed, ...extraObstacles];
    for (const [index, vehicle] of vehicles.entries()) {
      for (const obstacle of fixed) check(vehicle, obstacle);
      for (let other = index + 1; other < vehicles.length; other++) check(vehicle, vehicles[other]);
    }
    if (sample.size) hitSamples++;
    if (state.stage > 0) continue;
    const bucket = vehicles.find(part => part.label === "挖掘机铲斗");
    const active = tiles[state.excavator.index];
    const soil = bounds("work-soil", "施工作业土方", active.x, active.z, TILE_WIDTH / 2 - .035, TILE_DEPTH / 2 - .035, .06, .52);
    if (intersects(bucket, soil) && state.excavator.cycle <= .58) intentSamples++;
  }
  return {
    sampleCount: DURATION * 10 + 1,
    hitSamples,
    intentSamples,
    collisions: [...groups.values()].flat().sort((a, b) => a.from - b.from)
  };
}
