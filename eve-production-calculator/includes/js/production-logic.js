document.addEventListener('DOMContentLoaded', () => {
  const materialsUrl = productionCalculatorVars.materialsUrl;
  const nameidUrl = productionCalculatorVars.nameidUrl;
  const marketGroupsUrl = productionCalculatorVars.marketGroupsUrl;

  let materialData = null;
  let nameToID = null;
  let typeIDToName = {};
  let materialMap = {};
  let marketGroups = null;
  let typeIDToMarketGroup = {};

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
      typeIDToMarketGroup = {};
      for (const [name, data] of Object.entries(nameToID)) {
        // Your invTypes.json format keyed by name with object { typeID:..., marketGroupID:... }
        if (typeof data === 'object' && data.typeID && data.marketGroupID) {
          typeIDToName[data.typeID] = name;
          typeIDToMarketGroup[data.typeID] = data.marketGroupID.toString();
        } else if (typeof data === 'string' || typeof data === 'number') {
          // fallback if old format (just typeID number)
          const typeIDNum = parseInt(data);
          typeIDToName[typeIDNum] = name;
        }
      }
    }
    if (!marketGroups) {
      marketGroups = await loadJSON(marketGroupsUrl);
    }
  }

  // Traverse marketGroups parents until 'None', return true if ultimate parent is '4' (Ships)
  function isShip(marketGroupID) {
    let currentID = marketGroupID?.toString();
    if (!currentID || !(currentID in marketGroups)) return false;

    let prevID = null;
    while (currentID !== "None") {
      prevID = currentID;
      currentID = marketGroups[currentID]?.parentGroupID;
      if (currentID === undefined) break; // safety break
    }
    return prevID === "4";
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

    const lowerInput = nameInput.toLowerCase();

    // Try to match original input
    let matchKey = Object.keys(nameToID).find(k => k.toLowerCase() === lowerInput);
    let typeID = matchKey ? (typeof nameToID[matchKey] === 'object' ? nameToID[matchKey].typeID : parseInt(nameToID[matchKey])) : null;

    // If not found or no manufacturing data, try appending ' Blueprint'
    let materials = materialMap[typeID]?.filter(m => m.activityID === 1) || [];
    if ((!matchKey || materials.length === 0) && !lowerInput.endsWith('blueprint')) {
      const blueprintName = nameInput + " Blueprint";
      const blueprintKey = Object.keys(nameToID).find(k => k.toLowerCase() === blueprintName.toLowerCase());
      if (blueprintKey) {
        matchKey = blueprintKey;
        typeID = typeof nameToID[blueprintKey] === 'object' ? nameToID[blueprintKey].typeID : parseInt(nameToID[blueprintKey]);
        materials = materialMap[typeID]?.filter(m => m.activityID === 1) || [];
      }
    }

    if (!matchKey || materials.length === 0) {
      output.textContent = 'No manufacturing materials found.';
      return;
    }

    currentMaterials = materials.map(m => ({ ...m }));
    currentRootTypeID = typeID;
    currentRootName = matchKey;

    const hasExtraLayers = materials.some(mat => {
      let nested = materialMap[mat.materialTypeID];
      if (nested && nested.some(nm => nm.activityID === 1 && nm.quantity > 0)) return true;
      const matName = typeIDToName[mat.materialTypeID];
      if (!matName) return false;
      const blueprintName = matName + " Blueprint";
      const blueprintID = nameToID[blueprintName] ? (typeof nameToID[blueprintName] === 'object' ? nameToID[blueprintName].typeID : parseInt(nameToID[blueprintName])) : null;
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
      const blueprintID = nameToID[blueprintName] ? (typeof nameToID[blueprintName] === 'object' ? nameToID[blueprintName].typeID : parseInt(nameToID[blueprintName])) : null;
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

      // Check if this material has children
      let children = materialMap[matID];
      if ((!children || children.length === 0) && nameToID[name + " Blueprint"]) {
        const blueprintID = nameToID[name + " Blueprint"];
        children = materialMap[blueprintID];
      }

      let classes = `indented-material depth-${depth}`;
      if (Array.isArray(children) && children.some(m => m.activityID === 1)) {
        classes += ' has-child';
      } else {
        classes += ' is-child';
      }

      html += `<div class="${classes}" data-name="${name}" data-qty="${qty}">${name} x${qty.toLocaleString()} ${isShip(typeIDToMarketGroup[matID]) ? "YES" : "NO"}</div>`;
      html += await getIndentedMaterialsHTML(matID, qty, depth + 1);
    }

    return html;
  }

  async function resolveAllLayers() {
    await initializeData();

    const recursiveOutput = document.getElementById('eve-materials-recursive-output');
    recursiveOutput.innerHTML = `<h4>Resolved Materials for ${currentRootName}</h4>`;

    for (const mat of currentMaterials) {
      const matName = typeIDToName[mat.materialTypeID] || `Type ID: ${mat.materialTypeID}`;
      const qty = mat.quantity;

      let componentHTML = await getIndentedMaterialsHTML(mat.materialTypeID, qty);

      // Fallback: ensure even unresolvable top-level materials are rendered
      if (!componentHTML) {
        componentHTML = `<div class="indented-material depth-1" data-name="${matName}" data-qty="${qty}">${matName} x${qty.toLocaleString()} ${isShip(typeIDToMarketGroup[mat.materialTypeID]) ? "YES" : "NO"}</div>`;
      }

      let html = `<div class="component-block"><strong>${matName} x${qty.toLocaleString()} ${isShip(typeIDToMarketGroup[mat.materialTypeID]) ? "YES" : "NO"}</strong>`;
      html += componentHTML;
      html += '</div>';

      recursiveOutput.innerHTML += html;
    }

    document.getElementById('copy-button-container').style.display = 'block';
    document.getElementById('copy-parent-btn').style.display = 'inline-block';
    document.getElementById('copy-leaf-btn').style.display = 'inline-block';
    document.getElementById('copy-all-btn').style.display = 'none';
  }

  function copyResolvedLayers(type) {
    const container = document.getElementById('eve-materials-recursive-output');
    const allMap = new Map();

    // Get all component blocks (top-level containers)
    const componentBlocks = container.querySelectorAll('.component-block');

    // Set to hold parent names (elements that have children)
    const parents = new Set();

    // Add all .indented-material.has-child to parents set
    container.querySelectorAll('.indented-material.has-child').forEach(el => {
      parents.add(el.dataset.name);
    });

    // Check each component-block's top-material and if it has any .indented-material children, mark top-material as parent
    componentBlocks.forEach(block => {
      const topMaterial = block.querySelector('.top-material');
      const indentedChildren = block.querySelectorAll('.indented-material');
      if (topMaterial && indentedChildren.length > 0) {
        parents.add(topMaterial.dataset.name);
      }
    });

    // Now collect all materials inside the container
    const elements = container.querySelectorAll('.indented-material, .top-material');

    elements.forEach(el => {
      const name = el.dataset.name;
      const qty = parseInt(el.dataset.qty, 10);
      if (!name || isNaN(qty)) return;

      let shouldCopy = false;

      if (type === 'all') {
        shouldCopy = true;
      } else if (type === 'parent') {
        shouldCopy = parents.has(name);
      } else if (type === 'leaf') {
        shouldCopy = !parents.has(name);
      }

      if (shouldCopy) {
        allMap.set(name, (allMap.get(name) || 0) + qty);
      }
    });

    const output = Array.from(allMap.entries())
      .map(([name, qty]) => `${name} x${qty.toLocaleString()}`)
      .join('\n');

    navigator.clipboard.writeText(output);
  }

  document.getElementById('calculate-btn').addEventListener('click', lookupMaterials);
  document.getElementById('resolve-btn').addEventListener('click', resolveAllLayers);
  document.getElementById('copy-parent-btn').addEventListener('click', () => copyResolvedLayers('parent'));
  document.getElementById('copy-leaf-btn').addEventListener('click', () => copyResolvedLayers('leaf'));
  document.getElementById('copy-all-btn').addEventListener('click', () => copyResolvedLayers('all'));
});
