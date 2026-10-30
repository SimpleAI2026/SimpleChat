/**
 * Chrome MV3 full-page host for <simple-chat layout="extension">.
 * Settings drawer keeps openai / chrome-ai (Nano), themes, system prompt, tool style, host slot.
 * Requires Chrome 138+ for Gemini Nano Prompt API in extensions.
 */
import '@simplechat/element';

const app = document.querySelector('#app');
if (!app) throw new Error('#app missing');

app.innerHTML = '';
const el = document.createElement('simple-chat');
el.setAttribute('layout', 'extension');
el.setAttribute('open', '');
el.setAttribute('storage-key', 'simplechat-extension');
app.appendChild(el);
