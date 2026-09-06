// =========================================================================
// 1. GLOBALE VARIABLEN & HTML-ELEMENTE
// =========================================================================
let carsArray = [];
let classMapping = {}; 

const carContainer = document.getElementById('car-container');
const classSelect = document.getElementById('filter-class');
const brandSelect = document.getElementById('filter-brand');
const searchInput = document.getElementById('search-input');

// Hilfsfunktion zum Auflösen des Klassennamens aus der JSON
function getClassName(classId) {
    if (classMapping && classMapping[classId]) {
        return classMapping[classId].Name || classMapping[classId].name || `Klasse ${classId}`;
    }
    return `Klasse ${classId}`; 
}

// =========================================================================
// 2. DATEN LADEN (Jetzt komplett lokal von deiner Festplatte!)
// =========================================================================
async function loadData() {
    try {
        // Lädt daten.json und deine specs.csv direkt aus deinem Projektordner
        const [carsResponse, csvResponse] = await Promise.all([
            fetch('daten.json'),
            fetch('specs.csv').catch(e => {
                console.log("Hinweis: specs.csv wurde noch nicht im Ordner gefunden.");
                return null;
            })
        ]);

        if (!carsResponse.ok) throw new Error(`HTTP-Fehler daten.json! Status: ${carsResponse.status}`);
        const dataset = await carsResponse.json();
        
        // CSV-Daten auslesen, falls die Datei im Ordner liegt
        let sheetSpecs = {};
        if (csvResponse && csvResponse.ok) {
            const csvText = await csvResponse.text();
            sheetSpecs = parseSheetsCSV(csvText); 
        }

        classMapping = dataset.classes || dataset.classNames || dataset.Classes || {};
        
        if (dataset && dataset.cars) {
            carsArray = Object.values(dataset.cars);
            
            // Technische Daten mit den Autos verschmelzen
            carsArray.forEach(car => {
                const specData = sheetSpecs[car.Id];
                if (specData) {
                    Object.assign(car, specData); 
                }
            });
        } else {
            throw new Error("Das 'cars'-Objekt wurde in der daten.json nicht gefunden.");
        }
        
        if (typeof initClassFilter === 'function') initClassFilter();
        else if (typeof initFilterOptions === 'function') initFilterOptions();
        
        updateBrandFilter(); 
        renderCars();
    } catch (error) {
        console.error("Datenfehler beim Laden:", error);
        if (carContainer) {
            carContainer.innerHTML = `<p style="color: red; font-weight: bold;">Fehler beim Laden: ${error.message}</p>`;
        }
    }
}

// =========================================================================
// 5. HILFSFUNKTION: Zerlegt den CSV-Text fehlerfrei in nutzbare Daten
// =========================================================================
function parseSheetsCSV(csvText) {
    const lines = csvText.replace(/\r/g, "").split("\n");
    if (lines.length < 2) return {};

    // Erkennt automatisch, ob Excel/Google Semikolons (;) oder Kommas (,) genutzt hat
    const delimiter = csvText.includes(';') ? ';' : ',';

    // 🎯 KORREKTUR: Holt die Überschriften sauber aus der ersten Zeile (Index 0)
    const headers = lines[0].split(delimiter).map(h => h.trim());
    const result = {};

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const currentLine = lines[i].split(delimiter);
        const id = currentLine[0] ? currentLine[0].trim() : '';
        
        if (!id) continue;

        result[id] = {};
        for (let j = 1; j < headers.length; j++) {
            if (currentLine[j] !== undefined) {
                result[id][headers[j]] = currentLine[j].trim();
            }
        }
    }
    return result;
}

// =========================================================================
// 3. FILTER OPTIONEN DYNAMISCH BEFÜLLEN
// =========================================================================
function initClassFilter() {
    if (!classSelect || carsArray.length === 0) return;

    const classes = [...new Set(carsArray.map(car => car.Class).filter(Boolean))];
    classes.sort((a, b) => getClassName(a).localeCompare(getClassName(b)));

    classSelect.innerHTML = '<option value="all">Alle Klassen</option>';
    classes.forEach(cls => {
        classSelect.innerHTML += `<option value="${cls}">${getClassName(cls)}</option>`;
    });
}

