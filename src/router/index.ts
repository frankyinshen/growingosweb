import { createRouter, createWebHistory } from 'vue-router'
import ParentView from '../views/ParentView.vue'
import ChildView from '../views/ChildView.vue'

const routes = [
  {
    path: '/',
    redirect: '/parent' // 默认打开网站时，自动重定向跳转到父母端
  },
  {
    path: '/parent',
    name: 'Parent',
    component: ParentView
  },
  {
    path: '/child',
    name: 'Child',
    component: ChildView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router