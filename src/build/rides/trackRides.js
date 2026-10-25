/**
 * Tracked rides: roller coaster, log flume, go-karts and the kiddie train.
 *
 * All four share a spline-following vehicle model. Speed is simulated rather
 * than constant — the coaster trades height for velocity, the flume drifts and
 * then plunges, the karts accelerate out of corners — which is what makes the
 * motion read as real rather than as objects sliding along a path.
 */
import * as THREE from 'three';
import * as M from '../../gfx/Materials.js';
import * as C from './common.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Sweep an open 2D profile along a curve. Used for flume troughs and kart
 * tarmac. Unlike THREE.ExtrudeGeometry this honours closed curves, so looped
 * tracks have no seam.
 */
export function extrudeProfile(curve, profile, steps, closed, { uvScale = 1, widthUV = 1, bankStrength = 0 } = {}) {
  const n = profile.length;
  const rings = closed ? steps : steps + 1;
  const positions = new Float32Array(rings * n * 3);
  const uvs = new Float32Array(rings * n * 2);
  const indices = [];
  const P = new THREE.Vector3();

  for (let i = 0; i < rings; i++) {
    const t = (i / steps) % 1.0000001;
    curve.getPointAt(Math.min(t, 1), P);
    // Same world-up frame the vehicles use, so nothing drifts off the track.
    const bank = bankStrength ? C.bankAt(curve, t, bankStrength) : 0;
    const f = C.frameAt(curve, t, bank);
    const B = f.side, N = f.up;
    for (let j = 0; j < n; j++) {
      const [px, py] = profile[j];
      const k = (i * n + j) * 3;
      positions[k] = P.x + B.x * px + N.x * py;
      positions[k + 1] = P.y + B.y * px + N.y * py;
      positions[k + 2] = P.z + B.z * px + N.z * py;
      const u = (i * n + j) * 2;
      uvs[u] = (j / (n - 1)) * widthUV;
      uvs[u + 1] = (i / steps) * uvScale;
    }
  }
  const last = closed ? rings : rings - 1;
  for (let i = 0; i < last; i++) {
    const i2 = (i + 1) % rings;
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = i2 * n + j, c = i2 * n + j + 1, d = i * n + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Station building shared by the coaster and the flume. */
function station(width, depth, color, roofColor) {
  const g = new THREE.Group();
  const post = M.timber('#8a5a30');
  for (const x of [-width / 2, width / 2]) {
    for (const z of [-depth / 2, depth / 2]) {
      g.add(M.cyl(0.14, 3.3, post, x, 1.65, z, 8));
    }
  }
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(width + 1.2, 0.2, depth + 1.2),
    M.canopy(color, roofColor, 12),
  );
  roof.position.y = 3.4;
  roof.castShadow = true;
  g.add(roof);
  // Gable.
  const gable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, width + 1.2, 3, 1),
    M.paint(0xe6455c, { rough: 0.55 }),
  );
  gable.rotation.z = Math.PI / 2;
  gable.position.y = 3.75;
  g.add(gable);
  g.add(M.box(width, 0.2, depth, M.timber('#b5834a'), 0, 0.55, 0));
  return g;
}

/* ================================================================== *
 * Roller Coaster
 * ================================================================== */
