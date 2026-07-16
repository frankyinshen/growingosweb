<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const familyCode = 'DEMO123'

const API_URL = import.meta.env.DEV 
  ? 'http://localhost:8787' 
  : 'https://growing-os-api.frankyinshen.workers.dev'

const tasks = ref<any[]>([])          
const categories = ref<any[]>([])     
const dailyTasks = ref<any[]>([])     
const selectedFilterCategoryId = ref('') 

// 绑定的日历选择日期 [1.1.2]
const selectedDate = ref(new Date().toISOString().split('T')[0])

// 【新增】每日寄语绑定的文字状态
const parentMessage = ref('')

// 批量指派勾选数组
const selectedTaskIds = ref<string[]>([])

// 保存的用户常用组合模板
const bundles = ref<{ name: string, task_ids: string[] }[]>([])

// 输入表单
const newTaskName = ref('')
const newTaskDuration = ref(30)
const newTaskCategoryId = ref('')     
const isSubmitting = ref(false)

const newCategoryName = ref('')
const newCategoryColor = ref('#e3f2fd') 

let timer: any = null

const filteredTasks = computed(() => {
  if (!selectedFilterCategoryId.value) return tasks.value
  return tasks.value.filter(t => t.category_id === selectedFilterCategoryId.value)
})

// 100% 生效的智能文字匹配彩色分类占比算法
const categoryStats = computed(() => {
  const stats: Record<string, { name: string, color: string, duration: number }> = {
    'cat-study': { name: '学科学习', color: '#007aff', duration: 0 },
    'cat-interest': { name: '兴趣爱好', color: '#ff9500', duration: 0 },
    'cat-sport': { name: '体育运动', color: '#34c759', duration: 0 },
    'cat-growth': { name: '日常成长', color: '#af52de', duration: 0 },
    'unclassified': { name: '其他自主', color: '#8e8e93', duration: 0 }
  }
  
  dailyTasks.value.forEach(item => {
    const catName = item.category_name || ''
    const catId = item.category_id || ''
    
    if (catId.startsWith('cat-study') || catName.includes('学科') || catName.includes('学习') || catName.includes('语文') || catName.includes('编程')) {
      stats['cat-study'].duration += item.planned_duration || 30
    } else if (catId.startsWith('cat-interest') || catName.includes('兴趣') || catName.includes('爱好') || catName.includes('乐高') || catName.includes('唱歌')) {
      stats['cat-interest'].duration += item.planned_duration || 30
    } else if (catId.startsWith('cat-sport') || catName.includes('体育') || catName.includes('运动') || catName.includes('橄榄球')) {
      stats['cat-sport'].duration += item.planned_duration || 30
    } else if (catId.startsWith('cat-growth') || catName.includes('日常') || catName.includes('成长') || catName.includes('自律')) {
      stats['cat-growth'].duration += item.planned_duration || 30
    } else {
      stats['unclassified'].duration += item.planned_duration || 30
    }
  })
  
  const total = Object.values(stats).reduce((sum, i) => sum + i.duration, 0)
  
  return Object.values(stats)
    .map(item => ({
      ...item,
      percent: total > 0 ? Math.round((item.duration / total) * 100) : 0
    }))
    .filter(item => item.duration > 0)
})

const fetchCategories = async () => {
  try {
    const res = await fetch(`${API_URL}/api/categories/${familyCode}`)
    const json = await res.json()
    if (json.success) categories.value = json.data
  } catch (err) {
    console.error('获取分类失败:', err)
  }
}

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
      alert('分类信息已同步更新！')
    }
  } catch (err) {
    console.error('更新分类失败:', err)
  }
}

const fetchTasks = async () => {
  try {
    const res = await fetch(`${API_URL}/api/tasks/${familyCode}`)
    const json = await res.json()
    if (json.success) tasks.value = json.data
  } catch (err) {
    console.error('获取任务库失败:', err)
  }
}

const fetchDailyTasks = async (isInitial = false) => {
  try {
    const res = await fetch(`${API_URL}/api/daily-tasks?date=${selectedDate.value}`)
    const json = await res.json()
    if (json.success) {
      dailyTasks.value = json.data
      // 💡 只有在页面一打开、或者换日期(isInitial = true)时，才同步输入框文字
      if (isInitial) {
        parentMessage.value = json.parent_message || ''
      }
    }
  } catch (err) {
    console.error('获取今日计划失败:', err)
  }
}

