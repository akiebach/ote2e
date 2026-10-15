import { OTE, SYSTEM_PATH } from "../config.mjs";
import { OTEItem } from "../documents/item.mjs";
import { editImage } from "./common.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/** One compact sheet for every OTE item type; the template switches on type. */
export class OTEItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["ote", "item-sheet"],
    position: { width: 460, height: "auto" },
    form: { submitOnChange: true },
    actions: {
      editImage,
      ruleDice: OTEItemSheet.#onRuleDice
    }
  };

  static PARTS = {
    body: { template: `${SYSTEM_PATH}/templates/item/item-sheet.hbs` }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const type = this.document.type;
    return Object.assign(context, {
      item: this.document,
      system: this.document.system,
      editable: this.isEditable,
      isTrait: type === "trait",
      isWeapon: type === "weapon",
      isArmor: type === "armor",
      isGear: type === "gear",
      hasEquipped: type === "weapon" || type === "armor",
      traitKinds: OTE.traitKinds,
      scoreTypes: OTE.scoreTypes,
      attackTypes: OTE.attackTypes,
      armorUnits: OTE.armorUnits
    });
  }

  /** Set a trait's dice from the Chapter 1 score charts (superior vs. good). */
  static async #onRuleDice() {
    const { scoreType, superior } = this.document.system;
    return this.document.update({ "system.dice": OTEItem.ruleDice(scoreType, superior) });
  }
}
