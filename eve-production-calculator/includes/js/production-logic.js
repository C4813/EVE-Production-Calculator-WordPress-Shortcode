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
        if (typeof data === 'object' && data.typeID && data.marketGroupID) {
          typeIDToName[data.typeID] = name;
          typeIDToMarketGroup[data.typeID] = data.marketGroupID.toString();
        } else if (typeof data === 'string' || typeof data === 'number') {
          const typeIDNum = parseInt(data);
          typeIDToName[typeIDNum] = name;
        }
      }
    }
    if (!marketGroups) {
      marketGroups = await loadJSON(marketGroupsUrl);
    }
  }

  function isShip(marketGroupID) {
    let currentID = marketGroupID?.toString();
    if (!currentID || !(currentID in marketGroups)) return false;

    let prevID = null;
    while (currentID !== "None") {
      prevID = currentID;
      currentID = marketGroups[currentID]?.parentGroupID;
      if (currentID === undefined) break;
    }
    return prevID === "4";
  }

  function getChildrenForMaterial(matID, name) {
    const fallbackName = typeIDToName[matID];
    const searchName = name && name !== `Type ID: ${matID}` ? name : fallbackName;
    if (!searchName) return null;

    let children = materialMap[matID]?.filter(m => m.activityID === 1 && m.quantity > 0);
    if (Array.isArray(children) && children.length > 0) {
      return children;
    }

    const blueprintName = searchName + " Blueprint";
    const blueprintEntry = nameToID[blueprintName];
    const blueprintID = blueprintEntry
      ? (typeof blueprintEntry === 'object' ? blueprintEntry.typeID : parseInt(blueprintEntry))
      : null;

    if (!blueprintID) return null;

    const blueprintChildren = materialMap[blueprintID]?.filter(m => m.activityID === 1 && m.quantity > 0);
    if (!Array.isArray(blueprintChildren) || blueprintChildren.length === 0) {
      return null;
    }

    return blueprintChildren;
  }

  async function getIndentedMaterialsHTMLUnique(typeID, multiplier, depth = 1, seen) {
    const alreadySeen = seen.has(typeID);
    seen.set(typeID, true);

    let materials = materialMap[typeID]?.filter(m => m.activityID === 1);
    if ((!materials || materials.length === 0) && typeIDToName[typeID]) {
      const blueprintName = typeIDToName[typeID] + " Blueprint";
      const blueprintID = nameToID[blueprintName]
        ? (typeof nameToID[blueprintName] === "object"
            ? nameToID[blueprintName].typeID
            : parseInt(nameToID[blueprintName]))
        : null;
      if (blueprintID) {
        materials = materialMap[blueprintID]?.filter(m => m.activityID === 1);
      }
    }

    if (!materials || materials.length === 0) return "";

    let html = "";
    for (const mat of materials) {
      const matID = mat.materialTypeID;
      const qty = mat.quantity * multiplier;
      if (!qty || qty <= 0) continue;

      const name = typeIDToName[matID] || `Type ID: ${matID}`;
      const children = getChildrenForMaterial(matID, name);
      const hasChildren = !!children;

      let classes = `indented-material depth-${depth}`;
      classes += hasChildren ? " has-child" : " is-child";

      html += `<div class="${classes}" data-name="${name}" data-qty="${qty}">${name} x${qty.toLocaleString()} ${isShip(typeIDToMarketGroup[matID]) ? "YES" : "NO"}</div>`;

      if (hasChildren && !alreadySeen) {
        html += await getIndentedMaterialsHTMLUnique(matID, qty, depth + 1, seen);
      }
    }

    return html;
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
    let matchKey = Object.keys(nameToID).find(k => k.toLowerCase() === lowerInput);
    let typeID = matchKey ? (typeof nameToID[matchKey] === 'object' ? nameToID[matchKey].typeID : parseInt(nameToID[matchKey])) : null;

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
      const matName = typeIDToName[mat.materialTypeID];
      const children = getChildrenForMaterial(mat.materialTypeID, matName);
      return !!children;
    });

    let html = `<h4>Materials for ${matchKey}</h4>`;
    for (const mat of materials) {
      const matName = typeIDToName[mat.materialTypeID] || `Type ID: ${mat.materialTypeID}`;
      html += `<div class="top-material" data-name="${matName}" data-qty="${mat.quantity}">${matName} x${mat.quantity.toLocaleString()}</div>`;
    }
    output.innerHTML = html;

    if (hasExtraLayers) {
      resolveBtnDiv.style.display = 'block';
    } else {
      copyContainer.style.display = 'block';
      copyAllBtn.style.display = 'inline-block';
    }
  }

  async function resolveAllLayers() {
    await initializeData();
    const recursiveOutput = document.getElementById('eve-materials-recursive-output');
    recursiveOutput.innerHTML = `<h4>Resolved Materials for ${currentRootName}</h4>`;

    const seen = new Map();
    for (const mat of currentMaterials) {
      const matName = typeIDToName[mat.materialTypeID] || `Type ID: ${mat.materialTypeID}`;
      const qty = mat.quantity;
      const children = getChildrenForMaterial(mat.materialTypeID, matName);
      const hasChildren = !!children;

      const topClass = `indented-material depth-1 ${hasChildren ? 'has-child' : 'is-child'}`;

      const componentHTML = await getIndentedMaterialsHTMLUnique(mat.materialTypeID, qty, 1, seen);

      let html = `<div class="component-block">`;
      html += `<div class="${topClass}" data-name="${matName}" data-qty="${qty}">${matName} x${qty.toLocaleString()} ${isShip(typeIDToMarketGroup[mat.materialTypeID]) ? "YES" : "NO"}</div>`;
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
    const initialMap = new Map();

    container.querySelectorAll('.top-material').forEach(el => {
      const name = el.dataset.name;
      const qty = parseInt(el.dataset.qty, 10);
      if (!name || isNaN(qty)) return;
      initialMap.set(name, qty);
    });

    container.querySelectorAll('.top-material, .indented-material').forEach(el => {
      const name = el.dataset.name;
      const qty = parseInt(el.dataset.qty, 10);
      if (!name || isNaN(qty)) return;

      let shouldCopy = false;
      if (type === 'all') {
        shouldCopy = true;
      } else if (type === 'parent') {
        shouldCopy = el.classList.contains('has-child');
      } else if (type === 'leaf') {
        shouldCopy = el.classList.contains('is-child');
      }

      if (shouldCopy) {
        allMap.set(name, (allMap.get(name) || 0) + qty);
      }
    });

    for (const [name, qty] of initialMap.entries()) {
      if (!allMap.has(name)) {
        allMap.set(name, qty);
      }
    }

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
