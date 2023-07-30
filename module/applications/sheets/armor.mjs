import CrucibleSheetMixin from "./crucible-sheet.mjs";

/**
 * A sheet application for displaying and configuring Items with the Armor type.
 * @extends ItemSheet
 * @mixes CrucibleSheet
 */
export default class ArmorSheet extends CrucibleSheetMixin(ItemSheet) {

  /** @override */
  static documentType = "armor";

  /** @inheritDoc */
  static get defaultOptions() {
    return Object.assign(super.defaultOptions, {
      tabs: [{navSelector: ".tabs", contentSelector: "form", initial: "config"}],
      submitOnChange: true,
      closeOnSubmit: false
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async getData(options={}) {
    const isEditable = this.isEditable;
    const context = {
      actions: this.constructor.prepareActions(this.document.system.actions),
      cssClass: isEditable ? "editable" : "locked",
      editable: isEditable,
      item: this.document,
      source: this.document.toObject(),
      category: this.document.system.config.category,
      categories: SYSTEM.ARMOR.CATEGORIES,
      qualities: SYSTEM.QUALITY_TIERS,
      enchantments: SYSTEM.ENCHANTMENT_TIERS,
      tags: this.item.getTags(),
    };

    // Armor Properties
    context.properties = {};
    for ( let [id, prop] of Object.entries(SYSTEM.ARMOR.PROPERTIES) ) {
      context.properties[id] = {
        id: id,
        name: `system.properties.${id}`,
        label: prop.label,
        checked: this.item.system.properties.has(id)
      };
    }
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getSubmitData(updateData={}) {
    const formData = foundry.utils.expandObject(super._getSubmitData(updateData));
    formData.system.properties = Object.entries(formData.system.properties).reduce((arr, p) => {
      if ( p[1] === true ) arr.push(p[0]);
      return arr;
    }, []);
    return formData;
  }
}
