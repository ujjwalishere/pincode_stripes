// Store the URL of the browser-optimized PIN boundary GeoJSON file.
const DATA_URL = "data/pincodes.geojson";
// Build the URL for a stripe image using the PIN as the filename.
const STRIPE_PATH = (pin) => `data/stripes/${pin}.png`;

// Create the Leaflet map, using canvas rendering for better performance with many polygons.
const map = L.map("map", {
  // Prevent zooming farther out than the India view.
  minZoom: 4,
  // Prevent zooming beyond the useful detail level of the boundary data.
  maxZoom: 16,
  // Draw vector boundaries on a canvas instead of creating many SVG elements.
  preferCanvas: true,
  // Start with a view centered approximately over India.
}).setView([22.5, 79], 5);
// Add OpenStreetMap as the basemap behind the PIN boundaries.
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  // Display the required attribution for the OpenStreetMap data.
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  // Permit tile requests up to Leaflet's standard maximum zoom.
  maxZoom: 19,
  // Add the tile layer to the map.
}).addTo(map);

// Hold the Leaflet GeoJSON layer after the boundary data has loaded.
let boundaryLayer;
// Map each normalized PIN to its Leaflet layer for fast lookup and zooming.
let boundariesByPin = new Map();
// Map each normalized PIN to its office name from the loaded GeoJSON.
let pinNamesByPin = new Map();
// Keep the currently selected PINs, with a maximum of two for comparison.
let selectedPins = [];

// Cache the search input element.
const pinSearch = document.querySelector("#pin-search");
// Cache the search button element.
const searchButton = document.querySelector("#search-button");
// Cache the status message shown below the search control.
const searchStatus = document.querySelector("#search-status");
// Cache the loading/error message shown over the map.
const mapStatus = document.querySelector("#map-status");
// Cache the list that displays selected PINs.
const selectedPinsElement = document.querySelector("#selected-pins");
// Cache the container that displays stripe comparison cards.
const stripeCards = document.querySelector("#stripe-cards");
// Cache the status message shown next to the comparison heading.
const comparisonStatus = document.querySelector("#comparison-status");

// Normalize a candidate PIN by removing non-digits and requiring six digits.
function normalizePin(value) {
  // Convert null, undefined, or other values to text before cleaning them.
  const pin = String(value ?? "").replace(/\D/g, "");
  // Return the normalized PIN only when it has the expected length.
  return pin.length === 6 ? pin : null;
}

// Find and normalize the PIN property from a GeoJSON feature.
function getPin(properties = {}) {
  // Locate a supported PIN field without depending on its capitalization.
  const key = Object.keys(properties).find((name) =>
    ["pincode", "pin_code", "pin", "postal_code", "postcode"].includes(name.toLowerCase()),
  );
  // Normalize the matching property, or return null when no field exists.
  return normalizePin(key ? properties[key] : "");
}

// Find a human-readable post-office or area name from a GeoJSON feature.
function getPinName(properties = {}) {
  // Use the canonical field from the bundled GeoJSON when it is available.
  if (properties.Office_Nam) return String(properties.Office_Nam).trim();
  // Check common property names used by PIN-code datasets.
  const key = Object.keys(properties).find((name) =>
    [
      "officename",
      "office_name",
      "office_nam",
      "office",
      "post_office",
      "postoffice",
      "name",
      "poiname",
    ].includes(name.toLowerCase().replace(/[\s-]/g, "_")),
  );
  // Return the name as text, or a neutral fallback when it is unavailable.
  return key && properties[key] ? String(properties[key]).trim() : "PIN code area";
}

// Return the visual style for one boundary based on its selection state.
function styleBoundary(feature) {
  // Read the feature's normalized PIN.
  const pin = getPin(feature.properties);
  // Use a stronger orange style for selected boundaries.
  return {
    color: selectedPins.includes(pin) ? "#d85f45" : "#556a72",
    weight: selectedPins.includes(pin) ? 2.5 : 0.8,
    fillColor: selectedPins.includes(pin) ? "#e59a72" : "#9fc4c7",
    fillOpacity: selectedPins.includes(pin) ? 0.58 : 0.22,
  };
}

