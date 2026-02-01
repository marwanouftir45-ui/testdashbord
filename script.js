// Configuration
const CONFIG = {
    // URL CORRECTE de vos données GitLab
    GEOJSON_URL: 'https://raw.githubusercontent.com/marwanouftir45-ui/testdashbord/refs/heads/main/parcelles-agricoles-2026-01-23.json',
    
    // URLs de secours
    GEOJSON_FALLBACK_URLS: [
        'https://gitlab.com/marwan.ouftir45/parcellespac/-/raw/main/parcellespac.geojson',
        'parcellespac.geojson'  // Fichier local
    ],
    
    GITLAB_BASE_URL: 'https://gitlab.com/marwan.ouftir45/parcellespac'
};

// Variables globales
let map;
let geojsonLayer;
let cultureChart;
let surfaceChart;
let cultureBarChart;
let allFeatures = [];
let searchMarker = null;
let hoveredLayer = null;

// Dictionnaire des noms de cultures avec couleurs
const cultureConfig = {
    "AVH": { name: "Arboriculture Haute Tige", color: "#2ecc71" },
    "BTA": { name: "Betterave à sucre", color: "#e74c3c" },
    "BFS": { name: "Blé tendre", color: "#f39c12" },
    "BOR": { name: "Betterave industrielle", color: "#9b59b6" },
    "AFG": { name: "Affouragement en vert", color: "#3498db" },
    "AVP": { name: "Arboriculture Piège", color: "#1abc9c" },
    "default": { name: "Autre", color: "#95a5a6" }
};

// Fonction d'initialisation
document.addEventListener('DOMContentLoaded', function() {
    console.log("Dashboard initialisé");
    initDashboard();
    initMap();
    setupEventListeners();
    loadDataWithRetry();
});

// Initialisation du dashboard
function initDashboard() {
    // Mettre à jour l'affichage de la source
    const sourceElement = document.querySelector('.data-source') || document.createElement('div');
    sourceElement.className = 'data-source';
    sourceElement.innerHTML = `
        <i class="fas fa-database"></i> 
        <span>Données: GitLab Raw | Parcelles: <span id="feature-count">0</span></span>
    `;
    document.querySelector('.dashboard-header').appendChild(sourceElement);
}

// Initialisation de la carte
function initMap() {
    // Création de la carte centrée sur la Bretagne
    map = L.map('map').setView([48.1, -2.0], 9);
    
    // Ajout des tuiles OpenStreetMap avec un style plus clair
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
        className: 'map-tiles'
    }).addTo(map);
    
    // Ajouter un contrôle d'échelle
    L.control.scale({ position: 'bottomleft', metric: true, imperial: false }).addTo(map);
}

