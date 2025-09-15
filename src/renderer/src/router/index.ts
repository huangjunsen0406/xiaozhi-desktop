import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/main'
  },
  {
    path: '/main',
    component: () => import('../pages/MainView.vue')
  },
  {
    path: '/mini',
    component: () => import('../pages/MiniView.vue')
  }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router


