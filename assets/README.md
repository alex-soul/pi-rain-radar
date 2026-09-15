# Offline geography

`geography.json.gz` contains country rings, road lines and populated places from the public-domain Natural Earth 1:10m datasets. Only geometry, place names and population ranks are retained. This supports backend map preparation worldwide without a basemap API or runtime geography downloads.

Source: https://github.com/nvkelso/natural-earth-vector/tree/ca96624a56bd078437bca8184e78163e5039ad19/geojson

Datasets: `ne_10m_admin_0_countries`, `ne_10m_roads`, `ne_10m_populated_places`.

Regenerate with `node scripts/prepare-geography.js`. The source revision is pinned in that script. Rendering occurs in a short-lived worker only during map preparation; normal acquisition and playback do not load this dataset.
