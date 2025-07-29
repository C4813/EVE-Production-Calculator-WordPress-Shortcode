<?php
/*
Plugin Name: EVE Production Calculator
Description: Adds a shortcode [eve_production_calculator] which allows users to see the build requirements for any blueprint in EVE Online.
Version: 0.3
Author: C4813
*/

defined('ABSPATH') or die('No script kiddies please!');

function eve_production_calculator_styles() {
    wp_enqueue_style('eve-production-calculator-style', plugin_dir_url(__FILE__) . 'style.css');
}
add_action('wp_enqueue_scripts', 'eve_production_calculator_styles');

function eve_production_calculator_shortcode() {
    $materials_url = esc_url(plugin_dir_url(__FILE__) . 'industryActivityMaterials.json');
    $nameid_url = esc_url(plugin_dir_url(__FILE__) . 'invTypes.json');

    ob_start(); ?>
    <div class="eve-materials-container">
        <input type="text" id="eve-item-name" placeholder="Enter item name" />
        <button id="calculate-btn">Calculate</button>
        <div id="eve-materials-output" class="eve-materials-result"></div>
        <div id="resolve-layers-button" style="display:none; margin-top: 10px;">
            <button id="resolve-btn">Resolve All Layers</button>
        </div>
        <div id="eve-materials-recursive-output" class="eve-materials-result"></div>
    </div>

    <script>
    (function(){
        const materialsUrl = '<?php echo $materials_url; ?>';
        const nameidUrl = '<?php echo $nameid_url; ?>';

        let materialData = null;
        let nameToID = null;
        let typeIDToName = {};
        let materialMap = {};

        let currentMaterials = [];
        let currentRootTypeID = null;
        let currentRootName = null;

        async function loadJSON(url) {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Could not load ' + url);
            return res.json();
        }

        async function initializeData() {
            if (!materialData) {
                materialData = await loadJSON(materialsUrl);
                materialMap = {};
                for (const entry of materialData) {
                    materialMap[parseInt(entry.typeID)] = entry.materials;
                }
            }
            if (!nameToID) {
                nameToID = await loadJSON(nameidUrl);
                typeIDToName = {};
                for (const [name, id] of Object.entries(nameToID)) {
                    typeIDToName[parseInt(id)] = name;
                }
            }
        }

        async function lookupMaterials() {
            await initializeData();

            const nameInput = document.getElementById('eve-item-name').value.trim();
            const output = document.getElementById('eve-materials-output');
            const resolveBtnDiv = document.getElementById('resolve-layers-button');
            const recursiveOutput = document.getElementById('eve-materials-recursive-output');

            resolveBtnDiv.style.display = 'none';
            recursiveOutput.innerHTML = '';
            output.innerHTML = '';

            if (!nameInput) {
                output.textContent = 'Please enter an item name.';
                return;
            }

            const lowerName = nameInput.toLowerCase();
            const matchKey = Object.keys(nameToID).find(k => k.toLowerCase() === lowerName);
            const typeID = matchKey ? parseInt(nameToID[matchKey]) : null;

            if (!typeID) {
                output.textContent = 'Item not found.';
                return;
            }

            const materials = materialMap[typeID]?.filter(m => m.activityID === 1) || [];
            currentMaterials = materials.map(m => ({ ...m }));
            currentRootTypeID = typeID;
            currentRootName = matchKey;

            if (materials.length === 0) {
                output.textContent = 'No manufacturing materials found.';
                return;
            }

            const hasExtraLayers = materials.some(mat => {
                // Check direct manufacturing materials
                let nested = materialMap[mat.materialTypeID];
                if (nested && nested.some(nm => nm.activityID === 1 && nm.quantity > 0)) {
                    return true;
                }
                // Check blueprint materials if direct none found
                const matName = typeIDToName[mat.materialTypeID];
                if (!matName) return false;
                const blueprintName = matName + " Blueprint";
                const blueprintID = nameToID[blueprintName] ? parseInt(nameToID[blueprintName]) : null;
                if (!blueprintID) return false;
                nested = materialMap[blueprintID];
                return nested && nested.some(nm => nm.activityID === 1 && nm.quantity > 0);
            });

            let html = `<h4>Materials for ${matchKey}</h4>`;
            for (const mat of materials) {
                const matName = typeIDToName[mat.materialTypeID] || `Type ID: ${mat.materialTypeID}`;
                html += `<div>${matName} x${mat.quantity.toLocaleString()}</div>`;
            }
            output.innerHTML = html;

            resolveBtnDiv.style.display = hasExtraLayers ? 'block' : 'none';
        }

        async function getIndentedMaterialsHTML(typeID, multiplier, depth = 1) {
            let materials = materialMap[typeID]?.filter(m => m.activityID === 1);

            if ((!materials || materials.length === 0) && typeIDToName[typeID]) {
                const blueprintName = typeIDToName[typeID] + " Blueprint";
                const blueprintID = nameToID[blueprintName] ? parseInt(nameToID[blueprintName]) : null;
                if (blueprintID) {
                    materials = materialMap[blueprintID]?.filter(m => m.activityID === 1);
                }
            }

            if (!materials || materials.length === 0) return '';

            let html = '';
            for (const mat of materials) {
                const matID = mat.materialTypeID;
                const qty = mat.quantity * multiplier;
                const name = typeIDToName[matID] || `Type ID: ${matID}`;

                html += `<div class="indented-material depth-${depth}">${name} x${qty.toLocaleString()}</div>`;
                html += await getIndentedMaterialsHTML(matID, qty, depth + 1);
            }
            return html;
        }

        async function resolveAllLayers() {
            const recursiveOutput = document.getElementById('eve-materials-recursive-output');
            recursiveOutput.innerHTML = `<h4>Resolved Materials for ${currentRootName}</h4>`;

            for (let i = 0; i < currentMaterials.length; i++) {
                const mat = currentMaterials[i];
                const matName = typeIDToName[mat.materialTypeID] || `Type ID: ${mat.materialTypeID}`;
                const qty = mat.quantity;

                let html = `<div class="component-block"><strong>${matName} x${qty.toLocaleString()}</strong>`;
                html += await getIndentedMaterialsHTML(mat.materialTypeID, qty);
                html += '</div>';

                recursiveOutput.innerHTML += html;
            }
        }

        document.getElementById('calculate-btn').addEventListener('click', lookupMaterials);
        document.getElementById('resolve-btn').addEventListener('click', resolveAllLayers);
    })();
    </script>
    <?php
    return ob_get_clean();
}

add_shortcode('eve_production_calculator', 'eve_production_calculator_shortcode');
