import {
  defineComponent,
  h,
  onMounted,
  onBeforeUnmount,
  ref,
  watch,
  type PropType,
  type CSSProperties,
} from 'vue';
import type { HostTool, SimpleChatConfig, ToolStyleOverrides } from '@simplechat/core';
import '@simplechat/element';
import type { SimpleChatElement } from '@simplechat/element';

export const SimpleChatSidebar = defineComponent({
  name: 'SimpleChatSidebar',
  props: {
    open: { type: Boolean, default: true },
    config: { type: Object as PropType<Partial<SimpleChatConfig>>, default: () => ({}) },
    tools: { type: Array as PropType<HostTool[]>, default: () => [] },
    storageKey: { type: String, default: 'simplechat' },
    layout: { type: String as PropType<'sidebar' | 'panel' | 'extension'>, default: 'sidebar' },
    position: { type: String as PropType<'left' | 'right'>, default: 'right' },
    className: { type: String, default: '' },
    themeId: { type: String, default: '' },
    theme: { type: String, default: '' },
    themeCss: { type: String, default: '' },
    themeStyle: { type: Object as PropType<CSSProperties & Record<string, string>>, default: () => ({}) },
  },
  emits: ['update:open', 'close', 'resize'],
  setup(props, { emit, expose }) {
    const elRef = ref<SimpleChatElement | null>(null);
    let syncedToolKey = '';

    function resolvedThemeId(): string {
      return (props.themeId || props.theme || '').trim();
    }

    function getElement(): SimpleChatElement | null {
      return elRef.value;
    }

    function toolsKey(tools: HostTool[]): string {
      return tools.map((t) => t.name).join('\0');
    }

    function syncTools(el: SimpleChatElement, force = false): void {
      const key = toolsKey(props.tools);
      if (!force && key === syncedToolKey) return;
      syncedToolKey = key;
      for (const t of props.tools) el.registerTool(t);
    }

    function applyConfigAndTheme(): void {
      const el = elRef.value;
      if (!el) return;
      el.setConfig({
        apiBaseUrl: props.config.apiBaseUrl ?? '',
        apiKey: props.config.apiKey ?? '',
        model: props.config.model ?? '',
        systemPrompt: props.config.systemPrompt,
        temperature: props.config.temperature,
        maxTokens: props.config.maxTokens,
        headers: props.config.headers,
      });
      if (props.config.apiKey) el.apiKey = props.config.apiKey;
      if (props.config.systemPrompt != null) el.systemPrompt = props.config.systemPrompt;

      const tid = resolvedThemeId();
      if (tid && typeof el.setTheme === 'function') {
        el.setTheme(tid, { persist: false });
      } else if (tid) {
        el.setAttribute('theme-id', tid);
      }

      // Apply CSS via JS API only (never multiline attribute).
      if (typeof el.applyThemeCss === 'function') {
        el.applyThemeCss(props.themeCss || '');
      }
    }

    function applyAll(forceTools = false): void {
      const el = elRef.value;
      if (!el) return;
      applyConfigAndTheme();
      syncTools(el, forceTools);
      el.open = props.open;
    }

    onMounted(() => {
      applyAll(true);
      elRef.value?.addEventListener('sc-close', onClose as EventListener);
      elRef.value?.addEventListener('sc-resize', onResize as EventListener);
    });

    onBeforeUnmount(() => {
      elRef.value?.removeEventListener('sc-close', onClose as EventListener);
      elRef.value?.removeEventListener('sc-resize', onResize as EventListener);
    });

    function onClose() {
      emit('update:open', false);
      emit('close');
    }

    function onResize(e: Event) {
      const detail = (e as CustomEvent<{ width?: number }>).detail;
      const width = Number(detail?.width);
      if (Number.isFinite(width)) emit('resize', { width });
    }

    // Config / theme — no tool re-register
    watch(
      () => [
        props.config.apiBaseUrl,
        props.config.apiKey,
        props.config.model,
        props.config.systemPrompt,
        props.open,
        props.themeCss,
        props.themeId,
        props.theme,
      ],
      () => applyConfigAndTheme(),
    );

    watch(
      () => props.open,
      (v) => {
        if (elRef.value) elRef.value.open = v;
      },
    );

    // Tools — only when names change (not deep on handlers)
    watch(
      () => props.tools.map((t) => t.name).join('\0'),
      () => {
        if (elRef.value) syncTools(elRef.value, true);
      },
    );

    // themeStyle object on host element via render

    expose({
      getElement,
      setTheme: (id: string) => elRef.value?.setTheme(id),
      setToolStyle: (style: ToolStyleOverrides, opts?: { persist?: boolean; replace?: boolean }) =>
        elRef.value?.setToolStyle(style, opts),
      getUiStyle: () => elRef.value?.getUiStyle(),
      getToolStyle: () => elRef.value?.getToolStyle(),
      setHostSettingsSlot: (el: HTMLElement | null) => elRef.value?.setHostSettingsSlot(el),
      getWidth: () => elRef.value?.getWidth?.(),
      setWidth: (width: number, opts?: { persist?: boolean; emit?: boolean }) =>
        elRef.value?.setWidth?.(width, opts),
    });

    return () =>
      h('simple-chat', {
        ref: elRef,
        class: props.className,
        style: props.themeStyle || undefined,
        open: props.open,
        layout: props.layout,
        position: props.position,
        'storage-key': props.storageKey,
        'api-base-url': props.config.apiBaseUrl ?? '',
        model: props.config.model ?? '',
        'theme-id': resolvedThemeId() || undefined,
        // Do NOT pass multiline systemPrompt / themeCss as attributes —
        // apply via el.systemPrompt / el.setConfig / applyThemeCss (same class of bug).
        onScClose: onClose,
      });
  },
});

export default SimpleChatSidebar;
