// --- 1. Initialize Map ---
const maptilerApiKey = 'qfqfN9PAsljL4ynatVPA'; // 🔴 PASTE YOUR KEY HERE
const lightStyle = `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerApiKey}`;
const darkStyle = `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${maptilerApiKey}`;

const map = new maplibregl.Map({
    container: 'map',
    style: lightStyle,
    center: [36.8219, -1.2921],
    zoom: 11,
    pitch: 45,
    bearing: -10
});
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// --- 2. Configurations & Global Variables ---
let allData = {};
let activeLayerKey = 'heat';
let hoverPopup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false
});

const layerConfigs = {
    heat: { url: 'heat_zones.geojson', title: '🔥 Urban Heat', grades: ['Cool', 'Warm', 'Hot'], colors: ['#ffeda0', '#feb24c', '#f03b20'], weight: 1.5 },
    green: { url: 'ndvi_zones.geojson', title: '🌳 Green Cover', grades: ['Low', 'Medium', 'High'], colors: ['#edf8e9', '#74c476', '#006d2c'], weight: -1.5 },
    air: { url: 'no2_zones.geojson', title: '💨 Air Quality (NO₂)', grades: ['Low', 'Medium', 'High'], colors: ['#efedf5', '#bcbddc', '#756bb1'], weight: 1.0 },
    pop: { url: 'pop_zones.geojson', title: '👨‍👩‍👧‍👦 Population Density', grades: ['Low', 'Medium', 'High'], colors: ['#eff3ff', '#6baed6', '#08519c'], weight: 1.2 },
    landuse: {
        url: 'landuse_zones.geojson',
        title: '🏗️ Land Use',
        grades: ['Trees', 'Crops', 'Built-up'],
        colors: ['#33a02c', '#b2df8a', '#d6616b'],
        weight: 0.8
    },
    flood: {
        url: 'flood_zones.geojson',
        title: '🌊 Flood Risk',
        grades: ['Low Risk', 'Medium Risk', 'High Risk'],
        colors: ['#a6bddb', '#74a9cf', '#0570b0'],
        weight: 1.8
    }
};

// --- 3. Load Data & Initialize ---
map.on('load', () => {
    const urlsToFetch = Object.values(layerConfigs).map(c => c.url);
    const dataFetchPromise = Promise.all(urlsToFetch.map(url =>
        fetch(url).then(res => res.ok ? res.json() : Promise.reject(new Error(`Failed to load ${url}`)))
        .catch(error => {
            console.error(error);
            return { 'type': 'FeatureCollection', 'features': [] };
        })
    ));
    const timerPromise = new Promise(resolve => setTimeout(resolve, 5000));

    Promise.all([dataFetchPromise, timerPromise])
    .then(([fetchedDataArray]) => {
        fetchedDataArray.forEach((data, index) => {
            const key = Object.keys(layerConfigs)[index];
            allData[key] = data;
        });

        reAddSourcesAndLayers();

        document.getElementById('loader-overlay').style.display = 'none';
        switchLayer('heat');

    }).catch(error => {
        console.error("Critical error:", error);
        document.getElementById('loader-overlay').style.display = 'none';
        alert("Failed to load map data.");
    });
});

// --- 4. Core Logic & Analysis ---

function reAddSourcesAndLayers() {
    Object.keys(layerConfigs).forEach(key => {
        let data = allData[key];
        if (key === 'flood' && data.features.length > 0) { // Check if flood data exists before processing
            data = processFloodData(data);
            allData[key] = data;
        }
        
        if (map.getSource(`${key}-source`)) map.getSource(`${key}-source`).setData(data);
        else map.addSource(`${key}-source`, { 'type': 'geojson', 'data': data });
        
        if (!map.getLayer(`${key}-layer`)) {
            map.addLayer({
                'id': `${key}-layer`, 'type': 'fill', 'source': `${key}-source`, 'layout': { 'visibility': 'none' },
                'paint': {
                    'fill-color': [ 'match', ['to-string', ['get', 'class_name']], ...layerConfigs[key].grades.flatMap((g, i) => [g, layerConfigs[key].colors[i]]), '#808080' ],
                    'fill-opacity': 0.7
                }
            });
        }
    });
    
    calculateAndAddOpportunityLayer();
    addProposedPlanLayer();
}

