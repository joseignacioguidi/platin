import { Provider } from '@angular/core';
import { LucideConstruction, LucideUser, LucideWallet, provideLucideIcons } from '@lucide/angular';

/**
 * Icons used by name (`<svg lucideIcon="wallet">`), for example the ones stored in categories.
 * Only these are bundled; icons used directly as components don't need to be listed.
 */
export function provideAppIcons(): Provider {
  return provideLucideIcons(LucideConstruction, LucideUser, LucideWallet);
}