// Chargement des données avec retry
async function loadDataWithRetry() {
    showLoading(true);
    
    console.log("Tentative de chargement depuis:", CONFIG.GEOJSON_URL);
    
    try {
        // Essayer d'abord l'URL principale
        const response = await fetch(CONFIG.GEOJSON_URL, {
            mode: 'cors',
            headers: {
                'Accept': 'application/json',
                'Origin': window.location.origin
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log("✅ Données chargées depuis GitLab Raw");
        processGeoJSONData(data);
        
    } catch (error) {
        console.error("❌ Erreur avec l'URL principale:", error);
        
        // Essayer les URLs de secours
        for (let i = 0; i < CONFIG.GEOJSON_FALLBACK_URLS.length; i++) {
            const url = CONFIG.GEOJSON_FALLBACK_URLS[i];
            console.log(`Essai ${i + 1} avec: ${url}`);
            
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ Données chargées depuis source ${i + 1}`);
                    processGeoJSONData(data);
                    return;
                }
            } catch (fallbackError) {
                console.error(`❌ Échec source ${i + 1}:`, fallbackError);
                continue;
            }
        }
        
        // Si toutes les sources échouent
        console.error("❌ Toutes les sources ont échoué");
        showError(`
            Impossible de charger les données depuis GitLab.<br>
            <strong>URL testée:</strong> ${CONFIG.GEOJSON_URL}<br><br>
            <strong>Solutions:</strong><br>
            1. Vérifiez que le fichier existe à cette URL<br>
            2. Téléchargez le fichier et placez-le dans le dossier public/<br>
            3. Utilisez le mode démo ci-dessous
        `);
        loadDemoData();
        
    } finally {
        showLoading(false);
    }
}

// Traitement des données GeoJSON
function processGeoJSONData(data) {
    allFeatures = data.features || [];
    
    if (allFeatures.length === 0) {
        showError("Aucune donnée trouvée dans le fichier GeoJSON");
        return;
    }
    
    console.log(`Traitement de ${allFeatures.length} parcelles...`);
    
    // Mettre à jour le compteur
    document.getElementById('feature-count').textContent = allFeatures.length;
    
    // Calcul des indicateurs clés
    calculateKPIs(allFeatures);
    
    // Initialisation des graphiques AMÉLIORÉS
    initImprovedCharts(allFeatures);
    
    // Initialisation de la table de statistiques
    updateStatsTable(allFeatures);
    
    // Initialisation du filtre de cultures
    initCultureFilter(allFeatures);
    
    // Ajout des données à la carte
    addGeoJSONToMap(allFeatures);
    
    // Mise à jour de la légende
    updateLegend(allFeatures);
    
    // Afficher notification de succès
    showNotification(`${allFeatures.length} parcelles chargées avec succès!`, "success");
}

// Calcul des indicateurs clés (KPIs)
function calculateKPIs(features) {
    const totalParcelles = features.length;
    
    // Cultures uniques
    const uniqueCultures = [...new Set(features.map(f => f.properties.code_cultu))].filter(c => c);
    
    // Surface totale
    const totalSurface = features.reduce((sum, f) => sum + (f.properties.surf_parc || 0), 0);
    
    // Surface moyenne
    const moyenneSurface = totalParcelles > 0 ? totalSurface / totalParcelles : 0;
    
    // Trouver la plus grande parcelle
    const maxSurface = Math.max(...features.map(f => f.properties.surf_parc || 0));
    const maxParcelle = features.find(f => (f.properties.surf_parc || 0) === maxSurface);
    
    // Mise à jour des KPI dans l'interface
    document.getElementById('total-parcelles').textContent = totalParcelles.toLocaleString('fr-FR');
    document.getElementById('cultures-uniques').textContent = uniqueCultures.length;
    document.getElementById('surface-totale').textContent = totalSurface.toFixed(1) + " ha";
    document.getElementById('surface-moyenne').textContent = moyenneSurface.toFixed(2) + " ha";
    
    // Ajouter une info tooltip pour la plus grande parcelle
    if (maxParcelle) {
        const surfaceElement = document.getElementById('surface-totale');
        surfaceElement.title = `Plus grande parcelle: FID ${maxParcelle.properties.fid} (${maxSurface.toFixed(2)} ha)`;
    }
}

// Initialisation des graphiques AMÉLIORÉS
function initImprovedCharts(features) {
    // Données pour les graphiques
    const cultureData = getCultureDistribution(features);
    const surfaceData = getSurfaceDistribution(features);
    
    // 1. GRAPHIQUE CIRCULAIRE AMÉLIORÉ (Répartition des cultures)
    const ctx1 = document.getElementById('cultureChart').getContext('2d');
    if (cultureChart) cultureChart.destroy();
    
    cultureChart = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: cultureData.labels,
            datasets: [{
                data: cultureData.values,
                backgroundColor: cultureData.colors,
                borderColor: '#ffffff',
                borderWidth: 2,
                hoverBorderWidth: 3,
                hoverOffset: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: {
                            size: 11,
                            family: "'Segoe UI', sans-serif"
                        },
                        color: '#2c3e50'
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#2c3e50',
                    bodyColor: '#555',
                    borderColor: '#ddd',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${label}: ${value} parcelles (${percentage}%)`;
                        }
                    }
                }
            },
            animation: {
                animateScale: true,
                animateRotate: true,
                duration: 1000
            }
        }
    });
    
    // 2. GRAPHIQUE À BARRES HORIZONTAL (Top 10 cultures)
    const top10Data = getTop10Cultures(features);
    const ctx3 = document.getElementById('surfaceChart').getContext('2d');
    if (cultureBarChart) cultureBarChart.destroy();
    
    cultureBarChart = new Chart(ctx3, {
        type: 'bar',
        data: {
            labels: top10Data.labels,
            datasets: [{
                label: 'Nombre de parcelles',
                data: top10Data.values,
                backgroundColor: top10Data.colors,
                borderColor: '#ffffff',
                borderWidth: 1,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#2c3e50',
                    bodyColor: '#555',
                    borderColor: '#ddd',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.x} parcelles`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: {
                            size: 11
                        }
                    },
                    title: {
                        display: true,
                        text: 'Nombre de parcelles',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 11
                        }
                    }
                }
            },
            animation: {
                duration: 1000
            }
        }
    });
    
    // 3. GRAPHIQUE DE DISTRIBUTION DES SURFACES (dans un conteneur séparé si besoin)
    updateSurfaceDistributionChart(surfaceData);
}

// Récupération de la distribution des cultures avec couleurs
function getCultureDistribution(features) {
    const cultureCount = {};
    
    features.forEach(feature => {
        const code = feature.properties.code_cultu;
        if (code) {
            cultureCount[code] = (cultureCount[code] || 0) + 1;
        }
    });
    
    // Trier par nombre décroissant
    const sorted = Object.entries(cultureCount)
        .sort((a, b) => b[1] - a[1]);
    
    return {
        labels: sorted.map(item => cultureConfig[item[0]]?.name || item[0]),
        values: sorted.map(item => item[1]),
        colors: sorted.map(item => cultureConfig[item[0]]?.color || cultureConfig.default.color)
    };
}

// Récupération du Top 10 des cultures
function getTop10Cultures(features) {
    const cultureCount = {};
    
    features.forEach(feature => {
        const code = feature.properties.code_cultu;
        if (code) {
            cultureCount[code] = (cultureCount[code] || 0) + 1;
        }
    });
    
    // Trier par nombre décroissant et limiter à 10
    const sorted = Object.entries(cultureCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    return {
        labels: sorted.map(item => cultureConfig[item[0]]?.name || item[0]),
        values: sorted.map(item => item[1]),
        colors: sorted.map(item => cultureConfig[item[0]]?.color || cultureConfig.default.color)
    };
}

// Récupération de la distribution des surfaces
function getSurfaceDistribution(features) {
    const distribution = [
        { label: 'Très petite\n< 0.1 ha', min: 0, max: 0.1, count: 0, color: '#a8e6cf' },
        { label: 'Petite\n0.1 - 0.5 ha', min: 0.1, max: 0.5, count: 0, color: '#dcedc1' },
        { label: 'Moyenne\n0.5 - 1 ha', min: 0.5, max: 1, count: 0, color: '#ffd3b6' },
        { label: 'Grande\n1 - 5 ha', min: 1, max: 5, count: 0, color: '#ffaaa5' },
        { label: 'Très grande\n> 5 ha', min: 5, max: Infinity, count: 0, color: '#ff8b94' }
    ];
    
    features.forEach(feature => {
        const surface = feature.properties.surf_parc || 0;
        for (const category of distribution) {
            if (surface >= category.min && surface < category.max) {
                category.count++;
                break;
            }
        }
    });
    
    return distribution;
}

// Mise à jour du graphique de distribution des surfaces
function updateSurfaceDistributionChart(distributionData) {
    // Créer un canvas pour ce graphique si nécessaire
    let surfaceDistCanvas = document.getElementById('surfaceDistChart');
    if (!surfaceDistCanvas) {
        const chartContainer = document.querySelector('.chart-container:nth-child(2)');
        const newCanvas = document.createElement('canvas');
        newCanvas.id = 'surfaceDistChart';
        newCanvas.className = 'chart-improved';
        chartContainer.querySelector('canvas').replaceWith(newCanvas);
        surfaceDistCanvas = newCanvas;
    }
    
    const ctx = surfaceDistCanvas.getContext('2d');
    if (surfaceChart) surfaceChart.destroy();
    
    surfaceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: distributionData.map(d => d.label),
            datasets: [{
                label: 'Nombre de parcelles',
                data: distributionData.map(d => d.count),
                backgroundColor: distributionData.map(d => d.color),
                borderColor: '#ffffff',
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    titleColor: '#2c3e50',
                    bodyColor: '#555',
                    borderColor: '#ddd',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y} parcelles`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: {
                            size: 11
                        }
                    },
                    title: {
                        display: true,
                        text: 'Nombre de parcelles',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 10
                        }
                    }
                }
            },
            animation: {
                duration: 1000
            }
        }
    });
}

