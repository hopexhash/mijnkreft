// Chunk meshing: one merged BufferGeometry per chunk (opaque + water),
// visible faces only, per-vertex voxel light + ambient occlusion,
// texture atlas UVs. Rendering uses custom shaders so day/night sunlight
// can be changed by a uniform without remeshing.

import * as THREE from 'three';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../core/constants.js';
import { getBlock, B } from './BlockRegistry.js';
import { tileUV, getAtlasTexture } from '../gfx/TextureAtlas.js';

// face definitions: [dir, corners(4 x [x,y,z]), uv order]
// corners wound counter-clockwise viewed from outside
const FACES = [
  { // +X
    dir: [1, 0, 0],
    corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]
  },
  { // -X
    dir: [-1, 0, 0],
    corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]
  },
  { // +Y (top)
    dir: [0, 1, 0],
    corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]
  },
  { // -Y (bottom)
    dir: [0, -1, 0],
    corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]
  },
  { // +Z
    dir: [0, 0, 1],
    corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
  },
  { // -Z
    dir: [0, 0, -1],
    corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]
  }
];

const FACE_SHADE = [0.8, 0.8, 1.0, 0.55, 0.9, 0.7]; // simple directional shading
const FACE_SHADE_FLAT = [1, 1, 1, 1, 1, 1];

// Mesh-time visual options (settings-driven); changing them requires remesh.
const meshOptions = { ao: true, directionalShade: true };
export function setMeshOptions(opts) {
  Object.assign(meshOptions, opts);
}

function textureKeyFor(def, faceIndex) {
  const t = def.textures;
  if (!t) return 'stone';
  if (t.all) return t.all;
  if (faceIndex === 2) return t.top || t.side;
  if (faceIndex === 3) return t.bottom || t.side;
  return t.side;
}

let opaqueMaterial = null;
let waterMaterial = null;

const VERT = /* glsl */`
attribute vec2 aLight;
attribute float aAO;
varying vec2 vUv;
varying vec2 vLight;
varying float vAO;
varying float vFogDepth;
void main() {
  vUv = uv;
  vLight = aLight;
  vAO = aAO;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;

function makeFrag(isWater) {
  return /* glsl */`
