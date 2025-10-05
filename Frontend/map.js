// 1. Initialize Map
const map = L.map('map').setView([-1.2921, 36.8219], 11);
const lightMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(map);
const darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap &copy; CARTO' });

// --- 2. Global variable declarations ---
const layers = {};
const legends = {};
// 🟢 CORRECT: 'allData' is declared here in the global scope, so all functions can see it.
const allData = {}; 
let activeLayer = null;

const layerConfigs = {
    heat: { url: 'heat_zones.geojson', title: 'Urban Heat', grades: ['Cool', 'Warm', 'Hot'], colors: ['#ffeda0', '#feb24c', '#f03b20'] },
    green: { url: 'ndvi_zones.geojson', title: 'Green Cover (NDVI)', grades: ['Low', 'Medium', 'High'], colors: ['#ccebc5', '#7bccc4', '#2b8cbe'] },
    air: { url: 'no2_zones.geojson', title: 'Air Quality (NO₂)', grades: ['Low', 'Medium', 'High'], colors: ['#efedf5', '#bcbddc', '#756bb1'] },
    pop: { url: 'pop_zones.geojson', title: 'Population Density', grades: ['Low', 'Medium', 'High'], colors: ['#eff3ff', '#6baed6', '#08519c'] },
    landuse: { url: 'landuse_zones.geojson', title: 'Land Use', grades: ['Trees', 'Crops', 'Built-up', 'Other'], colors: ['#2ca02c', '#fdbf6f', '#e31a1c', '#b2b2b2'] },
    traffic: { url: 'activity_zones.geojson', title: 'Nighttime Activity', grades: ['Low', 'Medium', 'High'], colors: ['#fff7bc', '#fec44f', '#d95f0e'] },
    flood: { url: 'flood_zones.geojson', title: 'Flood Risk', grades: ['Low Risk', 'Medium Risk', 'High Risk'], colors: ['#c6dbef', '#6baed6', '#08306b'] }
};

// --- 3. Fetch data and populate the global 'allData' object ---
const urlsToFetch = Object.values(layerConfigs).map(c => c.url);
Promise.all(urlsToFetch.map(url => fetch(url).then(res => res.json())))
    .then(fetchedDataArray => {
        Object.keys(layerConfigs).forEach((key, index) => {
            const config = layerConfigs[key];
            const data = fetchedDataArray[index];
            
            // 🟢 CORRECT: This fills the global 'allData' container.
            allData[key] = data;

            layers[key] = L.geoJSON(data, { style: feature => styleFeature(feature, config) });
            legends[key] = createLegend(config);
        });
        toggleLayer('heat');
    });

// --- 4. Map-wide click event listener ---
map.on('click', function(e) {
    const clickedPoint = turf.point([e.latlng.lng, e.latlng.lat]);
    const clickedZoneData = {};

    // 🟢 CORRECT: This can now safely access the global 'allData' object.
    for (const key in allData) {
        if (allData[key] && allData[key].features) {
            for (const feature of allData[key].features) {
                if (turf.booleanPointInPolygon(clickedPoint, feature)) {
                    clickedZoneData[key] = feature.properties.class_name;
                    break; 
                }
            }
        }
    }

    const recommendation = generateRecommendation(clickedZoneData);
    
    L.popup()
        .setLatLng(e.latlng)
        .setContent(recommendation)
        .openOn(map);
});


// --- NEW: The Recommendation Engine ---
function generateRecommendation(data) {
    let content = '<h4>Analysis at this Location</h4><hr>';
    
    // List all factors found
    for(const key in data) {
        content += `<p><strong>${layerConfigs[key].title}:</strong> ${data[key]}</p>`;
    }
    
    // Rule-based suggestions
    let suggestion = '';
    if (data.heat === 'Hot' && data.pop === 'High') {
        suggestion = 'High heat and dense population detected. Consider implementing cool roofs and increasing tree canopy to reduce urban heat island effect.';
    } else if (data.air === 'High' && data.traffic === 'High') {
        suggestion = 'High pollution coincides with high nighttime activity. Suggests creating low-emission zones or improving public transport infrastructure.';
    } else if (data.flood === 'High Risk' && data.pop === 'High') {
        suggestion = 'A densely populated area is at high risk of flooding. Prioritize investment in drainage systems and developing green spaces like parks to increase water permeability.';
    } else if (data.green === 'Low' && data.pop === 'High') {
        suggestion = 'Low vegetation in a densely populated area. Suggests identifying locations for pocket parks or community gardens to improve quality of life.';
    } else {
        suggestion = 'No critical combination of factors detected at this location.';
    }
    
    content += `<hr><p style="color:#007aff;"><strong>Suggestion:</strong> ${suggestion}</p>`;
    return content;
}
// 5. Add Theme Toggle Logic
const themeToggle = document.getElementById('theme-toggle');
themeToggle.addEventListener('change', function() {
    if (this.checked) {
        // Switch to Dark Mode
        map.removeLayer(lightMap);
        darkMap.addTo(map);
        document.body.classList.add('dark-mode');
    } else {
        // Switch to Light Mode
        map.removeLayer(darkMap);
        lightMap.addTo(map);
        document.body.classList.remove('dark-mode');
    }
});
// --- 4. DEFINE FUNCTIONS AND EVENT LISTENERS ---

function styleFeature(feature, config) {
    const className = feature.properties.class_name;
    const gradeIndex = config.grades.indexOf(className);
    return {
        fillColor: config.colors[gradeIndex] || '#CCCCCC',
        weight: 0.5,
        opacity: 1,
        color: 'white',
        fillOpacity: 0.7
    };
}

function createLegend(config) {
    const legend = L.control({position: 'bottomright'});
    legend.onAdd = function () {
        const div = L.DomUtil.create('div', 'info legend');
        let labels = [`<h4>${config.title}</h4>`];
        for (let i = 0; i < config.grades.length; i++) {
            labels.push(
                `<i style="background:${config.colors[i]}"></i> ${config.grades[i]}`
            );
        }
        div.innerHTML = labels.join('<br>');
        return div;
    };
    return legend;
}

function toggleLayer(layerKey) {
    // Remove current layer and legend
    if (activeLayer) {
        map.removeLayer(layers[activeLayer]);
        legends[activeLayer].remove();
        document.getElementById(activeLayer + 'Btn').classList.remove('active');
    }

    // Add new layer and legend
    if (layers[layerKey]) {
        map.addLayer(layers[layerKey]);
        legends[layerKey].addTo(map);
        document.getElementById(layerKey + 'Btn').classList.add('active');
        activeLayer = layerKey;
    }
}

// Add event listeners to buttons
// Add event listeners for all buttons
document.getElementById('heatBtn').addEventListener('click', () => toggleLayer('heat'));
document.getElementById('heatBtn').addEventListener('click', () => toggleLayer('heat'));
document.getElementById('greenBtn').addEventListener('click', () => toggleLayer('green'));
document.getElementById('airBtn').addEventListener('click', () => toggleLayer('air'));
document.getElementById('popBtn').addEventListener('click', () => toggleLayer('pop'));
document.getElementById('landuseBtn').addEventListener('click', () => toggleLayer('landuse'));
document.getElementById('trafficBtn').addEventListener('click', () => toggleLayer('traffic'));
document.getElementById('floodBtn').addEventListener('click', () => toggleLayer('flood'));