// Mise à jour du tableau de statistiques
function updateStatsTable(features) {
    const cultureStats = {};
    
    // Calcul des statistiques par culture
    features.forEach(feature => {
        const code = feature.properties.code_cultu;
        if (!code) return;
        
        if (!cultureStats[code]) {
            cultureStats[code] = {
                count: 0,
                totalSurface: 0,
                minSurface: Infinity,
                maxSurface: 0
            };
        }
        
        const surface = feature.properties.surf_parc || 0;
        cultureStats[code].count++;
        cultureStats[code].totalSurface += surface;
        cultureStats[code].minSurface = Math.min(cultureStats[code].minSurface, surface);
        cultureStats[code].maxSurface = Math.max(cultureStats[code].maxSurface, surface);
    });
    
    // Conversion en tableau et tri
    const statsArray = Object.entries(cultureStats).map(([code, stats]) => ({
        code,
        name: cultureConfig[code]?.name || code,
        count: stats.count,
        totalSurface: stats.totalSurface,
        avgSurface: stats.totalSurface / stats.count,
        minSurface: stats.minSurface === Infinity ? 0 : stats.minSurface,
        maxSurface: stats.maxSurface
    }));
    
    statsArray.sort((a, b) => b.count - a.count);
    
    // Mise à jour du HTML
    const tbody = document.getElementById('statsTableBody');
    tbody.innerHTML = '';
    
    statsArray.forEach(stat => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 12px; height: 12px; border-radius: 3px; background: ${cultureConfig[stat.code]?.color || cultureConfig.default.color};"></div>
                    <div>
                        <strong>${stat.name}</strong><br>
                        <small style="color: #7f8c8d;">${stat.code}</small>
                    </div>
                </div>
            </td>
            <td style="text-align: center; font-weight: 600;">${stat.count}</td>
            <td>${stat.totalSurface.toFixed(2)} ha</td>
            <td>
                <div style="font-size: 0.9rem;">
                    <div>Ø ${stat.avgSurface.toFixed(2)} ha</div>
                    <div style="font-size: 0.8rem; color: #7f8c8d;">
                        min: ${stat.minSurface.toFixed(2)} / max: ${stat.maxSurface.toFixed(2)} ha
                    </div>
                </div>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

// Ajout des données GeoJSON à la carte avec popups améliorés
function addGeoJSONToMap(features) {
    // Supprimer la couche existante si elle existe
    if (geojsonLayer) {
        map.removeLayer(geojsonLayer);
    }
    
    // Créer une couche GeoJSON avec style amélioré
    geojsonLayer = L.geoJSON(features, {
        style: function(feature) {
            const cultureCode = feature.properties.code_cultu;
            const config = cultureConfig[cultureCode] || cultureConfig.default;
            
            return {
                fillColor: config.color,
                color: '#2c3e50',
                weight: 1.5,
                opacity: 0.8,
                fillOpacity: 0.6,
                dashArray: null
            };
        },
        onEachFeature: function(feature, layer) {
            // Créer un popup amélioré
            const popupContent = createEnhancedPopupContent(feature);
            
            // Ajouter le popup mais NE PAS l'ouvrir automatiquement
            layer.bindPopup(popupContent, {
                className: 'popup-enhanced',
                maxWidth: 300,
                minWidth: 280,
                autoClose: true,
                closeOnClick: true,
                closeButton: true
            });
            
            // Événement au clic pour ouvrir le popup (pas le détail)
            layer.on('click', function(e) {
                // Ouvrir seulement le popup Leaflet
                layer.openPopup();
                
                // Mettre en évidence la parcelle
                highlightParcelle(layer);
            });
            
            // Effet de survol amélioré
            layer.on('mouseover', function(e) {
                if (hoveredLayer !== layer) {
                    layer.setStyle({
                        weight: 3,
                        fillOpacity: 0.8,
                        color: '#e74c3c'
                    });
                    hoveredLayer = layer;
                    
                    // Changer le curseur
                    map.getContainer().style.cursor = 'pointer';
                }
            });
            
            layer.on('mouseout', function(e) {
                if (hoveredLayer === layer) {
                    geojsonLayer.resetStyle(layer);
                    hoveredLayer = null;
                    
                    // Revenir au curseur normal
                    map.getContainer().style.cursor = '';
                }
            });
        }
    }).addTo(map);
    
    // Ajuster la vue pour montrer toutes les données
    if (features.length > 0) {
        const bounds = geojsonLayer.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
        }
    }
}

// Création du contenu du popup amélioré (NE PAS ouvrir le détail automatiquement)
function createEnhancedPopupContent(feature) {
    const props = feature.properties;
    const config = cultureConfig[props.code_cultu] || cultureConfig.default;
    const cultureName = config.name;
    
    let content = `
        <div class="popup-header-enhanced">
            <i class="fas fa-map-marker-alt"></i>
            <h3>Parcelle Agricole</h3>
            <span class="popup-id-badge">${props.fid}</span>
        </div>
        <div class="popup-content-enhanced">
            <div class="popup-row">
                <span class="popup-label">Culture :</span>
                <span class="popup-value">
                    <span style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: ${config.color}; margin-right: 5px;"></span>
                    ${props.code_cultu} - ${cultureName}
                </span>
            </div>
            <div class="popup-row">
                <span class="popup-label">Surface :</span>
                <span class="popup-value" style="font-weight: 600; color: #2c3e50;">
                    ${(props.surf_parc || 0).toFixed(2)} ha
                </span>
            </div>
    `;
    
    if (props.culture_d1) {
        content += `
            <div class="popup-row">
                <span class="popup-label">Culture principale :</span>
                <span class="popup-value">${props.culture_d1}</span>
            </div>
        `;
    }
    
    if (props.culture_d2) {
        content += `
            <div class="popup-row">
                <span class="popup-label">Culture secondaire :</span>
                <span class="popup-value">${props.culture_d2}</span>
            </div>
        `;
    }
    
    content += `
            <div class="popup-row">
                <span class="popup-label">Groupe :</span>
                <span class="popup-value">${props.code_group || 'N/A'}</span>
            </div>
            <div class="popup-actions">
                <button class="popup-btn popup-btn-details" onclick="window.showDetailPopupFromMap(${props.fid})">
                    <i class="fas fa-info-circle"></i> Détails
                </button>
                <button class="popup-btn popup-btn-zoom" onclick="window.zoomToParcelle(${props.fid})">
                    <i class="fas fa-search-plus"></i> Zoom
                </button>
            </div>
        </div>
    `;
    
    return content;
}

// Fonction pour mettre en évidence une parcelle
function highlightParcelle(layer) {
    // Réinitialiser toutes les parcelles
    geojsonLayer.eachLayer(function(l) {
        if (l !== layer) {
            geojsonLayer.resetStyle(l);
        }
    });
    
    // Mettre en évidence la parcelle cliquée
    layer.setStyle({
        weight: 4,
        color: '#e74c3c',
        fillOpacity: 0.9,
        dashArray: null
    });
    
    // Bring to front
    layer.bringToFront();
}

// Fonction pour zoomer sur une parcelle (accessible depuis les popups)
window.zoomToParcelle = function(fid) {
    const feature = allFeatures.find(f => f.properties.fid === fid);
    if (feature && feature.geometry) {
        try {
            // Calculer le centre
            const coords = feature.geometry.coordinates[0][0][0];
            const center = L.latLng(coords[1], coords[0]);
            
            // Zoom sur la parcelle
            map.setView(center, 15);
            
            // Fermer tous les popups
            map.closePopup();
            
        } catch(e) {
            // Fallback: utiliser les bounds
            const layer = L.geoJSON(feature);
            const bounds = layer.getBounds();
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
            }
        }
    }
};

