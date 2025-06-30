import CrucibleAction from "./action.mjs";
import SpellCastDialog from "../dice/spell-cast-dialog.mjs";

/**
 * Data and functionality that represents a Spell in the Crucible spellcraft system.
 *
 * @property {CrucibleSpellcraftRune} rune
 * @property {CrucibleSpellcraftGesture} gesture
 * @property {CrucibleSpellcraftInflection} inflection
 * @property {number} composition
 * @property {string} damageType
 */
export default class CrucibleSpellAction extends CrucibleAction {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();
    schema.rune = new fields.StringField({required: true, choices: SYSTEM.SPELL.RUNES});
    schema.gesture = new fields.StringField({required: true, choices: SYSTEM.SPELL.GESTURES});
    schema.inflection = new fields.StringField({required: false, choices: SYSTEM.SPELL.INFLECTIONS});
    schema.composition = new fields.NumberField({choices: Object.values(this.COMPOSITION_STATES)});
    schema.damageType = new fields.StringField({required: false, choices: SYSTEM.DAMAGE_TYPES, initial: undefined});
    return schema;
  }

  /**
   * Spell composition states.
   * @enum {number}
   */
  static COMPOSITION_STATES = {
    NONE: 0,
    COMPOSING: 1,
    COMPOSED: 2
  }

  /** @override */
  static dialogClass = SpellCastDialog;


  /* -------------------------------------------- */
  /*  Action Lifecycle                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  * _tests() {
    if ( this.rune.hooks ) yield this.rune.hooks;
    if ( this.gesture.hooks ) yield this.gesture.hooks;
    if ( this.inflection?.hooks ) yield this.inflection.hooks;
    yield* super._tests();
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _initializeSource(data, options) {
    data = super._initializeSource(data, options);
    data.id = this.getSpellId(data);
    return data;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  updateSource(changes, options) {
    if ( ("rune" in changes) || ("gesture" in changes) || ("inflection" in changes) ) {
      changes.id = this.getSpellId(changes);
    }
    return super.updateSource(changes, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepareData() {
    super._prepareData();

    // Spell Composition
    this.rune = SYSTEM.SPELL.RUNES[this.rune];
    this.gesture = SYSTEM.SPELL.GESTURES[this.gesture];
    this.inflection = SYSTEM.SPELL.INFLECTIONS[this.inflection];

    // Composed Spell
    if ( this.composition >= CrucibleSpellAction.COMPOSITION_STATES.COMPOSING ) {
      this.nameFormat = this.gesture.nameFormat ?? this.rune.nameFormat;
      this.name = CrucibleSpellAction.#getName(this);
      this.img = this.rune.img;
      this.description = "Weave arcana to create a work of spellcraft." // TODO make dynamic
    }

    // Derived Spell Attributes
    this.scaling = new Set([this.rune.scaling, this.gesture.scaling]);
    this.cost = CrucibleSpellAction.#prepareCost.call(this);
    this.defense = CrucibleSpellAction.#prepareDefense.call(this);
    this.damage = CrucibleSpellAction.#prepareDamage.call(this);
    this.target = {...this.gesture.target};
    this.range = this.gesture.range;
  }

  /* -------------------------------------------- */

  /**
   * Create the unique identifier that represents this spell as a combination of rune, gesture, and inflection.
   * @param rune
   * @param gesture
   * @param inflection
   * @returns {*}
   */
  getSpellId({rune, gesture, inflection}={}) {
    rune ??= (this.rune?.id || "none");
    gesture ??= (this.gesture?.id || "none");
    inflection ??= (this.inflection?.id || "none");
    return ["spell", rune, gesture, inflection].filterJoin(".");
  }

  /* -------------------------------------------- */

  /**
   * Prepare the cost for the spell from its components.
   * @this {CrucibleSpellAction}  The spell being prepared
   * @returns {ActionCost}        Configured cost data
   */
  static #prepareCost() {
    const cost = {...this.gesture.cost};
    cost.hands = this.gesture.hands;
    if ( this.inflection ) {
      cost.action += this.inflection.cost.action;
      cost.focus += this.inflection.cost.focus;
    }
    return cost;
  }

  /* -------------------------------------------- */

  /**
   * Prepare the defense against which this spell is tested.
   * @this {CrucibleSpellAction}  The spell being prepared
   * @returns {string}            The defense to test
   */
  static #prepareDefense() {
    if ( this.rune.restoration ) return {
      health: "wounds",
      wounds: "wounds",
      morale: "madness",
      madness: "madness"
    }[this.rune.resource];
    else return this.rune.defense;
  }

  /* -------------------------------------------- */

  /**
   * Prepare damage information for the spell from its components.
   * @this {CrucibleSpellAction}  The spell being prepared
   * @returns {DamageData}        Prepared damage data
   */
  static #prepareDamage() {
    return {
      base: this.gesture.damage.base ?? 0,
      bonus: this.gesture.damage.bonus ?? 0,
      multiplier: 1,
      type: this.damageType ?? this.rune.damageType,
      restoration: this.rune.restoration
    };
  }

  /* -------------------------------------------- */

  /**
   * Prepare a default name for the spell if a custom name has not been designated.
   * @type {string}
   */
  static #getName({rune, gesture, inflection, nameFormat}={}) {
    let name = "";
    switch ( nameFormat ) {
      case SYSTEM.SPELL.NAME_FORMATS.NOUN:
        name = game.i18n.format("SPELL.NameFormatNoun", {rune, gesture});
        break;
      case SYSTEM.SPELL.NAME_FORMATS.ADJ:
        name = game.i18n.format("SPELL.NameFormatAdj", {rune: rune.adjective, gesture});
        break;
    }
    if ( inflection ) name = `${inflection.adjective} ${name}`;
    return name;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _prepare() {
    CrucibleSpellAction.#prepareGesture.call(this);
    super._prepare();

    // Add Weapon cost
    if ( this.cost.weapon ) {
      const w = this.actor.equipment.weapons.mainhand;
      this.cost.action += (w?.system.actionCost || 0);
    }

    // Zero cost for un-composed spells
    this._trueCost = {...this.cost};
    if ( this.composition !== CrucibleSpellAction.COMPOSITION_STATES.COMPOSED ) {
      this.cost.action = this.cost.focus = this.cost.health = 0;
    }
  }

  /* -------------------------------------------- */

  /**
   * Customize the spell based on the Gesture used.
   * TODO I think this should be handled as a `prepare` hook on the gesture config itself?
   * @this {CrucibleSpellAction}
   */
  static #prepareGesture() {
    const e = this.actor.equipment;
    const mh = e.weapons.mainhand;
    const s = this.actor.system.status;
    const t = this.actor.talentIds;
    this.usage.hasDice = true; // Spells involve dice rolls by default
    switch ( this.gesture.id ) {

      /* -------------------------------------------- */
      /*  Gesture: Arrow                              */
      /* -------------------------------------------- */
      case "arrow":
        if ( t.has("arcanearcher0000") && mh.config.category.ranged ) {
          this.range.weapon = true;
          this.cost.hands = 0;
          if ( s.rangedAttack && !s.arcaneArcher ) {
            this.cost.action -= 1;
            this.usage.actorStatus.arcaneArcher = true;
          }
        }
        break;

      /* -------------------------------------------- */
      /*  Gesture: Create                             */
      /* -------------------------------------------- */
      case "create":
        this.tags.add("summon");
        this.usage.hasDice = false;

        // Configure summon data
        const summonUUIDs = SYSTEM.SPELL.CREATION_SUMMONS;
        const actorUuid = summonUUIDs[this.rune.id] || summonUUIDs.fallback;
        const tokenData = {
          delta: {
            system: {
              details: {
                level: Math.ceil(this.actor.system.advancement.threatLevel / 2),
                rank: "minion"
              }
            }
          }
        };

        // Configure summon effect
        let effectId = SYSTEM.EFFECTS.getEffectId("create");

        // TODO move this to conjurer talent
        if ( t.has("conjurer00000000") ) {
          const effectIds = ["conjurercreate1", "conjurercreate2", "conjurercreate3"].map(id => SYSTEM.EFFECTS.getEffectId(id));
          effectId = effectIds.find(id => !this.actor.effects.has(id)) || effectIds[0];
        }
        const effectData = {
          _id: effectId,
          icon: this.img,
          duration: {rounds: 10},
          origin: this.actor.uuid
        }

        // Configure the summons
        this.usage.summons = [{actorUuid, tokenData, effectData}];
        break;

      /* -------------------------------------------- */
      /*  Gesture: Strike                             */
      /* -------------------------------------------- */
      case "strike":
        this.scaling = new Set(mh.config.category.scaling.split("."));
        this.damage.bonus = mh.system.damage.bonus;

        // Spellblade Signature
        if ( t.has("spellblade000000") && s.meleeAttack && !s.spellblade ) {
          this.cost.action -= 1;
          this.usage.actorStatus.spellblade = true;
        }
        break;

      /* -------------------------------------------- */
      /*  Gesture: Ward                               */
      /* -------------------------------------------- */
      case "ward":
        this.usage.hasDice = false;

        // TODO: Enable healing wards
        if ( this.damage.healing ) {
          ui.notifications.warning("Gesture: Ward is not configured for healing Runes yet");
          break;
        }

        // Shield Ward
        if ( t.has("shieldward000000") && e.weapons.shield ) this.cost.hands = 0;

        // Configure Ward effect
        let resistance = this.gesture.damage.base;
        if ( this.actor.talentIds.has("runewarden000000") ) {
          resistance += Math.ceil(this.actor.abilities.wisdom.value / 2);
        }
        this.effects.push({
          _id: SYSTEM.EFFECTS.getEffectId("ward"),
          icon: this.gesture.img,
          duration: {rounds: 1},
          origin: this.actor.uuid,
          changes: [
            {
              key: `system.resistances.${this.damage.type}.bonus`,
              value: resistance,
              mode: CONST.ACTIVE_EFFECT_MODES.ADD
            }
          ]
        });
        break;

      /* -------------------------------------------- */
      /*  Gesture: Aspect                             */
      /* -------------------------------------------- */
      case "aspect":
        // TODO
        if ( this.damage.healing ) {
          ui.notifications.warning("Gesture: Aspect is not configured for healing Runes yet");
          break;
        }
        this.effects.push({
          _id: SYSTEM.EFFECTS.getEffectId("aspect"),
          icon: this.gesture.img,
          duration: {rounds: 6},
          origin: this.actor.uuid,
          changes: [
            {
              key: `system.resistances.${this.damage.type}.bonus`,
              value: 2,
              mode: CONST.ACTIVE_EFFECT_MODES.ADD
            },
            {
              key: `system.rollBonuses.damage.${this.damage.type}`,
              value: 2,
              mode: CONST.ACTIVE_EFFECT_MODES.ADD
            }
          ]
        });
        this.usage.hasDice = false;
        break;
    }
  }

  /* -------------------------------------------- */
  /*  Action Execution Methods                    */
  /* -------------------------------------------- */

  /** @inheritDoc */
  acquireTargets(options={}) {
    if ( this.composition === CrucibleSpellAction.COMPOSITION_STATES.COMPOSING ) options.strict = false;
    return super.acquireTargets(options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  clone(updateData={}, context) {
    if ( !this.composition ) updateData.composition = CrucibleSpellAction.COMPOSITION_STATES.COMPOSING;
    return super.clone(updateData, context);
  }

  /* -------------------------------------------- */

  /**
   * Prepare the default Cast Spell action, populated with the most recently cast spell components.
   * @param {CrucibleActor} actor       The Actor for whom the spell is being prepared
   * @param {object} spellData          Initial data for the spell
   * @returns {CrucibleSpellAction}     The constructed CrucibleSpellAction
   */
  static getDefault(actor, spellData={}) {

    // Repeat Last Spell
    const lastSpell = actor.flags.crucible?.lastSpell;
    if ( lastSpell ) {
      try {
        const last = this.fromId(lastSpell, {actor});
        last._canUse([]);
        return last;
      } catch(err) {
        console.warn(err);
      }
    }

    // Cast New Spell
    const {runes, gestures} = actor.grimoire;
    const rune = runes.first()?.id;
    const gesture = gestures.first()?.id;
    Object.assign(spellData, {
      rune,
      gesture,
      inflection: undefined,
      composition: this.COMPOSITION_STATES.NONE,
      tags: ["spell"]
    });
    return new this(spellData, {actor});
  }

  /* -------------------------------------------- */

  /**
   * Obtain a Spell instance corresponding to a provided spell ID
   * @param {string} spellId          The provided spell ID in the format spell.{rune}.{gesture}.{inflection}
   * @param {object} [context]        Context data applied to the created spell
   * @returns {CrucibleSpellAction}   The constructed spell instance
   */
  static fromId(spellId, context={}) {
    const [spell, rune, gesture, inflection] = spellId.split(".").map(p => p === "none" ? "" : p);
    if ( spell !== "spell" ) throw new Error(`Invalid Spell ID: "${spellId}"`);
    return new this({
      id: spellId,
      rune,
      gesture,
      inflection,
      composition: this.COMPOSITION_STATES.COMPOSED,
      tags: ["spell"]
    }, context);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async configure(targets) {
    const result = await super.configure(targets);
    this.updateSource({composition: CrucibleSpellAction.COMPOSITION_STATES.COMPOSED});
    return result;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritDoc */
  getTags() {
    const tags = super.getTags();

    // Variable Cost
    if ( this.composition === CrucibleSpellAction.COMPOSITION_STATES.NONE ) {
      if ( tags.activation.ap ) tags.activation.ap += "+";
      if ( tags.activation.fp ) tags.activation.fp += "+";
      if ( tags.activation.hp ) tags.activation.hp += "+";
    }

    delete tags.action.spell;
    tags.action.scaling = Array.from(this.scaling).map(a => SYSTEM.ABILITIES[a].label).join("/");
    if ( this.damage.healing ) tags.action.healing = "Healing";
    else tags.action.defense = SYSTEM.DEFENSES[this.defense].label;
    tags.action.resource = SYSTEM.RESOURCES[this.rune.resource].label;
    return tags;
  }
}
