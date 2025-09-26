/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare module '~icons/*' {
  import type { FunctionalComponent, SVGAttributes } from 'vue'

  const component: FunctionalComponent<SVGAttributes>
  export default component
}
