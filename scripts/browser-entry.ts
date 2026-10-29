/**
 * Browser bundle entry for hosts that vendor a single ESM file.
 * Side effect: registers the <simple-chat> custom element.
 */
import '../packages/element/src/index.ts';

export {
  SC_WIDTH_MIN,
  SC_WIDTH_MAX,
  SC_WIDTH_DEFAULT,
  SC_WIDTH_STORAGE_KEY,
  clampSidebarWidth,
  loadSidebarWidth,
  saveSidebarWidth,
} from '../packages/core/src/settings.ts';

export { SimpleChatElement } from '../packages/element/src/SimpleChatElement.ts';
export type { SimpleChatElementProps } from '../packages/element/src/SimpleChatElement.ts';
