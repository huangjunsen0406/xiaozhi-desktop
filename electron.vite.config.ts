import type { PluginOption } from 'vite'
import { resolve } from 'node:path'
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import AutoImport from 'unplugin-auto-import/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'OPENPANEL_')
  const openpanelConfig = {
    apiUrl: env.OPENPANEL_API_URL?.trim() ?? '',
    clientId: env.OPENPANEL_CLIENT_ID?.trim() ?? '',
    clientSecret: env.OPENPANEL_CLIENT_SECRET?.trim() ?? '',
  }
  const configuredValues = Object.values(openpanelConfig).filter(Boolean)
  if (configuredValues.length > 0 && configuredValues.length < 3) {
    throw new Error('OpenPanel 构建配置不完整：请同时设置 OPENPANEL_API_URL、OPENPANEL_CLIENT_ID、OPENPANEL_CLIENT_SECRET，或全部留空以禁用统计。')
  }

  return {
    main: {
      // 仅替换主进程常量，不将上报凭证暴露给 preload / renderer。
      define: {
        __OPENPANEL_CONFIG__: JSON.stringify(openpanelConfig),
      },
      resolve: {
        alias: {
          '@shared': resolve('src/shared'),
        },
      },
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          output: {
            // 按服务职责拆分模块
            manualChunks(id): string | void {
              // 激活和设备配置
              if (id.includes('ActivationService')
                || id.includes('deviceFingerprintDB')
                || id.includes('configManagerDB')) {
                return 'activation'
              }
              // 产品分析（含 OpenPanel 凭证）
              if (id.includes('AnalyticsService')) {
                return 'analytics'
              }
              // 核心服务（Application、ShortcutManager）
              if (id.includes('services/Application')
                || id.includes('services/ShortcutManager')) {
                return 'core-services'
              }
              // 音频相关（包含 Opus 编解码）
              if (id.includes('audio/') || id.includes('AudioPlugin')) {
                return 'audio'
              }
            },
          },
          external: ['sherpa-onnx-node'],
        },
      },
    },
    preload: {
      resolve: {
        alias: {
          '@shared': resolve('src/shared'),
        },
      },
      plugins: [
        externalizeDepsPlugin({
          // 关键：这行把依赖从 external 名单里排除，转而 bundle 进去
          exclude: ['@electron-toolkit/preload'],
        }),
      ],
    },
    renderer: {
      // publicDir: resolve(__dirname, 'src/renderer/public'),
      resolve: {
        alias: {
          '@renderer': resolve('src/renderer/src'),
          '@shared': resolve('src/shared'),
        },
      },
      build: {
        rollupOptions: {
          input: {
            index: resolve(__dirname, 'src/renderer/index.html'),
            audio: resolve(__dirname, 'src/renderer/audio.html'),
          },
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
  }
})