// Reapply styles after the selected PIN list changes.
function refreshBoundaryStyles() {
  // Stop when the GeoJSON layer has not loaded yet.
  if (!boundaryLayer) return;
  // Visit each boundary and calculate its current style.
  boundaryLayer.eachLayer((layer) => layer.setStyle(styleBoundary(layer.feature)));
}

// Add a valid PIN to the comparison selection.
function selectPin(pin) {
  // Ignore unknown PINs because they cannot be displayed or located on the map.
  if (!pin || !boundariesByPin.has(pin)) return false;
  // Avoid adding the same PIN twice.
  if (!selectedPins.includes(pin)) {
    // Remove the oldest selection when a third PIN is selected.
    if (selectedPins.length === 2) selectedPins.shift();
    // Add the new PIN as the newest selection.
    selectedPins.push(pin);
  }
  // Update the selected-PIN controls.
  renderSelections();
  // Highlight the selected boundaries on the map.
  refreshBoundaryStyles();
  // Refresh the comparison cards.
  renderStripes();
  // Tell callers that the PIN was selected successfully.
  return true;
}

// Render the current selections in the sidebar.
function renderSelections() {
  // Remove the previous selection elements before rebuilding the list.
  selectedPinsElement.replaceChildren();
  // Show the initial instruction when no PIN is selected.
  if (!selectedPins.length) {
    // Create the empty-state message.
    const empty = document.createElement("p");
    // Apply the existing empty-state styles.
    empty.className = "empty-state";
    // Explain how to select a PIN.
    empty.textContent = "Click a boundary on the map to add it here.";
    // Add the message to the sidebar.
    selectedPinsElement.append(empty);
    // There is nothing else to render.
    return;
  }
  // Render one control row for each selected PIN.
  selectedPins.forEach((pin) => {
    // Create the row containing the PIN and remove button.
    const item = document.createElement("div");
    // Apply the selected-PIN row styles.
    item.className = "selected-pin";
    // Add the PIN label and an accessible remove button.
    item.innerHTML = `<span>${pin}</span><button class="remove-pin" type="button" aria-label="Remove ${pin}">&times;</button>`;
    // Remove this PIN when its button is clicked.
    item.querySelector("button").addEventListener("click", () => {
      // Keep every selected PIN except the one being removed.
      selectedPins = selectedPins.filter((value) => value !== pin);
      // Re-render all dependent UI.
      renderSelections();
      refreshBoundaryStyles();
      renderStripes();
    });
    // Add the completed row to the sidebar.
    selectedPinsElement.append(item);
  });
}

// Add one PIN's stripe image to a comparison card.
function stripeImage(pin, card) {
  // Create the image element without blocking the initial page render.
  const image = document.createElement("img");
  // Provide descriptive alternative text for accessibility.
  image.alt = `Climate stripes for PIN code ${pin}`;
  // Defer loading until the image is near the viewport.
  image.loading = "lazy";
  // Let the browser decode the image asynchronously.
  image.decoding = "async";
  // Request the PNG whose filename matches the PIN.
  image.src = STRIPE_PATH(pin);
  // Replace a failed image with a useful data-layout message.
  image.addEventListener("error", () => {
    // Create the missing-image message.
    const missing = document.createElement("div");
    // Apply the existing missing-image styles.
    missing.className = "image-missing";
    // Tell the user exactly where the expected file belongs.
    missing.textContent = `No stripe image found. Add data/stripes/${pin}.png.`;
    // Replace the broken image with the message.
    image.replaceWith(missing);
  });
  // Add the image to the card's figure element.
  card.append(image);
}

