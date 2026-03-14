import { createSatelliteMarker } from "./satelliteMarker.js";
import { fetchTLE } from "../api/fetchTLE.js";
import { latLonToVector3 } from "../math/latLonToVector3.js";

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
    });
  }
}