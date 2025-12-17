//Stores train markers.

const trainMarkers = [];

//Groups station stop_ids by shared coordinates.
const stationGroups = {};

//Initializes the map.

const map = L.map('map', {
  center: [52, -98], //Canada-centered view.
  zoom: 5,
  zoomControl: true
});

//Separate panes to control layer stacking order.
map.createPane('railsPane');
map.createPane('stationsPane');
map.createPane('trainsPane');

map.getPane('railsPane').style.zIndex = 400;
map.getPane('stationsPane').style.zIndex = 500;
map.getPane('trainsPane').style.zIndex = 600;

//Loads base map tiles.

L.tileLayer(
  'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
  {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }
).addTo(map);

//Organizes layers into groups.

const railLinesLayer = L.layerGroup().addTo(map);
const stationsLayer  = L.layerGroup().addTo(map);
const trainsLayer    = L.layerGroup().addTo(map);

//Geocoder search.

L.Control.geocoder({
  defaultMarkGeocode: true
}).addTo(map);

//Current location tool.

const locateControl = L.control({ position: 'topleft' });

locateControl.onAdd = function () {
  const div = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
  div.innerHTML = '📍';
  div.style.background = 'white';
  div.style.width = '34px';
  div.style.height = '34px';
  div.style.lineHeight = '34px';
  div.style.textAlign = 'center';
  div.style.cursor = 'pointer';
  div.title = 'Locate Me';

  L.DomEvent.disableClickPropagation(div);

  div.onclick = () => map.locate({ setView: true, maxZoom: 12 });

  return div;
};

locateControl.addTo(map);

//Legend for map.

const legend = L.control({ position: 'bottomleft' });

legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'legend');

  div.style.background = 'white';
  div.style.border = '2px solid black';
  div.style.borderRadius = '6px';
  div.style.padding = '10px';
  div.style.fontSize = '14px';

  div.innerHTML = `
    <strong>Legend</strong><br><br>

    <div style="display:flex;align-items:center;gap:8px;">
      <div style="width:30px;height:3px;background:black;"></div>
      <span>Rail Line</span>
    </div>

    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
      <img src="https://cdn-icons-png.flaticon.com/512/3448/3448339.png"
           style="width:16px;height:16px;">
      <span>Station</span>
    </div>

    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
      <div style="width:12px;height:12px;background:#1e90ff;
                  border-radius:50%;border:1px solid white;"></div>
      <span>Train</span>
    </div>
  `;

  return div;
};

legend.addTo(map);

//Loads rail lines from GeoJSON file.
fetch('data/canlines.geojson')
  .then(res => res.json())
  .then(data => {

    L.geoJSON(data, {
      pane: 'railsPane',
      style: {
        color: '#ffffff',
        weight: 4,
        opacity: 0.9
      }
    }).addTo(railLinesLayer);

    L.geoJSON(data, {
      pane: 'railsPane',
      style: {
        color: '#222',
        weight: 2,
        opacity: 0.95
      },
      onEachFeature: (feature, layer) => {
        const owner = feature.properties.opnam_en || 'Unknown operator';
        layer.bindPopup(`<b>Railway</b><br>Operator: ${owner}`);
      }
    }).addTo(railLinesLayer);

    //Fitted on map once loaded.
    map.fitBounds(railLinesLayer.getBounds());
  })
  .catch(err => console.error('Failed to load rail lines:', err));

//Loads station icon.

const stationIcon = L.icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -8]
});

//Loads stations from GeoJSON file.

fetch('data/canpoints.geojson')
  .then(res => res.json())
  .then(data => {

    L.geoJSON(data, {
      pane: 'stationsPane',

      pointToLayer: (feature, latlng) =>
        L.marker(latlng, {
          icon: stationIcon,
          pane: 'stationsPane'
        }),

      onEachFeature: (feature, layer) => {
        const [lon, lat] = feature.geometry.coordinates;
        const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;

        //Create group if it doesn't exist.
        if (!stationGroups[key]) {
          stationGroups[key] = [];
        }

        //Add stop_id to this coordinate group.
        stationGroups[key].push(feature.properties.stop_id);

        //Build popup once clicked.
        const stopsHtml = stationGroups[key]
          .map(id => `<li>Station ID: ${id}</li>`)
          .join('');

        layer.bindPopup(`
          <b>Station Stops</b><br>
          <ul style="margin:4px 0;padding-left:18px;">
            ${stopsHtml}
          </ul>
        `);
      }
    }).addTo(stationsLayer);

  })
  .catch(err => console.error('Failed to load stations:', err));

//Loads the trains csv file.

fetch('data/trainsfin.csv')
  .then(res => res.text())
  .then(csvText => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: function (results) {

        results.data.forEach(train => {
          const lat = parseFloat(train.Latitude);
          const lon = parseFloat(train.Longitude);
          if (isNaN(lat) || isNaN(lon)) return;

          //Read the speed of the trains.
          const speedKey = Object.keys(train).find(
            k => k.trim().toLowerCase() === 'speedkph'
          );

          const speed = speedKey && train[speedKey]
            ? `${train[speedKey]} km/h`
            : 'Unknown';

          const marker = L.circleMarker([lat, lon], {
            pane: 'trainsPane',
            radius: 5,
            fillColor: '#1e90ff',
            color: '#ffffff',
            weight: 1,
            fillOpacity: 0.9
          })
          .addTo(trainsLayer)
          .bindPopup(`
            <b>${train.LineName}</b><br>
            Company: ${train.Company}<br>
            Speed: ${speed}<br>
            Delayed: ${train.Delayed}
          `);

          trainMarkers.push(marker);
        });

        startTrainBlips(); //Starts blinking animation.
      }
    });
  })
  .catch(err => console.error('Failed to load trainsfin.csv:', err));

//Train blinking animation.

function startTrainBlips() {
  let growing = true;

  setInterval(() => {
    trainMarkers.forEach(marker => {
      if (growing) {
        marker.setRadius(8);
        marker.setStyle({ fillOpacity: 0.6 });
      } else {
        marker.setRadius(5);
        marker.setStyle({ fillOpacity: 0.9 });
      }
    });
    growing = !growing;
  }, 900);
}

//Layer toggles.

L.control.layers(null, {
  'Rail Lines': railLinesLayer,
  'Stations': stationsLayer,
  'Trains': trainsLayer
}).addTo(map);