export function rollerCoaster(ctx) {
  const root = new THREE.Group();
  const accent = 0xe6455c;

  // Layout: station straight -> lift hill -> first drop -> airtime hill ->
  // banked turnaround -> low helix -> brake run back into the station.
  const pts = [
    [-6.0, 1.3, -6.0], [-1.0, 1.3, -6.4], [3.5, 1.4, -6.2],
    [6.4, 2.6, -4.6], [7.4, 6.5, -1.8], [7.6, 12.0, 1.4], [6.8, 13.6, 4.2],
    [4.2, 11.6, 6.4], [1.4, 5.8, 7.2], [-1.8, 2.3, 6.4],
    [-4.6, 2.6, 4.6], [-6.8, 6.2, 2.2], [-7.2, 7.6, -0.6],
    [-6.0, 5.4, -2.8], [-3.4, 3.4, -3.2], [-0.6, 4.6, -1.6],
    [2.4, 3.8, 0.8], [2.0, 2.6, 3.6], [-1.2, 2.0, 4.0],
    [-4.8, 1.6, 2.0], [-6.6, 1.4, -2.2],
  ];
  const curve = C.makeTrack(pts, true, 0.5);
  curve.arcLengthDivisions = 800;
  const length = curve.getLength();

  const track = C.railsAlong(curve, {
    gauge: 1.15, railRadius: 0.085, ties: 150,
    railColor: 0xf0f3f8, tieColor: 0x3b4252, spineColor: accent,
    tubularSegments: 400, bankStrength: 1.15,
  });
  root.add(track);
  root.add(C.trackSupports(curve, 46, M.steel(0x8d96a8, 0.4), { minHeight: 1.0 }));

  // Chain-lift dogs on the climb.
  const liftFrom = 0.14, liftTo = 0.28;
  const chainMat = M.bar(0xffca4a);
  const chainInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.08, 0.18), chainMat, 40);
  const m4 = new THREE.Matrix4();
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 40; i++) {
    const t = liftFrom + (i / 40) * (liftTo - liftFrom);
    C.placeOnCurve(dummy, curve, t, { lift: -0.12 });
    dummy.updateMatrix();
    chainInst.setMatrixAt(i, dummy.matrix);
  }
  chainInst.instanceMatrix.needsUpdate = true;
  root.add(chainInst);

  const st = station(5.5, 3.2, '#ffd76a', '#e6455c');
  st.position.set(-1.2, 0, -6.2);
  root.add(st);

  // Train: a locomotive-ish lead car plus four followers.
  const CARS = 5;
  const carSpacing = 2.0 / length;
  const train = [];
  const trainGroup = new THREE.Group();
  root.add(trainGroup);

  for (let i = 0; i < CARS; i++) {
    const car = new THREE.Group();
    const col = i === 0 ? 0xffc23c : accent;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.52, 1.1, 4, 14),
      M.enamel(col),
    );
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.26;
    body.castShadow = true;
    car.add(body);
    car.add(M.box(1.15, 0.32, 1.9, M.enamel(col), 0, 0.3, 0));
    car.add(M.box(1.25, 0.1, 2.0, M.bar(0x2b3040), 0, 0.06, 0));
    // Nose cone on the lead car.
    if (i === 0) {
      const nose = M.cone(0.5, 1.0, M.enamel(0xffc23c), 0, 0.3, 1.35, 12);
      nose.rotation.x = Math.PI / 2;
      car.add(nose);
      car.add(M.sphere(0.13, M.glow(0xfff0c0, 3.0), 0, 0.42, 1.7));
    }
    // Wheels gripping the rail.
    for (const s of [-1, 1]) {
      for (const z of [-0.6, 0.6]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 10), M.rubber(0x15181f));
        w.rotation.z = Math.PI / 2;
        w.position.set(s * 0.58, 0.02, z);
        car.add(w);
      }
    }
    // Two rows of riders with lap bars.
    const riders = [];
    for (let r = 0; r < 2; r++) {
      for (const s of [-1, 1]) {
        const p = C.seatedRider(i * 4 + r * 2 + (s > 0 ? 1 : 0) + ctx.seed);
        p.position.set(s * 0.26, 0.38, r === 0 ? 0.42 : -0.42);
        p.scale.setScalar(0.78);
        p.visible = false;
        car.add(p);
        riders.push(p);
      }
      car.add(M.box(0.95, 0.09, 0.09, M.rubber(0x33384a), 0, 0.72, r === 0 ? 0.68 : -0.16));
    }
    trainGroup.add(car);
    train.push({ car, riders });
  }

  root.add(C.fenceRect(15.5, 15.5, 0x59617a, 0.95));
  const booth = C.operatorBooth(accent);
  booth.position.set(-5.4, 0, -8.4);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 0.95, -0.2);
  train[0].car.add(camSeat);

  // --- physics ---
  let t = 0.0;
  let speed = 3;
  const maxY = 13.8;
  let dwell = 0;
  const STATION_T = 0.995;

  return {
    root, camSeat,
    getSpeed: () => speed,
    update(dt, time, s) {
      for (const c of train) for (const r of c.riders) r.visible = s.riders > 0;

      if (s.power < 0.05) {
        // Park the train in the station when the ride is off.
        dwell = 0;
        const target = 0.02;
        t += (target - t) * dt * 0.8;
      } else if (dwell > 0) {
        dwell -= dt;
      } else {
        const p = curve.getPointAt(t);
        const inLift = t > liftFrom && t < liftTo;
        if (inLift) {
          speed = 3.4; // chain speed
        } else {
          // Energy conservation with a little friction.
          const v2 = 2 * 9.81 * Math.max(0.4, maxY + 1.2 - p.y);
          const target = Math.sqrt(v2) * 0.72;
          speed += (target - speed) * dt * 1.6;
          speed = Math.max(2.4, speed * (1 - dt * 0.03));
        }
        // Brake run into the station.
        if (t > 0.94 || t < 0.02) speed = Math.min(speed, 4.5);

        const prev = t;
        t += (speed / length) * dt * s.power;
        if (prev < STATION_T && t >= STATION_T) { dwell = 1.4; }
        if (t >= 1) t -= 1;
      }

      for (let i = 0; i < CARS; i++) {
        const ct = t - i * carSpacing;
        const bank = C.bankAt(curve, ct, 1.15);
        C.placeOnCurve(train[i].car, curve, ct, { bank, lift: 0.42 });
      }
      // Animate the lift chain.
      chainInst.position.y = 0;
    },
  };
}