function updateBrandFilter() {
    if (!brandSelect || !classSelect) return;

    const selectedClass = classSelect.value;
    const savedSelectedBrand = brandSelect.value; // Sichert den aktuellen Wert (z.B. "BMW")

    // 1. Alle Autos filtern, die zur aktuell gewählten Klasse gehören
    const carsInSelectedClass = carsArray.filter(car => {
        return selectedClass === 'all' || String(car.Class) === selectedClass;
    });

    // 2. Zählen, wie oft jede Marke in dieser Klasse vorkommt
    const brandCounts = {};
    carsInSelectedClass.forEach(car => {
        const brandName = car.BrandName || car.TeamName || 'Unbekannt';
        if (!brandCounts[brandName]) {
            brandCounts[brandName] = 0;
        }
        brandCounts[brandName]++;
    });

    const availableBrands = Object.keys(brandCounts).sort();

    // 3. Dropdown befüllen: Der "value" bleibt REIN ("BMW"), nur der Text kriegt die Klammer
    brandSelect.innerHTML = '<option value="all">Alle Hersteller</option>';
    availableBrands.forEach(brand => {
        const count = brandCounts[brand];
        brandSelect.innerHTML += `<option value="${brand}">${brand} (${count})</option>`;
    });

    // 4. Vorherige Auswahl sauber wiederherstellen (da value jetzt klammerfrei ist)
    if (availableBrands.includes(savedSelectedBrand)) {
        brandSelect.value = savedSelectedBrand;
    } else {
        brandSelect.value = 'all';
    }
}

