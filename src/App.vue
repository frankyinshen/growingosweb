<script setup lang="ts">
import { ref, onMounted, computed } from 'vue' 

const familyCode = 'DEMO123'
const currentRole = ref<'parent' | 'child'>('parent') 

// ====================================================================
// 【核心安全改动】自动识别环境：
// 本地开发(npm run dev)时，import.meta.env.DEV 为 true，自动用 localhost
// 发布线上(npm run build)时，自动切换为云端的 Workers 网址
// ====================================================================
const API_URL = import.meta.env.DEV 
  ? 'http://localhost:8787' 
  : 'https://growing-os-api.frankyinshen.workers.dev'

// 数据源
const tasks = ref<any[]>([])          
const dailyTasks = ref<any[]>([])     
const categories = ref<any[]>([])     

// 过滤状态
const selectedFilterCategoryId = ref('') 

// 输入表单 (任务)
const newTaskName = ref('')
const newTaskDuration = ref(30)
const newTaskCategoryId = ref('')     
const isSubmitting = ref(false)

// 输入表单 (自定义新建分类)
const newCategoryName = ref('')
const newCategoryColor = ref('#e3f2fd') 

// 今日任务完成进度计算
const completedCount = computed(() => dailyTasks.value.filter(t => t.status === 'completed').length)
const totalCount = computed(() => dailyTasks.value.length)
const progressPercent = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((completedCount.value / totalCount.value) * 100)
})

// 根据选中的分类，计算过滤后的任务库列表
const filteredTasks = computed(() => {
  if (!selectedFilterCategoryId.value) return tasks.value
  return tasks.value.filter(t => t.category_id === selectedFilterCategoryId.value)
})

// 获取分类列表
const fetchCategories = async () => {
  try {
    const res = await fetch(`${API_URL}/api/categories/${familyCode}`)
    const json = await res.json()
    if (json.success) categories.value = json.data
  } catch (err) {
    console.error('获取分类失败:', err)
  }
}

// 保存自定义的新分类
const saveCustomCategory = async () => {
  if (!newCategoryName.value.trim()) {
    alert('请输入分类名称')
    return
  }
  try {
    const res = await fetch(`${API_URL}/api/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        family_code: familyCode,
        name: newCategoryName.value,
        color: newCategoryColor.value,
        icon: '#333333' 
      })
    })
    const json = await res.json()
    if (json.success) {
      newCategoryName.value = ''
      await fetchCategories() 
      alert('自定义分类添加成功！')
    }
  } catch (err) {
    console.error('创建分类失败:', err)
  }
}

// 更新已有分类
const updateCategory = async (cat: any) => {
  if (!cat.name.trim()) {
    alert('分类名称不能为空')
  }
  try {
    const res = await fetch(`${API_URL}/api/categories/${cat.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cat.name,
        color: cat.color
      })
    })
    const json = await res.json()
    if (json.success) {
      await fetchCategories() 
      await fetchTasks()      
      await fetchDailyTasks() 
      alert('分类信息已同步更新！')
    }
  } catch (err) {
    console.error('更新分类失败:', err)
  }
}

// 获取任务库列表
const fetchTasks = async () => {
  try {
    const res = await fetch(`${API_URL}/api/tasks/${familyCode}`)
    const json = await res.json()
    if (json.success) tasks.value = json.data
  } catch (err) {
    console.error('获取任务库失败:', err)
  }
}

// 获取今日计划任务
const fetchDailyTasks = async () => {
  try {
    const res = await fetch(`${API_URL}/api/daily-tasks`)
    const json = await res.json()
    if (json.success) dailyTasks.value = json.data
  } catch (err) {
    console.error('获取今日计划失败:', err)
  }
}

