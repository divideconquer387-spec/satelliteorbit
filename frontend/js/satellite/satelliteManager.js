import { createSatelliteMarker } from "./satelliteMarker.js";
import { fetchTLE } from "../api/fetchTLE.js";
import { latLonToVector3 } from "../math/latLonToVector3.js";

const PREDICTION_MINUTES_AHEAD = 100;
const PREDICTION_STEP_SECONDS = 45;
const PREDICTION_REFRESH_MS = 30_000;

export class SatelliteManager {
  constructor(group) {
    this.group = group;
    this.satellites = [];
  }

  hasSatellite(norad) {
    return this.satellites.some((sat) => sat.norad === norad);
  }

  async addSatellite(norad) {
    if (this.hasSatellite(norad)) {
      return this.satellites.find((sat) => sat.norad === norad);
    }

    const sat = createSatelliteMarker();
    sat.norad = norad;

    this.group.add(sat.marker);

    try {
      const tle = await fetchTLE(norad);
      sat.name = tle.name;
      sat.satrec = satellite.twoline2satrec(tle.tle1, tle.tle2);
      this.satellites.push(sat);

      return sat;
    } catch (error) {
      this.group.remove(sat.marker);
      throw error;
    }
  }

  update() {
    const now = new Date();

    this.satellites.forEach((sat) => {
      if (!sat.satrec) {
        return;
      }

      const posVel = satellite.propagate(sat.satrec, now);

      if (!posVel.position) {
        return;
      }

      const gmst = satellite.gstime(now);
      const geo = satellite.eciToGeodetic(posVel.position, gmst);
      const latitude = satellite.degreesLat(geo.latitude);
      const longitude = satellite.degreesLong(geo.longitude);
      const altitudeKm = geo.height;

      sat.targetPosition.copy(latLonToVector3(latitude, longitude, altitudeKm));
      sat.marker.position.lerp(sat.targetPosition, 0.2);
      sat.marker.visible = true;

      sat.latestData = {
        latitude,
        longitude,
        altitude_km: altitudeKm
      };
      if (!sat.orbitLine || now.getTime() - sat.lastPredictionAt > PREDICTION_REFRESH_MS) {
        this.updatePredictionLines(sat, now);
        sat.lastPredictionAt = now.getTime();
      }
    });
  }
  updatePredictionLines(sat, now = new Date()) {
    const orbitPoints = [];
    const groundPoints = [];
    const altitudeBridgePoints = [];

    for (let t = 0; t <= PREDICTION_MINUTES_AHEAD * 60; t += PREDICTION_STEP_SECONDS) {
      const time = new Date(now.getTime() + t * 1000);
      const posVel = satellite.propagate(sat.satrec, time);

      if (!posVel.position) {
        continue;
      }

      const gmst = satellite.gstime(time);
      const geo = satellite.eciToGeodetic(posVel.position, gmst);
      const lat = satellite.degreesLat(geo.latitude);
      const lon = satellite.degreesLong(geo.longitude);
      const altKm = geo.height;

      const orbitPoint = latLonToVector3(lat, lon, altKm);
      const groundPoint = latLonToVector3(lat, lon, 0);

      if (orbitPoints.length > 0) {
        const prevOrbitPoint = orbitPoints[orbitPoints.length - 1];
        if (orbitPoint.distanceTo(prevOrbitPoint) > 2.4) {
          continue;
        }
      }

      orbitPoints.push(orbitPoint);
      groundPoints.push(groundPoint);
      altitudeBridgePoints.push(groundPoint, orbitPoint);
    }

    if (orbitPoints.length < 2) {
      return;
    }

    this.replaceLine(sat, "orbitLine", orbitPoints, 0xffb86a);
    this.replaceLine(sat, "groundLine", groundPoints, 0x66dbff);
    this.replaceLine(sat, "altitudeBridges", altitudeBridgePoints, 0x98ffa7, true);
  }

  replaceLine(sat, key, points, color, segments = false) {
    if (sat[key]) {
      this.group.remove(sat[key]);
      sat[key].geometry.dispose();
      sat[key].material.dispose();
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    sat[key] = segments
      ? new THREE.LineSegments(geometry, material)
      : new THREE.Line(geometry, material);

    this.group.add(sat[key]);
  }
}
