import rasterio
import geopandas as gpd
from rasterio.features import shapes
import numpy as np







# === Run 7: Flood Risk Map ===
BAND_NUMBER, OUTPUT_GEOJSON, CLASSIFICATION_BREAKS = 7, 'flood_zones.geojson', [[0.5, 'Low Risk'], [0.7, 'Medium Risk'], [float('inf'), 'High Risk']]


# --- SCRIPT LOGIC (No changes needed below) ---

TIF_FILE = 'nairobi_master_data.tif'
print(f"--- Processing Band {BAND_NUMBER} into {OUTPUT_GEOJSON} ---")
# ... (the rest of your script remains the same)
try:
    with rasterio.open(TIF_FILE) as src:
        band_data = src.read(BAND_NUMBER)
        transform = src.transform
        crs = src.crs
        print("Classifying data into zones...")
        classified_data = np.zeros_like(band_data, dtype=np.int8)
        classified_data[band_data <= CLASSIFICATION_BREAKS[0][0]] = 1
        classified_data[(band_data > CLASSIFICATION_BREAKS[0][0]) & (band_data <= CLASSIFICATION_BREAKS[1][0])] = 2
        classified_data[band_data > CLASSIFICATION_BREAKS[1][0]] = 3
        print("Converting raster zones to vector polygons...")
        results = [
            {'properties': {'class_id': int(v), 'class_name': CLASSIFICATION_BREAKS[int(v)-1][1]}, 'geometry': s}
            for i, (s, v) in enumerate(shapes(classified_data, transform=transform)) if v > 0
        ]
    if results:
        gdf = gpd.GeoDataFrame.from_features(results, crs=crs)
        gdf.to_file(OUTPUT_GEOJSON, driver='GeoJSON')
        print(f"✅ Success! Saved to '{OUTPUT_GEOJSON}'.\n")
    else:
        print("No data was processed.")
except Exception as e:
    print(f"An error occurred: {e}")