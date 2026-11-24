import * as THREE from "three";
import {
  MAP, SITE, STOCK, GANTRY, FACTORY, DELIVERY, DELIVERY_ROUTE, MIXER_LANE, PLANT_STOP, POUR_STOP, TILE_WIDTH, TILE_DEPTH,
  entities, tiles, courses, clamp, ease, lerp
} from "./simulation.js";

const theme = {
  sand: 0xd6c5a5, edge: 0x82978a, grass: 0xa6b697, moss: 0x7c9f84, tree: 0x6b947e,
  road: 0x606e69, roadEdge: 0x7f8a80, marking: 0xf1dba1, pavement: 0xb4bcb0,
  ink: 0x344841, teal: 0x327668, sea: 0x5a9c88, white: 0xecebdd, steel: 0x98aea6,
  glass: 0x456e6a, tire: 0x253633, amber: 0xdca242, yellow: 0xeebf60,
  wood: 0x9d6444, clay: 0xb88457, soil: 0xa66e4b, pit: 0x9b7758, pale: 0xc2cec1,
  concrete: 0xaabdba, wet: 0x98b2ac, terra: 0xb76952
};
const materialCache = new Map();
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const raycaster = new THREE.Raycaster();
const cameraTarget = new THREE.Vector3();

function material(color) {
  if (!materialCache.has(color)) materialCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: .87 }));
  return materialCache.get(color);
}

function mesh(parent, geometry, color, x, y, z, shadow = true) {
  const part = new THREE.Mesh(geometry, material(color));
  part.position.set(x, y, z);
  part.castShadow = shadow;
  part.receiveShadow = true;
  parent.add(part);
  return part;
}

function box(parent, x, y, z, width, height, depth, color, shadow = true) {
  const part = mesh(parent, boxGeometry, color, x, y, z, shadow);
  part.scale.set(width, height, depth);
  return part;
}

function cylinder(parent, x, y, z, top, bottom, height, color, sides = 12) {
  return mesh(parent, new THREE.CylinderGeometry(top, bottom, height, sides), color, x, y, z);
}

function tube(parent, start, end, radius, color, sides = 8) {
  const layer = cylinder(parent, 0, 0, 0, radius, radius, 1, color, sides);
  positionBeam(layer, start, end);
  return layer;
}

function positionBeam(beam, start, end, width = 1, depth = width) {
  const axis = new THREE.Vector3().subVectors(end, start);
  beam.position.copy(start).addScaledVector(axis, .5);
  beam.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, axis.clone().normalize());
  beam.scale.set(width, axis.length(), depth);
}

function polygon(parent, points, y, color) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => index ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
  shape.closePath();
  const plane = mesh(parent, new THREE.ShapeGeometry(shape), color, 0, y, 0, false);
  plane.rotation.x = -Math.PI / 2;
  return plane;
}

function point(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

function label(parent, text, x, y, z, width, border = "#456d62") {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 85;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = border;
  ctx.fillRect(0, 0, 384, 85);
  ctx.font = '700 53px "Microsoft YaHei", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f7f4e8";
  ctx.fillText(text, 192, 45);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, width * .22), new THREE.MeshBasicMaterial({ map: texture }));
  sign.position.set(x, y, z);
  parent.add(sign);
}

function tree(parent, x, z, scale, index) {
  const trunk = 1.0 * scale;
  cylinder(parent, x, trunk / 2, z, .14 * scale, .19 * scale, trunk, 0x8e785e, 6);
  const colors = [theme.tree, theme.moss, 0x91a77c];
  const foliage = mesh(parent, new THREE.IcosahedronGeometry(.91 * scale, 0), colors[index % 3], x, 1.54 * scale, z);
  foliage.rotation.y = index * .43;
  foliage.scale.y = 1.21;
  mesh(parent, new THREE.IcosahedronGeometry(.58 * scale, 0), colors[(index + 1) % 3], x + .42 * scale, 1.19 * scale, z - .18);
}

function barrier(parent, x, z, turn = false, count = 3) {
  const rail = new THREE.Group();
  parent.add(rail);
  rail.position.set(x, 0, z);
  rail.rotation.y = turn ? Math.PI / 2 : 0;
  for (let n = 0; n <= count; n++) {
    const slot = n * .82;
    box(rail, slot, .12, 0, .24, .24, .32, theme.steel);
    box(rail, slot, .46, 0, .11, .78, .12, theme.ink);
    if (n < count) {
      box(rail, slot + .41, .55, 0, .72, .15, .11, n % 2 ? theme.ink : theme.yellow);
      box(rail, slot + .41, .29, 0, .72, .093, .089, theme.steel);
    }
  }
}

function streetLight(parent, x, z) {
  cylinder(parent, x, 1.68, z, .073, .105, 3.36, theme.steel, 7);
  tube(parent, point(x, 3.19, z), point(x, 3.50, z + .62), .065, theme.steel);
  box(parent, x, 3.49, z + .79, .29, .12, .49, theme.ink);
  box(parent, x, 3.42, z + .79, .21, .035, .35, theme.white, false);
}

