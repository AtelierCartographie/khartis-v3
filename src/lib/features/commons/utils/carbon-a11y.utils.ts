import { m } from '$lib/paraglide/messages';

/**
 * `translateWithId` for Carbon ListBox (Dropdown, ComboBox) and NumberInput,
 * whose accessible names otherwise default to English.
 */
export function translateCarbonId(id: string): string {
  switch (id) {
    case 'open':
      return m.a11y_open_menu();
    case 'close':
      return m.a11y_close_menu();
    case 'clearSelection':
      return m.a11y_clear_selection();
    case 'clearAll':
      return m.a11y_clear_all_selections();
    case 'increment':
      return m.a11y_increment_number();
    case 'decrement':
      return m.a11y_decrement_number();
    default:
      return id;
  }
}
