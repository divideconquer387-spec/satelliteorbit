const viewer = document.getElementById("viewer");
const noradInput = document.getElementById("norad");
const trackBtn = document.getElementById("track-btn");
const statusEl = document.getElementById("status");
const satListEl = document.getElementById("sat-list");

const selectedNoradEl = document.getElementById("selected-norad");
const latEl = document.getElementById("latitude");
const lonEl = document.getElementById("longitude");
const altEl = document.getElementById("altitude");

const EARTH_RADIUS = 4;
const UPDATE_INTERVAL_MS = 3000;
const API_BASE = "https://satelliteorbit-production.up.railway.app/api/satellite";

const scene = new THREE.Scene();
const earthSystem = new THREE.Group();
scene.add(earthSystem);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 0, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
viewer.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 6;
controls.maxDistance = 35;
controls.enablePan = false;

const earthTexture = new THREE.TextureLoader().load("https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg");
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS, 72, 72),
  new THREE.MeshBasicMaterial({ map: earthTexture })
);
earthSystem.add(earth);

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS * 1.03, 64, 64),
  new THREE.MeshBasicMaterial({ color: 0x4fa2ff, transparent: true, opacity: 0.15, side: THREE.BackSide })
);
earthSystem.add(atmosphere);

const starGeometry = new THREE.BufferGeometry();
const starVertices = [];
for (let i = 0; i < 1500; i += 1) {
  const r = 200 + Math.random() * 600;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starVertices.push(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi)
  );
}
starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starVertices, 3));
scene.add(new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7 })));

const satellites = new Map();
let selectedSatellite = null;
let isRefreshing = false;

const colorPalette = [0x7df9ff, 0xff9d7d, 0xc4ff7d, 0xe89cff, 0xffe27d, 0x8ac4ff, 0x8effce, 0xff8ac0];
let colorCursor = 0;

function latLonToVector3(lat, lon, altitudeKm = 0) {
  const altitudeScale = altitudeKm / 6371;
  const radius = EARTH_RADIUS * (1 + altitudeScale * 0.15);
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

async function fetchSatellitePosition(norad) {
  const response = await fetch(`${API_BASE}/${norad}`);
  if (!response.ok) {
    throw new Error(`Satellite ${norad} not found`);
  }
  return response.json();
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#ff9da4" : "#d3e1ff";
}

function setTelemetry(sat) {
  selectedSatellite = sat;
  if (!sat || !sat.latestTelemetry) {
    selectedNoradEl.textContent = "—";
    latEl.textContent = "—";
    lonEl.textContent = "—";
    altEl.textContent = "—";
  } else {
    const telemetry = sat.latestTelemetry;
    selectedNoradEl.textContent = sat.norad;
    latEl.textContent = `${telemetry.latitude.toFixed(4)}°`;
    lonEl.textContent = `${telemetry.longitude.toFixed(4)}°`;
    altEl.textContent = `${telemetry.altitude_km.toFixed(2)} km`;
  }

  satListEl.querySelectorAll(".sat-pill").forEach((pill) => {
    pill.classList.toggle("active", sat && pill.dataset.norad === sat.norad);
  });
}

function createSatellite(norad) {
  const color = colorPalette[colorCursor % colorPalette.length];
  colorCursor += 1;

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 14, 14),
    new THREE.MeshBasicMaterial({ color })
  );
  marker.visible = false;
  marker.userData.norad = norad;
  earthSystem.add(marker);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 12, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 })
  );
  halo.visible = false;
  earthSystem.add(halo);

  const line = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 })
  );
  earthSystem.add(line);

  const sat = {
    norad,
    color,
    marker,
    halo,
    targetPosition: new THREE.Vector3(),
    groundTrack: [],
    groundLine: line,
    latestTelemetry: null
  };

  satellites.set(norad, sat);

  const pill = document.createElement("button");
  pill.className = "sat-pill";
  pill.type = "button";
  pill.dataset.norad = norad;
  pill.style.borderColor = `#${new THREE.Color(color).getHexString()}`;
  pill.textContent = `NORAD ${norad}`;
  pill.addEventListener("click", () => {
    setTelemetry(sat);
    setStatus(`Selected NORAD ${sat.norad}`);
  });
  satListEl.appendChild(pill);

  return sat;
}

async function updateSatellite(sat) {
  const data = await fetchSatellitePosition(sat.norad);

  sat.latestTelemetry = {
    latitude: data.latitude,
    longitude: data.longitude,
    altitude_km: data.altitude_km
  };

  sat.targetPosition.copy(latLonToVector3(data.latitude, data.longitude, data.altitude_km));

  if (!sat.marker.visible) {
    sat.marker.position.copy(sat.targetPosition);
    sat.halo.position.copy(sat.targetPosition);
  }

  sat.marker.visible = true;
  sat.halo.visible = true;

  sat.groundTrack.push(latLonToVector3(data.latitude, data.longitude, 0));
  if (sat.groundTrack.length > 720) {
    sat.groundTrack.shift();
  }

  sat.groundLine.geometry.dispose();
  sat.groundLine.geometry = new THREE.BufferGeometry().setFromPoints(sat.groundTrack);

  if (selectedSatellite?.norad === sat.norad) {
    setTelemetry(sat);
  }
}

async function addSatellite(norad) {
  if (!/^\d+$/.test(norad)) {
    throw new Error(`Invalid NORAD ID: ${norad}`);
  }

  if (satellites.has(norad)) {
    return satellites.get(norad);
  }

  const sat = createSatellite(norad);
  await updateSatellite(sat);
  return sat;
}

async function trackFromInput() {
  const ids = [...new Set(noradInput.value.split(",").map((id) => id.trim()).filter(Boolean))];

  if (!ids.length) {
    setStatus("Please enter at least one NORAD ID.", true);
    return;
  }

  const errors = [];
  let firstTracked = null;

  for (const id of ids) {
    try {
      const sat = await addSatellite(id);
      if (!firstTracked) {
        firstTracked = sat;
      }
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (firstTracked) {
    setTelemetry(firstTracked);
  }

  if (errors.length) {
    setStatus(errors.join(" | "), true);
  } else {
    setStatus(`Tracking ${satellites.size} satellite(s). Auto-refresh every 3s.`);
  }
}

async function refreshAllSatellites() {
  if (isRefreshing || satellites.size === 0) {
    return;
  }

  isRefreshing = true;
  const tasks = [...satellites.values()].map(async (sat) => {
    try {
      await updateSatellite(sat);
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  await Promise.all(tasks);
  isRefreshing = false;
}

setInterval(refreshAllSatellites, UPDATE_INTERVAL_MS);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
window.addEventListener("click", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const hits = raycaster.intersectObjects([...satellites.values()].map((sat) => sat.marker));
  if (!hits.length) {
    return;
  }

  const sat = satellites.get(hits[0].object.userData.norad);
  if (!sat) {
    return;
  }

  setTelemetry(sat);
  setStatus(`Selected NORAD ${sat.norad}`);
});

function animate() {
  earthSystem.rotation.y += 0.00035;

  satellites.forEach((sat) => {
    sat.marker.position.lerp(sat.targetPosition, 0.1);
    sat.halo.position.copy(sat.marker.position);
    sat.halo.scale.setScalar(1 + 0.22 * Math.sin(Date.now() * 0.005));
  });

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

trackBtn.addEventListener("click", trackFromInput);
noradInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    trackFromInput();
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const params = new URLSearchParams(window.location.search);
const initialIds = params.get("norad-id") || params.get("norad-ids");
if (initialIds) {
  noradInput.value = initialIds;
  trackFromInput();
}