function base(scene, plant, job) {
  box(scene, 0, -.69, MAP.centerZ, MAP.width - .35, .56, MAP.depth - .35, theme.edge);
  box(scene, 0, -.24, MAP.centerZ, MAP.width, .45, MAP.depth, theme.sand);
  box(scene, 0, -.03, MAP.centerZ, MAP.width - .35, .07, MAP.depth - .35, theme.grass, false);
  polygon(plant, [[-22.9, -9.9], [-5.1, -9.9], [-3.9, -8.7], [-3.9, 5.9], [-22.9, 5.9]], .025, theme.pavement);
  polygon(job, [[3.8, -8.7], [22.15, -8.7], [22.9, -7.9], [22.9, 3], [4, 3]], .029, 0xd8c4a0);
  box(scene, 0, .031, MIXER_LANE, MAP.width - .1, .042, 4.70, theme.roadEdge, false);
  box(scene, 0, .06, MIXER_LANE, MAP.width - .1, .018, 4.32, theme.road, false);
  for (let x = -MAP.width / 2 + 1.4; x < MAP.width / 2 - 1; x += 2.36) {
    box(scene, x, .074, 4.10, 1.08, .013, .077, theme.marking, false);
  }
  for (const z of [1.64, 5.86]) box(scene, 0, .077, z, MAP.width - .2, .015, .065, 0xdadacc, false);
  for (let i = 0; i < 7; i++) box(scene, -1.83 + i * .29, .079, 3.02, .16, .014, 1.82, 0xc9cdc0, false);
  for (const x of [-2.7, 1.8, 22.2]) streetLight(scene, x, 1.30);
  for (const x of [-20.1, -11.2, -1.4, 9.7, 18.0]) box(scene, x, .035, 8.55, 3.25, .06, 1.18, 0x9cab88, false);
  const trees = [
    [-22, 9, .95], [-20.9, 8.44, .73], [-17.9, 9.92, .84], [-12.8, 9.35, 1.01], [-8.3, 9.49, .76],
    [-5.7, 8.03, .74], [-3.4, -8.6, 1.03], [-1.6, -9.51, .87], [.9, -9.65, .72], [3.1, -9.3, .92],
    [1.9, 9.49, 1.01], [3.4, 9.88, .73], [9.2, 8.63, .95], [12.6, 9.46, .77], [17.62, 9.32, 1.05],
    [19.4, 8.75, .83], [22.02, 8.1, .79], [-21.8, -10.5, .72], [21.71, -10.2, .85]
  ];
  trees.forEach(([x, z, scale], index) => tree(scene, x, z, scale, index));
  for (let index = 0; index < 34; index++) {
    const x = -21.75 + index * 7.01 % 43.45;
    const z = 7.3 + index * 2.9 % 3.84;
    box(scene, x, .03, z, .19 + index % 3 * .10, .04, .095, index % 3 ? 0xafb991 : 0x839b77, false);
  }
  barrier(plant, -21.9, -9.07, false, 8);
  barrier(job, 9.2, -8.15, false, 8);
  barrier(job, 19.3, .89, false, 3);

  box(scene, 0, .047, 10.35, 89, .039, 2.85, theme.road, false);
  box(scene, 0, .037, DELIVERY.aisle, 92.8, .049, 4.8, theme.roadEdge, false);
  box(scene, 0, .059, DELIVERY.aisle, 92.8, .018, 4.26, theme.road, false);
  const loopDepth = DELIVERY.gate - DELIVERY.aisle;
  for (const x of [DELIVERY.west, DELIVERY.east]) {
    box(scene, x, .049, (DELIVERY.gate + DELIVERY.aisle) / 2, 4.45, .034, loopDepth + 4.2, theme.road, false);
    streetLight(scene, x * .94, 9.05);
    for (const z of [-20, -16, -8, -3, 1, 8, 14, 19, 25]) {
      tree(scene, x + Math.sign(x) * 4.7, z, .78 + Math.abs(z % .6), Math.round(z + 23));
    }
    for (const z of [-5.0, -.7, 8.2, 14.8, 20.6]) {
      box(scene, x, .078, z, .075, .013, 1.15, theme.marking, false);
    }
    for (const side of [-1, 1]) {
      box(scene, x + side * 3.04, 1.19, 27.05, .28, 2.38, .35, theme.ink);
      box(scene, x + side * 3.04, .47, 27.05, .42, .74, .46, theme.amber);
    }
    box(scene, x, 3.25, 27.05, 6.5, .26, .46, theme.ink);
    label(scene, x > 0 ? "东区入口" : "西区出口", x, 3.55, 27.28, 3.2);
  }
  for (let x = -40; x <= 40; x += 3.1) {
    box(scene, x, .076, 10.35, 1.37, .012, .074, theme.marking, false);
    if (x < FACTORY.x - FACTORY.width / 2 || x > FACTORY.x + FACTORY.width / 2) {
      box(scene, x, .076, DELIVERY.aisle, 1.37, .012, .074, theme.marking, false);
    }
  }
  for (const x of [-38, -33, -28.2, -3.1, -.2, 2.7, 28.9, 35.1, 38.8]) {
    tree(scene, x, 26.1, .94, Math.round(x + 40));
  }
  for (let x = -47; x <= 47; x += 4.4) {
    box(scene, x, .61, -26.4, .12, 1.22, .14, theme.ink);
    if (x + 4.4 <= 47) box(scene, x + 2.2, .73, -26.4, 4.3, .46, .11, theme.steel);
  }
  polygon(scene, [[-42.8,-24.5],[-32,-24.5],[-31,-22],[-31,-13.5],[-42.8,-13.5]], .034, theme.pavement);
  box(scene, -37, 1.95, -20.85, 8.2, 3.81, 5.65, theme.steel);
  box(scene, -37, 3.93, -20.85, 8.44, .29, 6.02, theme.teal);
  for (const x of [-39.5,-36.2]) box(scene, x, 2.02, -17.995, 1.64, 2.09, .068, theme.glass);
  label(scene, "设备维修", -37, 3.08, -17.99, 2.45);
  for (const x of [-30, -24, -12, -6.5, -.65, 4.6, 38.4]) {
    tree(scene, x, -23.5, 1.11, Math.round(x + 40));
  }
}