function processFloodData(originalFloodData) {
    const highRiskZone = originalFloodData.features.find(f => f.properties.class_name === "High Risk");
    if (!highRiskZone || !highRiskZone.geometry) return { type: 'FeatureCollection', features: [] };
    
    const cleanHighRisk = turf.cleanCoords(highRiskZone);
    const mediumRiskZone = turf.buffer(cleanHighRisk, 0.5, { units: 'kilometers' });
    const mediumRiskDonut = turf.difference(mediumRiskZone, cleanHighRisk);
    if(mediumRiskDonut) mediumRiskDonut.properties = { class_name: 'Medium Risk' };

    const nairobiBbox = [36.65, -1.45, 37.1, -1.15];
    const lowRiskZone = turf.bboxPolygon(nairobiBbox);
    const finalLowRisk = turf.difference(lowRiskZone, mediumRiskZone);
    if(finalLowRisk) finalLowRisk.properties = { class_name: 'Low Risk' };
    
    return {
        type: 'FeatureCollection',
        features: [finalLowRisk, mediumRiskDonut, highRiskZone].filter(Boolean)
    };
}

function calculateAndAddOpportunityLayer() {
    if (!allData.pop || !allData.pop.features.length) return;
    const baseGrid = allData.pop;
    let maxScore = -Infinity, minScore = Infinity;
    const scoredFeatures = baseGrid.features.map(feature => {
        let score = 0;
        const center = turf.centroid(feature);
        for (const key in layerConfigs) {
            if (key === 'pop') continue;
            const config = layerConfigs[key];
            const dataLayer = allData[key];
            if (!dataLayer || !dataLayer.features) continue;
            const intersectingFeature = dataLayer.features.find(df => df.geometry && turf.booleanPointInPolygon(center, df));
            if (intersectingFeature) {
                const value = intersectingFeature.properties.class_name;
                const gradeIndex = config.grades.indexOf(value);
                if (gradeIndex !== -1) {
                    const scoreValue = (config.weight < 0) ? (config.grades.length - 1 - gradeIndex) : gradeIndex;
                    score += scoreValue * Math.abs(config.weight);
                }
            }
        }
        feature.properties.opportunity_score = score;
        if (score > maxScore) maxScore = score;
        if (score < minScore) minScore = score;
        return feature;
    });
    scoredFeatures.forEach(f => f.properties.normalized_score = (maxScore === minScore) ? 0.5 : (f.properties.opportunity_score - minScore) / (maxScore - minScore));
    
    const opportunityData = turf.featureCollection(scoredFeatures);
    if (map.getSource('opportunity-source')) map.getSource('opportunity-source').setData(opportunityData);
    else map.addSource('opportunity-source', { 'type': 'geojson', 'data': opportunityData });

    if (!map.getLayer('opportunity-layer')) {
        map.addLayer({
            'id': 'opportunity-layer', 'type': 'fill', 'source': 'opportunity-source', 'layout': { 'visibility': 'none' },
            'paint': { 'fill-color': ['interpolate', ['linear'], ['get', 'normalized_score'], 0, '#ffffcc', 0.5, '#fd8d3c', 1, '#b30000'], 'fill-opacity': 0.8 }
        });
    }
}

