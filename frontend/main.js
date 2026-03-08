const viewer = document.getElementById("viewer");
const noradInput = document.getElementById("norad");
const trackBtn = document.getElementById("track-btn");

const statusEl = document.getElementById("status");
const latEl = document.getElementById("latitude");
const lonEl = document.getElementById("longitude");
const altEl = document.getElementById("altitude");

const EARTH_RADIUS = 4;

/* API */
const API_BASE = "https://satelliteorbit-production.up.railway.app/api/satellite";

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
const satellites = [];

function createSatelliteMarker(color = 0xffffff) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 12, 12),
    new THREE.MeshBasicMaterial({ color })
  );
  marker.visible = false;
  earthSystem.add(marker);


  return { marker, targetPosition: new THREE.Vector3(), groundTrack: [], data};
}

/* Lat/Lon to 3D */
function latLonToVector3(lat, lon, altitudeKm = 0) {
  const radius = EARTH_RADIUS + (altitudeKm / 6371) * EARTH_RADIUS; // scale altitude proportionally
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

async function fetchAllSatellites() {
  try {
    const res = await fetch(API_BASE); // fetch all satellites
    if (!res.ok) throw new Error("Failed to fetch satellites");
    const data = await res.json();

    data.forEach(satData => {
      const sat = createSatelliteMarker(satData);
      satellites.push(sat);

      const pos = latLonToVector3(satData.latitude, satData.longitude, satData.altitude_km);
      sat.targetPosition.copy(pos);
      sat.marker.visible = true;

      // Add initial ground track point
      const surfacePoint = latLonToVector3(satData.latitude, satData.longitude, 0);
      sat.groundTrack.push(surfacePoint);
      const geometry = new THREE.BufferGeometry().setFromPoints(sat.groundTrack);
      const material = new THREE.LineBasicMaterial({ color: 0xffcc66 });
      sat.groundLine = new THREE.Line(geometry, material);
      earthSystem.add(sat.groundLine);
    });
  } catch (err) {
    console.error(err);
  }
}

/* Fetch satellite data */
async function fetchSatellitePosition(norad) {
  const res = await fetch(`${API_BASE}/${norad}`);
  if (!res.ok) throw new Error("Satellite not found");
  return res.json();
}

/* Add satellite */
async function addSatellite(norad) {
  const sat = createSatelliteMarker();
  sat.norad = norad;
  satellites.push(sat);
  await updateSatellite(sat);
}

/* Update single satellite */
function updateSatellites() {
  satellites.forEach(sat => {
    // Update 3D position
    const pos = latLonToVector3(sat.data.latitude, sat.data.longitude, sat.data.altitude_km);
    sat.targetPosition.copy(pos);

    // Update ground track
    const surfacePoint = latLonToVector3(sat.data.latitude, sat.data.longitude, 0);
    sat.groundTrack.push(surfacePoint);
    if (sat.groundTrack.length > 500) sat.groundTrack.shift();

    // Refresh line
    if (sat.groundLine) earthSystem.remove(sat.groundLine);
    const geometry = new THREE.BufferGeometry().setFromPoints(sat.groundTrack);
    sat.groundLine.geometry = geometry; // update geometry
    earthSystem.add(sat.groundLine);
  });
}

// Call update every 3 seconds (or however often you want)
setInterval(updateSatellites, 3000);

/* Click info */
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
window.addEventListener("click", e => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const intersects = satellites.map(s => s.marker);
  const hit = raycaster.intersectObjects(intersects);
  if (hit.length > 0) {
    const sat = satellites.find(s => s.marker === hit[0].object);
    setStatus(`NORAD: ${sat.norad}`);
    latEl.textContent = sat.targetPosition.y.toFixed(2);
    lonEl.textContent = sat.targetPosition.z.toFixed(2);
    altEl.textContent = (sat.targetPosition.length() - EARTH_RADIUS).toFixed(2) + " km";
  }
});

/* UI */
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.style.color = isError ? "#ff8d93" : "#d0dcf6";
}

function animate() {
  satellites.forEach(sat => {
    sat.marker.position.lerp(sat.targetPosition, 0.15);
  });
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

/* Track button - enter multiple NORAD IDs separated by commas */
trackBtn.addEventListener("click", () => {
  const ids = noradInput.value.split(",").map(x => x.trim());
  ids.forEach(id => addSatellite(id));
});