function plantModels(plant) {
  const z = -3.38;
  for (const [index, x] of [-18.6, -15.55, -12.5].entries()) {
    const roof = index === 1 ? 6.96 : 6.46;
    const hue = index === 1 ? theme.steel : theme.white;
    box(plant, x, .15, z, 2.7, .30, 2.7, theme.steel);
    for (const dx of [-.78, .78]) {
      for (const dz of [-.78, .78]) box(plant, x + dx, 1.30, z + dz, .22, 2.56, .22, theme.ink);
    }
    cylinder(plant, x, 2.29, z, 1.21, .35, 1.05, theme.sea, 14);
    cylinder(plant, x, (roof + 2.76) / 2, z, 1.20, 1.20, roof - 2.76, hue, 14);
    for (const y of [3.05, 4.52, roof - .18]) cylinder(plant, x, y, z, 1.23, 1.23, .13, theme.sea, 14);
    cylinder(plant, x, roof, z, .72, 1.27, .24, theme.teal, 14);
    cylinder(plant, x, roof + .26, z, .29, .29, .36, theme.steel, 10);
    label(plant, String(index + 1).padStart(2, "0"), x, roof - .94, z + 1.207, .93);
    tube(plant, point(x, 1.38, z), point(x, 1.38, .67), .15, theme.steel);
  }
  tube(plant, point(-19.18, 1.37, .67), point(-12.45, 1.37, .67), .19, theme.ink);
  tube(plant, point(-12.65, 1.37, .67), point(-15.10, 4.37, 3.08), .24, theme.teal);
  box(plant, -15.06, 4.56, 3.75, 2.10, .23, 2.16, theme.teal);
  const hopper = cylinder(plant, -15.05, 3.87, 3.75, .88, .27, 1.38, theme.sea, 4);
  hopper.rotation.y = Math.PI / 4;
  cylinder(plant, -15.05, 3.07, 3.75, .23, .22, .23, theme.ink, 8);
  for (const x of [-16.36, -12.64]) {
    for (const laneZ of [2.07, 5.43]) {
      box(plant, x, 2.27, laneZ, .28, 4.54, .28, theme.ink);
      box(plant, x, .14, laneZ, .55, .28, .55, theme.steel);
      box(plant, x, .75, laneZ, .294, .54, .294, theme.yellow);
    }
    box(plant, x, 4.44, 3.75, .31, .23, 3.63, theme.ink);
  }
  for (const laneZ of [2.07, 5.43]) box(plant, -14.5, 4.42, laneZ, 3.90, .23, .27, theme.ink);
  label(plant, "拌合站", -14.50, 4.44, 5.584, 1.66);
  for (const [x, color] of [[-20.62, 0xb5956f], [-18.29, 0x969b85], [-15.96, 0xc2ac86]]) {
    box(plant, x, .13, -7.71, 2.24, .27, 1.98, theme.steel);
    for (const dx of [-1.09, 1.09]) box(plant, x + dx, .47, -7.77, .15, .93, 1.97, theme.white);
    box(plant, x, .49, -8.8, 2.27, .98, .15, theme.white);
    const gravel = mesh(plant, new THREE.ConeGeometry(1, .87, 5), color, x, .57, -7.78);
    gravel.scale.z = .86;
    gravel.rotation.y = .4;
  }
  const office = new THREE.Group();
  plant.add(office);
  office.position.set(-7.55, 0, -5.20);
  box(office, 0, .15, 0, 4.25, .30, 2.86, theme.steel);
  box(office, 0, 1.37, 0, 4.06, 2.46, 2.67, theme.white);
  box(office, 0, 2.62, 0, 4.20, .25, 2.84, theme.teal);
  box(office, 0, 2.25, 1.346, 4.0, .15, .075, theme.sea);
  for (const x of [-1.30, -.29]) box(office, x, 1.58, 1.348, .79, .63, .075, theme.glass);
  box(office, 1.17, 1.06, 1.35, .80, 1.64, .09, theme.ink);
  box(office, 1.17, .12, 1.65, .98, .24, .55, theme.steel);
  label(office, "控制室", -1.00, 2.04, 1.40, 1.33);
  box(office, 1.1, 2.81, -.50, .66, .19, .54, theme.steel);
}

function jobModels(job) {
  const {x, z, width, depth} = SITE;
  box(job, x + width / 2, .035, z + depth / 2, width + .22, .08, depth + .25, theme.pit, false);
  for (let n = 1; n < 4; n++) box(job, x + n * TILE_WIDTH, .080, z + depth / 2, .039, .02, depth, 0xb58f68, false);
  for (let n = 1; n < 3; n++) box(job, x + width / 2, .080, z + n * TILE_DEPTH, width, .02, .039, 0xb58f68, false);
  const boards = new THREE.Group();
  job.add(boards);
  for (const side of [z - .05, z + depth + .05]) {
    box(boards, x + width / 2, .25, side, width + .29, .38, .14, theme.wood);
    for (let n = 0; n < 6; n++) {
      const sx = x + n * 1.59;
      box(boards, sx, .27, side + (side > z ? .136 : -.136), .124, .51, .17, theme.clay);
      box(boards, sx, .553, side + (side > z ? .136 : -.136), .13, .092, .182, theme.yellow);
    }
  }
  for (const sx of [x - .09, x + width + .09]) box(boards, sx, .25, z + depth / 2, .13, .38, depth, theme.wood);
  const soil = tiles.map(({x, z}, index) => box(job, x, .29, z, TILE_WIDTH - .067, .46, TILE_DEPTH - .067, [theme.clay, theme.soil, 0xb67d56][index % 3]));
  const spoil = Array.from({ length: 12 }, (_, index) => {
    const row = Math.floor(index / 4);
    const columns = [4, 4, 4][row];
    return box(job, 4.07 + (index % columns) * .64 + (row % 2) * .12, .16 + row * .21, -6.52 + (index % 2) * .56, .61, .24, .52, index % 2 ? theme.soil : theme.clay);
  });
  const slab = box(job, x, .252, z + depth / 2, 1, .326, depth, theme.concrete);
  const leading = box(job, x, .422, z + depth / 2, 1, .018, depth - .03, theme.wet, false);
  const joints = Array.from({length: 3}, (_, index) => box(job, x + (index + 1) * width / 4, .42, z + depth / 2, .032, .013, depth - .09, 0x91a39f, false));
  const bricks = courses.map((row, layer) => row.map((brick, index) => box(
    job, brick.x, .62, brick.z, brick.width, .405, brick.depth,
    [0xbb7159, 0xc58269, 0xa95f4b, 0xd19477][(index + layer) % 4]
  )));
  box(job, 20.05, .79, -4.55, 3.20, 1.49, 1.87, theme.teal);
  box(job, 20.05, 1.59, -4.55, 3.30, .14, 1.98, theme.ink);
  for (let n = 0; n < 9; n++) box(job, 18.62 + n * .345, .80, -3.598, .06, 1.35, .06, theme.sea);
  box(job, 20.81, .79, -3.563, .78, 1.21, .07, theme.ink);
  label(job, "工具 / 02", 19.76, 1.15, -3.563, 1.06);
  box(job, 18.64, .13, -.45, 1.60, .21, 1.54, theme.wood);
  for (let iz = 0; iz < 3; iz++) {
    for (let ix = 0; ix < 3; ix++) box(job, 18.15 + ix * .49, .42, -.93 + iz * .48, .45, .35, .44, iz % 2 ? 0xc58269 : theme.terra);
  }
  for (const x of [18.42, 18.89]) box(job, x, .607, -.45, .073, .035, 1.44, theme.marking);
  const pin = new THREE.Group();
  job.add(pin);
  for (const x of [17.2, 18.9]) box(pin, x, .45, -6.41, .11, .89, .12, theme.ink);
  box(pin, 18.05, .84, -6.4, 2.06, .64, .09, theme.ink);
  label(pin, "施工区", 18.05, .84, -6.345, 1.96, "#a55c49");
  return { boards, soil, spoil, slab, leading, joints, bricks };
}

