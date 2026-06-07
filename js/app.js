document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // Tab Navigation Logic
    // ----------------------------------------------------
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        const btn = item.querySelector('button');
        btn.addEventListener('click', () => {
            // Remove active class from all items and tabs
            navItems.forEach(i => i.classList.remove('active'));
            tabContents.forEach(t => t.classList.remove('active'));

            // Add active class to clicked item and corresponding tab
            item.classList.add('active');
            const tabId = btn.getAttribute('data-tab');
            const targetTab = document.getElementById(tabId);
            targetTab.classList.add('active');

            // Leaflet bugfix: If the map container was hidden, size calculations
            // fail. We must trigger map.invalidateSize() when the map tab becomes visible.
            if (tabId === 'webgis-tab' && map) {
                setTimeout(() => {
                    map.invalidateSize();
                    // Fit bounds to ensure map is centered nicely
                    if (geojsonLayer) {
                        map.fitBounds(geojsonLayer.getBounds(), { padding: [20, 20] });
                    }
                }, 100);
            }
        });
    });

    // ----------------------------------------------------
    // Leaflet.js WebGIS Dashboard Logic
    // ----------------------------------------------------

    // Initialize Map centered on Nepal
    const map = L.map('map', {
        center: [28.25, 84.4],
        zoom: 7,
        minZoom: 6,
        maxZoom: 12,
        maxBounds: [[25.0, 79.5], [31.5, 89.0]], // Boundary limit for Nepal
        zoomControl: false // Custom placement of zoom control
    });

    // Add Zoom Control to Top-Left
    L.control.zoom({ position: 'topleft' }).addTo(map);

    // Define Basemaps
    const basemaps = {
        light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }),
        dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        })
    };

    // Add Default Basemap (Light)
    basemaps.light.addTo(map);

    // Custom Basemap Toggler Buttons
    const basemapButtons = document.querySelectorAll('.basemap-btn');
    basemapButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active class
            basemapButtons.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            e.target.classList.add('active');
            
            const selectedStyle = e.target.getAttribute('data-style');
            
            // Remove other layers and add selected one
            Object.keys(basemaps).forEach(key => {
                map.removeLayer(basemaps[key]);
            });
            basemaps[selectedStyle].addTo(map);
        });
    });

    // Theme selector reference
    const themeSelect = document.getElementById('theme-select');

    // ----------------------------------------------------
    // Choropleth Styling and Classification Rules
    // ----------------------------------------------------
    
    // Get colors matching classifications
    function getColor(value, theme) {
        if (theme === 'density') {
            // Density breaks: 61, 115, 138, 192, 230, 301, 635
            return value > 500 ? '#800026' : // Madhesh (635)
                   value > 300 ? '#e31a1c' : // Bagmati (301)
                   value > 200 ? '#fc4e2a' : // Lumbini (230)
                   value > 150 ? '#fd8d3c' : // Koshi (192)
                   value > 100 ? '#feb24c' : // Sudurpashchim (138), Gandaki (115)
                                 '#fed976';  // Karnali (61)
        } else if (theme === 'forest') {
            // Forest breaks: 26.0, 39.5, 40.5, 41.5, 45.0, 53.0, 57.0
            return value > 55 ? '#005a32' : // Sudurpashchim (57%)
                   value > 50 ? '#238443' : // Bagmati (53%)
                   value > 43 ? '#41ab5d' : // Koshi (45%)
                   value > 40 ? '#78c679' : // Karnali (41.5%), Lumbini (40.5%)
                   value > 30 ? '#addd8e' : // Gandaki (39.5%)
                                '#d9f0a3';  // Madhesh (26.0%)
        } else {
            // Tourism Index breaks: 60, 65, 70, 75, 90, 95, 98
            return value > 97 ? '#4a1486' : // Gandaki (98)
                   value > 93 ? '#6a51a3' : // Bagmati (95)
                   value > 85 ? '#807dba' : // Lumbini (90)
                   value > 73 ? '#9e9ac8' : // Koshi (75)
                   value > 62 ? '#bcbddc' : // Karnali (70), Sudurpashchim (65)
                                '#dadaeb';  // Madhesh (60)
        }
    }

    // Dynamic style function for GeoJSON polygons
    function styleFeature(feature) {
        const theme = themeSelect.value;
        let value;
        if (theme === 'density') {
            value = feature.properties.density;
        } else if (theme === 'forest') {
            value = feature.properties.forest_cover;
        } else {
            value = feature.properties.tourism_index;
        }

        return {
            fillColor: getColor(value, theme),
            weight: 1.5,
            opacity: 1,
            color: '#ffffff', // Border color
            dashArray: '3',
            fillOpacity: 0.8,
            className: 'province-polygon'
        };
    }

    // ----------------------------------------------------
    // Mouse Event Listeners for Map Features
    // ----------------------------------------------------
    
    let geojsonLayer;

    function highlightFeature(e) {
        const layer = e.target;

        layer.setStyle({
            weight: 3,
            color: '#0f172a', // Dark slate border on hover
            dashArray: '',
            fillOpacity: 0.9
        });

        if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
            layer.bringToFront();
        }

        // Update Floating Info panel
        infoPanel.update(layer.feature.properties);
    }

    function resetHighlight(e) {
        geojsonLayer.resetStyle(e.target);
        infoPanel.update(); // Clear details
    }

    function zoomToFeature(e) {
        map.fitBounds(e.target.getBounds());
    }

    function onEachFeature(feature, layer) {
        layer.on({
            mouseover: highlightFeature,
            mouseout: resetHighlight,
            click: zoomToFeature
        });
    }

    // ----------------------------------------------------
    // Custom Control Panels (Floating Panels)
    // ----------------------------------------------------
    
    // 1. Info Panel Control (Top-Right)
    const infoPanel = L.control({ position: 'topright' });
    infoPanel.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'leaflet-control-info');
        this.update();
        return this._div;
    };
    infoPanel.update = function (props) {
        this._div.innerHTML = '<h4>Province Statistics</h4>' + (props ?
            `<table>
                <tr>
                    <td>Province Name:</td>
                    <td>${props.name}</td>
                </tr>
                <tr>
                    <td>Code:</td>
                    <td>${props.adm_code}</td>
                </tr>
                <tr>
                    <td>Population (2021):</td>
                    <td>${props.population.toLocaleString()}</td>
                </tr>
                <tr>
                    <td>Area:</td>
                    <td>${props.area.toLocaleString()} km²</td>
                </tr>
                <tr>
                    <td>Pop. Density:</td>
                    <td>${props.density} / km²</td>
                </tr>
                <tr>
                    <td>Forest Cover:</td>
                    <td>${props.forest_cover}%</td>
                </tr>
                <tr>
                    <td>Tourism Index:</td>
                    <td>${props.tourism_index} / 100</td>
                </tr>
            </table>` : '<div class="info-tip">Hover over a province to view spatial statistics</div>');
    };
    infoPanel.addTo(map);

    // 2. Legend Control (Bottom-Right)
    const legendPanel = L.control({ position: 'bottomright' });
    legendPanel.onAdd = function (map) {
        this._div = L.DomUtil.create('div', 'leaflet-control-legend');
        this.update();
        return this._div;
    };
    legendPanel.update = function () {
        const theme = themeSelect.value;
        let title = '';
        let grades = [];
        
        if (theme === 'density') {
            title = 'Pop. Density (/km²)';
            grades = [0, 100, 150, 200, 300, 500];
        } else if (theme === 'forest') {
            title = 'Forest Cover (%)';
            grades = [0, 30, 40, 43, 50, 55];
        } else {
            title = 'Tourism Index (1-100)';
            grades = [0, 62, 73, 85, 93, 97];
        }

        let html = `<h4>${title}</h4>`;
        
        for (let i = 0; i < grades.length; i++) {
            const from = grades[i];
            const to = grades[i + 1];
            // Get midpoint or base value for coloring
            const colorVal = from + 1;
            const color = getColor(colorVal, theme);
            
            // Format labels
            let labelText = '';
            if (theme === 'density') {
                labelText = to ? `${from} &ndash; ${to}` : `${from}+`;
            } else if (theme === 'forest') {
                labelText = to ? `${from}% &ndash; ${to}%` : `${from}%+`;
            } else {
                labelText = to ? `${from} &ndash; ${to}` : `${from}+`;
            }
            
            html += `<div class="legend-item">
                <span class="legend-color-box" style="background:${color}"></span>
                <span>${labelText}</span>
            </div>`;
        }
        
        this._div.innerHTML = html;
    };
    legendPanel.addTo(map);

    // ----------------------------------------------------
    // Load GeoJSON and Wire Listeners
    // ----------------------------------------------------
    
    // Initialize the GeoJSON layer using the global variable `nepalProvincesData`
    // loaded from js/geojson-data.js
    if (typeof nepalProvincesData !== 'undefined') {
        geojsonLayer = L.geoJSON(nepalProvincesData, {
            style: styleFeature,
            onEachFeature: onEachFeature
        }).addTo(map);
        
        // Auto-center map on the GeoJSON boundaries
        map.fitBounds(geojsonLayer.getBounds(), { padding: [20, 20] });
    } else {
        console.error("GeoJSON data not found. Make sure 'js/geojson-data.js' is loaded correctly.");
    }

    // Trigger update when dropdown changes
    themeSelect.addEventListener('change', () => {
        if (geojsonLayer) {
            geojsonLayer.setStyle(styleFeature);
        }
        legendPanel.update();
    });
});
