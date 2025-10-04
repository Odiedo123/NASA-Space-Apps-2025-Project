import ee
import ee.data

ee.Authenticate()
ee.Initialize(project='nasa-space-apps-474109')

# Get the precise administrative boundary for Nairobi
admin_boundaries = ee.FeatureCollection("FAO/GAUL/2015/level2")
nairobi_boundary = admin_boundaries.filter(ee.Filter.eq('ADM0_NAME', 'Kenya')).filter(ee.Filter.eq('ADM2_NAME', 'Nairobi')).geometry()

start_date = '2023-01-01'
end_date = '2025-01-01'

# --- 1. Urban Heat Map ---
modis_lst = ee.ImageCollection('MODIS/061/MOD11A1').select('LST_Day_1km').filterDate(start_date, end_date).filterBounds(nairobi_boundary)
heat_map = modis_lst.median().multiply(0.02).subtract(273.15).rename('heat').float() # Cast to Float32

# --- 2. Green Cover / NDVI Map ---
modis_ndvi = ee.ImageCollection('MODIS/061/MOD13A2').select('NDVI').filterDate(start_date, end_date).filterBounds(nairobi_boundary)
green_cover_map = modis_ndvi.median().multiply(0.0001).rename('ndvi').float() # Cast to Float32

# --- 3. Air Quality Map ---
tropomi_no2 = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_NO2').select('NO2_column_number_density').filterDate(start_date, end_date).filterBounds(nairobi_boundary)
air_quality_map = tropomi_no2.median().rename('no2').float() # Cast to Float32

# --- 4. Population Density Map ---
population_map = ee.ImageCollection("CIESIN/GPWv411/GPW_Population_Density").select('population_density').filter(ee.Filter.calendarRange(2020, 2020, 'year')).first().rename('population').float() # Cast to Float32

# --- 5. Land Use Map ---
dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1').filterDate(start_date, end_date).filterBounds(nairobi_boundary)
land_use_map = dw.select('label').mode().rename('land_use').float() # Cast to Float32

# --- 6. Traffic / Activity Map (using Nightlights) ---
viirs_nightlights = ee.ImageCollection("NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG").select('avg_rad').filterDate(start_date, end_date).filterBounds(nairobi_boundary)
traffic_map = viirs_nightlights.median().rename('activity').float() # Cast to Float32

# --- 7. Flood Risk Map (Simple Model) ---
srtm = ee.Image('USGS/SRTMGL1_003')
elevation = srtm.select('elevation')
slope = ee.Terrain.slope(srtm)
topo_risk = elevation.multiply(-1).unitScale(-2000, -1000).add(slope.multiply(-1).unitScale(-20, 0))
gpm = ee.ImageCollection('NASA/GPM_L3/IMERG_V07').select('precipitation').filterDate(start_date, end_date).filterBounds(nairobi_boundary)
rainfall_risk = gpm.sum().unitScale(0, 2000)
impervious_risk = land_use_map.eq(6)
flood_risk_map = topo_risk.multiply(0.5).add(rainfall_risk.multiply(0.3)).add(impervious_risk.multiply(0.2)).rename('flood_risk').float() # Cast to Float32

# --- Combine all layers into a single image and clip ---
final_image = heat_map \
    .addBands(green_cover_map) \
    .addBands(air_quality_map) \
    .addBands(population_map) \
    .addBands(land_use_map) \
    .addBands(traffic_map) \
    .addBands(flood_risk_map) \
    .clip(nairobi_boundary)

# --- Export the master image ---
export_task = ee.batch.Export.image.toDrive(
    image=final_image,
    description='Nairobi_Master_Dataset_GeoTIFF',
    folder='NASA_Space_Apps_Data',
    fileNamePrefix='nairobi_master_data',
    region=nairobi_boundary,
    scale=200,
    fileFormat='GeoTIFF'
)
export_task.start()
print("✅ GEE task created successfully. This version should fix the data type error.")