function mixerModel(vehicle) {
  box(vehicle, -.02, .58, 0, 4.31, .39, 1.64, theme.ink);
  box(vehicle, .12, .74, 0, 3.98, .24, 1.67, theme.steel);
  for (const x of [-1.43, -.69, 1.47]) {
    for (const z of [-.81, .81]) {
      const wheel = cylinder(vehicle, x, .46, z, .44, .44, .24, theme.tire, 14);
      wheel.rotation.x = Math.PI / 2;
      const hub = cylinder(vehicle, x, .46, z + Math.sign(z) * .125, .235, .235, .035, theme.steel, 12);
      hub.rotation.x = Math.PI / 2;
      const cap = cylinder(vehicle, x, .46, z + Math.sign(z) * .154, .103, .103, .036, theme.ink, 8);
      cap.rotation.x = Math.PI / 2;
    }
  }
  box(vehicle, 1.46, 1.38, 0, 1.46, 1.32, 1.59, theme.white);
  box(vehicle, 1.43, 2.075, 0, 1.57, .15, 1.65, theme.white);
  box(vehicle, 2.195, 1.69, 0, .039, .48, 1.35, theme.glass);
  box(vehicle, 2.216, 1.03, 0, .055, .23, 1.31, theme.ink);
  box(vehicle, 2.24, .73, 0, .19, .17, 1.58, theme.steel);
  for (const z of [-.807, .807]) {
    box(vehicle, 1.67, 1.69, z, .80, .50, .043, theme.glass);
    box(vehicle, 1.43, 1.27, z, 1.21, .15, .047, theme.sea);
    box(vehicle, 1.55, 1.15, z * 1.03, .23, .052, .045, theme.ink);
    box(vehicle, 2.245, .97, z * .84, .061, .13, .24, theme.marking);
  }
  box(vehicle, 1.29, 2.184, 0, .21, .09, .42, theme.yellow);
  label(vehicle, "MX–07", 1.36, 1.05, .835, .95);
  box(vehicle, -1.64, .87, 0, .46, .39, 1.24, theme.sea);
  const drum = new THREE.Group();
  drum.position.set(-.63, 1.62, 0);
  vehicle.add(drum);
  const rings = [0, .58, 1.34, 2.03].map((x, i) => point(x - 1.14, [.38, .69, .77, .49][i], 0));
  const geometry = new THREE.LatheGeometry(rings.map(p => new THREE.Vector2(p.y, p.x)), 14);
  geometry.rotateZ(-Math.PI / 2);
  mesh(drum, geometry, theme.white, 0, 0, 0);
  for (const [x, radius, shade] of [[-1.05, .43, theme.steel], [-.37, .735, theme.sea], [.22, .777, theme.teal], [.67, .65, theme.sea]]) {
    const band = cylinder(drum, x, 0, 0, radius, radius, .15, shade, 14);
    band.rotation.z = -Math.PI / 2;
  }
  for (const angle of [0, Math.PI * .67, Math.PI * 1.33]) {
    box(drum, -.18, Math.cos(angle) * .746, Math.sin(angle) * .746, .52, .11, .13, theme.teal);
  }
  const chute = box(vehicle, 0, 0, 0, 1, 1, 1, theme.steel);
  const lip = box(vehicle, 0, 0, 0, 1, 1, 1, theme.ink);
  return { drum, chute, lip };
}

function excavatorModel(vehicle, scene) {
  for (const z of [-.65, .65]) {
    box(vehicle, 0, .32, z, 2.58, .56, .49, theme.tire);
    box(vehicle, 0, .33, z + Math.sign(z) * .248, 2.27, .29, .05, theme.ink);
    for (let n = 0; n < 7; n++) {
      box(vehicle, -1.15 + n * .387, .606, z, .105, .052, .51, 0x627062);
      box(vehicle, -1.15 + n * .387, .29, z + Math.sign(z) * .263, .063, .32, .031, 0x61706a);
    }
  }
  cylinder(vehicle, 0, .61, 0, .76, .76, .22, theme.ink);
  const cab = new THREE.Group();
  vehicle.add(cab);
  box(cab, -.09, .96, 0, 1.98, .52, 1.62, theme.yellow);
  box(cab, -.74, 1.24, -.12, .55, .25, 1.24, theme.amber);
  box(cab, .29, 1.40, .46, 1.03, .62, .72, theme.glass);
  box(cab, .24, 1.75, .44, 1.14, .15, .81, theme.yellow);
  box(cab, .27, 1.45, .833, .078, .61, .043, theme.ink);
  box(cab, .17, 1.15, .836, .27, .07, .04, theme.ink);
  for (let n = 0; n < 5; n++) box(cab, -.72, 1.38, -.46 + n * .153, .32, .034, .057, theme.wood);
  label(cab, "EX–12", -.52, .99, .815, .60, "#9b602a");
  const arms = new THREE.Group();
  vehicle.userData.articulation = arms;
  arms.userData.entity = "EX-12";
  scene.add(arms);
  const boom = box(arms, 0, 0, 0, 1, 1, 1, theme.yellow);
  const stick = box(arms, 0, 0, 0, 1, 1, 1, theme.amber);
  const piston = box(arms, 0, 0, 0, 1, 1, 1, theme.steel);
  const elbow = mesh(arms, new THREE.SphereGeometry(.18, 10, 8), theme.wood, 0, 0, 0);
  const bucket = new THREE.Group();
  arms.add(bucket);
  box(bucket, .08, .155, 0, .56, .21, .68, theme.ink);
  const back = box(bucket, -.22, .29, 0, .13, .40, .67, theme.ink);
  back.rotation.z = -.12;
  for (const z of [-.28, 0, .28]) box(bucket, .39, .08, z, .25, .11, .139, theme.amber);
  for (const z of [-.33, .33]) box(bucket, .03, .25, z, .56, .27, .09, theme.ink);
  const payload = box(bucket, -.05, .33, 0, .33, .28, .40, theme.clay);
  return { cab, boom, stick, piston, elbow, bucket, payload };
}

