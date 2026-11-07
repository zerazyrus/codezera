/** Orca's page-level Esc handlers skip while a Codezera drawer (`data-codezera-overlay`) is open. */
export function isCodezeraOverlayOpen(): boolean {
  return document.querySelector('[data-codezera-overlay]') !== null
}