/* ================================================================== *
 * Log Flume
 * ================================================================== */
export function logFlume(ctx) {
  const root = new THREE.Group();

  const pts = [
    [-5.5, 1.1, -5.0], [-1.0, 1.1, -5.6], [3.6, 1.2, -5.2],
    [5.8, 1.4, -3.0], [6.0, 1.5, 0.5], [5.4, 1.5, 3.4],
    [3.0, 1.5, 5.4], [0.0, 1.6, 5.8],
    // Lift to the top of the drop.
    [-2.6, 3.4, 5.2], [-4.6, 6.6, 3.4], [-5.4, 8.4, 1.0],
    [-5.0, 8.3, -0.6],
    // The plunge.
    [-3.4, 5.2, -1.8], [-1.6, 1.6, -2.4], [0.8, 1.15, -2.2],
    [3.0, 1.1, -1.0], [2.6, 1.05, 1.4], [0.2, 1.05, 2.2],
    [-2.8, 1.05, 1.4], [-4.4, 1.05, -1.6], [-6.0, 1.08, -3.6],
  ];
  const curve = C.makeTrack(pts, true, 0.5);
  curve.arcLengthDivisions = 700;
  const length = curve.getLength();
  const DROP_T = 0.62; // where the splash happens

  // Trough: a U-shaped profile swept along the spline.
  const profile = [
    [-1.05, 0.34], [-1.05, -0.38], [-0.74, -0.52], [0.74, -0.52], [1.05, -0.38], [1.05, 0.34],
  ];
  const troughGeo = extrudeProfile(curve, profile, 420, true, { uvScale: 40 });
  const trough = new THREE.Mesh(troughGeo, M.mat('flume-trough', {
    color: 0xcfd8e2, roughness: 0.62, metalness: 0.05, side: THREE.DoubleSide,
  }));
  trough.castShadow = true;
  trough.receiveShadow = true;
  root.add(trough);

  // Water ribbon just below the rim.
  const waterProfile = [[-0.78, -0.18], [0.78, -0.18]];
  const waterGeo = extrudeProfile(curve, waterProfile, 420, true, { uvScale: 60 });
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2ec4e8, roughness: 0.12, metalness: 0.0,
    transparent: true, opacity: 0.9, side: THREE.DoubleSide,
    emissive: 0x0f4a63, emissiveIntensity: 0.5,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  root.add(water);

  root.add(C.trackSupports(curve, 40, M.steel(0x7d8899, 0.45), { minHeight: 0.9 }));

  // Themed rockwork around the splashdown.
  const rockMat = M.mat('flume-rock', { color: 0x6b6f78, roughness: 1.0, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r = 3.0 + Math.sin(i * 2.7) * 1.1;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + (i % 4) * 0.35, 0), rockMat);
    rock.position.set(-2.2 + Math.cos(a) * r, 0.3 + (i % 3) * 0.2, -1.0 + Math.sin(a) * r * 0.7);
    rock.rotation.set(i, i * 2, i * 0.5);
    rock.castShadow = true; rock.receiveShadow = true;
    root.add(rock);
  }
  // Splash pool.
  const pool = M.pad(3.2, M.mat('flume-pool', {
    color: 0x2f9ec0, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.8,
  }), 0.12);
  pool.position.set(-1.4, 0.12, -2.2);
  root.add(pool);

  const stg = station(4.6, 3.0, '#7de0f0', '#2b8fb0');
  stg.position.set(-1.0, 0, -5.4);
  root.add(stg);

  // Logs.
  const LOGS = 4;
  const logs = [];
  for (let i = 0; i < LOGS; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.46, 1.5, 4, 12), M.timber('#7a4f2a'));
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.1;
    body.castShadow = true;
    g.add(body);
    // Hollowed top.
    g.add(M.box(0.66, 0.2, 1.6, M.timber('#5e3b1f'), 0, 0.4, 0));
    g.add(M.cyl(0.5, 0.12, M.timber('#8a5a30'), 0, 0.12, 1.05, 12).rotateX(Math.PI / 2));
    const riders = [];
    for (let r = 0; r < 3; r++) {
      const p = C.seatedRider(i * 3 + r + ctx.seed);
      p.position.set(0, 0.3, 0.55 - r * 0.55);
      p.scale.setScalar(0.76);
      p.visible = false;
      g.add(p);
      riders.push(p);
    }
    root.add(g);
    logs.push({ g, riders, t: i / LOGS, splashed: false });
  }

  root.add(C.fenceRect(14.5, 14, 0x59617a, 0.95));
  const booth = C.operatorBooth(0x2b8fb0);
  booth.position.set(-5.2, 0, -7.6);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 0.85, -0.3);
  logs[0].g.add(camSeat);

  return {
    root, camSeat,
    update(dt, time, s) {
      // Scroll the water surface to fake flow.
      waterMat.emissiveIntensity = 0.35 + Math.sin(time * 2) * 0.1;

      for (const L of logs) {
        for (const r of L.riders) r.visible = s.riders > 0;
        if (s.power < 0.05) continue;

        const p = curve.getPointAt(L.t);
        // Slow drift on the flats, chain-lift pace on the climb, free fall on
        // the drop.
        let v;
        if (L.t > 0.40 && L.t < 0.56) v = 1.6;          // lift
        else if (L.t > 0.56 && L.t < 0.70) v = 5.5 + (8.4 - p.y) * 1.5; // plunge
        else v = 2.2;
        L.t += (v / length) * dt * s.power;
        if (L.t >= 1) { L.t -= 1; L.splashed = false; }

        const bank = C.bankAt(curve, L.t, 0.5);
        C.placeOnCurve(L.g, curve, L.t, { bank, lift: 0.04 });

        // Splash once per lap at the bottom of the drop.
        if (!L.splashed && L.t > DROP_T && L.t < DROP_T + 0.05) {
          L.splashed = true;
          const wp = L.g.getWorldPosition(new THREE.Vector3());
          ctx.fx?.splash(wp, 1.3);
        }
      }
    },
  };
}

