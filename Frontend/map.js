// 1. Initialize Map
const map = L.map('map').setView([-1.2921, 36.8219], 11);

// 2. Define Basemaps
const lightMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO'
});

const darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO'
});

// Add the light map as the default
lightMap.addTo(map);

// 3. Setup Layers, Legends, etc.
const layers = {}, legends = {};
let activeLayer = null;
const layerConfigs = {
    heat: { 
        url: 'heat_zones.geojson', 
        title: 'Urban Heat', 
        grades: ['Cool', 'Warm', 'Hot'], 
        // A classic Yellow-Orange-Red palette, great for heatmaps
        colors: ['#ffeda0', '#feb24c', '#f03b20'] 
    },
    green: { 
        url: 'ndvi_zones.geojson', 
        title: 'Green Cover (NDVI)', 
        grades: ['Low', 'Medium', 'High'], 
        // A sequential green palette, from light to dark
        colors: ['#ccebc5', '#7bccc4', '#2b8cbe']
    },
    air: { 
        url: 'no2_zones.geojson', 
        title: 'Air Quality (NO₂)', 
        grades: ['Low', 'Medium', 'High'], 
        // A purple palette, which has good contrast and is distinct from other layers
        colors: ['#efedf5', '#bcbddc', '#756bb1'] 
    },
    pop: { 
        url: 'pop_zones.geojson', 
        title: 'Population Density', 
        grades: ['Low', 'Medium', 'High'], 
        // A sequential blue palette
        colors: ['#eff3ff', '#6baed6', '#08519c'] 
    },
    landuse: { 
        url: 'landuse_zones.geojson', 
        title: 'Land Use', 
        grades: ['Trees', 'Crops', 'Built-up', 'Other'], 
        // Refined qualitative colors for better distinction
        colors: ['#2ca02c', '#fdbf6f', '#e31a1c', '#b2b2b2'] 
    },
    traffic: { 
        url: 'activity_zones.geojson', 
        title: 'Nighttime Activity', 
        grades: ['Low', 'Medium', 'High'], 
        // A more vibrant yellow-orange scheme
        colors: ['#fff7bc', '#fec44f', '#d95f0e'] 
    },
    flood: { 
        url: 'flood_zones.geojson', 
        title: 'Flood Risk', 
        grades: ['Low Risk', 'Medium Risk', 'High Risk'], 
        // A blue palette is intuitive for water/flood risk
        colors: ['#c6dbef', '#6baed6', '#08306b'] 
    }
};

// 4. Fetch data (this part remains the same)
const urlsToFetch = Object.values(layerConfigs).map(c => c.url);
Promise.all(urlsToFetch.map(url => fetch(url).then(res => res.json())))
    .then(allData => {
        Object.keys(layerConfigs).forEach((key, index) => {
            const config = layerConfigs[key];
            const data = allData[index];
            layers[key] = L.geoJSON(data, {
                style: feature => styleFeature(feature, config),
                // Replace the old onEachFeature function with this one

onEachFeature: (feature, layer) => {
    layer.bindPopup(`<strong>${config.title}: ${feature.properties.class_name}</strong>`);
}
            });
            legends[key] = createLegend(config);
        });
        toggleLayer('heat');
    });

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