// 保存新任务 (带上分类 ID)
const saveTask = async () => {
  if (!newTaskName.value.trim()) {
    alert('请输入任务名称')
    return
  }
  isSubmitting.value = true
  try {
    const res = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newTaskName.value,
        family_code: familyCode,
        category_id: newTaskCategoryId.value || null, 
        default_duration: newTaskDuration.value
      })
    })
    const json = await res.json()
    if (json.success) {
      newTaskName.value = ''
      newTaskDuration.value = 30
      newTaskCategoryId.value = '' 
      await fetchTasks()
    }
  } catch (err) {
    console.error('保存任务失败:', err)
  } finally {
    isSubmitting.value = false
  }
}

// 软删除
const deleteTask = async (id: string) => {
  if (!confirm('确定要从历史任务库中删除吗？')) return
  try {
    const res = await fetch(`${API_URL}/api/tasks/${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.success) await fetchTasks()
  } catch (err) {
    console.error(err)
  }
}

// 将建议任务加入“今日计划”
const addToDailyPlan = async (task: any) => {
  try {
    const res = await fetch(`${API_URL}/api/daily-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: task.id,
        planned_duration: task.default_duration
      })
    })
    const json = await res.json()
    if (json.success) {
      alert(`已成功把「${task.name}」加入到孩子的今日计划中！`)
      await fetchDailyTasks()
    }
  } catch (err) {
    console.error(err)
  }
}