// 【新增】父母端保存今日寄语到数据库 💬
const saveParentMessage = async () => {
  try {
    const res = await fetch(`${API_URL}/api/daily-plans/message`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent_message: parentMessage.value,
        date: selectedDate.value
      })
    })
    const json = await res.json()
    if (json.success) {
      alert('今日鼓励寄语已发送给孩子！💬')
    }
  } catch (err) {
    console.error('保存寄语失败:', err)
  }
}

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

const addToDailyPlan = async (task: any) => {
  try {
    const res = await fetch(`${API_URL}/api/daily-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: task.id,
        planned_duration: task.default_duration,
        date: selectedDate.value 
      })
    })
    const json = await res.json()
    if (json.success) {
      await fetchDailyTasks() 
    }
  } catch (err) {
    console.error(err)
  }
}

const addSelectedToDailyPlan = async () => {
  if (selectedTaskIds.value.length === 0) return
  try {
    const res = await fetch(`${API_URL}/api/daily-tasks/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_ids: selectedTaskIds.value,
        family_code: familyCode,
        date: selectedDate.value 
      })
    })
    const json = await res.json()
    if (json.success) {
      selectedTaskIds.value = [] 
      await fetchDailyTasks()
      alert('一键组合任务指派成功！🚀')
    }
  } catch (err) {
    console.error('批量指派失败:', err)
  }
}

const saveSelectedAsBundle = () => {
  if (selectedTaskIds.value.length === 0) {
    alert('请在右侧建议池先勾选你要组合的任务！')
    return
  }
  const name = prompt('请输入这个任务组合的名字（如：每日铁三角）：')
  if (!name) return

  const newBundle = {
    name,
    task_ids: [...selectedTaskIds.value]
  }
  bundles.value.push(newBundle)
  localStorage.setItem('growing-os-bundles', JSON.stringify(bundles.value))
  selectedTaskIds.value = [] 
  alert(`组合「${name}」已保存成功！下次一键即可指派。`)
}

