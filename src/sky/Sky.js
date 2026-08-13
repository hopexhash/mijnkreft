// Day/night cycle: sky dome colors, sun, moon, stars, fog tinting.

import * as THREE from 'three';

// time is 0..1 (0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight)
export class Sky {
  constructor(scene, dayLength) {
    this.scene = scene;
    this.dayLength = dayLength;
    this.time = 0.05; // start just after dawn
    this.sunFactor = 1;
    this.isNight = false;

    // sky dome — inverted sphere with vertex-gradient shader
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color(0.35, 0.6, 1.0) },
        uHorizon: { value: new THREE.Color(0.8, 0.9, 1.0) }
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_Position.z = gl_Position.w; // push to far plane
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 c = mix(uHorizon, uTop, pow(h, 0.6));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 16, 12), this.skyMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // sun — glowing quad
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 1, depthWrite: false, fog: false })
    );
    this.sun.renderOrder = -9;
    scene.add(this.sun);

    // moon — smaller pale quad
    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 22),
      new THREE.MeshBasicMaterial({ color: 0xdfe6f2, transparent: true, opacity: 1, depthWrite: false, fog: false })
    );
    this.moon.renderOrder = -9;
    scene.add(this.moon);

    // stars — point cloud on the dome
    const starCount = 420;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3().randomDirection();
      if (v.y < 0.05) v.y = 0.05 + Math.random() * 0.9;
      v.normalize().multiplyScalar(390);
      positions[i * 3] = v.x; positions[i * 3 + 1] = v.y; positions[i * 3 + 2] = v.z;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, transparent: true, opacity: 0, sizeAttenuation: false, depthWrite: false });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    this.fogColor = new THREE.Color();
  }

  update(dt, cameraPos, biomeTint = [0.8, 0.88, 1.0]) {
    this.time = (this.time + dt / this.dayLength) % 1;

    // sun elevation: sin curve, day is time 0..0.5
    const sunAngle = this.time * Math.PI * 2; // 0 at dawn
    const sunHeight = Math.sin(sunAngle);     // >0 during day
    this.sunFactor = THREE.MathUtils.clamp(sunHeight * 3 + 0.1, 0, 1);
    this.isNight = sunHeight < -0.08;

    // sky colors through the cycle
    const dayTop = new THREE.Color(0.3, 0.56, 0.98);
    const dayHor = new THREE.Color(0.72, 0.85, 1.0);
    const duskTop = new THREE.Color(0.22, 0.16, 0.35);
    const duskHor = new THREE.Color(0.98, 0.55, 0.32);
    const nightTop = new THREE.Color(0.012, 0.015, 0.05);
    const nightHor = new THREE.Color(0.04, 0.05, 0.11);

    const top = new THREE.Color(), hor = new THREE.Color();
    const twilight = THREE.MathUtils.clamp(1 - Math.abs(sunHeight) * 5, 0, 1); // near horizon crossings
    if (sunHeight > 0) {
      top.lerpColors(duskTop, dayTop, THREE.MathUtils.clamp(sunHeight * 2.5, 0, 1));
      hor.lerpColors(duskHor, dayHor, THREE.MathUtils.clamp(sunHeight * 2.5, 0, 1));
    } else {
      top.lerpColors(nightTop, duskTop, twilight);
      hor.lerpColors(nightHor, duskHor, twilight * 0.85);
    }
    this.skyMat.uniforms.uTop.value.copy(top);
    this.skyMat.uniforms.uHorizon.value.copy(hor);

    // biome-tinted fog at horizon color
    this.fogColor.copy(hor).multiply(new THREE.Color(biomeTint[0], biomeTint[1], biomeTint[2]).lerp(new THREE.Color(1, 1, 1), 0.6));

    // position celestial bodies (east-west arc)
    const R = 350;
    const sx = Math.cos(sunAngle), sy = Math.sin(sunAngle);
    this.sun.position.set(cameraPos.x + sx * R, cameraPos.y + sy * R, cameraPos.z);
    this.sun.lookAt(cameraPos);
    this.sun.material.opacity = THREE.MathUtils.clamp(sy * 4 + 0.4, 0, 1);
    this.moon.position.set(cameraPos.x - sx * R, cameraPos.y - sy * R, cameraPos.z);
    this.moon.lookAt(cameraPos);
    this.moon.material.opacity = THREE.MathUtils.clamp(-sy * 4 + 0.2, 0, 0.95);

    this.starMat.opacity = THREE.MathUtils.clamp(-sunHeight * 3.2, 0, 0.9);

    // dome + stars follow camera
    this.dome.position.copy(cameraPos);
    this.stars.position.copy(cameraPos);
  }

  // "HH:MM" style readout for the HUD
  clockString() {
    // time 0 = 6:00 (dawn)
    const mins = ((this.time * 24 + 6) % 24) * 60;
    const h = Math.floor(mins / 60), m = Math.floor(mins % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
