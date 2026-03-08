const viewer = document.getElementById("viewer");
const noradInput = document.getElementById("norad");
const trackBtn = document.getElementById("track-btn");

const statusEl = document.getElementById("status");
const selectedNoradEl = document.getElementById("selected-norad");
const latEl = document.getElementById("latitude");
const lonEl = document.getElementById("longitude");
const altEl = document.getElementById("altitude");

const EARTH_RADIUS = 4;
const UPDATE_INTERVAL_MS = 3000;

/* API */
const apiBaseMeta = document.querySelector('meta[name="api-base"]')?.content?.trim();
const API_BASE = apiBaseMeta || "/api/satellite";

/* Scene */
const scene = new THREE.Scene();
const earthSystem = new THREE.Group();
scene.add(earthSystem);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1200
);
camera.position.set(0, 0, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
viewer.appendChild(renderer.domElement);

/* Controls */
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 6;
controls.maxDistance = 30;

/* Earth */
const earthTexture = new THREE.TextureLoader().load("https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg");
const earth = new THREE.Mesh(
  new THREE.SphereGeometry(EARTH_RADIUS, 64, 64),
  new THREE.MeshBasicMaterial({ map: earthTexture })
);
earthSystem.add(earth);

/* Satellite management */
const satellitesByNorad = new Map();
let selectedSatellite = null;

function createSatelliteMarker(color = 0xffffff) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 12, 12),
    new THREE.MeshBasicMaterial({ color })
  );

  marker.visible = false;
  earthSystem.add(marker);

  const groundLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([]),
    new THREE.LineBasicMaterial({ color: 0xffcc66 })
  );
  earthSystem.add(groundLine);

  return {
    marker,
    groundLine,
    groundTrack: [],
    targetPosition: new THREE.Vector3(),
    data: null,
    norad: null,
    name: null
  };
}

/* Lat/Lon to 3D */
function latLonToVector3(lat, lon, altitudeKm = 0) {
  const radius = EARTH_RADIUS + (altitudeKm / 6371) * EARTH_RADIUS;
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;

  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function updateSatelliteFromData(sat, satData) {
  sat.data = satData;
  sat.norad = satData.noradId;
  sat.name = satData.name;

  const pos = latLonToVector3(satData.latitude, satData.longitude, satData.altitude_km);
  sat.targetPosition.copy(pos);
  sat.marker.visible = true;

  // Keep track line at satellite altitude (not projected to Earth surface).
  sat.groundTrack.push(pos.clone());
  if (sat.groundTrack.length > 500) {
    sat.groundTrack.shift();
  }

  sat.groundLine.geometry.dispose();
  sat.groundLine.geometry = new THREE.BufferGeometry().setFromPoints(sat.groundTrack);

  if (selectedSatellite === sat) {
    renderSelectedSatelliteInfo(sat);
  }
}

async function fetchAllSatellites() {
  const response = await fetch(API_BASE);

  if (!response.ok) {
    let details = "";

    try {
      const body = await response.json();
      details = body?.error || body?.details || "";
    } catch (_error) {
      details = "";
    }

    throw new Error(`Failed to fetch satellites (${response.status})${details ? `: ${details}` : ""}`);
  }

  const payload = await response.json();

  if (!Array.isArray(payload)) {
    throw new Error("Invalid satellite payload from API");
  }

  return payload;
}

async function refreshSatellites() {
  try {
    const allSatellites = await fetchAllSatellites();

    allSatellites.forEach((satData) => {
      let sat = satellitesByNorad.get(satData.noradId);

      if (!sat) {
        sat = createSatelliteMarker();
        satellitesByNorad.set(satData.noradId, sat);
      }

      updateSatelliteFromData(sat, satData);
    });

    setStatus(`Tracking ${allSatellites.length} satellites • updates every 3s`);
  } catch (error) {
    console.error(error);
    setStatus(`Unable to update satellites: ${error.message}`, true);
  }
}

/* Add single satellite from user input */
async function addSatellite(norad) {
  if (!norad) return;

  try {
    const res = await fetch(`${API_BASE}/${norad}`);

    if (!res.ok) {
      throw new Error(`Satellite ${norad} not found`);
    }

    const satData = await res.json();

    let sat = satellitesByNorad.get(satData.noradId);
    if (!sat) {
      sat = createSatelliteMarker(0x66ffcc);
      satellitesByNorad.set(satData.noradId, sat);
    }

    updateSatelliteFromData(sat, satData);
    setStatus(`Added NORAD ${satData.noradId}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

/* Click info */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function renderSelectedSatelliteInfo(sat) {
  if (!sat || !sat.data) return;

  selectedNoradEl.textContent = sat.norad;
  latEl.textContent = `${sat.data.latitude.toFixed(2)}°`;
  lonEl.textContent = `${sat.data.longitude.toFixed(2)}°`;
  altEl.textContent = `${sat.data.altitude_km.toFixed(2)} km`;
  setStatus(`Selected NORAD ${sat.norad}${sat.name ? ` (${sat.name})` : ""}`);
}

window.addEventListener("click", (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const markers = Array.from(satellitesByNorad.values()).map((sat) => sat.marker);
  const hits = raycaster.intersectObjects(markers);

  if (hits.length > 0) {
    selectedSatellite = Array.from(satellitesByNorad.values()).find(
      (sat) => sat.marker === hits[0].object
    );
    renderSelectedSatelliteInfo(selectedSatellite);
  }
});

/* UI */
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#ff8d93" : "#d0dcf6";
}

trackBtn.addEventListener("click", () => {
  const ids = noradInput.value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  ids.forEach((id) => addSatellite(id));
});

function animate() {
  satellitesByNorad.forEach((sat) => {
    sat.marker.position.lerp(sat.targetPosition, 0.2);
  });

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

refreshSatellites();
setInterval(refreshSatellites, UPDATE_INTERVAL_MS);
animate();
