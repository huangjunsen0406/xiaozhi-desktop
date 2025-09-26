import type { PluginOption } from 'vite'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import AutoImport from 'unplugin-auto-import/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin(
      {
        // 关键：这行把依赖从 external 名单里排除，转而 bundle 进去
        exclude: ['@electron-toolkit/preload'],
      },
    )],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [
      vue(),
      AutoImport({
        // 自动导入 Vue/Router 等常用 API + Naive UI 的函数式 API
        imports: [
          'vue',
          'vue-router',
          {
            'naive-ui': ['useDialog', 'useMessage', 'useNotification', 'useLoadingBar'],
          },
        ],
        dts: 'src/auto-imports.d.ts',
        eslintrc: { enabled: true },
      }),
      Components({
        dts: 'src/components.d.ts', // 生成类型声明
        resolvers: [IconsResolver({ prefix: 'icon' }), NaiveUiResolver()], // <icon-mdi-home />
      }),
      Icons({
        compiler: 'vue3',
        autoInstall: true, // 开发时自动安装缺少的 @iconify-json/* 包
        // defaultClass: 'inline-block align-[-0.125em]', // 想加默认样式也可以
      }),
      tailwindcss() as PluginOption,
    ],
  },
})