// =========================================================================
// 4. AUTOS FILTERN, SUCHEN UND ALLE LACKIERUNGEN (LIVERIES) ANZEIGEN
// =========================================================================
function renderCars() {
    if (!carContainer) return;

    const selectedClass = classSelect ? classSelect.value : 'all';
    const selectedBrand = brandSelect ? brandSelect.value : 'all';
    const searchQuery = (searchInput) ? searchInput.value.toLowerCase().trim() : '';

    // Wenn "Alle Klassen" aktiv ist, zeigen wir den gewünschten Hinweis
    if (selectedClass === 'all') {
        carContainer.innerHTML = `
            <p style="grid-column: 1 / -1; text-align: center; color: #64748b; font-size: 16px; margin-top: 40px;">
                🏁 Bitte wähle zuerst oben eine <b>Klasse</b> aus, um die Fahrzeuge anzuzeigen.
            </p>
        `;
        return;
    }

    // 1. SCHRITT: Wir filtern zuerst die Basis-Autos nach Klasse und Marke
    const filteredCars = carsArray.filter(car => {
        const matchesClass = (String(car.Class) === selectedClass);
        const currentBrand = car.BrandName || car.TeamName || 'Unbekannt';
        const matchesBrand = (selectedBrand === 'all' || currentBrand === selectedBrand);
        return matchesClass && matchesBrand;
    });

    // 2. SCHRITT: Wir brechen die Autos in eine flache Liste ALLER einzelnen Designs auf
    const allLiveriesToShow = [];

    filteredCars.forEach(car => {
        // Fall A: Das Auto hat eine Liste mit mehreren Lackierungen
        if (car.liveries && Array.isArray(car.liveries) && car.liveries.length > 0) {
            car.liveries.forEach(livery => {
                allLiveriesToShow.push({
                    carObject: car, // Referenz zum Hauptauto für Klasse/Marke
                    liveryId: livery.Id,
                    displayName: car.Name,
                    liveryName: livery.Name,
                    teamName: livery.TeamName || car.TeamName || 'Privatteam',
                    drivers: livery.drivers || []
                });
            });
        } 
        // Fall B: Das Fahrzeug liegt flach in der JSON (keine eigene liveries-Liste)
        else {
            allLiveriesToShow.push({
                carObject: car,
                liveryId: car.Id,
                displayName: car.Name,
                liveryName: car.Name.startsWith('#') ? car.Name : 'Standard Design',
                teamName: car.TeamName || 'Privatteam',
                drivers: car.drivers || []
            });
        }
    });

    // 3. SCHRITT: Freitext-Suche auf die gesammelten Designs anwenden
    const finalFilteredLiveries = allLiveriesToShow.filter(item => {
        if (searchQuery === "") return true;

        const carNameMatches = (item.displayName && item.displayName.toLowerCase().includes(searchQuery));
        const brandNameMatches = (item.carObject.BrandName && item.carObject.BrandName.toLowerCase().includes(searchQuery));
        const teamNameMatches = (item.teamName && item.teamName.toLowerCase().includes(searchQuery));
        const liveryNameMatches = (item.liveryName && item.liveryName.toLowerCase().includes(searchQuery));
        
        let driverString = "";
        if (Array.isArray(item.drivers)) {
            driverString = item.drivers.map(d => `${d.Forename} ${d.Surname}`).join(' ');
        }
        const driverMatches = driverString.toLowerCase().includes(searchQuery);

        return carNameMatches || brandNameMatches || teamNameMatches || liveryNameMatches || driverMatches;
    });

    // 4. SCHRITT: Karten für jedes einzelne Design rendern
    carContainer.innerHTML = finalFilteredLiveries.map(item => {
        const car = item.carObject;

        // Fahrer für dieses spezifische Design auflisten
        const driverInfo = (Array.isArray(item.drivers) && item.drivers.length > 0)
            ? item.drivers.map(d => `${d.Forename} ${d.Surname}`).join(', ')
            : 'Kein Fahrer eingetragen';

        // Deine exakt funktionierende Bild-Logik mit funktionierender Verkettung
        const imageUrl = "http://game.raceroom.com/store/image_redirect?id=" + item.liveryId + "&size=small";

        const imageHtml = item.liveryId 
            ? `<img src="${imageUrl}" 
                    alt="${item.displayName}" 
                    style="width: 100%; height: 150px; object-fit: contain; border-radius: 4px; margin-bottom: 12px; background-color: #f0f0f0; display: block;"
                    onerror="this.onerror=null; this.src='https://placehold.co';">`
            : `<div style="width: 100%; height: 150px; background-color: #e9ecef; border-radius: 4px; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; color: #6c757d;">Keine Bild-ID</div>`;

        // Intelligenter Name ohne doppelte Marken
        const brand = car.BrandName || '';
        const name = item.displayName || '';
        const finalTitle = name.startsWith(brand) ? name : (brand ? brand + ' ' : '') + name;

        return `
            <div class="car-card">
                <div>
                    ${imageHtml}
                    <h3>${finalTitle}</h3>
                    <div style="margin: 10px 0; font-size: 14px; line-height: 1.4;">
                        <p style="margin: 4px 0;">🎨 <strong>Design:</strong> <strong>${item.liveryName}</strong> (${item.teamName})</p>
                        <p style="margin: 4px 0;">👤 <strong>Fahrer:</strong> ${driverInfo}</p>
                        
                        <!-- 🎯 HIER WERDEN DEINE NEUEN ZUSATZINFOS ANGEZEIGT -->
                        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee; color: #555; font-size: 13px;">
			    <p style="margin: 3px 0;">🌏 <strong>Nation:</strong> ${car.Nation || 'Keine Angabe'}</p>	
                            <p style="margin: 3px 0;">📅 <strong>Baujahr:</strong> ${car.Baujahr || 'Keine Angabe'}</p>
                            <p style="margin: 3px 0;">⚡ <strong>Leistung:</strong> ${car.Leistung || 'N/A'}</p>
                            <p style="margin: 3px 0;">⚖️ <strong>Gewicht:</strong> ${car.Gewicht || 'N/A'}</p>
			    <p style="margin: 3px 0;">⚡ <strong>Motor:</strong> ${car.Motor || 'N/A'}</p>
                            <p style="margin: 3px 0;">🚶‍♂️‍➡️ <strong>Antrieb:</strong> ${car.Antrieb || 'N/A'}</p>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 12px;">
                    <span class="tag">Klasse: ${getClassName(car.Class)}</span>
                    <span class="tag">Hersteller: ${car.BrandName || car.TeamName || 'N/A'}</span>
                </div>
            </div>
        `;
    }).join('');
    
    if (finalFilteredLiveries.length === 0) {
        carContainer.innerHTML = '<p>Keine Fahrzeuge für diese Suche/Auswahl gefunden.</p>';
    }
}
// =========================================================================
// 5. EVENT LISTENER & START
// =========================================================================
if (classSelect) {
    classSelect.addEventListener('change', () => {
        updateBrandFilter();
        renderCars();
    });
}
if (brandSelect) brandSelect.addEventListener('change', renderCars);
if (searchInput) searchInput.addEventListener('input', renderCars);

loadData();