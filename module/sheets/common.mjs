/**
 * Shared sheet action: open a FilePicker to change a document image.
 * Used as an ApplicationV2 `actions` handler, so `this` is the sheet.
 * Markup: <img data-action="editImage" data-edit="img">
 */
export async function editImage(event, target) {
  const attr = target.dataset.edit || "img";
  const current = foundry.utils.getProperty(this.document._source, attr);
  const defaults = this.document.constructor.getDefaultArtwork?.(this.document._source) ?? {};
  const defaultImage = foundry.utils.getProperty(defaults, attr);
  const picker = new foundry.applications.apps.FilePicker.implementation({
    type: "image",
    current,
    redirectToRoot: defaultImage ? [defaultImage] : [],
    callback: path => this.document.update({ [attr]: path }),
    position: { top: this.position.top + 40, left: this.position.left + 10 }
  });
  return picker.browse();
}