function loadedPallet(parent, color) {
  const pallet = new THREE.Group();
  parent.add(pallet);
  for (const z of [-.36, 0, .36]) box(pallet, 0, .065, z, 1.04, .13, .14, theme.wood);
  box(pallet, 0, .13, 0, 1.05, .055, 1, theme.clay);
  for (const x of [-.235, .235]) {
    box(pallet, x, .31, 0, .45, .35, .86, color);
    box(pallet, x, .495, 0, .065, .022, .88, theme.marking);
  }
  return pallet;
}

function yardModels(yard, vehicle, scene) {
  const violet = 0x935b70;
  const colors = [0xba8666, 0xc0a473, 0x93a596];
  polygon(yard, [[-29,12],[-5,12],[-5,23.8],[-29,23.8]], .026, 0xcdbfc2);
  box(yard, -17.65, .067, STOCK.z, 22.6, .085, 2.73, 0xa4aaa1, false);
  for (const z of [STOCK.z - 1.17, STOCK.z + 1.17]) {
    box(yard, -17.65, .113, z, 21.8, .015, .055, theme.marking, false);
  }
  for (const x of [STOCK.pickup + STOCK.forkReach, STOCK.delivery + STOCK.forkReach]) {
    box(yard, x, .12, STOCK.z, 1.45, .023, 1.35, 0xd4babd, false);
    for (const offset of [-.705, .705]) {
      box(yard, x + offset, .139, STOCK.z, .052, .014, 1.38, violet, false);
    }
  }
  label(yard, "材料堆场", -17.9, 2.25, 12.8, 2.55, "#824d62");

  const rackX = -24;
  for (const x of [-27.2, -24, -20.8]) {
    for (const z of [19.8, 21.7]) box(yard, x, 1.72, z, .14, 3.44, .15, theme.ink);
  }
  for (const y of [.16, 1.22, 2.3]) {
    box(yard, rackX, y, 20.75, 6.54, .16, 2.04, theme.steel);
    for (const [index, x] of [-26.16, -24.0, -21.8].entries()) {
      const pack = loadedPallet(yard, colors[index]);
      pack.position.set(x, y + .09, 20.75);
      pack.scale.setScalar(1.12);
    }
  }
  box(yard, -12.4, 1.40, 21.15, 6.2, 2.76, 3.1, theme.white);
  box(yard, -12.4, 2.88, 21.15, 6.3, .22, 3.21, violet);
  for (const x of [-14.5,-13.1]) box(yard, x, 1.51, 19.58, .93, .66, .06, theme.glass);
  box(yard, -10.82, 1.1, 19.58, .84, 1.84, .07, theme.ink);
  label(yard, "转运调度", -12.4, 2.24, 19.57, 1.9, "#824d62");

  box(vehicle, -.08, .39, 0, 1.51, .34, 1.15, theme.ink);
  box(vehicle, -.32, .64, 0, 1.19, .34, 1.08, violet);
  box(vehicle, -.72, .80, 0, .31, .29, 1.04, 0xac7182);
  for (const x of [-.61,.56]) {
    for (const z of [-.59,.59]) {
      const wheel = cylinder(vehicle, x, .29, z, .285, .285, .19, theme.tire, 12);
      wheel.rotation.x = Math.PI / 2;
      const hub = cylinder(vehicle, x, .29, z * 1.16, .129, .129, .035, theme.steel, 10);
      hub.rotation.x = Math.PI / 2;
    }
  }
  for (const x of [-.64,.35]) {
    for (const z of [-.45,.45]) box(vehicle, x, 1.31, z, .079, 1.15, .085, theme.ink);
  }
  box(vehicle, -.14, 1.88, 0, 1.12, .12, 1.02, violet);
  box(vehicle, -.28, .99, 0, .38, .23, .45, theme.tire);
  for (const z of [-.405,.405]) box(vehicle, .79, 1.13, z, .11, 2.21, .12, theme.ink);
  box(vehicle, .8, 2.19, 0, .13, .12, .92, theme.steel);
  cylinder(vehicle, .79, 1.08, 0, .059, .059, 1.74, theme.steel);
  const forks = new THREE.Group();
  vehicle.add(forks);
  box(forks, .89, .11, 0, .12, .26, .91, theme.steel);
  for (const z of [-.36,.36]) box(forks, STOCK.forkReach, 0, z, 1.13, .09, .10, theme.ink);
  label(vehicle, "FL-04", -.32, .689, .548, .62, "#824d62");
  return { forks, cargo: colors.slice(0, STOCK.loads).map(color => loadedPallet(scene, color)) };
}

