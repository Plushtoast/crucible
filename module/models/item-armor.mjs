import CruciblePhysicalItem from "./item-physical.mjs";
import * as ARMOR from "../config/armor.mjs";

/**
 * Data schema, attributes, and methods specific to Armor type Items.
 */
export default class CrucibleArmorItem extends CruciblePhysicalItem {

  /** @override */
  static ITEM_CATEGORIES = ARMOR.CATEGORIES;

  /** @override */
  static DEFAULT_CATEGORY = "medium";

  /** @override */
  static ITEM_PROPERTIES = ARMOR.PROPERTIES;

  /** @override */
  static LOCALIZATION_PREFIXES = ["ITEM", "ARMOR"];

  /* -------------------------------------------- */
  /*  Data Schema                                 */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return foundry.utils.mergeObject(super.defineSchema(), {
      armor: new fields.SchemaField({
        base: new fields.NumberField({required: true, nullable: false, integer: true, min: 0, max: 18, initial: 0})
      })
    });
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /**
   * Weapon configuration data.
   * @type {{category: WeaponCategory, quality: ItemQualityTier, enchantment: ItemEnchantmentTier}}
   */
  config;

  /**
   * Item rarity score.
   * @type {number}
   */
  rarity;

  /* -------------------------------------------- */

  /**
   * Prepare derived data specific to the weapon type.
   */
  prepareBaseData() {
    super.prepareBaseData();
    const {category, quality, enchantment} = this.config;

    // Armor Defense
    this.armor.base = Math.clamp(this.armor.base, category.armor.min, category.armor.max);
    this.armor.bonus = quality.bonus;

    // Dodge Defense
    this.dodge ||= {};
    this.dodge.base = category.dodge.base(this.armor.base) + enchantment.bonus;
    this.dodge.scaling = category.dodge.scaling;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareDerivedData() {
    if ( this.broken ) {
      this.armor.base = Math.floor(this.armor.base / 2);
      this.armor.bonus = Math.floor(this.armor.bonus / 2);
      this.rarity -= 2;
    }
    super.prepareDerivedData();
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /** @inheritDoc */
  getTags(scope="full") {
    const tags = super.getTags(scope);
    const actor = this.parent.parent;

    // Defenses
    tags.armor = `${this.armor.base + this.armor.bonus} Armor`;
    if ( !actor ) tags.dodge = `${this.dodge.base}+ Dodge`;
    else {
      const dodgeBonus = Math.max(actor.system.abilities.dexterity.value - this.dodge.scaling, 0);
      tags.dodge = `${this.dodge.base + dodgeBonus} Dodge`;
      tags.total = `${this.armor.base + this.armor.bonus + this.dodge.base + dodgeBonus} Defense`;
    }

    // Armor Properties
    for ( let p of this.properties ) {
      if ( p === "investment" ) continue;
      tags[p] = ARMOR.PROPERTIES[p].label;
    }
    return scope === "short" ? {armor: tags.armor, dodge: tags.dodge} : tags;
  }

  /* -------------------------------------------- */

  /**
   * Get the default unarmored Armor item used by this Actor if they do not have other equipped armor.
   * @param {CrucibleActor} actor
   * @returns {CrucibleItem}
   */
  static getUnarmoredArmor(actor) {
    const itemCls = /** @type Constructor<CrucibleItem> */ getDocumentClass("Item");
    const armor = new itemCls(ARMOR.UNARMORED_DATA, {parent: actor});
    armor.prepareData(); // Needs to be explicitly called since we may be in the midst of Actor preparation.
    return armor;
  }
}