// Fonction pour afficher le popup détaillé (manuellement depuis le bouton)
window.showDetailPopupFromMap = function(fid) {
    const feature = allFeatures.find(f => f.properties.fid === fid);
    if (feature) {
        // Fermer le popup Leaflet
        map.closePopup();
        
        // Ouvrir le popup détaillé après un petit délai
        setTimeout(() => {
            showDetailPopup(feature);
        }, 100);
    }
};

// Fonction pour afficher le popup détaillé (manuellement depuis le bouton)
window.showDetailPopupFromMap = function(fid) {
    const feature = allFeatures.find(f => f.properties.fid === fid);
    if (feature) {
        // Fermer le popup Leaflet
        map.closePopup();
        
        // Ouvrir le popup détaillé après un petit délai
        setTimeout(() => {
            showDetailPopup(feature);
        }, 100);
    }
};

// Fonction pour afficher le popup détaillé
function showDetailPopup(feature) {
    const props = feature.properties;
    const config = cultureConfig[props.code_cultu] || cultureConfig.default;
    const cultureName = config.name;
    
    // Récupérer les coordonnées du centroïde pour l'affichage
    let coordsText = "Non disponible";
    if (feature.geometry && feature.geometry.coordinates) {
        try {
            // Pour MultiPolygon, prendre le premier point du premier polygone
            const coords = feature.geometry.coordinates[0][0][0];
            coordsText = `${coords[1].toFixed(6)}, ${coords[0].toFixed(6)}`;
        } catch(e) {
            coordsText = "Format complexe";
        }
    }
    
    // Mettre à jour le contenu du popup
    document.getElementById('popupFid').textContent = props.fid || 'N/A';
    document.getElementById('popupCode').textContent = `${props.code_cultu || 'N/A'} - ${cultureName}`;
    document.getElementById('popupGroup').textContent = props.code_group || 'N/A';
    document.getElementById('popupSurface').textContent = (props.surf_parc || 0).toFixed(2) + ' ha';
    document.getElementById('popupCulture1').textContent = props.culture_d1 || 'Non spécifié';
    document.getElementById('popupCulture2').textContent = props.culture_d2 || 'Non spécifié';
    document.getElementById('popupCategory').textContent = props.cat_cult_p || 'N/A';
    document.getElementById('popupCoords').textContent = coordsText;
    
    // Lien GitLab
    const gitlabLink = document.getElementById('popupGitlabLink');
    gitlabLink.href = CONFIG.GITLAB_BASE_URL;
    gitlabLink.title = "Voir le projet sur GitLab";
    
    // Afficher le popup avec animation
    const popup = document.getElementById('detailPopup');
    const overlay = document.getElementById('overlay');
    
    popup.classList.add('active');
    overlay.classList.add('active');
    
    // Empêcher le scroll du body
    document.body.style.overflow = 'hidden';
}

