<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const familyCode = 'DEMO123'

const API_URL = import.meta.env.DEV 
  ? 'http://localhost:8787' 
  : 'https://growing-os-api.frankyinshen.workers.dev'

const dailyTasks = ref<any[]>([])     
const isSyncing = ref(false) 

// 【新增】保存家长发来的寄语文字
const parentMessage = ref('')

// 孩子自主添加表单状态
const childNewTaskName = ref('')
const childNewTaskDuration = ref(30)
const dragIndex = ref<number | null>(null)

let timer: any = null

const completedCount = computed(() => dailyTasks.value.filter(t => t.status === 'completed').length)
const totalCount = computed(() => dailyTasks.value.length)
const progressPercent = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((completedCount.value / totalCount.value) * 100)
})

const totalActualMinutes = computed(() => {
  return dailyTasks.value
    .filter(t => t.status === 'completed')
    .reduce((sum, item) => sum + (item.actual_duration || 0), 0)
})

// 💡 升级：拉取任务的同时，自动刷新家长写的今日寄语！
const fetchDailyTasks = async (showAnim = false) => {
  if (showAnim) isSyncing.value = true
  try {
    const res = await fetch(`${API_URL}/api/daily-tasks`)
    const json = await res.json()
    if (json.success) {
      dailyTasks.value = json.data
      parentMessage.value = json.parent_message || '' // 💡 同步家长发送的寄语
    }
  } catch (err) {
    console.error('获取今日计划失败:', err)
  } finally {
    if (showAnim) {
      setTimeout(() => { isSyncing.value = false }, 600) 
    }
  }
}

const onDragStart = (index: number) => {
  dragIndex.value = index
}

const onDragOver = (event: DragEvent) => {
  event.preventDefault() 
}

const onDrop = async (index: number) => {
  if (dragIndex.value === null || dragIndex.value === index) return
  
  const draggedItem = dailyTasks.value[dragIndex.value]
  dailyTasks.value.splice(dragIndex.value, 1) 
  dailyTasks.value.splice(index, 0, draggedItem) 
  
  dragIndex.value = null 

  const orders = dailyTasks.value.map((item, idx) => ({
    id: item.id,
    order_index: idx + 1
  }))

  try {
    const res = await fetch(`${API_URL}/api/daily-tasks/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders })
    })
    const json = await res.json()
    if (!json.success) {
      alert('同步保存排序失败')
    }
  } catch (err) {
    console.error('排序更新失败:', err)
  }
}

const addChildTaskDirectly = async () => {
  if (!childNewTaskName.value.trim()) {
    alert('想要安排点什么呢？')
    return
  }
  try {
    const res = await fetch(`${API_URL}/api/daily-tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_name: childNewTaskName.value,
        planned_duration: childNewTaskDuration.value,
        family_code: familyCode
      })
    })
    const json = await res.json()
    if (json.success) {
      childNewTaskName.value = ''
      childNewTaskDuration.value = 30
      await fetchDailyTasks(true) 
    }
  } catch (err) {
    console.error(err)
  }
}

const removeDailyTask = async (id: string) => {
  if (!confirm('确定要从今天的计划里删掉这个任务吗？')) return
  try {
    const res = await fetch(`${API_URL}/api/daily-tasks/${id}`, {
      method: 'DELETE'
    })
    const json = await res.json()
    if (json.success) {
      await fetchDailyTasks(true) 
    }
  } catch (err) {
    console.error('删除计划失败:', err)
  }
}

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

const editTimeManually = async (item: any) => {
  const input = prompt(`请输入「${item.task_name}」的真实实际耗时 (分钟):`, item.actual_duration || 30)
  if (input === null) return 

  const duration = parseInt(input, 10)
  if (isNaN(duration) || duration <= 0) {
    alert('请输入正确的分钟整数！')
    return
  }

  try {
    const res = await fetch(`${API_URL}/api/daily-tasks/${item.id}/manual-time`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actual_duration: duration })
    })
    const json = await res.json()
    if (json.success) {
      await fetchDailyTasks() 
    }
  } catch (err) {
    console.error(err)
  }
}

onMounted(() => {
  fetchDailyTasks()
  timer = setInterval(() => { fetchDailyTasks(false) }, 5000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer) 
})
</script>

