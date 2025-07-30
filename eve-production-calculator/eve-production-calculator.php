<?php
/*
Plugin Name: EVE Production Calculator
Description: Adds a shortcode [eve_production_calculator] which allows users to see the build requirements for any blueprint in EVE Online.
Version: 0.3.4
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
        <div id="copy-button-container" style="display:none; margin-top:10px;">
            <button id="copy-all-btn" style="display:none;">Copy All</button>
            <button id="copy-parent-btn" style="display:none; margin-right:10px;">Copy Parent Layers</button>
            <button id="copy-leaf-btn" style="display:none;">Copy Leaf Layers</button>
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
            const copyContainer = document.getElementById('copy-button-container');
            const copyAllBtn = document.getElementById('copy-all-btn');
            const copyParentBtn = document.getElementById('copy-parent-btn');
            const copyLeafBtn = document.getElementById('copy-leaf-btn');

            resolveBtnDiv.style.display = 'none';
            recursiveOutput.innerHTML = '';
            output.innerHTML = '';
            copyContainer.style.display = 'none';
            copyAllBtn.style.display = 'none';
            copyParentBtn.style.display = 'none';
            copyLeafBtn.style.display = 'none';

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
                let nested = materialMap[mat.materialTypeID];
                if (nested && nested.some(nm => nm.activityID === 1 && nm.quantity > 0)) return true;
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
                html += `<div class="top-material">${matName} x${mat.quantity.toLocaleString()}</div>`;
            }
            output.innerHTML = html;

            if (hasExtraLayers) {
                resolveBtnDiv.style.display = 'block';
            } else {
                copyContainer.style.display = 'block';
                copyAllBtn.style.display = 'inline-block';
            }
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
                if (!qty || qty <= 0) continue;
        
                const name = typeIDToName[matID] || `Type ID: ${matID}`;
        
                let children = materialMap[matID];
                if ((!children || children.length === 0) && nameToID[name + " Blueprint"]) {
                    const blueprintID = nameToID[name + " Blueprint"];
                    children = materialMap[blueprintID];
                }
        
                const isParent = children && children.some(m => m.activityID === 1);
        
                let classes = `indented-material depth-${depth}`;
                if (isParent) {
                    classes += ' has-child';
                } else {
                    classes += ' is-child';
                }
        
                html += `<div class="${classes}" data-name="${name}" data-qty="${qty}">${name} x${qty.toLocaleString()}</div>`;
                html += await getIndentedMaterialsHTML(matID, qty, depth + 1);
            }
            return html;
        }

        async function resolveAllLayers() {
            await initializeData();
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

            document.getElementById('copy-button-container').style.display = 'block';
            document.getElementById('copy-parent-btn').style.display = 'inline-block';
            document.getElementById('copy-leaf-btn').style.display = 'inline-block';
            document.getElementById('copy-all-btn').style.display = 'none';
        }

        function copyResolvedLayers(type) {
            const all = document.querySelectorAll('.indented-material');
        
            // Fallback for when no resolved layers exist
            const noResolvedLayers = all.length === 0;
        
            if ((type === 'parent' || type === 'all') && (noResolvedLayers || type === 'parent')) {
                if (!currentMaterials || currentMaterials.length === 0) return;
        
                const output = currentMaterials
                    .map(mat => {
                        const name = typeIDToName[mat.materialTypeID] || `Type ID: ${mat.materialTypeID}`;
                        return `${name} x${mat.quantity.toLocaleString()}`;
                    })
                    .join('\n');
        
                navigator.clipboard.writeText(output);
                return;
            }
        
            // Otherwise: copy from resolved indented DOM elements
            const map = new Map();
        
            all.forEach(el => {
                const name = el.dataset.name;
                const qty = parseInt(el.dataset.qty);
                const isLeaf = el.classList.contains('is-child');
        
                const shouldCopy =
                    (type === 'all') ||
                    (type === 'leaf' && isLeaf);
        
                if (shouldCopy) {
                    if (!map.has(name)) map.set(name, 0);
                    map.set(name, map.get(name) + qty);
                }
            });
        
            const output = Array.from(map.entries())
                .map(([name, qty]) => `${name} x${qty.toLocaleString()}`)
                .join('\n');
        
            navigator.clipboard.writeText(output);
        }

        document.getElementById('calculate-btn').addEventListener('click', lookupMaterials);
        document.getElementById('resolve-btn').addEventListener('click', resolveAllLayers);
        document.getElementById('copy-parent-btn').addEventListener('click', () => copyResolvedLayers('parent'));
        document.getElementById('copy-leaf-btn').addEventListener('click', () => copyResolvedLayers('leaf'));
        document.getElementById('copy-all-btn').addEventListener('click', () => copyResolvedLayers('all'));
    })();
    </script>
    <?php
    return ob_get_clean();
}
add_shortcode('eve_production_calculator', 'eve_production_calculator_shortcode');