function prefabModels(assembly, crane, scene) {
  const { west, east, north, south, rail, z, panelHeight, panelWidth, panelDepth } = GANTRY;
  const midX = (west + east) / 2;
  const craneColor = 0xd4a361;
  polygon(assembly, [[4.1,12.1],[30.2,12.1],[30.2,24],[4.1,24]], .032, 0xcac8b7);
  box(assembly, midX, GANTRY.pad - .14, z, 23, .28, 5.4, 0xabb2a1, false);
  for (const x of [GANTRY.pickup, ...GANTRY.destinations]) {
    box(assembly, x, GANTRY.pad + .008, z, 2.39, .018, 1.15, 0xd4be93, false);
    box(assembly, x, .295, z + .7, 1.38, .014, .046, theme.marking, false);
  }
  box(assembly, 17.4, 1.54, 11.35, 10.16, 3, 2.64, theme.white);
  box(assembly, 17.4, 3.1, 11.35, 10.36, .23, 2.77, theme.terra);
  for (const x of [14.05,17.4,20.75]) box(assembly, x, 1.41, 12.69, 2.48, 2.42, .056, theme.steel);
  label(assembly, "预制装配", 17.4, 2.77, 12.713, 2.15, "#a7613c");
  for (const lane of [north, south]) {
    box(assembly, midX, rail - .08, lane, east - west + .65, .23, .43, theme.ink);
    box(assembly, midX, rail + .045, lane, east - west + .65, .06, .22, theme.steel);
    for (const x of [west, east]) {
      box(assembly, x, .168, lane, .72, .335, .83, theme.steel);
      box(assembly, x, rail / 2, lane, .42, rail, .44, theme.teal);
      box(assembly, x, .69, lane, .44, .72, .46, craneColor);
    }
  }
  const bridgeZ = (north + south) / 2;
  box(crane, 0, rail + .33, bridgeZ, .62, .51, south - north + .73, craneColor);
  for (const lane of [north, south]) box(crane, 0, rail + .17, lane, 1.08, .25, .56, theme.terra);
  box(crane, 0, rail + .67, z, .72, .29, .67, theme.ink);
  label(crane, "GC-02", 0, rail + .60, south + .35, .82, "#a7613c");

  const rope = box(crane, 0, 0, z, .033, 1, .033, theme.ink);
  const hook = new THREE.Group();
  crane.add(hook);
  box(hook, 0, .07, 0, .30, .13, .22, craneColor);
  box(hook, 0, -.083, 0, .15, .17, .13, theme.ink);
  const slings = Array.from({length:2}, () => box(crane, 0, 0, 0, 1, 1, 1, theme.ink));
  const panels = GANTRY.destinations.map((_, index) => {
    const group = new THREE.Group();
    scene.add(group);
    const color = index % 2 ? 0xbec7bf : 0xcbd1c4;
    const gap = index % 2 ? .87 : 1.12;
    const sides = (panelWidth - gap) / 2;
    for (const sign of [-1, 1]) box(group, sign * (panelWidth - sides) / 2, panelHeight / 2, 0, sides, panelHeight, panelDepth, color);
    box(group, 0, .235, 0, gap, .47, panelDepth, color);
    box(group, 0, panelHeight - .22, 0, gap, .44, panelDepth, color);
    for (const x of [-.47,.47]) box(group, x, panelHeight + .026, 0, .08, .052, .16, theme.terra);
    return group;
  });
  return { rope, hook, slings, panels };
}

function factoryModels(factory, van) {
  const { x, z, width, depth } = FACTORY;
  const doorZ = z + depth / 2;
  polygon(factory, [[x-width/2-1.3,z-depth/2-1.6],[x+width/2+1.3,z-depth/2-1.6],[x+width/2+1.3,doorZ+1.35],[x-width/2-1.3,doorZ+1.35]], .038, 0xc0cbd0);
  box(factory, x, 2.28, z, width, 4.54, depth, 0xb0c1c5);
  box(factory, x, .21, doorZ + .49, width + .07, .40, .99, theme.steel);
  box(factory, x, 3.07, doorZ + .05, width, .31, .12, 0x67868c);
  const slope = Math.atan2(1.37, depth/2);
  for (const sign of [-1,1]) {
    const roof = box(factory, x, 5.245, z + sign * depth / 4, width + .51, .245,
      Math.hypot(depth / 2, 1.37) + .32, 0x526f76);
    roof.rotation.x = sign * slope;
  }
  box(factory, x, 5.96, z, width + .5, .14, .22, theme.steel);
  for (const roofX of [x-8.3, x-.3, x+8]) box(factory, roofX, 6.16, z, 2.8, .36, .81, theme.white);
  for (let index = 0; index < 13; index++) {
    box(factory, x-width/2+.7 + index * 2.28, 3.73, doorZ+.04, 1.56, .61, .07, theme.glass);
  }
  for (const [index, bay] of [10.7,20.25,DELIVERY.bay].entries()) {
    box(factory, bay, 1.424, doorZ+.064, 3.12, 2.54, .10, theme.ink);
    box(factory, bay, 1.48, doorZ+.127, 2.69, 2.24, .073, index === 2 ? 0x72958c : theme.steel);
    for (let stripe=0; stripe<7; stripe++) box(factory, bay, .57+stripe*.275, doorZ+.17, 2.65, .023, .021, 0x607b79);
    for (const side of [-1,1]) box(factory, bay+1.52*side, .46, doorZ+.59, .17, .85, .19, theme.yellow);
    label(factory, "0"+(index+1), bay, 3.05, doorZ+.133, .69, "#50758e");
  }
  label(factory, "生产车间", x, 4.28, doorZ+.067, 4.1, "#50758e");

  box(van, 0, .52, 0, 4.13, .33, 1.65, theme.ink);
  box(van, -.57, 1.30, 0, 2.89, 1.48, 1.68, 0x8facb8);
  box(van, 1.50, 1.04, 0, 1.24, 1.16, 1.54, 0x537b91);
  box(van, 2.12, 1.26, 0, .055, .38, 1.36, theme.glass);
  for (const side of [-1,1]) {
    box(van, 1.55, 1.34, .79*side, .69, .365, .039, theme.glass);
    box(van, -.56, 1.66, .85*side, 2.74, .19, .044, theme.white);
    for (const wheelX of [-1.34,1.43]) {
      const wheel = cylinder(van, wheelX, .364, .82*side, .34, .34, .19, theme.tire);
      wheel.rotation.x = Math.PI/2;
      const cap = cylinder(van, wheelX, .364, .923*side, .155, .155, .033, theme.steel);
      cap.rotation.x = Math.PI/2;
    }
  }
  label(van, "DV-05", -.53, 1.35, .881, .84, "#50758e");
  return Array.from({length:DELIVERY.crates}, (_, index) => {
    const cargo = loadedPallet(factory, 0xac9168);
    cargo.position.set(DELIVERY.bay - 1.09 + index * .96, .405, doorZ + .57);
    cargo.scale.setScalar(.71);
    return cargo;
  });
}