uniform sampler2D uMap;
uniform float uSun;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
varying vec2 vUv;
varying vec2 vLight;
varying float vAO;
varying float vFogDepth;
void main() {
  vec2 uv = vUv;
  ${isWater ? 'uv.x += sin(uTime * 0.8 + vUv.y * 40.0) * 0.002; uv.y += cos(uTime * 0.6) * 0.002;' : ''}
  vec4 tex = texture2D(uMap, uv);
  ${isWater ? '' : 'if (tex.a < 0.5) discard;'}
  float l = max(vLight.y, vLight.x * uSun);
  float brightness = 0.04 + 0.96 * pow(clamp(l, 0.0, 1.0), 1.6);
  vec3 color = tex.rgb * brightness * vAO;
  float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
  color = mix(color, uFogColor, fogFactor);
  gl_FragColor = vec4(color, ${isWater ? 'tex.a * 0.82' : 'tex.a'});
}
`;
}

export function getChunkMaterials() {
  if (!opaqueMaterial) {
    const uniforms = () => ({
      uMap: { value: getAtlasTexture() },
      uSun: { value: 1 },
      uFogColor: { value: new THREE.Color(0.75, 0.85, 1.0) },
      uFogNear: { value: 60 },
      uFogFar: { value: 100 },
      uTime: { value: 0 }
    });
    opaqueMaterial = new THREE.ShaderMaterial({
      uniforms: uniforms(),
      vertexShader: VERT,
      fragmentShader: makeFrag(false),
      side: THREE.DoubleSide
    });
    waterMaterial = new THREE.ShaderMaterial({
      uniforms: uniforms(),
      vertexShader: VERT,
      fragmentShader: makeFrag(true),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }
  return { opaque: opaqueMaterial, water: waterMaterial };
}

// Update shared uniforms once per frame
export function updateChunkMaterials({ sun, fogColor, fogNear, fogFar, time }) {
  const mats = getChunkMaterials();
  for (const m of [mats.opaque, mats.water]) {
    m.uniforms.uSun.value = sun;
    m.uniforms.uFogColor.value.setRGB(fogColor.r, fogColor.g, fogColor.b);
    m.uniforms.uFogNear.value = fogNear;
    m.uniforms.uFogFar.value = fogFar;
    m.uniforms.uTime.value = time;
  }
}

// occlusion test for AO — fully opaque solid blocks occlude
function occludes(world, x, y, z) {
  return getBlock(world.getBlockId(x, y, z)).opacity >= 15;
}

function vertexAO(world, x, y, z, dir, corner) {
  // Standard voxel AO: for the cube corner `corner` (0/1 per axis) of a face
  // with normal `dir`, test the two edge neighbors and the diagonal neighbor
  // in the cell layer the face opens into.
  const [dx, dy, dz] = dir;
  // the two tangent axes of the face plane (0=x, 1=y, 2=z)
  let a1, a2;
  if (dx !== 0) { a1 = 1; a2 = 2; }
  else if (dy !== 0) { a1 = 0; a2 = 2; }
  else { a1 = 0; a2 = 1; }
  const s1 = corner[a1] ? 1 : -1;
  const s2 = corner[a2] ? 1 : -1;
  const o1 = [0, 0, 0], o2 = [0, 0, 0];
  o1[a1] = s1;
  o2[a2] = s2;
  // neighbor cell in front of the face
  const fx = x + dx, fy = y + dy, fz = z + dz;
  const side1 = occludes(world, fx + o1[0], fy + o1[1], fz + o1[2]);
  const side2 = occludes(world, fx + o2[0], fy + o2[1], fz + o2[2]);
  const cornerOcc = occludes(world, fx + o1[0] + o2[0], fy + o1[1] + o2[1], fz + o1[2] + o2[2]);
  const occ = (side1 && side2) ? 3 : (side1 ? 1 : 0) + (side2 ? 1 : 0) + (cornerOcc ? 1 : 0);
  return 1 - occ * 0.18;
}

export function buildChunkGeometry(world, chunk) {
  const baseX = chunk.cx * CHUNK_SIZE;
  const baseZ = chunk.cz * CHUNK_SIZE;

  const opaque = { pos: [], uv: [], light: [], ao: [], idx: [] };
  const water = { pos: [], uv: [], light: [], ao: [], idx: [] };

  const pushFace = (buf, x, y, z, face, faceIndex, def, uvRect, yTopOffset = 0) => {
    const startIndex = buf.pos.length / 3;
    const [u0, v0, u1, v1] = uvRect;
    const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const wx = baseX + x, wz = baseZ + z;
    // light sampled from the cell the face opens into
    const lx = wx + face.dir[0], ly = y + face.dir[1], lz = wz + face.dir[2];
    const sun = world.getSunAt(lx, ly, lz) / 15;
    const bl = world.getBlockLightAt(lx, ly, lz) / 15;
    const shade = (meshOptions.directionalShade ? FACE_SHADE : FACE_SHADE_FLAT)[faceIndex];

    for (let i = 0; i < 4; i++) {
      const c = face.corners[i];
      let vy = y + c[1];
      if (yTopOffset && c[1] === 1) vy -= yTopOffset;
      buf.pos.push(x + c[0], vy, z + c[2]);
      buf.uv.push(uvs[i][0], uvs[i][1]);
      buf.light.push(sun, bl);
      const ao = (def.cross || !meshOptions.ao) ? 1 : vertexAO(world, wx, y, wz, face.dir, c);
      buf.ao.push(ao * shade);
    }
    buf.idx.push(startIndex, startIndex + 1, startIndex + 2, startIndex, startIndex + 2, startIndex + 3);
  };

  const pushCross = (buf, x, y, z, def, uvRect) => {
    const [u0, v0, u1, v1] = uvRect;
    const wx = baseX + x, wz = baseZ + z;
    const sun = world.getSunAt(wx, y, wz) / 15;
    const bl = Math.max(world.getBlockLightAt(wx, y, wz), def.lightEmit) / 15;
    const quads = [
      [[0.15, 0, 0.15], [0.85, 0, 0.85], [0.85, 1, 0.85], [0.15, 1, 0.15]],
      [[0.85, 0, 0.15], [0.15, 0, 0.85], [0.15, 1, 0.85], [0.85, 1, 0.15]]
    ];
    for (const q of quads) {
      const s = buf.pos.length / 3;
      const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      for (let i = 0; i < 4; i++) {
        buf.pos.push(x + q[i][0], y + q[i][1], z + q[i][2]);
        buf.uv.push(uvs[i][0], uvs[i][1]);
        buf.light.push(sun, bl);
        buf.ao.push(1);
      }
      buf.idx.push(s, s + 1, s + 2, s, s + 2, s + 3);
    }
  };

  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const id = chunk.blocks[x | (z << 4) | (y << 8)];
        if (id === B.AIR) continue;
        const def = getBlock(id);

        if (def.cross) {
          pushCross(opaque, x, y, z, def, tileUV(textureKeyFor(def, 0)));
          continue;
        }

        const isWater = def.liquid;
        const buf = isWater ? water : opaque;
        const wx = baseX + x, wz = baseZ + z;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = wx + face.dir[0], ny = y + face.dir[1], nz = wz + face.dir[2];
          const nId = ny < 0 ? B.BEDROCK : (ny >= WORLD_HEIGHT ? B.AIR : world.getBlockId(nx, ny, nz));
          const nDef = getBlock(nId);
          // draw face if the neighbor doesn't fully occlude and isn't the same block type
          const visible = nId !== id && nDef.opacity < 15;
          if (!visible) continue;
          const uvRect = tileUV(textureKeyFor(def, f));
          // lower water surface when air above
          const topOffset = isWater && f === 2 && !nDef.liquid ? 0.12 : 0;
          pushFace(buf, x, y, z, face, f, def, uvRect, topOffset);
        }
      }
    }
  }

  const build = (buf) => {
    if (!buf.idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
    geo.setAttribute('aLight', new THREE.Float32BufferAttribute(buf.light, 2));
    geo.setAttribute('aAO', new THREE.Float32BufferAttribute(buf.ao, 1));
    geo.setIndex(buf.idx);
    geo.computeBoundingSphere();
    return geo;
  };

  return { opaque: build(opaque), water: build(water) };
}