// Render zero, one, or two climate-stripe comparison cards.
function renderStripes() {
  // Clear the previous cards before rendering the current selection.
  stripeCards.replaceChildren();
  // Update the comparison status based on the number of selected PINs.
  comparisonStatus.textContent = selectedPins.length === 2
    ? "Comparing two PIN codes."
    : selectedPins.length === 1 ? "Add another PIN to compare." : "Select one or two PIN codes.";
  // Show an instruction card when no PIN has been selected.
  if (!selectedPins.length) {
    // Create the empty comparison card.
    const empty = document.createElement("div");
    // Apply the existing empty-card styles.
    empty.className = "empty-card";
    // Explain what selecting a PIN will display.
    empty.textContent = "Select a PIN code to display its precomputed climate stripe image.";
    // Add the card to the comparison area.
    stripeCards.append(empty);
    // There are no selected cards to render.
    return;
  }
  // Create one comparison card for each selected PIN.
  selectedPins.forEach((pin) => {
    // Create the outer comparison card.
    const card = document.createElement("article");
    // Apply the existing comparison-card styles.
    card.className = "stripe-card";
    // Read the office or area name from the corresponding GeoJSON feature.
    const name = pinNamesByPin.get(pin) || getPinName(boundariesByPin.get(pin).feature.properties);
    // Add the PIN heading, name, and empty figure container.
    card.innerHTML = `<h3>PIN ${pin}</h3><p class="pin-name">${name}</p><figure></figure>`;
    // Load the corresponding stripe image into the figure.
    stripeImage(pin, card.querySelector("figure"));
    // Create a caption below the image.
    const caption = document.createElement("figcaption");
    // Describe the image content.
    caption.textContent = "Precomputed climate stripe";
    // Add the caption to the figure.
    card.querySelector("figure").append(caption);
    // Add the completed card to the comparison area.
    stripeCards.append(card);
  });
}

// Validate and select the PIN entered in the search field.
function searchPin() {
  // Normalize the user's input.
  const pin = normalizePin(pinSearch.value);
  // Show a validation error for malformed input.
  if (!pin) {
    // Apply the error status style.
    searchStatus.className = "status error";
    // Explain the required input format.
    searchStatus.textContent = "Enter a valid six-digit PIN code.";
    // Stop before attempting a lookup.
    return;
  }
  // Show an error when the PIN is not present in the loaded GeoJSON.
  if (!selectPin(pin)) {
    // Apply the error status style.
    searchStatus.className = "status error";
    // Include the searched PIN in the error message.
    searchStatus.textContent = `PIN ${pin} was not found in the loaded boundary data.`;
    // Stop before attempting to zoom.
    return;
  }
  // Restore the normal status style after a successful search.
  searchStatus.className = "status";
  // Confirm the selected PIN to the user.
  searchStatus.textContent = `PIN ${pin} selected.`;
  // Zoom the map to the selected boundary.
  map.fitBounds(boundariesByPin.get(pin).getBounds(), { padding: [28, 28], maxZoom: 12 });
}

// Run a search when the Show button is clicked.
searchButton.addEventListener("click", searchPin);
// Run a search when Enter is pressed in the PIN input.
pinSearch.addEventListener("keydown", (event) => {
  // Only submit on the Enter key.
  if (event.key === "Enter") searchPin();
});
// Clear all selected PINs when the Clear button is clicked.
document.querySelector("#clear-button").addEventListener("click", () => {
  // Reset the selection state.
  selectedPins = [];
  // Clear any previous search status.
  searchStatus.textContent = "";
  // Re-render the sidebar, map styles, and comparison area.
  renderSelections();
  refreshBoundaryStyles();
  renderStripes();
});