// Initialisation du filtre de cultures
function initCultureFilter(features) {
    const uniqueCultures = [...new Set(features.map(f => f.properties.code_cultu))].filter(c => c);
    const filterSelect = document.getElementById('cultureFilter');
    
    // Vider les options existantes (garder "Toutes les cultures")
    while (filterSelect.options.length > 1) {
        filterSelect.remove(1);
    }
    
    // Ajouter les options avec couleurs
    uniqueCultures.sort().forEach(code => {
        const config = cultureConfig[code] || cultureConfig.default;
        const option = document.createElement('option');
        option.value = code;
        option.textContent = `${config.name} (${code})`;
        option.style.cssText = `
            padding: 8px;
            background: ${config.color}10;
            border-left: 3px solid ${config.color};
            margin: 2px 0;
        `;
        filterSelect.appendChild(option);
    });
    
    // Ajouter un événement pour mettre à jour le style de l'option sélectionnée
    filterSelect.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        if (selectedOption.value !== 'all') {
            const config = cultureConfig[selectedOption.value] || cultureConfig.default;
            this.style.borderColor = config.color;
            this.style.boxShadow = `0 0 0 3px ${config.color}20`;
        } else {
            this.style.borderColor = '';
            this.style.boxShadow = '';
        }
    });
}

// Mise à jour de la légende
function updateLegend(features) {
    const uniqueCultures = [...new Set(features.map(f => f.properties.code_cultu))].filter(c => c);
    const legendContent = document.getElementById('legendContent');
    
    let legendHTML = '';
    
    // Trier par fréquence
    const cultureCounts = {};
    features.forEach(f => {
        const code = f.properties.code_cultu;
        if (code) cultureCounts[code] = (cultureCounts[code] || 0) + 1;
    });
    
    const sortedCultures = uniqueCultures.sort((a, b) => (cultureCounts[b] || 0) - (cultureCounts[a] || 0));
    
    sortedCultures.forEach(code => {
        const count = cultureCounts[code] || 0;
        const config = cultureConfig[code] || cultureConfig.default;
        const percentage = ((count / features.length) * 100).toFixed(1);
        
        legendHTML += `
            <div class="legend-item" data-culture="${code}">
                <div class="legend-color" style="background-color: ${config.color};"></div>
                <span style="flex: 1;">
                    <strong>${config.name}</strong><br>
                    <small style="color: #7f8c8d;">${code} • ${count} parcelles (${percentage}%)</small>
                </span>
            </div>
        `;
    });
    
    legendContent.innerHTML = legendHTML;
    
    // Ajouter des événements pour filtrer au clic sur la légende
    document.querySelectorAll('.legend-item').forEach(item => {
        item.addEventListener('click', function() {
            const cultureCode = this.getAttribute('data-culture');
            document.getElementById('cultureFilter').value = cultureCode;
            filterMapByCulture(cultureCode);
        });
    });
}

// Obtention de la couleur pour une culture
function getColorForCulture(code) {
    return cultureConfig[code]?.color || cultureConfig.default.color;
}