function addProposedPlanLayer() {
    const proposedPlanData = {
        'type': 'FeatureCollection',
        'features': [
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [ [36.90, -1.22], [36.86, -1.24], [36.83, -1.28] ]}, 'properties': { 'name': 'Thika Superhighway', 'type': 'Green Corridor', 'specialization': 'Mobility Hub'} },
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [ [36.825, -1.28], [36.81, -1.29], [36.78, -1.305], [36.75, -1.31] ]}, 'properties': { 'name': 'Waiyaki Way / Uhuru Highway', 'type': 'Green Corridor', 'specialization': 'Economic Corridor'} },
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [ [36.83, -1.31], [36.85, -1.32], [36.90, -1.335], [36.96, -1.35] ]}, 'properties': { 'name': 'Mombasa Road', 'type': 'Green Corridor', 'specialization': 'Industrial & Logistics'} },
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [ [36.81, -1.30], [36.79, -1.31], [36.76, -1.32], [36.75, -1.33] ]}, 'properties': { 'name': 'Ngong Road', 'type': 'Green Corridor', 'specialization': 'Commercial Connector'} },
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [ [36.86, -1.25], [36.88, -1.27], [36.91, -1.29], [36.94, -1.30] ]}, 'properties': { 'name': 'Outer Ring Road', 'type': 'Green Corridor', 'specialization': 'Residential Connector'} },
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [ [36.81, -1.24], [36.815, -1.26], [36.82, -1.28] ]}, 'properties': { 'name': 'Limuru Road', 'type': 'Green Corridor', 'specialization': 'Residential Connector'} },
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [ [36.75, -1.36], [36.78, -1.34], [36.81, -1.32] ]}, 'properties': { 'name': 'Lang\'ata Road', 'type': 'Green Corridor', 'specialization': 'Recreational & Residential'} },
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [ [36.75, -1.28], [36.80, -1.26], [36.81, -1.24] ]}, 'properties': { 'name': 'James Gichuru / Red Hill Link', 'type': 'Green Corridor', 'specialization': 'Suburban Connector'} },
            { 'type': 'Feature', 'geometry': { 'type': 'LineString', 'coordinates': [ [36.86, -1.24], [36.82, -1.21], [36.80, -1.18] ]}, 'properties': { 'name': 'Kiambu Road', 'type': 'Green Corridor', 'specialization': 'Northern Connector'} },
            { 'type': 'Feature', 'geometry': { 'type': 'Polygon', 'coordinates': [[ [36.815, -1.28], [36.85, -1.285], [36.845, -1.315], [36.81, -1.31], [36.815, -1.28] ]]}, 'properties': { 'name': 'CBD / Upper Hill Superblock Zone', 'type': 'Superblock', 'specialization': 'Commercial & Economic Hub.'} },
            { 'type': 'Feature', 'geometry': { 'type': 'Polygon', 'coordinates': [[ [36.78, -1.28], [36.81, -1.28], [36.81, -1.30], [36.78, -1.30], [36.78, -1.28] ]]}, 'properties': { 'name': 'Kilimani / Kileleshwa Superblock Zone', 'type': 'Superblock', 'specialization': 'Mixed-Use Residential & Commercial.'} },
            { 'type': 'Feature', 'geometry': { 'type': 'Polygon', 'coordinates': [[ [36.85, -1.315], [36.88, -1.315], [36.88, -1.33], [36.85, -1.33], [36.85, -1.315] ]]}, 'properties': { 'name': 'South C Superblock Zone', 'type': 'Superblock', 'specialization': 'Standard Residential.'} },
            { 'type': 'Feature', 'geometry': { 'type': 'Polygon', 'coordinates': [ [[36.85, -1.22], [36.94, -1.22], [36.94, -1.29], [36.88, -1.27], [36.85, -1.28], [36.85, -1.22]] ]}, 'properties': { 'name': 'Kasarani / Roysambu Living Cell', 'type': 'Living Cell', 'specialization': 'High-Density Residential Upgrades.'} },
            { 'type': 'Feature', 'geometry': { 'type': 'Polygon', 'coordinates': [ [[36.88, -1.27], [36.96, -1.29], [36.96, -1.34], [36.90, -1.335], [36.88, -1.33], [36.88, -1.315], [36.85, -1.285], [36.88, -1.27]] ]}, 'properties': { 'name': 'Eastlands Living Cell (Umoja, Donholm)', 'type': 'Living Cell', 'specialization': 'Health & Wellness Zone.'} },
            { 'type': 'Feature', 'geometry': { 'type': 'Polygon', 'coordinates': [ [[36.83, -1.31], [36.81, -1.32], [36.78, -1.34], [36.75, -1.36], [36.82, -1.42], [36.93, -1.42], [36.96, -1.35], [36.90, -1.335], [36.88, -1.33], [36.845, -1.315], [36.83, -1.31]] ]}, 'properties': { 'name': 'South Nairobi Living Cell (Industrial, South B)', 'type': 'Living Cell', 'specialization': 'Climate Resilience & Industrial Greening.'} },
            { 'type': 'Feature', 'geometry': { 'type': 'Polygon', 'coordinates': [ [[36.75, -1.31], [36.78, -1.305], [36.81, -1.30], [36.81, -1.32], [36.78, -1.34], [36.75, -1.36], [36.75, -1.31]] ]}, 'properties': { 'name': 'Kibera / Lang\'ata Living Cell', 'type': 'Living Cell', 'specialization': 'Community Upgrading & Basic Services.'} },
            { 'type': 'Feature', 'geometry': { 'type': 'Polygon', 'coordinates': [ [[36.75, -1.24], [36.80, -1.26], [36.81, -1.28], [36.78, -1.28], [36.75, -1.24]] ]}, 'properties': { 'name': 'Lavington Living Cell', 'type': 'Living Cell', 'specialization': 'Mixed-Use Densification.'} },
            { 'type': 'Feature', 'geometry': { 'type': 'Polygon', 'coordinates': [ [[36.68, -1.22], [36.75, -1.22], [36.75, -1.31], [36.75, -1.36], [36.68, -1.40], [36.68, -1.22]] ]}, 'properties': { 'name': 'Western Outskirts Living Cell', 'type': 'Living Cell', 'specialization': 'Green Space Preservation.'} },
            { 'type': 'Feature', 'geometry': { 'type': 'Polygon', 'coordinates': [ [[36.81, -1.18], [36.90, -1.18], [36.90, -1.22], [36.86, -1.24], [36.81, -1.24], [36.81, -1.18]] ]}, 'properties': { 'name': 'Northern Living Cell (Muthaiga, Gigiri)', 'type': 'Living Cell', 'specialization': 'Low-Density Residential Management.'} },
            { 'type': 'Feature', 'geometry': { 'type': 'Polygon', 'coordinates': [ [[36.94, -1.22], [37.00, -1.22], [37.00, -1.29], [36.94, -1.29], [36.94, -1.22]] ]}, 'properties': { 'name': 'Eastern Bypass Zone', 'type': 'Living Cell', 'specialization': 'Peri-Urban Development.'} },
            { 'type': 'Feature', 'geometry': { 'type': 'Polygon', 'coordinates': [ [[36.80, -1.26], [36.75, -1.28], [36.75, -1.22], [36.80, -1.20], [36.81, -1.24], [36.80, -1.26]] ]}, 'properties': { 'name': 'Spring Valley / Kitusuru Living Cell', 'type': 'Living Cell', 'specialization': 'Standard Residential.'} }
        ]
    };
    if (map.getSource('plan-source')) map.getSource('plan-source').setData(proposedPlanData);
    else map.addSource('plan-source', { 'type': 'geojson', 'data': proposedPlanData });

    if (!map.getLayer('plan-layer-fills')) {
        map.addLayer({
            'id': 'plan-layer-fills', 'type': 'fill', 'source': 'plan-source', 'filter': ['==', '$type', 'Polygon'], 'layout': { 'visibility': 'none' },
            'paint': { 'fill-color': ['match', ['get', 'type'], 'Living Cell', '#9b59b6', 'Superblock', '#e74c3c', '#ccc'], 'fill-opacity': 0.7, 'fill-outline-color': '#000' }
        });
        map.addLayer({
            'id': 'plan-layer-lines', 'type': 'line', 'source': 'plan-source', 'filter': ['==', '$type', 'LineString'], 'layout': { 'visibility': 'none', 'line-cap': 'round', 'line-join': 'round' },
            'paint': { 'line-color': '#2ecc71', 'line-width': 8, 'line-opacity': 0.8 }
        });
        ['plan-layer-fills'].forEach(layerId => { // Only fills for hover
            map.on('mousemove', layerId, (e) => {
                map.getCanvas().style.cursor = 'pointer';
                const props = e.features[0].properties;
                const content = `<h4>${props.name}</h4><p><strong>Type:</strong> ${props.type}</p><p><strong>Specialization:</strong> ${props.specialization}</p>`;
                hoverPopup.setLngLat(e.lngLat).setHTML(content).addTo(map);
            });
            map.on('mouseleave', layerId, () => {
                map.getCanvas().style.cursor = '';
                hoverPopup.remove();
            });
        });
    }
}

