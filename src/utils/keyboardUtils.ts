/**
 * Utility functions for keyboard event handling
 */

/**
 * Checks if the currently focused element is an editable input field
 * (INPUT, TEXTAREA, or contentEditable element)
 *
 * Use this to prevent global keyboard shortcuts from interfering with text editing
 *
 * @param event Optional keyboard event to check the target element
 */
export function isEditableElementFocused(event?: KeyboardEvent): boolean {
  // Check both event target and document.activeElement for robustness
  const target = (event?.target as HTMLElement) || document.activeElement as HTMLElement

  if (!target) {
    return false
  }

  const tagName = target.tagName

  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    target.isContentEditable
  )
}
