import type { RouteRecordRaw } from 'vue-router'
import { createRouter, createWebHashHistory } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/main',
  },
  {
    path: '/main',
    component: () => import('../pages/MainView.vue'),
  },
  {
    path: '/mini',
    component: () => import('../pages/MiniView.vue'),
  },
  {
    path: '/panel',
    component: () => import('../pages/PanelView.vue'),
  },
  {
    path: '/hover',
    component: () => import('../pages/HoverView.vue'),
  },
  {
    path: '/activation',
    component: () => import('../pages/ActivationView.vue'),
  },
  {
    path: '/settings',
    component: () => import('../pages/SettingsView.vue'),
  },
  {
    path: '/chat',
    component: () => import('../pages/ChatView.vue'),
  },
  {
    path: '/live2d',
    component: () => import('../pages/Live2dView.vue'),
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router