function surveyedRoute(scene, points, height, color) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(([x,z]) => point(x,height,z)));
  const route = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color, dashSize:.55, gapSize:.34, transparent:true, opacity:.87 }));
  route.computeLineDistances();
  route.visible = false;
  scene.add(route);
  return route;
}

export function setFrustum(camera, aspect, half = Math.max(34, 64 / aspect)) {
  camera.left = -half * aspect;
  camera.right = half * aspect;
  camera.top = half;
  camera.bottom = -half;
  camera.updateProjectionMatrix();
}

export function overviewCamera(aspect) {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 260);
  camera.position.set(42, 49.3, 64.5 + MAP.centerZ);
  setFrustum(camera, aspect);
  camera.lookAt(0, .43, MAP.centerZ);
  return camera;
}

export function createWorld(canvas, { capture = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: capture, powerPreference: "high-performance" });
  renderer.setClearColor(0xe6eee6);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe6eee6);
  scene.add(new THREE.HemisphereLight(0xf6fcf7, 0xbbab87, 2.30));
  const sun = new THREE.DirectionalLight(0xffefd5, 2.48);
  sun.position.set(-40, 74, 33);
  sun.target.position.z = MAP.centerZ;
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(capture ? 1024 : 1536);
  Object.assign(sun.shadow.camera, { left: -58, right: 58, top: 45, bottom: -45, far: 165 });
  sun.shadow.normalBias = .037;
  sun.shadow.bias = -.00031;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);
  const floor = mesh(scene, new THREE.PlaneGeometry(190, 160), 0xe3ece3, 0, -1.015, 0, false);
  floor.rotation.x = -Math.PI / 2;
  const grid = new THREE.GridHelper(150, 75, 0xb5cabb, 0xb5cabb);
  grid.position.y = -1.005;
  grid.material.transparent = true;
  grid.material.opacity = .25;
  scene.add(grid);
  const roots = new Map();
  for (const { id } of entities) {
    const group = new THREE.Group();
    group.userData.entity = id;
    roots.set(id, group);
    scene.add(group);
  }
  const plant = roots.get("PL-01");
  const job = roots.get("ST-02");
  const mixer = roots.get("MX-07");
  const excavator = roots.get("EX-12");
  const forklift = roots.get("FL-04");
  const gantry = roots.get("GC-02");
  const delivery = roots.get("DV-05");
  base(scene, plant, job);
  plantModels(plant);
  const work = jobModels(job);
  const truck = mixerModel(mixer);
  const digger = excavatorModel(excavator, scene);
  const stockModel = yardModels(roots.get("YD-03"), forklift, scene);
  const prefab = prefabModels(roots.get("AS-04"), gantry, scene);
  const receivedCargo = factoryModels(roots.get("WH-05"), delivery);
  const routes = new Map([
    ["MX-07", surveyedRoute(scene, [[PLANT_STOP,MIXER_LANE],[POUR_STOP,MIXER_LANE]], .093, 0xa0efdc)],
    ["FL-04", surveyedRoute(scene, [[STOCK.pickup-3.8,STOCK.z],[STOCK.delivery+STOCK.forkReach,STOCK.z]], .148, 0xa84566)],
    ["GC-02", surveyedRoute(scene, [[GANTRY.pickup,GANTRY.z],[GANTRY.destinations[0],GANTRY.z]], .327, 0xc27d30)],
    ["DV-05", surveyedRoute(scene, DELIVERY_ROUTE, .095, 0xb1e0ff)]
  ]);
  const flow = box(scene, 0, 0, 0, 1, 1, 1, theme.wet);
  const loadFlow = cylinder(scene, -15.05, 2.65, MIXER_LANE, .17, .105, .71, theme.concrete, 7);
  const halo = new THREE.Mesh(new THREE.RingGeometry(1, 1.049, 56), new THREE.MeshBasicMaterial({
    color: 0x157b69, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false
  }));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = .104;
  halo.visible = false;
  scene.add(halo);
  const anchor = new THREE.Vector3();
  const marker = {
    "MX-07": { height: 2.62, size: [2.59,1.36] },
    "EX-12": { height: 2.37, size: [1.76,1.23] },
    "FL-04": { height: 2.48, size: [1.41,1.04] },
    "GC-02": { height: GANTRY.rail + 1.10, z: GANTRY.z, size: [1.83,2.05] },
    "DV-05": { height: 2.52, size: [2.58,1.29] },
    "PL-01": { at: [-15.52,7.44,-3.45], size: [6.58,5.38] },
    "ST-02": { at: [12.30,3.38,-2.0], size: [5.33,3.89] },
    "YD-03": { at: [-17.25,3.64,17.9], size: [11.3,5.25] },
    "AS-04": { at: [17.4,GANTRY.rail+.97,17.9], size: [12.5,5.15] },
    "WH-05": { at: [FACTORY.x,6.72,FACTORY.z+2], size: [15.9,7.1] }
  };
  const pinColors = new Map(entities.map(entity => [entity.id, entity.color]));
  let previousState;
  let activeId = null;

  function anchorFor(id) {
    const { at, height, z } = marker[id];
    if (at) return anchor.set(...at);
    const position = roots.get(id).position;
    return anchor.set(position.x, height, z ?? position.z);
  }

  function highlight() {
    halo.visible = activeId !== null;
    if (!activeId) return;
    const a = anchorFor(activeId);
    const [width, depth] = marker[activeId].size;
    halo.position.x = a.x;
    halo.position.z = a.z;
    halo.position.y = activeId === "GC-02" ? GANTRY.pad + .04 : activeId === "FL-04" ? .151 : .104;
    halo.scale.set(width, depth, 1);
    halo.material.color.set(pinColors.get(activeId));
  }

  function update(state) {
    if (previousState === state) return;
    previousState = state;
    const {constructionTime: time, removed, dumped, poured, pouring, course} = state;
    mixer.position.set(state.mixer.x, .075, state.mixer.z);
    truck.drum.rotation.x = (Math.min(time, 18) - 8) * 3.25 * Number(time >= 8);
    truck.drum.rotation.z = .21;
    const chuteStart = point(-1.83, 1.25, -.16);
    const opening = ease((time - 14.25) / .36);
    const chuteEnd = point(lerp(-2.09, -2.15, opening), lerp(.78, .50, opening), lerp(.39, -2.79, opening));
    positionBeam(truck.chute, chuteStart, chuteEnd, .39, .13);
    positionBeam(truck.lip, chuteEnd.clone().add(point(-.19, .09, 0)), chuteEnd.clone().add(point(.16, .09, 0)), .13, .11);
    flow.visible = pouring;
    if (pouring) {
      const at = chuteEnd.clone().add(mixer.position);
      const ripple = .035 * Math.sin(time * 27);
      positionBeam(flow, at, point(at.x, .389, SITE.z + SITE.depth - .19), .14 + ripple, .16);
    }
    loadFlow.visible = time > 8 && time < 10.35;
    loadFlow.scale.x = loadFlow.scale.z = .93 + .1 * Math.sin(time * 31);

    const move = state.excavator;
    excavator.position.set(move.x, 0, move.z);
    digger.cab.rotation.y = -move.angle;
    const a = point(move.pivot.x, move.pivot.y, move.pivot.z);
    const b = point(move.knee.x, move.knee.y, move.knee.z);
    const c = point(move.tip.x, move.tip.y + .25, move.tip.z);
    positionBeam(digger.boom, a, b, .27, .29);
    positionBeam(digger.stick, b, c, .20, .23);
    positionBeam(digger.piston, a.clone().add(point(.02, .14, .17)), a.clone().lerp(b, .68).add(point(0, .04, .15)), .11, .11);
    digger.elbow.position.copy(b);
    digger.bucket.position.set(move.tip.x, move.tip.y, move.tip.z);
    digger.bucket.rotation.y = -move.angle;
    digger.bucket.rotation.z = -.36 + .61 * move.bite;
    digger.payload.visible = move.carrying;
    work.soil.forEach((part, index) => { part.visible = index >= removed; });
    work.spoil.forEach((part, index) => { part.visible = index < dumped; });
    work.boards.visible = time >= 8;
    work.slab.visible = poured > 0;
    const fill = SITE.width * poured;
    work.slab.scale.x = Math.max(.001, fill);
    work.slab.position.x = SITE.x + fill / 2;
    work.leading.visible = poured > 0 && poured < 1;
    work.leading.position.x = SITE.x + fill - Math.min(.26, fill) / 2;
    work.leading.scale.x = Math.min(.26, fill);
    work.joints.forEach(part => { part.visible = part.position.x < SITE.x + fill - .13; });
    work.bricks.forEach((row, layer) => row.forEach((part, index) => {
      const arrival = clamp(clamp(course - layer) * row.length - index);
      part.visible = arrival > 0;
      part.position.y = .419 + .2025 + layer * .423 + (1 - ease(arrival)) * 1.21;
    }));
    const transport = state.forklift;
    forklift.position.set(transport.x, STOCK.ground, transport.z);
    stockModel.forks.position.y = transport.forks;
    stockModel.cargo.forEach((mesh, index) => {
      const load = transport.pallets[index];
      mesh.visible = load !== null;
      if (load) mesh.position.set(load.x, load.y, STOCK.z);
    });

    const lift = state.gantry;
    gantry.position.x = lift.x;
    prefab.hook.position.set(0, lift.hook, GANTRY.z);
    const hoist = GANTRY.rail + .44;
    prefab.rope.position.y = (hoist + lift.hook) / 2;
    prefab.rope.scale.y = hoist - lift.hook;
    for (const [index, sling] of prefab.slings.entries()) {
      sling.visible = lift.carried;
      if (lift.carried) positionBeam(sling, point(0,lift.hook-.12,GANTRY.z), point(index ? .47 : -.47,lift.hook-.22,GANTRY.z), .024, .024);
    }
    prefab.panels.forEach((mesh, index) => {
      const panel = lift.panels[index];
      mesh.visible = panel !== null;
      if (panel) mesh.position.set(panel.x, panel.y, GANTRY.z);
    });

    const shipment = state.delivery;
    delivery.position.set(shipment.x, .073, shipment.z);
    delivery.rotation.y = -shipment.angle;
    receivedCargo.forEach((cargo, index) => { cargo.visible = index < shipment.received; });
    highlight();
    renderer.shadowMap.needsUpdate = true;
  }

  function render(state, camera) {
    update(state);
    renderer.render(scene, camera);
  }

  function pick(clientX, clientY, camera) {
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(2 * (clientX - rect.left) / rect.width - 1, 1 - 2 * (clientY - rect.top) / rect.height);
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects([...roots.values(), excavator.userData.articulation], true);
    for (const hit of hits) {
      let candidate = hit.object;
      let shown = true;
      while (candidate) {
        shown &&= candidate.visible;
        if (candidate.userData.entity) {
          if (shown) return candidate.userData.entity;
          break;
        }
        candidate = candidate.parent;
      }
    }
    return null;
  }

  function dispose() {
    const geometries = new Set();
    scene.traverse(obj => {
      if (obj.geometry && obj.geometry !== boxGeometry) geometries.add(obj.geometry);
      if (obj.material && ![...materialCache.values()].includes(obj.material)) {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    sun.shadow.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return {
    renderer, render, pick, dispose,
    setActive(id) {
      activeId = id;
      for (const [entity, route] of routes) route.visible = id === entity;
      highlight();
    },
    anchorFor(id) { return anchorFor(id).clone(); },
    project(id, camera) { return cameraTarget.copy(anchorFor(id)).project(camera); }
  };
}
