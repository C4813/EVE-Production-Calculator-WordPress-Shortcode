document.addEventListener('DOMContentLoaded', () => {
  // Enforce positive decimal input and auto-select on focus for tax (%) fields
  function setupPositiveDecimalInputById(id) {
    const el = document.getElementById(id);
    if (!el) return;

    // Use a text input style sanitation to allow decimals robustly across locales
    const selectAll = () => el.select();
    el.setAttribute('inputmode', 'decimal');

    // Auto-select when focusing/clicking
    el.addEventListener('focus', selectAll);
    el.addEventListener('click', selectAll);
    el.addEventListener('mouseup', (e) => { e.preventDefault(); });

    // Allow digits and one decimal separator ('.' or ','); convert ',' -> '.'
    function sanitize(raw) {
      if (raw == null) return '';
      let v = String(raw).replace(',', '.');
      v = v.replace(/[^\d.]/g, '');
      const firstDot = v.indexOf('.');
      if (firstDot !== -1) {
        v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
      }
      if (v.startsWith('.')) v = '0' + v;     // ".5" → "0.5"
      v = v.replace(/^-+/, '');               // no negatives
      return v;
    }

    el.addEventListener('beforeinput', (e) => {
      const data = e.data;
      if (data == null) return;
      if (!/[0-9.,]/.test(data)) e.preventDefault();
    });

    el.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const clean = sanitize(text);
      document.execCommand('insertText', false, clean);
    });

    el.addEventListener('input', () => {
      const before = el.value;
      const after = sanitize(before);
      if (before !== after) {
        el.value = after;
        try { el.setSelectionRange(after.length, after.length); } catch {}
      }
    });

    el.addEventListener('blur', () => {
      const v = sanitize(el.value);
      if (v === '' || v === '.') { el.value = ''; return; }
      const num = Number(v);
      if (isNaN(num)) { el.value = ''; return; }
      const clamped = Math.max(0, Math.min(100, num));
      el.value = String(clamped);
    });
  }

  // Apply to known tax inputs
  setupPositiveDecimalInputById('hull-other-mod');
  setupPositiveDecimalInputById('comp-other-mod');

  function escapeHTML(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const materialsUrl = productionCalculatorVars.materialsUrl;
  const invTypesUrl = productionCalculatorVars.nameidUrl;
  const marketGroupsUrl = productionCalculatorVars.marketGroupsUrl;

  let materialData = null;
  let nameToID = null;
  let typeIDToName = {};
  let typeIDToMarketGroup = {};
  let materialMap = {};
  let marketGroups = null;

  let currentMaterials = [];
  let currentRootTypeID = null;
  let currentRootName = null;

  // Robust JSON fetch helper (avoids scope issues with prior 'loadJSON' references)
  const fetchJSON = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Could not load ' + url);
    return res.json();
  };

  async function initializeData() {
    if (!materialData) {
      materialData = await fetchJSON(materialsUrl);
      materialMap = {};
      for (const entry of materialData) {
        materialMap[parseInt(entry.typeID)] = entry.materials;
      }
    }
    if (!nameToID) {
      nameToID = await fetchJSON(invTypesUrl);
      typeIDToName = {};
      typeIDToMarketGroup = {};
      for (const [name, data] of Object.entries(nameToID)) {
        if (typeof data === 'object' && data.typeID && data.marketGroupID) {
          typeIDToName[data.typeID] = name;
          typeIDToMarketGroup[data.typeID] = data.marketGroupID;
        } else {
          const typeIDNum = parseInt(data, 10);
          if (!Number.isNaN(typeIDNum)) {
            typeIDToName[typeIDNum] = name;
          }
        }
      }
    }
    if (!marketGroups) {
      marketGroups = await fetchJSON(marketGroupsUrl);
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

      const childIsShip = isShip(typeIDToMarketGroup[matID]) ? '1' : '0';

      html += `<div class="${classes}" data-isship="${childIsShip}" data-name="${name}" data-qty="${qty}">${escapeHTML(name)} x${qty.toLocaleString()}</div>`;

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
      const topIsShip = isShip(typeIDToMarketGroup[mat.materialTypeID]) ? '1' : '0';

      const componentHTML = await getIndentedMaterialsHTMLUnique(mat.materialTypeID, qty, 1, seen);

      let html = `<div class="component-block">`;
      html += `<div class="${topClass}" data-isship="${topIsShip}" data-name="${matName}" data-qty="${qty}">${escapeHTML(matName)} x${qty.toLocaleString()}</div>`;
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
  if (!container) return;
  const allMap = new Map();

  const copyFromCurrentMaterials = () => {
    if (!Array.isArray(currentMaterials) || currentMaterials.length === 0) return false;
    for (const mat of currentMaterials) {
      const name = typeIDToName[mat.materialTypeID] || `Type ID: ${mat.materialTypeID}`;
      const qty = mat.quantity;
      if (!name || !qty) continue;
      allMap.set(name, (allMap.get(name) || 0) + qty);
    }
    return true;
  };

  if (type === 'parent') {
    if (!Array.isArray(currentMaterials) || currentMaterials.length === 0) return;

    // 1) Top-level parents: add only NON-ship items
    for (const mat of currentMaterials) {
      const mgid = typeIDToMarketGroup[mat.materialTypeID];
      if (isShip(mgid)) continue; // skip ship hull itself
      const name = typeIDToName[mat.materialTypeID] || `Type ID: ${mat.materialTypeID}`;
      const qty = mat.quantity;
      if (!name || !qty) continue;
      allMap.set(name, (allMap.get(name) || 0) + qty);
    }

    // 2) For any top-level that IS a ship hull, include ONLY its immediate parents
    for (const mat of currentMaterials) {
      const mgid = typeIDToMarketGroup[mat.materialTypeID];
      if (!isShip(mgid)) continue;
      const name = typeIDToName[mat.materialTypeID] || `Type ID: ${mat.materialTypeID}`;
      const children = getChildrenForMaterial(mat.materialTypeID, name);
      if (!Array.isArray(children)) continue;
      for (const c of children) {
        const childName = typeIDToName[c.materialTypeID] || `Type ID: ${c.materialTypeID}`;
        const childQty = (c.quantity || 0) * (mat.quantity || 1);
        if (!childName || !childQty) continue;
        allMap.set(childName, (allMap.get(childName) || 0) + childQty);
      }
    }

  } else if (type === 'all') {
    // Use resolved DOM if present; otherwise fallback to base currentMaterials
    const nodes = Array.from(container.querySelectorAll('.indented-material'));
    if (nodes.length > 0) {
      nodes.forEach(el => {
        const name = el.dataset.name;
        const qty = parseInt(el.dataset.qty, 10);
        if (!name || isNaN(qty)) return;
        allMap.set(name, (allMap.get(name) || 0) + qty);
      });
    } else {
      if (!copyFromCurrentMaterials()) return;
    }

  } else if (type === 'leaf') {
    const nodes = Array.from(container.querySelectorAll('.indented-material.is-child'));
    if (nodes.length === 0) {
      if (!copyFromCurrentMaterials()) return;
    } else {
      nodes.forEach(el => {
        const name = el.dataset.name;
        const qty = parseInt(el.dataset.qty, 10);
        if (!name || isNaN(qty)) return;
        allMap.set(name, (allMap.get(name) || 0) + qty);
      });
    }
  }

  const output = Array.from(allMap.entries())
    .map(([name, qty]) => `${name} x${qty.toLocaleString()}`)
    .join('\n');
  if (!output) return;

  // Clipboard with fallback
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(output).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = output;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = output;
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

}

document.getElementById('calculate-btn').addEventListener('click', lookupMaterials);
  document.getElementById('resolve-btn').addEventListener('click', resolveAllLayers);
  document.getElementById('copy-parent-btn').addEventListener('click', () => copyResolvedLayers('parent'));
  document.getElementById('copy-leaf-btn').addEventListener('click', () => copyResolvedLayers('leaf'));
  document.getElementById('copy-all-btn').addEventListener('click', () => copyResolvedLayers('all'));
});