// Load and parse the large boundary file away from the main browser thread.
const boundaryWorkerSource = `
  self.onmessage = async (event) => {
    try {
      const response = await fetch(event.data.url);
      if (!response.ok) throw new Error("Could not load boundary data (" + response.status + ")");
      const geojson = await response.json();
      const features = geojson.features || [];
      const simplifyRing = (ring, tolerance) => {
        if (ring.length <= 3) return ring;
        const toleranceSquared = tolerance * tolerance;
        const simplified = [ring[0]];
        let previous = ring[0];
        for (let index = 1; index < ring.length - 1; index += 1) {
          const point = ring[index];
          const deltaX = point[0] - previous[0];
          const deltaY = point[1] - previous[1];
          if (deltaX * deltaX + deltaY * deltaY >= toleranceSquared) {
            simplified.push(point);
            previous = point;
          }
        }
        simplified.push(ring[ring.length - 1]);
        return simplified;
      };
      const simplifyCoordinates = (coordinates, type, tolerance) => {
        if (type === "Polygon") return coordinates.map((ring) => simplifyRing(ring, tolerance));
        if (type === "MultiPolygon") {
          return coordinates.map((polygon) =>
            polygon.map((ring) => simplifyRing(ring, tolerance)),
          );
        }
        return coordinates;
      };
      const simplifyFeature = (feature) => ({
        ...feature,
        geometry: {
          ...feature.geometry,
          coordinates: simplifyCoordinates(
            feature.geometry.coordinates,
            feature.geometry.type,
            0.002,
          ),
        },
      });
      const batchSize = 40;
      for (let index = 0; index < features.length; index += batchSize) {
        self.postMessage({
          type: "batch",
          features: features.slice(index, index + batchSize).map(simplifyFeature),
          loaded: Math.min(index + batchSize, features.length),
          total: features.length,
        });
      }
      self.postMessage({ type: "complete" });
    } catch (error) {
      self.postMessage({ type: "error", message: error.message });
    }
  };
`;
const boundaryWorkerUrl = URL.createObjectURL(
  new Blob([boundaryWorkerSource], { type: "application/javascript" }),
);
const boundaryWorker = new Worker(boundaryWorkerUrl);
const boundaryOptions = {
  style: styleBoundary,
  onEachFeature: (feature, layer) => {
    const pin = getPin(feature.properties);
    if (pin) {
      boundariesByPin.set(pin, layer);
      pinNamesByPin.set(pin, getPinName(feature.properties));
    }
    layer.on("click", () => {
      if (!pin) return;
      selectPin(pin);
      searchStatus.className = "status";
      searchStatus.textContent = `PIN ${pin} selected.`;
    });
  },
};

boundaryLayer = L.featureGroup().addTo(map);
const boundaryBatchQueue = [];
let boundaryRenderScheduled = false;
const renderNextBoundaryBatch = () => {
  boundaryRenderScheduled = false;
  const batch = boundaryBatchQueue.shift();
  if (!batch) return;
  const batchLayer = L.geoJSON(batch.features, boundaryOptions);
  batchLayer.eachLayer((layer) => boundaryLayer.addLayer(layer));
  if (boundaryBatchQueue.length) {
    boundaryRenderScheduled = true;
    requestAnimationFrame(renderNextBoundaryBatch);
  }
};
boundaryWorker.onmessage = (event) => {
  if (event.data.type === "batch") {
    boundaryBatchQueue.push(event.data);
    if (!boundaryRenderScheduled) {
      boundaryRenderScheduled = true;
      requestAnimationFrame(renderNextBoundaryBatch);
    }
    mapStatus.textContent = `Loading PIN boundaries… ${event.data.loaded.toLocaleString()} of ${event.data.total.toLocaleString()}`;
    return;
  }
  if (event.data.type === "complete") {
    const finishLoading = () => {
      if (boundaryBatchQueue.length || boundaryRenderScheduled) {
        requestAnimationFrame(finishLoading);
        return;
      }
      const bounds = boundaryLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
      boundaryWorker.terminate();
      URL.revokeObjectURL(boundaryWorkerUrl);
      mapStatus.remove();
    };
    finishLoading();
    return;
  }
  if (event.data.type === "error") {
    mapStatus.className = "map-status status error";
    mapStatus.textContent = "Boundary data could not be loaded. See README.md for the expected file.";
    boundaryWorker.terminate();
    URL.revokeObjectURL(boundaryWorkerUrl);
    console.error(new Error(event.data.message));
  }
};
boundaryWorker.postMessage({ url: new URL(DATA_URL, window.location.href).href });

// Render the initial empty sidebar state.
renderSelections();
// Render the initial empty comparison state.
renderStripes();