/* ================================================================== *
 * Go-Karts
 * ================================================================== */
export function goKarts(ctx) {
  const root = new THREE.Group();

  const pts = [
    [-6.5, 0.12, -4.5], [-2.0, 0.12, -6.0], [3.0, 0.12, -5.6], [6.2, 0.12, -3.0],
    [6.6, 0.12, 0.5], [4.0, 0.12, 2.4], [1.0, 0.12, 1.4], [-1.5, 0.12, 2.8],
    [-1.0, 0.12, 5.4], [-4.0, 0.12, 6.0], [-6.6, 0.12, 3.6], [-7.0, 0.12, -0.5],
  ];
  const curve = C.makeTrack(pts, true, 0.5);
  curve.arcLengthDivisions = 600;
  const length = curve.getLength();

  // Tarmac ribbon.
  const roadGeo = extrudeProfile(curve, [[-2.3, 0], [2.3, 0]], 380, true, { uvScale: 30 });
  const road = new THREE.Mesh(roadGeo, M.mat('kart-road', {
    color: 0x3a3d45, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide,
  }));
  road.receiveShadow = true;
  root.add(road);

  // Red/white kerbs.
  for (const side of [-1, 1]) {
    const geo = extrudeProfile(curve, [[side * 2.3, 0.02], [side * 2.62, 0.06]], 190, true, { uvScale: 46 });
    const kerb = new THREE.Mesh(geo, M.canopy('#e6455c', '#fff6e8', 2));
    kerb.receiveShadow = true;
    root.add(kerb);
  }

  // Tyre barriers.
  const tyreGeo = new THREE.TorusGeometry(0.32, 0.15, 6, 12);
  tyreGeo.rotateX(Math.PI / 2);
  const tyreCount = 120;
  const tyres = new THREE.InstancedMesh(tyreGeo, M.rubber(0x1d2029), tyreCount * 2);
  tyres.castShadow = true;
  const m4 = new THREE.Matrix4();
  const p = new THREE.Vector3(), tan = new THREE.Vector3(), nrm = new THREE.Vector3();
  let ti = 0;
  for (let i = 0; i < tyreCount; i++) {
    const t = i / tyreCount;
    curve.getPointAt(t, p);
    curve.getTangentAt(t, tan);
    nrm.set(-tan.z, 0, tan.x).normalize();
    for (const side of [-1, 1]) {
      m4.makeTranslation(p.x + nrm.x * side * 3.0, 0.16, p.z + nrm.z * side * 3.0);
      tyres.setMatrixAt(ti++, m4);
    }
  }
  tyres.count = ti;
  tyres.instanceMatrix.needsUpdate = true;
  root.add(tyres);

  // Start gantry.
  const gantry = new THREE.Group();
  const gp = curve.getPointAt(0);
  const gt = curve.getTangentAt(0);
  gantry.position.set(gp.x, 0, gp.z);
  gantry.rotation.y = Math.atan2(gt.x, gt.z);
  for (const s of [-1, 1]) {
    gantry.add(M.cyl(0.16, 4.2, M.steel(0xe0e6ef, 0.35), s * 3.0, 2.1, 0, 8));
  }
  gantry.add(M.box(6.4, 0.5, 0.4, M.paint(0xe6455c, { rough: 0.5 }), 0, 4.3, 0));
  const lights = [];
  for (let i = 0; i < 5; i++) {
    const l = M.sphere(0.17, M.glow(0xff2b2b, 2.8), -1.6 + i * 0.8, 4.3, 0.28);
    gantry.add(l);
    lights.push(l);
  }
  root.add(gantry);
  // Chequered strip.
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.9),
    M.canopy('#1b2030', '#f5f7fb', 8));
  grid.rotation.x = -Math.PI / 2;
  grid.position.set(gp.x, 0.14, gp.z);
  grid.rotation.z = Math.atan2(gt.x, gt.z);
  root.add(grid);

  // Karts.
  const KARTS = 6;
  const karts = [];
  for (let i = 0; i < KARTS; i++) {
    const g = new THREE.Group();
    const col = M.funColor(i + ctx.seed);
    g.add(M.box(0.78, 0.24, 1.5, M.enamel(col), 0, 0.26, 0));
    g.add(M.box(0.62, 0.3, 0.5, M.enamel(col), 0, 0.48, -0.42));
    g.add(M.box(0.9, 0.12, 0.3, M.enamel(0x2b3040), 0, 0.5, 0.72));
    // Nose cone + wheels.
    g.add(M.box(0.5, 0.16, 0.4, M.enamel(col), 0, 0.24, 0.82));
    const wheels = [];
    for (const s of [-1, 1]) {
      for (const z of [-0.5, 0.55]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 12), M.rubber(0x15181f));
        w.rotation.z = Math.PI / 2;
        w.position.set(s * 0.5, 0.24, z);
        w.castShadow = true;
        g.add(w);
        wheels.push(w);
      }
    }
    const rider = C.seatedRider(i + ctx.seed);
    rider.position.set(0, 0.34, -0.1);
    rider.scale.setScalar(0.82);
    rider.visible = false;
    g.add(rider);
    // Steering wheel + roll hoop.
    g.add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 12), M.bar(0x2b3040))
      .translateY(0.62).translateZ(0.28).rotateX(-1.0));
    root.add(g);
    karts.push({
      g, rider, wheels,
      t: i / KARTS * 0.9,
      v: 0,
      lane: (i % 2 === 0 ? -1 : 1) * 0.85,
      skill: 0.82 + (i % 4) * 0.06,
    });
  }

  root.add(C.fenceRect(16, 15, 0x59617a, 1.0));
  const booth = C.operatorBooth(0xffc23c);
  booth.position.set(-8.0, 0, -6.0);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 0.8, -0.5);
  karts[0].g.add(camSeat);

  const tmpN = new THREE.Vector3();
  return {
    root, camSeat,
    update(dt, time, s) {
      // Start lights count down while the ride spins up.
      const lit = Math.floor(s.power * 5);
      lights.forEach((l, i) => {
        l.material = i < lit ? M.glow(0x2bff6a, 3.0) : M.glow(0xff2b2b, 1.2);
      });

      for (const k of karts) {
        k.rider.visible = s.riders > 0;
        if (s.power < 0.05) { k.v *= 0.94; }
        else {
          // Slow for corners, accelerate on straights.
          const curvature = Math.abs(C.bankAt(curve, k.t, 1));
          const target = (9.5 - curvature * 5.5) * k.skill * s.power;
          k.v += (target - k.v) * dt * 1.4;
        }
        k.t += (k.v / length) * dt;
        if (k.t >= 1) k.t -= 1;

        curve.getPointAt(k.t, p);
        curve.getTangentAt(k.t, tan);
        tmpN.set(-tan.z, 0, tan.x).normalize();
        k.g.position.set(p.x + tmpN.x * k.lane, 0.13, p.z + tmpN.z * k.lane);
        k.g.rotation.y = Math.atan2(tan.x, tan.z);
        k.g.rotation.z = C.bankAt(curve, k.t, 0.35);
        for (const w of k.wheels) w.rotation.x += k.v * dt * 4;
      }
    },
  };
}

