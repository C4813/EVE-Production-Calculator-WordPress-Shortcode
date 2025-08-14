<div class="production-settings-grid">
  <div class="production-column">
    <h4>Hull Production</h4>
    <label>Structure
      <select id="hull-structure">
        <option>Raitaru</option>
        <option>Azbel</option>
        <option>Sotiyo</option>
      </select>
    </label>
    <label>ME Rig
      <select id="hull-me-rig">
        <option>None</option>
        <option>T1</option>
        <option>T2</option>
        <option>Thukker</option>
      </select>
    </label>
    <label>TE Rig
      <select id="hull-te-rig">
        <option>None</option>
        <option>T1</option>
        <option>T2</option>
        <option>Thukker</option>
      </select>
    </label>
    <label>System Security
      <select id="hull-sec">
        <option>HighSec</option>
        <option>LowSec</option>
        <option>NullSec</option>
        <option>Wormhole</option>
      </select>
    </label>
    <label>Implant
      <select id="hull-implant">
        <option>None</option>
        <option>BX-801</option>
        <option>BX-802</option>
        <option>BX-804</option>
      </select>
    </label>
    <label>Tax (%):
      <input type="text" id="hull-other-mod" inputmode="decimal" aria-label="Hull Tax Percentage" value="0" />
    </label>
  </div>

  <div class="production-divider"></div>

  <div class="production-column">
    <h4>Component Production</h4>
    <label>Structure
      <select id="comp-structure">
        <option>Raitaru</option>
        <option>Azbel</option>
        <option>Sotiyo</option>
      </select>
    </label>
    <label>ME Rig
      <select id="comp-me-rig">
        <option>None</option>
        <option>T1</option>
        <option>T2</option>
        <option>Thukker</option>
      </select>
    </label>
    <label>TE Rig
      <select id="comp-te-rig">
        <option>None</option>
        <option>T1</option>
        <option>T2</option>
        <option>Thukker</option>
      </select>
    </label>
    <label>System Security
      <select id="comp-sec">
        <option>HighSec</option>
        <option>LowSec</option>
        <option>NullSec</option>
        <option>Wormhole</option>
      </select>
    </label>
    <label>Implant
      <select id="comp-implant">
        <option>None</option>
        <option>BX-801</option>
        <option>BX-802</option>
        <option>BX-804</option>
      </select>
    </label>
    <label>Tax (%)
      <input type="text" id="comp-other-mod" inputmode="decimal" aria-label="Component Tax Percentage" value="0" />
    </label>
  </div>
</div>

<div class="eve-materials-container" style="margin-top: 20px;">
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