// 更新任务状态
const updateDailyTaskStatus = async (id: string, status: 'pending' | 'in_progress' | 'completed') => {
  try {
    const res = await fetch(`${API_URL}/api/daily-tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    })
    const json = await res.json()
    if (json.success) {
      await fetchDailyTasks()
    }
  } catch (err) {
    console.error(err)
  }
}

// 初始化加载
onMounted(() => {
  fetchCategories()
  fetchTasks()
  fetchDailyTasks()
})
</script>

<template>
  <div class="container">
    <!-- 双端切换 Tab 导航 -->
    <nav class="role-nav">
      <button 
        :class="['nav-btn', currentRole === 'parent' ? 'active-parent' : '']"
        @click="currentRole = 'parent'"
      >
        👨‍👩‍👧 父母控制端
      </button>
      <button 
        :class="['nav-btn', currentRole === 'child' ? 'active-child' : '']"
        @click="currentRole = 'child'"
      >
        👦 孩子执行端
      </button>
    </nav>

    <!-- ================= 父母端界面 ================= -->
    <div v-if="currentRole === 'parent'">
      <header class="header">
        <h1>Growing OS - 父母建议中心</h1>
        <p>创建任务，为孩子设计他的一天提供丰富的建议池</p>
      </header>

      <main class="main-content">
        <section class="card form-card">
          <h2>➕ 新增任务建议</h2>
          
          <div class="form-group">
            <label>任务名称</label>
            <input v-model="newTaskName" type="text" placeholder="例如：数学计算100题、自主阅读" />
          </div>

          <!-- 分类选择下拉框 -->
          <div class="form-group">
            <label>任务分类</label>
            <select v-model="newTaskCategoryId" class="form-select">
              <option value="">-- 未分类 (默认) --</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                {{ cat.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>预计时间 (分钟)</label>
            <input v-model.number="newTaskDuration" type="number" min="1" />
          </div>
          
          <button class="btn" @click="saveTask" :disabled="isSubmitting">保存任务建议</button>

          <!-- 自定义添加分类小表单 -->
          <div class="custom-cat-section">
            <h3>🛠️ 自定义新建分类</h3>
            <div class="custom-cat-form">
              <input 
                v-model="newCategoryName" 
                type="text" 
                placeholder="输入新分类，如: 🧪 科学实验" 
                class="cat-input"
              />
              <div class="color-picker-wrapper" title="选择分类背景色">
                <input v-model="newCategoryColor" type="color" class="color-picker" />
              </div>
              <button class="add-cat-btn" @click="saveCustomCategory">添加</button>
            </div>
          </div>

          <!-- 已有分类修改列表 -->
          <div class="manage-cat-section" v-if="categories.length > 0">
            <h3>📋 修改已有分类 (双端即时同步)</h3>
            <ul class="cat-manage-list">
              <li v-for="cat in categories" :key="cat.id" class="cat-manage-item">
                <input v-model="cat.name" type="text" class="cat-manage-input" />
                <input v-model="cat.color" type="color" class="cat-manage-color" />
                <button class="save-cat-btn" @click="updateCategory(cat)">💾 保存</button>
              </li>
            </ul>
          </div>
        </section>

        <section class="card list-card">
          <h2>📋 任务库建议池</h2>

          <!-- 快速过滤标签 -->
          <div class="filter-bar" v-if="categories.length > 0">
            <span class="filter-label">分类筛选:</span>
            <button 
              :class="['filter-tag', selectedFilterCategoryId === '' ? 'active-tag' : '']"
              @click="selectedFilterCategoryId = ''"
            >
              全部 ({{ tasks.length }})
            </button>
            <button 
              v-for="cat in categories" 
              :key="cat.id"
              :class="['filter-tag', selectedFilterCategoryId === cat.id ? 'active-tag' : '']"
              @click="selectedFilterCategoryId = cat.id"
            >
              {{ cat.name }}
            </button>
          </div>

          <div v-if="filteredTasks.length === 0" class="empty-state">
            当前分类下暂无任务建议。
          </div>
          
          <ul v-else class="task-list">
            <li v-for="task in filteredTasks" :key="task.id" class="task-item">
              <div class="task-info">
                <div class="title-with-badge">
                  <span class="task-name">{{ task.name }}</span>
                  <span 
                    v-if="task.category_name" 
                    class="category-badge"
                    :style="{ backgroundColor: task.category_bg_color, color: task.category_text_color }"
                  >
                    {{ task.category_name }}
                  </span>
                </div>
                <span class="task-duration">⏱️ {{ task.default_duration }} 分钟</span>
              </div>
              <div class="action-group">
                <button class="add-today-btn" @click="addToDailyPlan(task)">➕ 今日</button>
                <button class="delete-btn" @click="deleteTask(task.id)">🗑️</button>
              </div>
            </li>
          </ul>
        </section>
      </main>
    </div>

    <!-- ================= 孩子端界面 ================= -->
    <div v-else>
      <header class="header child-header">
        <h1>我的一天 ☀️</h1>
        <p>今天我想怎样度过？开始执行并记录你的精彩一天吧！</p>
      </header>

      <main class="child-main">
        <!-- 今日完成进度卡片 -->
        <section class="card progress-card" v-if="totalCount > 0">
          <div class="progress-info-text">
            <span>🌟 今天完成进度: <strong>{{ completedCount }}</strong> / {{ totalCount }} 个任务</span>
            <span class="progress-num">{{ progressPercent }}%</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
        </section>

        <section class="card daily-card">
          <h2>📅 今日任务清单</h2>
          <div v-if="dailyTasks.length === 0" class="empty-state">
            今天还没有安排任务哦。<br>请让爸爸妈妈在“父母端”点击【➕ 今日】把任务指派过来。
          </div>
          <ul v-else class="daily-task-list">
            <li 
              v-for="item in dailyTasks" 
              :key="item.id" 
              :class="['daily-item', item.status]"
            >
              <div class="daily-info">
                <div class="title-with-badge">
                  <span class="daily-name">{{ item.task_name }}</span>
                  <span 
                    v-if="item.category_name" 
                    class="category-badge"
                    :style="{ backgroundColor: item.category_bg_color, color: item.category_text_color }"
                  >
                    {{ item.category_name }}
                  </span>
                </div>
                <span class="daily-plan-time">⏱️ 计划: {{ item.planned_duration }}分钟</span>
              </div>
              
              <div class="status-action">
                <button 
                  v-if="item.status === 'pending'" 
                  class="action-btn start"
                  @click="updateDailyTaskStatus(item.id, 'in_progress')"
                >
                  ▶️ 开始
                </button>
                
                <div v-else-if="item.status === 'in_progress'" class="running-group">
                  <span class="running-tag">⚡ 正在进行...</span>
                  <button 
                    class="action-btn finish"
                    @click="updateDailyTaskStatus(item.id, 'completed')"
                  >
                    ✅ 完成
                  </button>
                </div>

                <span v-else class="completed-tag">🎉 已搞定！</span>
              </div>
            </li>
          </ul>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* 全局基础样式 */
.container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px 20px 60px 20px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #333;
}
/* 顶端导航栏 */
.role-nav {
  display: flex;
  justify-content: center;
  gap: 15px;
  margin-bottom: 30px;
  border-bottom: 2px solid #eaeaea;
  padding-bottom: 15px;
}
.nav-btn {
  padding: 10px 24px;
  border: none;
  background: #f5f5f5;
  font-size: 1.05rem;
  font-weight: bold;
  border-radius: 30px;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;
}
.nav-btn:hover {
  background: #e0e0e0;
}
.active-parent {
  background-color: #2e7d32 !important;
  color: white !important;
}
.active-child {
  background-color: #0288d1 !important;
  color: white !important;
}

/* 父母端标题 */
.header h1 {
  font-size: 1.8rem;
  color: #2e7d32;
  margin-bottom: 8px;
  text-align: center;
}
/* 孩子端标题 */
.child-header h1 {
  color: #0288d1;
}
.header p {
  color: #666;
  text-align: center;
  margin-top: 0;
  margin-bottom: 30px;
}

/* 布局 */
.main-content {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 30px;
}
.child-main {
  max-width: 700px;
  margin: 0 auto;
}

/* 卡片 */
.card {
  background: #ffffff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  border: 1px solid #eaeaea;
}
.card h2 {
  font-size: 1.25rem;
  margin-top: 0;
  margin-bottom: 20px;
  color: #333;
  border-bottom: 2px solid #eaeaea;
  padding-bottom: 10px;
}

/* 表单 */
.form-group {
  margin-bottom: 20px;
}
.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 8px;
  font-size: 0.9rem;
  color: #555;
}
.form-group input, .form-select {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid #ccc;
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;
  background: white;
}
.form-group input:focus, .form-select:focus {
  border-color: #2e7d32;
  outline: none;
}
.btn {
  width: 100%;
  padding: 12px;
  background-color: #2e7d32;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.2s;
}
.btn:hover {
  background-color: #1b5e20;
}

/* 自定义分类新建区域 */
.custom-cat-section {
  margin-top: 25px;
  padding-top: 20px;
  border-top: 1.5px dashed #eaeaea;
}
.custom-cat-section h3 {
  font-size: 0.95rem;
  margin-top: 0;
  margin-bottom: 12px;
  color: #555;
}
.custom-cat-form {
  display: flex;
  gap: 10px;
  align-items: center;
}
.cat-input {
  flex: 1;
  padding: 8px 12px;
  border: 1.5px solid #ccc;
  border-radius: 6px;
  font-size: 0.9rem;
}
.cat-input:focus {
  border-color: #2e7d32;
  outline: none;
}
.color-picker-wrapper {
  width: 38px;
  height: 38px;
  border-radius: 6px;
  border: 1.5px solid #ccc;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.color-picker {
  width: 50px;
  height: 50px;
  border: none;
  cursor: pointer;
  padding: 0;
  background: none;
}
.add-cat-btn {
  padding: 8px 16px;
  background-color: #2e7d32;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.2s;
}
.add-cat-btn:hover {
  background-color: #1b5e20;
}

/* 已有分类修改列表样式 */
.manage-cat-section {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid #eaeaea;
}
.manage-cat-section h3 {
  font-size: 0.95rem;
  margin-bottom: 12px;
  color: #555;
}
.cat-manage-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cat-manage-item {
  display: flex;
  gap: 8px;
  align-items: center;
}
.cat-manage-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.85rem;
}
.cat-manage-color {
  width: 32px;
  height: 32px;
  border: none;
  padding: 0;
  cursor: pointer;
  background: none;
}
.save-cat-btn {
  padding: 6px 10px;
  background-color: #f5f5f5;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.2s;
}
.save-cat-btn:hover {
  background-color: #e0e0e0;
}

/* 快速过滤标签样式 */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 12px;
  border-bottom: 1.5px dashed #f0f0f0;
}
.filter-label {
  font-size: 0.85rem;
  color: #777;
  font-weight: bold;
}
.filter-tag {
  padding: 4px 12px;
  border: 1px solid #eaeaea;
  background: #fafafa;
  border-radius: 20px;
  font-size: 0.8rem;
  cursor: pointer;
  color: #555;
  transition: all 0.2s;
}
.filter-tag:hover {
  background: #f0f0f0;
  border-color: #ccc;
}
.active-tag {
  background-color: #e8f5e9 !important;
  border-color: #2e7d32 !important;
  color: #1b5e20 !important;
  font-weight: bold;
}

/* 孩子端今日完成进度条样式 */
.progress-card {
  margin-bottom: 22px;
  padding: 16px 20px;
  border-color: #b2dfdb;
  background-color: #fafafa;
}
.progress-info-text {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 0.95rem;
  color: #333;
}
.progress-num {
  font-weight: bold;
  color: #00796b;
  font-size: 1.1rem;
}
.progress-track {
  width: 100%;
  height: 10px;
  background-color: #e0e0e0;
  border-radius: 10px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background-color: #009688;
  border-radius: 10px;
  transition: width 0.4s ease-out; 
}

/* 列表通用样式 */
.empty-state {
  color: #999;
  text-align: center;
  padding: 40px 0;
  line-height: 1.6;
}
.task-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.task-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 10px;
  border-bottom: 1px solid #f0f0f0;
}
.task-item:last-child {
  border-bottom: none;
}
.task-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.title-with-badge {
  display: flex;
  align-items: center;
  gap: 10px;
}
.task-name {
  font-weight: 600;
  font-size: 1.05rem;
}

/* 分类徽章 */
.category-badge {
  font-size: 0.75rem;
  font-weight: bold;
  padding: 3px 8px;
  border-radius: 4px;
}

.task-duration {
  font-size: 0.8rem;
  color: #777;
}

/* 操作组 */
.action-group {
  display: flex;
  gap: 10px;
}
.add-today-btn {
  background-color: #e3f2fd;
  color: #0d47a1;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.2s;
}
.add-today-btn:hover {
  background-color: #bbdefb;
}
.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.2s;
  opacity: 0.5;
}
.delete-btn:hover {
  opacity: 1;
  background-color: #ffebee;
}

/* 孩子端列表专用样式 */
.daily-task-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.daily-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  background: #f9f9f9;
  border-left: 5px solid #ccc;
  transition: all 0.3s;
}
.daily-item.pending {
  border-left-color: #9e9e9e;
}
.daily-item.in_progress {
  border-left-color: #0288d1;
  background-color: #e1f5fe;
}
.daily-item.completed {
  border-left-color: #4caf50;
  background-color: #e8f5e9;
}
.daily-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.daily-name {
  font-size: 1.1rem;
  font-weight: bold;
}
.completed .daily-name {
  text-decoration: line-through;
  color: #888;
}
.daily-plan-time {
  font-size: 0.85rem;
  color: #666;
}

/* 孩子端按钮控制 */
.action-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.2s;
}
.action-btn.start {
  background-color: #0288d1;
  color: white;
}
.action-btn.start:hover {
  background-color: #01579b;
}
.running-group {
  display: flex;
  align-items: center;
  gap: 12px;
}
.running-tag {
  color: #0288d1;
  font-weight: bold;
  font-size: 0.9rem;
}
.action-btn.finish {
  background-color: #4caf50;
  color: white;
}
.action-btn.finish:hover {
  background-color: #2e7d32;
}
.completed-tag {
  color: #2e7d32;
  font-weight: bold;
}
</style>