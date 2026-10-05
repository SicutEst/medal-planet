import { createRouter, createWebHistory } from 'vue-router'
import HomePage from './views/HomePage.vue'
import TasksPage from './views/TasksPage.vue'
import ApplicationsPage from './views/ApplicationsPage.vue'
import RecordsPage from './views/RecordsPage.vue'
import StorePage from './views/StorePage.vue'
import SettingsPage from './views/SettingsPage.vue'
import TaskManagePage from './views/TaskManagePage.vue'

const routes = [
  { path: '/', component: HomePage, name: 'home' },
  { path: '/tasks', component: TasksPage, name: 'tasks' },
  { path: '/applications', component: ApplicationsPage, name: 'applications' },
  { path: '/records', component: RecordsPage, name: 'records' },
  { path: '/store', component: StorePage, name: 'store' },
  { path: '/settings', component: SettingsPage, name: 'settings' },
  { path: '/task-manage', component: TaskManagePage, name: 'task-manage' },
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
