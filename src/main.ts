import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router' // 1. 引入我们的路由配置文件

const app = createApp(App)

app.use(router) // 2. 告诉 Vue 使用路由系统

app.mount('#app')