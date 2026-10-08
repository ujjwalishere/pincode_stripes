# India Climate Stripes dashboard

A static Leaflet dashboard for exploring India Post PIN-code boundaries and comparing precomputed climate-stripe images.

## Data layout

Add your converted shapefile as GeoJSON at:

```text
data/
  pincodes.geojson
  stripes/
    110001.png
    400001.png
```
Each stripe image must be a PNG named exactly after its six-digit PIN code, for example `data/stripes/250401.png`.

The GeoJSON must be a `FeatureCollection`. Each feature needs a six-digit PIN property. The app recognizes `pincode`, `pin_code`, `pin`, `postal_code`, and `postcode` (case-insensitive).


## Run locally

Because browsers restrict `fetch()` from `file://` pages, serve the folder with a local HTTP server:

```powershell
py -m http.server 8000
```

Then open <http://localhost:8000> in a browser.

## Host on GitHub Pages

This is a static website, so it can be hosted directly from a GitHub
repository using GitHub Pages.

### 1. Create and push a repository

Create a new repository on GitHub, then put the contents of this project in
the repository root. The root should contain `index.html`, `app.js`,
`styles.css`, and the `data/` folder.

From this project folder, run:

```powershell
git init
git add .
git commit -m "Add India climate stripes dashboard"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace `YOUR-USERNAME` and `YOUR-REPOSITORY` with your GitHub username and
repository name.

### 2. Enable GitHub Pages

1. Open the repository on GitHub.
2. Select **Settings** → **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and the `/ (root)` folder.
5. Select **Save**.

After GitHub finishes deploying, the site will be available at:

```text
https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/
```

The dashboard uses relative paths such as `data/pincodes.geojson` and
`data/stripes/250401.png`, so it works from a repository subpath without code
changes.

### 3. Check the deployed data

Open the deployed site and verify that:

- `data/pincodes.geojson` loads in the browser.
- The map displays the PIN boundaries.
- A stripe such as `data/stripes/250401.png` loads.
- The browser address uses `https://`, which is required for the external
  Leaflet and font resources.

### GitHub file-size considerations

GitHub blocks individual files larger than 100 MB. Large GeoJSON files can
also make the dashboard slow because the browser must download and render all
boundaries. For GitHub Pages:

- Simplify the display GeoJSON before uploading it.
- Remove unused GeoJSON properties.
- Keep the original shapefile in `data/shapefiles/` only if its files are
  small enough; otherwise store the source data outside the website repository.
- Compress the GeoJSON through the web server where possible, or use vector
  tiles for a nationwide production map.
- Avoid Git LFS for files that must be served directly by GitHub Pages; use
  regular web-hosted assets or a data-hosting service for very large files.

## Converting the shapefile

For a large national dataset, optimize the browser copy before serving it:

1. Keep the original shapefile in `data/shapefiles/` as the source of truth.
2. Create a simplified display copy with `ogr2ogr -simplify`, or use Mapshaper:
   `npx mapshaper input.shp -simplify dp 5% -o format=geojson data/pincodes.geojson`
3. Remove attributes that are not needed by the dashboard; retain the PIN and office-name fields.
4. Enable HTTP gzip or Brotli compression for `pincodes.geojson`.
5. For a nationwide production dataset, use vector tiles (for example PMTiles or
   MapLibre/Mapbox vector tiles) instead of loading every boundary at startup.

The app uses Leaflet's canvas renderer and avoids creating a tooltip for every
polygon. These reduce interaction overhead, but geometry simplification and
vector tiles provide the largest improvement to initial load and map movement.

## Configuration

The data paths and supported stripe filenames are defined at the top of [app.js](./app.js). The Leaflet CSS and JavaScript are loaded from the unpkg CDN.