/* ================================================================== *
 * Kiddie Train
 * ================================================================== */
export function kiddieTrain(ctx) {
  const root = new THREE.Group();
  const pts = [];
  // Gentle rounded rectangle.
  const RX = 5.4, RZ = 4.4;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push([Math.cos(a) * RX, 0.35, Math.sin(a) * RZ]);
  }
  const curve = C.makeTrack(pts, true, 0.5);
  curve.arcLengthDivisions = 400;
  const length = curve.getLength();

  // Ballast bed.
  const bed = extrudeProfile(curve, [[-0.95, -0.22], [-0.8, -0.05], [0.8, -0.05], [0.95, -0.22]], 200, true, { uvScale: 24 });
  const bedMesh = new THREE.Mesh(bed, M.mat('train-bed', {
    color: 0x8a8578, roughness: 1.0, side: THREE.DoubleSide,
  }));
  bedMesh.receiveShadow = true;
  root.add(bedMesh);
  root.add(C.railsAlong(curve, {
    gauge: 0.95, railRadius: 0.05, ties: 70,
    railColor: 0xb9c2cf, tieColor: 0x6b4a30, tubularSegments: 220,
  }));

  // Grass infield with flowers.
  const infield = M.pad(3.4, M.paint(0x5ea64f, { rough: 0.95 }), 0.06);
  infield.scale.x *= 1.25;
  root.add(infield);
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 3.0;
    const f = M.sphere(0.12, M.paint(M.funColor(i), { rough: 0.8 }),
      Math.cos(a) * r * 1.2, 0.18, Math.sin(a) * r);
    root.add(f);
  }

  // Locomotive + carriages.
  const CARS = 4;
  const cars = [];
  for (let i = 0; i < CARS; i++) {
    const g = new THREE.Group();
    const isLoco = i === 0;
    const col = isLoco ? 0xe6455c : M.funColor(i + 3 + ctx.seed);
    if (isLoco) {
      g.add(M.box(0.85, 0.5, 1.5, M.enamel(col), 0, 0.42, 0));
      const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.1, 14), M.enamel(col));
      boiler.rotation.x = Math.PI / 2;
      boiler.position.set(0, 0.62, 0.35);
      g.add(boiler);
      g.add(M.cyl(0.14, 0.5, M.enamel(0x2b3040), 0, 1.05, 0.62, 10));
      g.add(M.cyl(0.19, 0.12, M.enamel(0x2b3040), 0, 1.3, 0.62, 10));
      g.add(M.box(0.8, 0.55, 0.7, M.enamel(0xffc23c), 0, 0.85, -0.42));
      g.add(M.box(0.92, 0.1, 0.82, M.enamel(0x2b3040), 0, 1.16, -0.42));
      g.add(M.sphere(0.1, M.glow(0xfff0c0, 3.0), 0, 0.78, 0.92));
      g.userData.stack = new THREE.Vector3(0, 1.4, 0.62);
    } else {
      g.add(M.box(0.85, 0.32, 1.35, M.enamel(col), 0, 0.36, 0));
      g.add(M.box(0.9, 0.42, 0.1, M.enamel(col), 0, 0.6, -0.68));
      g.add(M.box(0.9, 0.42, 0.1, M.enamel(col), 0, 0.6, 0.68));
      const canopyMesh = M.box(0.95, 0.08, 1.4, M.canopy('#ffd76a', '#e6455c', 6), 0, 1.15, 0);
      g.add(canopyMesh);
      for (const s of [-1, 1]) for (const z of [-0.6, 0.6]) {
        g.add(M.cyl(0.035, 0.6, M.bar(0xc8d0dc), s * 0.42, 0.82, z, 6));
      }
    }
    const riders = [];
    if (!isLoco) {
      for (let r = 0; r < 2; r++) {
        const pr = C.seatedRider(i * 2 + r + ctx.seed);
        pr.position.set(0, 0.5, 0.34 - r * 0.68);
        pr.scale.setScalar(0.66);
        pr.visible = false;
        g.add(pr);
        riders.push(pr);
      }
    } else {
      const driver = C.seatedRider(99);
      driver.position.set(0, 0.62, -0.42);
      driver.scale.setScalar(0.72);
      g.add(driver);
    }
    const wheels = [];
    for (const s of [-1, 1]) for (const z of [-0.45, 0.45]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 10), M.rubber(0x2b2f38));
      w.rotation.z = Math.PI / 2;
      w.position.set(s * 0.47, 0.2, z);
      g.add(w);
      wheels.push(w);
    }
    root.add(g);
    cars.push({ g, riders, wheels, isLoco });
  }

  const stg = station(3.2, 2.4, '#9ede4a', '#2f7a3a');
  stg.position.set(0, 0, RZ + 1.9);
  root.add(stg);
  const booth = C.operatorBooth(0x9ede4a);
  booth.position.set(RX + 1.6, 0, RZ + 1.0);
  root.add(booth);

  const camSeat = new THREE.Object3D();
  camSeat.position.set(0, 0.9, 0);
  cars[1].g.add(camSeat);

  let t = 0;
  let smokeTimer = 0;
  const spacing = 1.75 / length;
  return {
    root, camSeat,
    update(dt, time, s) {
      t += (2.6 / length) * dt * s.power;
      if (t >= 1) t -= 1;
      for (let i = 0; i < CARS; i++) {
        const c = cars[i];
        C.placeOnCurve(c.g, curve, t - i * spacing, { lift: 0.12 });
        for (const w of c.wheels) w.rotation.x += dt * s.power * 9;
        for (const r of c.riders) r.visible = s.riders > 0;
      }
      // Puff smoke from the funnel.
      smokeTimer -= dt;
      if (s.power > 0.3 && smokeTimer <= 0) {
        smokeTimer = 0.32;
        const wp = cars[0].g.localToWorld(cars[0].g.userData.stack.clone());
        ctx.fx?.smoke(wp, 0.5);
      }
    },
  };
}