// Fonction de recherche par FID
function searchByFid(fid) {
    // Supprimer le marqueur précédent s'il existe
    if (searchMarker) {
        map.removeLayer(searchMarker);
        searchMarker = null;
    }
    
    // Nettoyer les résultats précédents
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = '';
    resultsContainer.classList.remove('active');
    
    if (!fid || fid.trim() === '') {
        return;
    }
    
    const searchTerm = fid.trim().toLowerCase();
    const results = [];
    
    // Recherche exacte
    const exactMatch = allFeatures.find(f => f.properties.fid.toString() === searchTerm);
    if (exactMatch) {
        results.push(exactMatch);
    }
    
    // Recherche partielle si pas de résultat exact
    if (results.length === 0) {
        results.push(...allFeatures.filter(f => 
            f.properties.fid.toString().includes(searchTerm)
        ));
    }
    
    // Limiter à 10 résultats
    const limitedResults = results.slice(0, 10);
    
    // Afficher les résultats
    if (limitedResults.length > 0) {
        let resultsHTML = '';
        
        limitedResults.forEach(feature => {
            const props = feature.properties;
            const config = cultureConfig[props.code_cultu] || cultureConfig.default;
            
            resultsHTML += `
                <div class="search-result-item" data-fid="${props.fid}">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 12px; height: 12px; border-radius: 3px; background: ${config.color};"></div>
                        <div>
                            <span class="result-fid">FID: ${props.fid}</span>
                            <span class="result-culture">${config.name}</span>
                        </div>
                    </div>
                    <div class="result-surface">${(props.surf_parc || 0).toFixed(2)} ha</div>
                </div>
            `;
        });
        
        resultsContainer.innerHTML = resultsHTML;
        resultsContainer.classList.add('active');
        
        // Ajouter les événements de clic aux résultats
        document.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', function() {
                const fid = this.getAttribute('data-fid');
                selectSearchResult(parseInt(fid));
            });
        });
        
        // Zoom sur le premier résultat
        if (limitedResults.length > 0) {
            zoomToFeature(limitedResults[0]);
        }
    } else {
        resultsContainer.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search" style="font-size: 1.2rem; margin-bottom: 8px; display: block;"></i>
                Aucune parcelle trouvée
            </div>
        `;
        resultsContainer.classList.add('active');
    }
}

// Zoom sur une feature spécifique
function zoomToFeature(feature) {
    if (!feature || !feature.geometry) return;
    
    // Supprimer le marqueur précédent s'il existe
    if (searchMarker) {
        map.removeLayer(searchMarker);
    }
    
    try {
        // Pour MultiPolygon, prendre le premier point du premier polygone
        const coords = feature.geometry.coordinates[0][0][0];
        const center = L.latLng(coords[1], coords[0]);
        
        // Créer un marqueur personnalisé
        searchMarker = L.marker(center, {
            icon: L.divIcon({
                html: `
                    <div style="background: #e74c3c; color: white; padding: 8px 12px; 
                         border-radius: 6px; font-weight: bold; border: 3px solid white; 
                         box-shadow: 0 0 15px rgba(0,0,0,0.3); display: flex; 
                         align-items: center; gap: 5px;">
                        <i class="fas fa-map-pin"></i>
                        Parcelle ${feature.properties.fid}
                    </div>
                `,
                className: 'search-marker',
                iconSize: [150, 40],
                iconAnchor: [75, 20]
            }),
            zIndexOffset: 1000
        }).addTo(map);
        
        // Ajouter un popup au marqueur
        searchMarker.bindPopup(createEnhancedPopupContent(feature), {
            className: 'popup-enhanced',
            autoClose: false,
            closeOnClick: false
        }).openPopup();
        
        // Centrer la carte sur la parcelle
        map.setView(center, 15);
        
        // Mettre en évidence la parcelle
        const layer = findLayerByFid(feature.properties.fid);
        if (layer) {
            highlightParcelle(layer);
        }
        
    } catch(e) {
        console.error("Erreur lors du zoom sur la feature:", e);
        // Fallback: utiliser les bounds
        const layer = L.geoJSON(feature);
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
    }
}

// Trouver une couche par FID
function findLayerByFid(fid) {
    let foundLayer = null;
    geojsonLayer.eachLayer(function(layer) {
        if (layer.feature.properties.fid === fid) {
            foundLayer = layer;
        }
    });
    return foundLayer;
}

// Sélection d'un résultat de recherche
function selectSearchResult(fid) {
    const feature = allFeatures.find(f => f.properties.fid === fid);
    if (feature) {
        zoomToFeature(feature);
        // Fermer la liste des résultats
        document.getElementById('searchResults').classList.remove('active');
        // Vider le champ de recherche
        document.getElementById('searchFid').value = '';
    }
}

// Configuration des écouteurs d'événements
function setupEventListeners() {
    // Fermeture du popup détaillé
    document.getElementById('closePopup').addEventListener('click', function() {
        closeDetailPopup();
    });
    
    document.getElementById('overlay').addEventListener('click', function() {
        closeDetailPopup();
    });
    
    // Fermeture avec la touche Échap
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeDetailPopup();
        }
    });
    
    // Filtre par culture
    document.getElementById('cultureFilter').addEventListener('change', function() {
        filterMapByCulture(this.value);
    });
    
    // Bouton de réinitialisation
    document.getElementById('resetView').addEventListener('click', function() {
        resetMapView();
    });
    
    // Bouton d'export
    document.getElementById('exportBtn').addEventListener('click', function() {
        exportData();
    });
    
    // Recherche par FID
    document.getElementById('searchBtn').addEventListener('click', function() {
        const fid = document.getElementById('searchFid').value;
        searchByFid(fid);
    });
    
    // Recherche par FID avec la touche Entrée
    document.getElementById('searchFid').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            const fid = this.value;
            searchByFid(fid);
        }
    });
    
    // Fermer les résultats de recherche en cliquant en dehors
    document.addEventListener('click', function(e) {
        const searchContainer = document.querySelector('.search-container');
        const searchResults = document.getElementById('searchResults');
        const searchInput = document.getElementById('searchFid');
        
        if (searchContainer && !searchContainer.contains(e.target) && e.target !== searchInput) {
            searchResults.classList.remove('active');
        }
    });
    
    // Effet de focus sur le champ de recherche
    document.getElementById('searchFid').addEventListener('focus', function() {
        this.parentElement.style.boxShadow = '0 0 0 3px rgba(52, 152, 219, 0.2)';
        this.parentElement.style.borderColor = '#3498db';
    });
    
    document.getElementById('searchFid').addEventListener('blur', function() {
        this.parentElement.style.boxShadow = '';
        this.parentElement.style.borderColor = '#ddd';
    });
}

// Fermer le popup détaillé
function closeDetailPopup() {
    const popup = document.getElementById('detailPopup');
    const overlay = document.getElementById('overlay');
    
    popup.classList.remove('active');
    overlay.classList.remove('active');
    
    // Restaurer le scroll du body
    document.body.style.overflow = '';
}

// Filtrage de la carte par culture
function filterMapByCulture(cultureCode) {
    if (!geojsonLayer) return;
    
    if (cultureCode === 'all') {
        // Afficher toutes les parcelles
        geojsonLayer.eachLayer(function(layer) {
            layer.setStyle({
                fillOpacity: 0.6,
                opacity: 0.8,
                weight: 1.5
            });
        });
        
        // Supprimer le filtre visuel de la légende
        document.querySelectorAll('.legend-item').forEach(item => {
            item.style.opacity = '1';
            item.style.backgroundColor = '';
        });
        
    } else {
        // Filtrer par culture
        const config = cultureConfig[cultureCode] || cultureConfig.default;
        
        geojsonLayer.eachLayer(function(layer) {
            const featureCulture = layer.feature.properties.code_cultu;
            if (featureCulture === cultureCode) {
                layer.setStyle({
                    fillOpacity: 0.9,
                    opacity: 1,
                    weight: 3,
                    color: config.color,
                    fillColor: config.color
                });
                layer.bringToFront();
            } else {
                layer.setStyle({
                    fillOpacity: 0.1,
                    opacity: 0.2,
                    weight: 1,
                    color: '#ccc'
                });
            }
        });
        
        // Mettre en évidence la légende correspondante
        document.querySelectorAll('.legend-item').forEach(item => {
            if (item.getAttribute('data-culture') === cultureCode) {
                item.style.backgroundColor = config.color + '20';
                item.style.borderLeft = `3px solid ${config.color}`;
                item.style.paddingLeft = '10px';
            } else {
                item.style.opacity = '0.4';
                item.style.backgroundColor = '';
                item.style.borderLeft = '3px solid transparent';
            }
        });
    }
    
    // Fermer tous les popups
    map.closePopup();
    
    // Supprimer le marqueur de recherche
    if (searchMarker) {
        map.removeLayer(searchMarker);
        searchMarker = null;
    }
}

// Réinitialiser la vue de la carte
function resetMapView() {
    // Réinitialiser le filtre
    document.getElementById('cultureFilter').value = 'all';
    filterMapByCulture('all');
    
    // Réinitialiser la recherche
    document.getElementById('searchFid').value = '';
    document.getElementById('searchResults').classList.remove('active');
    
    // Supprimer le marqueur de recherche
    if (searchMarker) {
        map.removeLayer(searchMarker);
        searchMarker = null;
    }
    
    // Réinitialiser la légende
    document.querySelectorAll('.legend-item').forEach(item => {
        item.style.opacity = '1';
        item.style.backgroundColor = '';
        item.style.borderLeft = '3px solid transparent';
    });
    
    // Recentrer la carte
    if (geojsonLayer && allFeatures.length > 0) {
        const bounds = geojsonLayer.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
        }
    }
    
    // Fermer tous les popups
    map.closePopup();
    closeDetailPopup();
    
    // Afficher une notification
    showNotification("Vue réinitialisée", "info");
}

// Fonction pour exporter les données
function exportData() {
    if (allFeatures.length === 0) {
        showNotification("Aucune donnée à exporter", "warning");
        return;
    }
    
    // Créer un résumé des données
    const exportData = {
        metadata: {
            exportDate: new Date().toISOString(),
            totalParcelles: allFeatures.length,
            source: CONFIG.GEOJSON_URL
        },
        summary: {
            cultures: {},
            surfaces: getSurfaceDistribution(allFeatures)
        },
        top10Parcelles: allFeatures
            .map(f => ({
                fid: f.properties.fid,
                culture: f.properties.code_cultu,
                surface: f.properties.surf_parc || 0,
                groupe: f.properties.code_group
            }))
            .sort((a, b) => b.surface - a.surface)
            .slice(0, 10)
    };
    
    // Ajouter les statistiques par culture
    const cultureStats = {};
    allFeatures.forEach(f => {
        const code = f.properties.code_cultu;
        if (!code) return;
        
        if (!cultureStats[code]) {
            cultureStats[code] = {
                count: 0,
                totalSurface: 0,
                parcelles: []
            };
        }
        
        cultureStats[code].count++;
        cultureStats[code].totalSurface += f.properties.surf_parc || 0;
        cultureStats[code].parcelles.push({
            fid: f.properties.fid,
            surface: f.properties.surf_parc || 0
        });
    });
    
    exportData.summary.cultures = cultureStats;
    
    // Convertir en JSON formaté
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const exportFileName = `parcelles-agricoles-export-${new Date().toISOString().split('T')[0]}.json`;
    
    // Créer un lien de téléchargement
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileName);
    linkElement.style.display = 'none';
    document.body.appendChild(linkElement);
    linkElement.click();
    document.body.removeChild(linkElement);
    
    showNotification("Export terminé !", "success");
}

// Fonction pour afficher/masquer le chargement
function showLoading(show) {
    const loadingElement = document.getElementById('mapLoading');
    if (loadingElement) {
        if (show) {
            loadingElement.innerHTML = `
                <div style="text-align: center;">
                    <i class="fas fa-spinner fa-spin fa-2x" style="margin-bottom: 10px;"></i>
                    <div style="font-size: 1rem;">Chargement des données...</div>
                    <div style="font-size: 0.8rem; color: #7f8c8d; margin-top: 5px;">
                        ${allFeatures.length} parcelles chargées
                    </div>
                </div>
            `;
            loadingElement.style.display = 'flex';
        } else {
            loadingElement.style.display = 'none';
        }
    }
}

// Fonction pour afficher une notification
function showNotification(message, type = "success") {
    // Supprimer les notifications existantes
    document.querySelectorAll('.notification').forEach(n => n.remove());
    
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    
    const colors = {
        success: '#27ae60',
        error: '#e74c3c',
        warning: '#f39c12',
        info: '#3498db'
    };
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type]};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 2000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        max-width: 400px;
        display: flex;
        align-items: center;
        gap: 12px;
        animation: slideIn 0.3s ease;
        cursor: pointer;
    `;
    
    notification.innerHTML = `
        <i class="fas fa-${icons[type]}" style="font-size: 1.2rem;"></i>
        <span>${message}</span>
        <i class="fas fa-times" style="margin-left: auto; opacity: 0.7;"></i>
    `;
    
    document.body.appendChild(notification);
    
    // Fermer au clic
    notification.addEventListener('click', () => {
        notification.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => notification.remove(), 300);
    });
    
    // Supprimer automatiquement après 5 secondes
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