const assignSavedBundle = async (bundle: any) => {
  try {
    const res = await fetch(`${API_URL}/api/daily-tasks/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_ids: bundle.task_ids,
        family_code: familyCode,
        date: selectedDate.value 
      })
    })
    const json = await res.json()
    if (json.success) {
      await fetchDailyTasks()
      alert(`常用组合「${bundle.name}」已指派到孩子清单中！🚀`)
    }
  } catch (err) {
    console.error(err)
  }
}

const deleteBundle = (index: number) => {
  if (confirm('确定要删除这个常用组合吗？')) {
    bundles.value.splice(index, 1)
    localStorage.setItem('growing-os-bundles', JSON.stringify(bundles.value))
  }
}

const loadBundles = () => {
  const saved = localStorage.getItem('growing-os-bundles')
  if (saved) bundles.value = JSON.parse(saved)
}

const removeDailyTask = async (id: string) => {
  if (!confirm('确定要帮孩子取消这项今天的任务吗？')) return
  try {
    const res = await fetch(`${API_URL}/api/daily-tasks/${id}`, {
      method: 'DELETE'
    })
    const json = await res.json()
    if (json.success) {
      await fetchDailyTasks() 
    }
  } catch (err) {
    console.error('移除计划失败:', err)
  }
}

const onDateChange = () => {
  fetchDailyTasks()
}

onMounted(() => {
  fetchCategories()
  fetchTasks()
  fetchDailyTasks(true) // 💡 1. 第一次进入页面（传入 true），强制同步一次寄语输入框
  loadBundles() 
  timer = setInterval(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    if (selectedDate.value === todayStr) {
      fetchDailyTasks(false) // 💡 2. 后续每 5 秒的自动轮询（传入 false），只默默刷新状态，绝对不打扰输入法！
    }
  }, 5000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer) 
})
</script>

<template>
  <div class="container">
    <header class="header parent-header">
      <span class="header-date">
        {{ new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) }}
      </span>
      <h1>父母控制端</h1>
      <p class="subtitle">管理建议任务和分类，实时掌控孩子今天的执行进度。</p>
    </header>

    <main class="main-content">
      <!-- 第一栏：新增与分类 -->
      <section class="card form-card">
        <h2>➕ 新增任务建议</h2>
        <div class="form-group">
          <label>任务名称</label>
          <input v-model="newTaskName" type="text" placeholder="例如：数学计算100题、自主阅读" />
        </div>

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

        <div class="custom-cat-section">
          <h3>🛠️ 自定义新建分类</h3>
          <div class="custom-cat-form">
            <input v-model="newCategoryName" type="text" placeholder="输入新分类，如: 🧪 科学实验" class="cat-input" />
            <div class="color-picker-wrapper" title="选择分类背景色">
              <input v-model="newCategoryColor" type="color" class="color-picker" />
            </div>
            <button class="add-cat-btn" @click="saveCustomCategory">添加</button>
          </div>
        </div>

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

      <!-- 第二栏：今日已指派清单 (监控 + 比例彩条 + 💡【新增：家长寄语输入】) -->
      <section class="card daily-monitor-card">
        <div class="card-header-with-loader">
          <h2>📅 计划执行清单</h2>
          <span class="live-tag">● 实时同步中</span>
        </div>

        <div class="calendar-wrapper">
          <span class="calendar-label">📅 日历历史穿梭：</span>
          <input 
            type="date" 
            v-model="selectedDate" 
            class="apple-calendar"
            @change="onDateChange"
          />
        </div>

        <!-- 【新增】父母端一句话鼓励/每日寄语输入栏 💬 -->
        <div class="parent-message-box">
          <label class="msg-label">💬 今日鼓励寄语：</label>
          <div class="msg-form">
            <input 
              v-model="parentMessage" 
              type="text" 
              placeholder="写一句话鼓励孩子，如：今天做完带你去骑车！" 
              class="msg-input"
            />
            <button class="msg-send-btn" @click="saveParentMessage">发送</button>
          </div>
        </div>

        <!-- 今日时间配比分析条 (💡 智能容错：100% 出现，斑斓夺目！) -->
        <div class="analytics-wrapper" v-if="categoryStats.length > 0">
          <div class="analytics-header">
            <span>📊 【{{ selectedDate }}】时间分配比例</span>
          </div>
          <div class="dist-track">
            <div 
              v-for="stat in categoryStats" 
              :key="stat.name"
              class="dist-fill"
              :style="{ width: stat.percent + '%', backgroundColor: stat.color }"
              :title="`${stat.name}: ${stat.duration}分钟 (${stat.percent}%)`"
            ></div>
          </div>
          <ul class="dist-legend">
            <li v-for="stat in categoryStats" :key="stat.name">
              <span class="legend-dot" :style="{ backgroundColor: stat.color }"></span>
              <span class="legend-info">{{ stat.name }} <strong>{{ stat.duration }}</strong>分</span>
            </li>
          </ul>
        </div>

        <div v-if="dailyTasks.length === 0" class="empty-state">
          该日期还没有指派任务。<br>请在右侧任务池中点击【➕ 今日】进行指派。
        </div>
        <ul v-else class="monitor-list">
          <li v-for="item in dailyTasks" :key="item.id" :class="['monitor-item', item.status]">
            <div class="monitor-info">
              <span class="monitor-name">{{ item.task_name }}</span>
              <span class="monitor-plan">计划: {{ item.planned_duration }}分钟</span>
            </div>
            <div class="monitor-action">
              <span v-if="item.status === 'pending'" class="status-badge pending">⏳ 待执行</span>
              <span v-else-if="item.status === 'in_progress'" class="status-badge running">⚡ 进行中</span>
              <!-- 💡 【大更新：父母端审计完美闭环！】当 item.is_manual === 1 时，高亮亮起“✍️ 修正”警告徽章！ -->
              <span v-else class="status-badge done">
                🎉 已完成 ({{ item.actual_duration }}分)
                <span v-if="item.is_manual === 1" class="manual-warning-badge">✍️ 修正</span>
              </span>
              <button class="remove-daily-btn" @click="removeDailyTask(item.id)" title="取消今天的指派">🗑️</button>
            </div>
          </li>
        </ul>
      </section>

      <!-- 第三栏：建议任务池 -->
      <section class="card list-card">
        <div class="pool-header">
          <h2>📋 任务库建议池</h2>
          <button 
            class="batch-assign-btn" 
            @click="addSelectedToDailyPlan"
            :disabled="selectedTaskIds.length === 0"
            title="一键指派勾选的所有任务到今日计划"
          >
            🚀 一键指派 ({{ selectedTaskIds.length }})
          </button>
        </div>

        <!-- 我的常用指派组合自定义保存面板 -->
        <div class="bundle-section" v-if="bundles.length > 0 || selectedTaskIds.length > 0">
          <h3>📦 我的常用指派组合</h3>
          <div class="bundle-actions">
            <button 
              v-if="selectedTaskIds.length > 0" 
              class="save-bundle-btn"
              @click="saveSelectedAsBundle"
            >
              💾 将勾选的 {{ selectedTaskIds.length }} 项保存为常用组合
            </button>
            <div class="bundle-list" v-if="bundles.length > 0">
              <div v-for="(b, idx) in bundles" :key="b.name" class="bundle-chip-item">
                <button class="bundle-chip" @click="assignSavedBundle(b)">
                  🚀 {{ b.name }}
                </button>
                <button class="delete-bundle-btn" @click="deleteBundle(idx)" title="删除此组合">×</button>
              </div>
            </div>
          </div>
        </div>

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

        <div v-if="filteredTasks.length === 0" class="empty-state">当前分类下暂无任务建议。</div>
        <ul v-else class="task-list">
          <li v-for="task in filteredTasks" :key="task.id" class="task-item">
            <div class="task-info">
              <div class="title-with-badge">
                <input 
                  type="checkbox" 
                  :value="task.id" 
                  v-model="selectedTaskIds" 
                  class="task-checkbox"
                />
                <span class="task-name">{{ task.name }}</span>
                <span v-if="task.category_name" class="category-badge" :style="{ backgroundColor: task.category_bg_color, color: task.category_text_color }">
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
</template>

<style scoped>
.container { max-width: 1420px; margin: 0 auto; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, "SF Pro SC", "SF Pro Text", "Helvetica Neue", Arial, sans-serif; color: #1d1d1f; }

.parent-header { text-align: center; margin-bottom: 48px; padding-top: 10px; }
.header-date { display: block; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.08em; color: #86868b; margin-bottom: 10px; text-transform: uppercase; }
.parent-header h1 { font-size: 2.4rem; font-weight: 700; color: #1d1d1f; margin: 0 0 12px 0; letter-spacing: -0.015em; }
.subtitle { font-size: 1.15rem; line-height: 1.47; font-weight: 400; color: #86868b; margin: 0; letter-spacing: -0.022em; }

.main-content { display: grid; grid-template-columns: 1fr 1.1fr 1.1fr; gap: 24px; }
.card { background: #ffffff; border-radius: 16px; padding: 24px; box-shadow: 0 8px 30px rgba(0,0,0,0.04); border: 1px solid #f2f2f7; }
.card h2 { font-size: 1.25rem; margin-top: 0; margin-bottom: 20px; color: #1d1d1f; border-bottom: 1px solid #f2f2f7; padding-bottom: 12px; }

/* 💡【一句话寄语输入框样式】 */
.parent-message-box { background-color: #f5f5f7; border-radius: 12px; padding: 12px 16px; margin-bottom: 18px; border: 1px solid #e8e8ed; display: flex; flex-direction: column; gap: 6px; }
.msg-label { font-size: 0.82rem; font-weight: bold; color: #555; }
.msg-form { display: flex; gap: 8px; }
.msg-input { flex: 1; padding: 6px 12px; border: 1.5px solid #ccc; border-radius: 6px; font-size: 0.88rem; background: white; }
.msg-input:focus { border-color: #007aff; outline: none; }
.msg-send-btn { background-color: #007aff; color: white; border: none; padding: 6px 14px; border-radius: 6px; font-size: 0.85rem; font-weight: bold; cursor: pointer; }

.calendar-wrapper { display: flex; align-items: center; background-color: #f5f5f7; border-radius: 12px; padding: 12px 16px; margin-bottom: 18px; border: 1px solid #e8e8ed; gap: 8px; }
.calendar-label { font-size: 0.88rem; font-weight: bold; color: #1d1d1f; }
.apple-calendar { border: 1.5px solid #007aff; background-color: #ffffff; color: #007aff; font-weight: bold; font-size: 0.9rem; padding: 4px 12px; border-radius: 8px; cursor: pointer; outline: none; }

.card-header-with-loader { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f2f2f7; margin-bottom: 16px; padding-bottom: 12px; }
.card-header-with-loader h2 { border: none; margin: 0; padding: 0; }
.live-tag { font-size: 0.75rem; font-weight: bold; color: #34c759; background-color: #e8f5e9; padding: 4px 10px; border-radius: 20px; display: flex; align-items: center; gap: 5px; }
.live-tag::before { content: ""; display: inline-block; width: 6px; height: 6px; background-color: #34c759; border-radius: 50%; animation: blink 1.5s infinite; }
@keyframes blink { 0% { opacity: 0.3; } 50% { opacity: 1; } 100% { opacity: 0.3; } }

.analytics-wrapper { background-color: #f5f5f7; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; border: 1px solid #e8e8ed; }
.analytics-header { font-size: 0.85rem; font-weight: bold; color: #555; margin-bottom: 10px; }
.dist-track { width: 100%; height: 12px; background-color: #e5e5ea; border-radius: 6px; overflow: hidden; display: flex; }
.dist-fill { height: 100%; transition: width 0.4s ease-out; }
.dist-fill:first-child { border-top-left-radius: 6px; border-bottom-left-radius: 6px; }
.dist-fill:last-child { border-top-right-radius: 6px; border-bottom-right-radius: 6px; }
.dist-legend { list-style: none; padding: 0; margin: 12px 0 0 0; display: flex; flex-wrap: wrap; gap: 8px 14px; }
.dist-legend li { display: flex; align-items: center; gap: 6px; }
.legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.legend-info { font-size: 0.78rem; color: #666; }

.monitor-list { list-style: none; padding: 0; margin: 0; }
.monitor-item { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-radius: 12px; margin-bottom: 12px; border: 1px solid #f2f2f7; border-left: 5px solid #ccc; background-color: #fafafa; }
.monitor-item.pending { border-left-color: #aeaeae; }
.monitor-item.in_progress { border-left-color: #007aff; background-color: #f2f9ff; border-color: #d0e7ff; }
.monitor-item.completed { border-left-color: #34c759; background-color: #f2fbf4; border-color: #d3f4dd; }
.monitor-info { display: flex; flex-direction: column; gap: 4px; }
.monitor-name { font-weight: bold; font-size: 1rem; }
.monitor-plan { font-size: 0.8rem; color: #86868b; }
.monitor-action { display: flex; align-items: center; gap: 10px; }
.status-badge { font-size: 0.75rem; font-weight: bold; padding: 4px 8px; border-radius: 6px; }
.status-badge.pending { color: #86868b; background-color: #e5e5ea; }
.status-badge.running { color: #007aff; background-color: #e1f5fe; }
.status-badge.done { color: #34c759; background-color: #e8f5e9; }

/* 💡【新增：父母端审计标记样式（高对比度淡黄底橙红字）】 */
.manual-warning-badge { font-size: 0.7rem; background-color: #ffebee; color: #ff3b30; padding: 2px 6px; border-radius: 4px; margin-left: 5px; font-weight: bold; }

.remove-daily-btn { background: none; border: none; cursor: pointer; font-size: 1rem; padding: 4px; border-radius: 6px; opacity: 0.5; }
.remove-daily-btn:hover { opacity: 1; background-color: #ffebee; }

.pool-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f2f2f7; margin-bottom: 16px; padding-bottom: 12px; }
.pool-header h2 { border: none; margin: 0; padding: 0; }
.batch-assign-btn { background-color: #007aff; color: white; border: none; padding: 6px 14px; border-radius: 8px; font-weight: bold; font-size: 0.85rem; cursor: pointer; transition: opacity 0.2s; }
.batch-assign-btn:disabled { background-color: #e5e5ea; color: #aeaeae; cursor: not-allowed; }

.bundle-section { background-color: #f5f5f7; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; border: 1px solid #e8e8ed; }
.bundle-section h3 { font-size: 0.85rem; margin-top: 0; margin-bottom: 10px; color: #555; }
.bundle-actions { display: flex; flex-direction: column; gap: 10px; }
.save-bundle-btn { background-color: #e3f2fd; color: #0d47a1; border: 1px solid #bbdefb; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 0.82rem; cursor: pointer; align-self: flex-start; }
.bundle-list { display: flex; flex-wrap: wrap; gap: 8px; }
.bundle-chip-item { display: flex; align-items: center; background-color: #ffffff; border: 1px solid #e8e8ed; border-radius: 20px; padding: 2px 4px 2px 10px; gap: 4px; }
.bundle-chip { background: none; border: none; font-size: 0.8rem; font-weight: bold; color: #1d1d1f; cursor: pointer; padding: 4px 0; }
.bundle-chip:hover { color: #007aff; }
.delete-bundle-btn { background: none; border: none; color: #aeaeae; font-size: 1.1rem; cursor: pointer; padding: 0 4px; line-height: 1; }
.delete-bundle-btn:hover { color: #ff3b30; }

.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-weight: 600; margin-bottom: 8px; font-size: 0.9rem; color: #555; }
.form-group input, .form-select { width: 100%; padding: 10px 12px; border: 1.5px solid #ccc; border-radius: 8px; font-size: 1rem; box-sizing: border-box; background: white; }
.form-group input:focus, .form-select:focus { border-color: #007aff; outline: none; }
.btn { width: 100%; padding: 12px; background-color: #007aff; color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: bold; cursor: pointer; }
.btn:hover { background-color: #0056b3; }

.custom-cat-section { margin-top: 25px; padding-top: 20px; border-top: 1.5px dashed #eaeaea; }
.custom-cat-section h3 { font-size: 0.95rem; margin-top: 0; margin-bottom: 12px; color: #555; }
.custom-cat-form { display: flex; gap: 10px; align-items: center; }
.cat-input { flex: 1; padding: 8px 12px; border: 1.5px solid #ccc; border-radius: 6px; font-size: 0.9rem; }
.color-picker-wrapper { width: 38px; height: 38px; border-radius: 6px; border: 1.5px solid #ccc; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.color-picker { width: 50px; height: 50px; border: none; cursor: pointer; padding: 0; background: none; }
.add-cat-btn { padding: 8px 16px; background-color: #007aff; color: white; border: none; border-radius: 6px; font-size: 0.9rem; font-weight: bold; cursor: pointer; }
.manage-cat-section { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eaeaea; }
.manage-cat-section h3 { font-size: 0.95rem; margin-bottom: 12px; color: #555; }
.cat-manage-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.cat-manage-item { display: flex; gap: 8px; align-items: center; }
.cat-manage-input { flex: 1; padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 0.85rem; }
.cat-manage-color { width: 32px; height: 32px; border: none; padding: 0; cursor: pointer; background: none; }
.save-cat-btn { padding: 6px 10px; background-color: #f5f5f5; border: 1px solid #ccc; border-radius: 4px; font-size: 0.8rem; cursor: pointer; }

.filter-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 15px; padding-bottom: 12px; border-bottom: 1.5px dashed #f0f0f0; }
.filter-label { font-size: 0.85rem; color: #777; font-weight: bold; }
.filter-tag { padding: 4px 12px; border: 1px solid #eaeaea; background: #fafafa; border-radius: 20px; font-size: 0.8rem; cursor: pointer; color: #555; }
.active-tag { background-color: #e8f5e9 !important; border-color: #2e7d32 !important; color: #1b5e20 !important; font-weight: bold; }
.empty-state { color: #86868b; text-align: center; padding: 40px 0; }

.task-list { list-style: none; padding: 0; margin: 0; }
.task-item { display: flex; justify-content: space-between; align-items: center; padding: 14px 10px; border-bottom: 1px solid #f2f2f7; }
.task-item:last-child { border-bottom: none; }
.task-info { display: flex; flex-direction: column; gap: 6px; }
.title-with-badge { display: flex; align-items: center; gap: 10px; }
.task-checkbox { width: 16px; height: 16px; border: 1.5px solid #ccc; border-radius: 4px; cursor: pointer; }
.task-name { font-weight: 600; font-size: 1.05rem; }
.category-badge { font-size: 0.72rem; font-weight: bold; padding: 3px 8px; border-radius: 6px; }
.task-duration { font-size: 0.8rem; color: #86868b; }
.action-group { display: flex; gap: 10px; }
.add-today-btn { background-color: #f2f9ff; color: #007aff; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 0.85rem; }
.delete-btn { background: none; border: none; cursor: pointer; font-size: 1.1rem; padding: 4px; border-radius: 6px; opacity: 0.5; }
.delete-btn:hover { opacity: 1; background-color: #ffebee; }
</style>