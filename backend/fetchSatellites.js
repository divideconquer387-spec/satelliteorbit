const axios = require("axios");
const db = require("./db");

async function loadSatellites() {
  try {

    const response = await axios.get(
      "https://celestrak.org/NORAD/elements/active.txt"
    );

    const lines = response.data.split("\n");

    for (let i = 0; i < lines.length; i += 3) {

      const name = lines[i].trim();
      const line1 = lines[i + 1];
      const line2 = lines[i + 2];

      if (!line1 || !line2) continue;

      const norad_id = line1.substring(2, 7).trim();
      const inclination = parseFloat(line2.substring(8, 16));

      await db.query(
        "INSERT INTO satellites (name, norad_id, inclination) VALUES (?, ?, ?)",
        [name, norad_id, inclination]
      );

    }

    console.log("Satellites loaded successfully 🚀");

  } catch (error) {
    console.error("Error loading satellites:", error);
  }
}

loadSatellites();