// Fonction pour afficher une erreur détaillée
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-alert';
    errorDiv.innerHTML = `
        <h4><i class="fas fa-exclamation-triangle"></i> Erreur de chargement</h4>
        <div style="margin: 10px 0; line-height: 1.5;">${message}</div>
        <div style="margin-top: 15px; display: flex; gap: 10px;">
            <button onclick="loadDemoData()" class="btn-demo" style="flex: 1;">
                <i class="fas fa-play-circle"></i> Mode démo
            </button>
            <button onclick="location.reload()" class="btn-demo" style="flex: 1; background: #3498db;">
                <i class="fas fa-redo"></i> Réessayer
            </button>
        </div>
    `;
    
    // Insérer avant la carte
    const mapContainer = document.getElementById('map');
    mapContainer.parentNode.insertBefore(errorDiv, mapContainer);
    mapContainer.style.display = 'none';
}

// Fonction de secours avec des données de démo
function loadDemoData() {
    console.log("Chargement des données de démo...");
    
    // Données de démo étendues
    const demoData = {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: {
                    fid: 261,
                    code_cultu: "AFG",
                    code_group: "16",
                    surf_parc: 0.66,
                    culture_d1: null,
                    culture_d2: null,
                    cat_cult_p: "TA"
                },
                geometry: {
                    type: "MultiPolygon",
                    coordinates: [[[
                        [-2.098221, 48.083437], [-2.098086, 48.083442],
                        [-2.098072, 48.083443], [-2.098029, 48.083443]
                    ]]]
                }
            },
            {
                type: "Feature",
                properties: {
                    fid: 2672,
                    code_cultu: "AVH",
                    code_group: "4",
                    surf_parc: 0.04,
                    culture_d1: null,
                    culture_d2: null,
                    cat_cult_p: "TA"
                },
                geometry: {
                    type: "MultiPolygon",
                    coordinates: [[[
                        [-2.029376, 48.184125], [-2.029416, 48.184064],
                        [-2.030142, 48.184306], [-2.030112, 48.184365]
                    ]]]
                }
            },
            {
                type: "Feature",
                properties: {
                    fid: 2681,
                    code_cultu: "AVH",
                    code_group: "4",
                    surf_parc: 0.07,
                    culture_d1: null,
                    culture_d2: null,
                    cat_cult_p: "TA"
                },
                geometry: {
                    type: "MultiPolygon",
                    coordinates: [[[
                        [-2.029371, 48.184122], [-2.029310, 48.184220],
                        [-2.028872, 48.184086], [-2.028943, 48.183982]
                    ]]]
                }
            },
            {
                type: "Feature",
                properties: {
                    fid: 2683,
                    code_cultu: "AVH",
                    code_group: "4",
                    surf_parc: 0.08,
                    culture_d1: null,
                    culture_d2: null,
                    cat_cult_p: "TA"
                },
                geometry: {
                    type: "MultiPolygon",
                    coordinates: [[[
                        [-2.029313, 48.184222], [-2.029376, 48.184125],
                        [-2.030112, 48.184365], [-2.030060, 48.184477]
                    ]]]
                }
            }
        ]
    };
    
    processGeoJSONData(demoData);
    
    // Masquer l'erreur et réafficher la carte
    const errorDiv = document.querySelector('.error-alert');
    if (errorDiv) errorDiv.remove();
    
    const mapContainer = document.getElementById('map');
    mapContainer.style.display = 'block';
    
    showNotification("Mode démo activé - Données limitées chargées", "warning");
}

// Fonction utilitaire pour formater les nombres
function formatNumber(num) {
    return num.toLocaleString('fr-FR');
}

// Fonction utilitaire pour générer des couleurs
function generateColors(count) {
    const colors = [];
    const hueStep = 360 / count;
    
    for (let i = 0; i < count; i++) {
        const hue = (i * hueStep) % 360;
        colors.push(`hsl(${hue}, 70%, 60%)`);
    }
    
    return colors;
}

// Initialiser les animations CSS
function initAnimations() {
    // Ajouter les keyframes CSS si nécessaire
    if (!document.getElementById('animations-style')) {
        const style = document.createElement('style');
        style.id = 'animations-style';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .chart-container, .stats-container, .kpi-card {
                animation: fadeIn 0.5s ease-out;
            }
        `;
        document.head.appendChild(style);
    }
}

// Initialiser les animations au démarrage
initAnimations();

// Exposer les fonctions globales nécessaires
window.searchByFid = searchByFid;
window.filterMapByCulture = filterMapByCulture;
window.resetMapView = resetMapView;
window.exportData = exportData;