<template>
  <div class="child-container">
    <header class="header child-header">
      <span class="header-date">
        {{ new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) }}
      </span>
      <h1>我的一天</h1>
      <p class="subtitle">今天你想怎样度过？开始执行并记录你的精彩一天。</p>
    </header>

    <main class="child-main">
      <!-- 【新增：父母今日极简高级鼓励寄语卡片】 💬 -->
      <section class="card msg-bubble-card" v-if="parentMessage">
        <div class="msg-bubble-title">💬 爸妈今天的寄语</div>
        <p class="msg-bubble-content">“ {{ parentMessage }} ”</p>
      </section>

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
        <div class="daily-card-header">
          <h2>📅 今日任务清单</h2>
          <div class="sync-status">
            <span class="pulse-dot"></span>
            <button 
              :class="['sync-btn', isSyncing ? 'spinning' : '']" 
              @click="fetchDailyTasks(true)"
              title="手动一键同步云端数据"
            >
              🔄 同步
            </button>
          </div>
        </div>

        <div class="child-add-box">
          <input 
            v-model="childNewTaskName" 
            type="text" 
            placeholder="➕ 想要自主安排点什么？如：搭乐高、画画、读书..." 
            class="child-add-input"
          />
          <div class="child-duration-wrapper">
            <input 
              v-model.number="childNewTaskDuration" 
              type="number" 
              min="5" 
              step="5" 
              class="child-add-duration"
            />
            <span class="child-add-unit">分钟</span>
          </div>
          <button class="child-add-btn" @click="addChildTaskDirectly">安排</button>
        </div>

        <div v-if="dailyTasks.length === 0" class="empty-state">
          今天还没有安排任务哦。<br>在上方自主输入并点击【安排】，或者让爸爸妈妈在“父母端”把任务指派过来。
        </div>
        
        <ul v-else class="daily-task-list">
          <li 
            v-for="(item, index) in dailyTasks" 
            :key="item.id" 
            :class="['daily-item', item.status, dragIndex === index ? 'dragging' : '']"
            draggable="true"
            @dragstart="onDragStart(index)"
            @dragover="onDragOver"
            @drop="onDrop(index)"
          >
            <div class="daily-info">
              <div class="title-with-badge">
                <span class="drag-handle" title="按住拖拽排序">☰</span>
                <span class="daily-name">{{ item.task_name }}</span>
                <span v-if="item.category_name" class="category-badge" :style="{ backgroundColor: item.category_bg_color, color: item.category_text_color }">
                  {{ item.category_name }}
                </span>
              </div>
              <div class="time-meta">
                <span class="daily-plan-time">⏱️ 计划: {{ item.planned_duration }}分钟</span>
                <span v-if="item.status === 'completed' && item.actual_duration" class="daily-actual-time">
                  | 🔥 实际耗时: {{ item.actual_duration }} 分钟
                  <span v-if="item.is_manual === 1" class="manual-badge">✍️ 手动修正</span>
                </span>
              </div>
            </div>
            
            <div class="status-action-group">
              <div class="status-action">
                <button v-if="item.status === 'pending'" class="action-btn start" @click="updateDailyTaskStatus(item.id, 'in_progress')">▶️ 开始</button>
                <div v-else-if="item.status === 'in_progress'" class="running-group">
                  <span class="running-tag">⚡ 正在进行...</span>
                  <button class="action-btn finish" @click="updateDailyTaskStatus(item.id, 'completed')">✅ 完成</button>
                </div>
                <div v-else-if="item.status === 'completed'" class="completed-group">
                  <span class="completed-tag">🎉 已完成</span>
                  <button class="edit-time-btn" @click="editTimeManually(item)" title="点击修正实际耗时">✏️ 修正</button>
                </div>
              </div>

              <button 
                v-if="item.is_child_added === 1"
                class="remove-item-btn" 
                @click="removeDailyTask(item.id)" 
                title="从今天计划中移除"
              >
                ×
              </button>
            </div>
          </li>
        </ul>
      </section>

      <!-- 我的自律勋章墙 -->
      <section class="card medal-card">
        <h2>🏆 我的自律勋章墙</h2>
        <div class="medal-shelf">
          <div :class="['medal-item', progressPercent === 100 && totalCount > 0 ? 'unlocked' : 'locked']">
            <div class="medal-glow"></div>
            <div class="medal-emoji">🏆</div>
            <span class="medal-title">完美自律之星</span>
            <span class="medal-desc">
              {{ progressPercent === 100 && totalCount > 0 ? '今天任务100%搞定！' : '今日100%完成时解锁' }}
            </span>
          </div>
          
          <div :class="['medal-item', completedCount > 0 ? 'unlocked' : 'locked']">
            <div class="medal-glow"></div>
            <div class="medal-emoji">🚀</div>
            <span class="medal-title">今日行动派</span>
            <span class="medal-desc">
              {{ completedCount > 0 ? '迈出了自律的第一步！' : '完成1个任务时解锁' }}
            </span>
          </div>

          <div :class="['medal-item', totalActualMinutes >= 60 ? 'unlocked' : 'locked']">
            <div class="medal-glow"></div>
            <div class="medal-emoji">⏱️</div>
            <span class="medal-title">专注挑战者</span>
            <span class="medal-desc">
              {{ totalActualMinutes >= 60 ? `今日深度专注累计 ${totalActualMinutes} 分钟！` : `今日累计实际专注 1 小时解锁（当前: ${totalActualMinutes}/60分钟）` }}
            </span>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.child-container { max-width: 700px; margin: 0 auto; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, "SF Pro SC", "SF Pro Text", "Helvetica Neue", Arial, sans-serif; color: #1d1d1f; }

.child-header { text-align: center; margin-bottom: 48px; padding-top: 10px; }
.header-date { display: block; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.08em; color: #86868b; margin-bottom: 10px; text-transform: uppercase; }
.child-header h1 { font-size: 2.4rem; font-weight: 700; color: #1d1d1f; margin: 0 0 12px 0; letter-spacing: -0.015em; }
.subtitle { font-size: 1.15rem; line-height: 1.47; font-weight: 400; color: #86868b; margin: 0; letter-spacing: -0.022em; }

.card { background: #ffffff; border-radius: 16px; padding: 24px; box-shadow: 0 8px 30px rgba(0,0,0,0.04); border: 1px solid #f2f2f7; margin-bottom: 24px; }
.card h2 { font-size: 1.25rem; margin-top: 0; margin-bottom: 20px; color: #1d1d1f; border-bottom: 1px solid #f2f2f7; padding-bottom: 12px; }

/* 💡【新增：家长今日鼓励寄语卡片（苹果对话泡泡风格）】 */
.msg-bubble-card { background: linear-gradient(135deg, #e0f2f1 0%, #e8f5e9 100%); border: 1px solid #b2dfdb; padding: 18px 24px; }
.msg-bubble-title { font-size: 0.8rem; font-weight: bold; color: #00796b; margin-bottom: 6px; letter-spacing: 0.05em; text-transform: uppercase; }
.msg-bubble-content { font-size: 1.15rem; font-weight: 600; color: #004d40; margin: 0; line-height: 1.4; font-style: italic; }

.daily-card-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f2f2f7; margin-bottom: 20px; padding-bottom: 12px; }
.daily-card-header h2 { border: none; margin: 0; padding: 0; }
.sync-status { display: flex; align-items: center; gap: 12px; }
.pulse-dot { width: 6px; height: 6px; background-color: #007aff; border-radius: 50%; animation: pulse-blink 1.5s infinite; }
@keyframes pulse-blink { 0% { opacity: 0.3; } 50% { opacity: 1; } 100% { opacity: 0.3; } }

.sync-btn { background: none; border: none; font-size: 0.85rem; font-weight: bold; color: #007aff; cursor: pointer; display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px; transition: background 0.2s; }
.sync-btn:hover { background-color: #f2f9ff; }
.sync-btn.spinning { animation: spin-anim 0.6s linear infinite; }
@keyframes spin-anim { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

.child-add-box { display: flex; gap: 12px; align-items: center; background-color: #f5f5f7; padding: 8px 12px; border-radius: 12px; margin-bottom: 24px; border: 1px solid #e8e8ed; }
.child-add-input { flex: 1; background: none; border: none; font-size: 1rem; color: #1d1d1f; padding: 8px 0; }
.child-add-input::placeholder { color: #86868b; }
.child-add-input:focus { outline: none; }
.child-duration-wrapper { display: flex; align-items: center; gap: 6px; background: #ffffff; padding: 4px 10px; border-radius: 8px; border: 1px solid #e8e8ed; }
.child-add-duration { width: 45px; border: none; background: none; font-size: 0.95rem; font-weight: bold; text-align: center; color: #1d1d1f; }
.child-add-duration:focus { outline: none; }
.child-add-unit { font-size: 0.8rem; color: #86868b; font-weight: 600; }
.child-add-btn { background-color: #007aff; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: bold; font-size: 0.9rem; cursor: pointer; }
.child-add-btn:hover { background-color: #0056b3; }

.progress-card { margin-bottom: 22px; padding: 18px 24px; border: 1px solid #e0f2f1; background-color: #fafafa; }
.progress-info-text { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 0.95rem; color: #1d1d1f; }
.progress-num { font-weight: bold; color: #00796b; font-size: 1.1rem; }
.progress-track { width: 100%; height: 8px; background-color: #e5e5ea; border-radius: 10px; overflow: hidden; }
.progress-fill { height: 100%; background-color: #009688; border-radius: 10px; transition: width 0.4s ease-out; }
.empty-state { color: #86868b; text-align: center; padding: 40px 0; font-size: 0.95rem; }
.daily-task-list { list-style: none; padding: 0; margin: 0; }

.daily-item { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; border-radius: 12px; margin-bottom: 14px; background: #ffffff; border: 1px solid #f2f2f7; border-left: 6px solid #ccc; box-shadow: 0 2px 8px rgba(0,0,0,0.01); transition: all 0.3s; cursor: grab; }
.daily-item:active { cursor: grabbing; }
.daily-item.dragging { opacity: 0.3; border: 1.5px dashed #007aff; background-color: #f2f9ff; }
.daily-item.pending { border-left-color: #aeaeae; }
.daily-item.in_progress { border-left-color: #007aff; background-color: #f2f9ff; border-color: #d0e7ff; }
.daily-item.completed { border-left-color: #34c759; background-color: #f2fbf4; border-color: #d3f4dd; }
.daily-info { display: flex; flex-direction: column; gap: 6px; }

.drag-handle { color: #c7c7cc; cursor: grab; font-size: 1.1rem; margin-right: 6px; user-select: none; }
.daily-name { font-size: 1.1rem; font-weight: bold; }
.completed .daily-name { text-decoration: line-through; color: #86868b; }
.title-with-badge { display: flex; align-items: center; gap: 10px; }
.category-badge { font-size: 0.72rem; font-weight: bold; padding: 3px 8px; border-radius: 6px; }
.time-meta { display: flex; gap: 8px; align-items: center; }
.daily-plan-time { font-size: 0.85rem; color: #86868b; }
.daily-actual-time { font-size: 0.85rem; color: #ff9500; font-weight: bold; }
.manual-badge { font-size: 0.7rem; background-color: #ffe0b2; color: #e65100; padding: 2px 6px; border-radius: 4px; margin-left: 5px; font-weight: bold; }

.status-action-group { display: flex; align-items: center; gap: 15px; }
.status-action { display: flex; align-items: center; }
.action-btn { padding: 8px 18px; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 0.9rem; transition: background 0.2s; }
.action-btn.start { background-color: #007aff; color: white; }
.action-btn.start:hover { background-color: #0056b3; }
.running-group { display: flex; align-items: center; gap: 12px; }
.running-tag { color: #007aff; font-weight: bold; font-size: 0.9rem; }
.action-btn.finish { background-color: #34c759; color: white; }
.completed-group { display: flex; align-items: center; gap: 8px; }
.completed-tag { color: #34c759; font-weight: bold; }
.edit-time-btn { background: none; border: none; cursor: pointer; font-size: 0.9rem; padding: 4px 8px; border-radius: 4px; transition: background 0.2s; }
.edit-time-btn:hover { background-color: #e5e5ea; }

.remove-item-btn { background: none; border: none; color: #aeaeae; font-size: 1.5rem; font-weight: 300; cursor: pointer; padding: 4px; line-height: 1; transition: color 0.2s; }
.remove-item-btn:hover { color: #ff3b30; }

/* 苹果风自律荣誉勋章墙样式 */
.medal-card { background: #ffffff; margin-top: 15px; }
.medal-shelf { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 10px; }
.medal-item { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 18px 14px; border-radius: 12px; border: 1px solid #f2f2f7; transition: all 0.4s ease; }
.medal-emoji { font-size: 2.2rem; margin-bottom: 10px; transition: transform 0.4s ease; }
.medal-title { font-size: 0.92rem; font-weight: bold; color: #1d1d1f; margin-bottom: 6px; }
.medal-desc { font-size: 0.75rem; color: #86868b; line-height: 1.3; }
.medal-item.locked { opacity: 0.4; filter: grayscale(100%); background-color: #fafafa; }
.medal-item.unlocked { opacity: 1; filter: none; background-color: #ffffff; border-color: #ffe082; box-shadow: 0 8px 24px rgba(255, 179, 0, 0.08); transform: translateY(-2px); }
.medal-item.unlocked .medal-emoji { transform: scale(1.15) rotate(5deg); }
.medal-item.unlocked .medal-glow { position: absolute; top: -5px; left: -5px; right: -5px; bottom: -5px; border-radius: 16px; border: 2px solid #ffd54f; opacity: 0.2; animation: glow-breathe 2s infinite ease-in-out; }
@keyframes glow-breathe { 0% { transform: scale(0.98); opacity: 0.1; } 50% { transform: scale(1.02); opacity: 0.4; } 100% { transform: scale(0.98); opacity: 0.1; } }
</style>