import type { PluginOption } from 'vite'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { bytecodePlugin, defineConfig, externalizeDepsPlugin } from 'electron-vite'
import AutoImport from 'unplugin-auto-import/vite'
import IconsResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      // 启用字节码保护(仅在生产构建时生效)
      bytecodePlugin({
        // 转换箭头函数以防止崩溃
        transformArrowFunctions: true,
        // 删除原始 JS 文件（生产环境）
        removeBundleJS: true,
        // 保护敏感字符串
        protectedStrings: [
          // 音乐 API
          'https://music-dl.sayqz.com/api/',
          // 算法名称
          'hmac-sha256',
          'aes-128-ctr',
        ],
      }),
    ],
    build: {
      // 禁用最小化以确保字符串保护生效
      minify: false,
      rollupOptions: {
        output: {
          // 手动分块以增强保护
          manualChunks(id): string | void {
            // 激活和设备指纹相关（最敏感）
            if (id.includes('ActivationService')
              || id.includes('deviceFingerprintDB')
              || id.includes('configManagerDB')) {
              return 'activation'
            }
            // 协议层（包含加密逻辑）
            if (id.includes('protocols/')) {
              return 'protocol'
            }
            // 数据库操作
            if (id.includes('services/database')) {
              return 'database'
            }
            // MCP 工具
            if (id.includes('mcp/')) {
              return 'mcp'
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
            // IoT 设备控制
            if (id.includes('iot/')) {
              return 'iot'
            }
          },
        },
      },
    },
  },
  preload: {
    plugins: [
      externalizeDepsPlugin({
        // 关键：这行把依赖从 external 名单里排除，转而 bundle 进去
        exclude: ['@electron-toolkit/preload'],
      }),
      // 预加载脚本也启用字节码保护
      bytecodePlugin({
        transformArrowFunctions: true,
        removeBundleJS: false,
      }),
    ],
  },
  renderer: {
    publicDir: resolve(__dirname, 'src/renderer/public'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
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
})