// --- 5. UI Interaction & 6. Event Listeners ---

function switchLayer(layerKey) {
    activeLayerKey = layerKey;
    document.querySelectorAll('#controls button').forEach(btn => btn.classList.remove('active'));
    Object.keys(layerConfigs).forEach(key => { if (map.getLayer(`${key}-layer`)) map.setLayoutProperty(`${key}-layer`, 'visibility', 'none'); });
    if (map.getLayer('opportunity-layer')) map.setLayoutProperty('opportunity-layer', 'visibility', 'none');
    if (map.getLayer('plan-layer-fills')) map.setLayoutProperty('plan-layer-fills', 'visibility', 'none');
    if (map.getLayer('plan-layer-lines')) map.setLayoutProperty('plan-layer-lines', 'visibility', 'none');
    
    const btn = document.getElementById(layerKey + 'Btn');
    if (btn) btn.classList.add('active');

    if (layerConfigs[layerKey] && map.getLayer(`${layerKey}-layer`)) {
        map.setLayoutProperty(`${layerKey}-layer`, 'visibility', 'visible');
    } else if (layerKey === 'opportunity' && map.getLayer('opportunity-layer')) {
        map.setLayoutProperty('opportunity-layer', 'visibility', 'visible');
    } else if (layerKey === 'plan' && map.getLayer('plan-layer-fills')) {
        map.setLayoutProperty('plan-layer-fills', 'visibility', 'visible');
        map.setLayoutProperty('plan-layer-lines', 'visibility', 'visible');
    }
    updateLegend(layerKey);
}

function updateLegend(layerKey) {
    const legendDiv = document.getElementById('legend');
    let content = '';
    if (layerConfigs[layerKey]) {
        const config = layerConfigs[layerKey];
        let labels = [`<h4>${config.title}</h4>`];
        config.grades.forEach((grade, i) => labels.push(`<i style="background:${config.colors[i]}"></i> ${grade}`));
        content = labels.join('<br>');
    } else if (layerKey === 'opportunity') {
        content = `<h4>Opportunity Score</h4><i style="background:#b30000;"></i> Highest Need<br><i style="background:#fc8d59;"></i> Medium Need<br><i style="background:#ffffcc;"></i> Lowest Need`;
    } else if (layerKey === 'plan') {
        content = `<h4>Proposed Plan</h4><i style="background:#e74c3c;"></i> Superblock<br><i style="background:#9b59b6;"></i> Living Cell<br><i style="background:#2ecc71; height: 4px; border-radius: 2px; margin-top: 7px;"></i> Green Corridor`;
    }
    legendDiv.innerHTML = content;
}

// 🔴 NEW CLICK EVENT LISTENER
map.on('click', (e) => {
    const point = turf.point([e.lngLat.lng, e.lngLat.lat]);
    let htmlContent = '<h3>Data at this Point</h3>';

    for (const key in layerConfigs) {
        const config = layerConfigs[key];
        const dataLayer = allData[key];
        if (!dataLayer || !dataLayer.features) continue;

        const intersectingFeature = dataLayer.features.find(df => df.geometry && turf.booleanPointInPolygon(point, df));
        
        let value = 'N/A';
        if (intersectingFeature) {
            value = intersectingFeature.properties.class_name;
        }
        htmlContent += `<p><strong>${config.title}:</strong> ${value}</p>`;
    }

    new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(htmlContent)
        .addTo(map);
});


document.getElementById('theme-toggle').addEventListener('change', function() {
    const newStyle = this.checked ? darkStyle : lightStyle;
    map.setStyle(newStyle);
    map.once('style.load', () => {
        reAddSourcesAndLayers();
        setTimeout(() => {
            switchLayer(activeLayerKey);
        }, 200); 
    });
});

document.querySelectorAll('#controls button').forEach(button => {
    button.addEventListener('click', () => switchLayer(button.id.replace('Btn', '')));
});