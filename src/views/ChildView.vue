<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, reactive } from 'vue'

const familyCode = 'DEMO123'
const API_URL = import.meta.env.DEV 
  ? 'http://localhost:8787' 
  : 'https://growingworker.evanyin.dpdns.org'

const dailyTasks = ref<any[]>([])     
const isSyncing = ref(false) 

const getOffsetDateString = (offsetDays: number) => {
  const d = new Date(); d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const todayStr = getOffsetDateString(0)
const yesterdayStr = getOffsetDateString(-1)
const tomorrowStr = getOffsetDateString(1)

const currentViewDate = ref(todayStr)
const isReadOnly = computed(() => currentViewDate.value !== todayStr)

const parentMessage = ref('')
const childReflection = ref('')

const childNewTaskName = ref('')
const childNewTaskDuration = ref(30)
const dragIndex = ref<number | null>(null)
let timer: any = null

const isWakeLockActive = ref(false)
let wakeLock: any = null

// 💡 孩子端安全门禁状态
const isAuthed = ref(false)
const childInputPassword = ref('')

const toggleWakeLock = async () => {
  if (isWakeLockActive.value) {
    if (wakeLock !== null) { await wakeLock.release(); wakeLock = null }
    isWakeLockActive.value = false
  } else {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await (navigator as any).wakeLock.request('screen')
        isWakeLockActive.value = true
        wakeLock.addEventListener('release', () => { isWakeLockActive.value = false })
      } else { alert('当前浏览器不支持强制常亮') }
    } catch (err: any) { alert(`无法开启常亮: ${err.message}`) }
  }
}

// ==========================================
// 20-20-20 护眼番茄钟逻辑 (带语音播报)
// ==========================================
const isEyeResting = ref(false)
const eyeRestCountdown = ref(20)
let eyeRestInterval: any = null

const triggerEyeRest = () => {
  isEyeResting.value = true; eyeRestCountdown.value = 20
  // 💡 播报开场白
  speakText('护眼时间到，请闭上眼睛或看向远方，倒计时二十秒')
  if (eyeRestInterval) clearInterval(eyeRestInterval)
  eyeRestInterval = setInterval(() => {
    eyeRestCountdown.value--
    // 💡 最后5秒报数
    if (eyeRestCountdown.value <= 5 && eyeRestCountdown.value > 0) {
      speakText(String(eyeRestCountdown.value))
    } else if (eyeRestCountdown.value === 0) {
      // 💡 播报结束语
      speakText('时间到，可以继续了')
      clearInterval(eyeRestInterval); isEyeResting.value = false
    }
  }, 1000)
}

const showCertificate = ref(false)
const runningTimers = reactive<Record<string, { seconds: number, isPaused: boolean, intervalId: any }>>({})

const formatTime = (totalSeconds: number) => {
  const hrs = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const secs = String(totalSeconds % 60).padStart(2, '0')
  return `${hrs}:${mins}:${secs}`
}

const startLocalTimer = (itemId: string, initialSeconds = 0) => {
  if (runningTimers[itemId]?.intervalId) return
  if (!runningTimers[itemId]) runningTimers[itemId] = { seconds: initialSeconds, isPaused: false, intervalId: null }
  runningTimers[itemId].intervalId = setInterval(() => {
    if (!runningTimers[itemId].isPaused) {
      runningTimers[itemId].seconds++
      localStorage.setItem(`task-timer-${itemId}`, JSON.stringify({ seconds: runningTimers[itemId].seconds, isPaused: runningTimers[itemId].isPaused }))
      if (runningTimers[itemId].seconds > 0 && runningTimers[itemId].seconds % 1200 === 0) triggerEyeRest()
    }
  }, 1000)
}

const togglePauseLocalTimer = (itemId: string) => {
  if (runningTimers[itemId]) {
    runningTimers[itemId].isPaused = !runningTimers[itemId].isPaused
    localStorage.setItem(`task-timer-${itemId}`, JSON.stringify({ seconds: runningTimers[itemId].seconds, isPaused: runningTimers[itemId].isPaused }))
  }
}

const finishLocalTimer = async (item: any) => {
  const state = runningTimers[item.id]
  const totalSeconds = state ? state.seconds : 0
  if (state?.intervalId) clearInterval(state.intervalId)
  delete runningTimers[item.id]
  localStorage.removeItem(`task-timer-${item.id}`)
  const actualMinutes = Math.max(1, Math.round(totalSeconds / 60))
  try {
    await authFetch(`${API_URL}/api/daily-tasks/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'completed', actual_duration: actualMinutes }) })
    await fetchDailyTasks() 
  } catch (err) { console.error(err) }
}

const completedCount = computed(() => dailyTasks.value.filter(t => t.status === 'completed').length)
const totalCount = computed(() => dailyTasks.value.length)

const progressPercent = computed(() => {
  if (totalCount.value === 0) return 0
  const requiredTasks = dailyTasks.value.filter(t => t.is_required === 1)
  if (requiredTasks.length === 0) return Math.round((completedCount.value / totalCount.value) * 100)
  const completedRequired = requiredTasks.filter(t => t.status === 'completed').length
  if (completedRequired < requiredTasks.length) return 99 
  return Math.round((completedCount.value / totalCount.value) * 100)
})

const totalActualMinutes = computed(() => dailyTasks.value.filter(t => t.status === 'completed').reduce((sum, item) => sum + (item.actual_duration || 0), 0))

// 💡 核心安全封装：孩子端所有请求也必须带上密码
const authFetch = (url: string, options: any = {}) => {
  const pwd = localStorage.getItem(`growing-parent-auth-${familyCode}`) || ''
  options.headers = {
    ...options.headers,
    'x-family-code': familyCode,
    'x-family-password': pwd
  }
  return fetch(url, options)
}

const handleChildLogin = async () => {
  if (!childInputPassword.value) return alert('请输入父母设置的管理密码！')
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ family_code: familyCode, password: childInputPassword.value })
    })
    const json = await res.json()
    if (json.success) {
      localStorage.setItem(`growing-parent-auth-${familyCode}`, childInputPassword.value)
      isAuthed.value = true
      await initChildView()
    } else { alert('密码错误，请找爸爸妈妈要密码哦！') }
  } catch (err) { alert('验证失败，请检查网络') }
}

const initChildView = async () => {
  if (currentViewDate.value === todayStr) {
    authFetch(`${API_URL}/api/templates/sync-today`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ family_code: familyCode, date: todayStr })
    }).then(() => fetchDailyTasks())
  } else {
    fetchDailyTasks()
  }
  timer = setInterval(() => { if (currentViewDate.value === todayStr) fetchDailyTasks(false) }, 5000)
}

const fetchDailyTasks = async (showAnim = false) => {
  if (showAnim) isSyncing.value = true
  try {
    const res = await authFetch(`${API_URL}/api/daily-tasks?date=${currentViewDate.value}&family_code=${familyCode}`)
    const json = await res.json()
    if (json.success) {
      dailyTasks.value = json.data
      parentMessage.value = json.parent_message || '' 
      childReflection.value = json.child_reflection || '' 
      if (!isReadOnly.value) {
        dailyTasks.value.forEach(item => {
          if (item.status === 'in_progress') {
            if (!runningTimers[item.id]) {
              const saved = localStorage.getItem(`task-timer-${item.id}`)
              let seconds = 0, isPaused = false
              if (saved) { const parsed = JSON.parse(saved); seconds = parsed.seconds; isPaused = parsed.isPaused }
              startLocalTimer(item.id, seconds)
              if (runningTimers[item.id]) runningTimers[item.id].isPaused = isPaused
            }
          }
        })
      }
    }
  } catch (err) { console.error('获取计划失败:', err) } finally { if (showAnim) setTimeout(() => { isSyncing.value = false }, 600) }
}

const saveReflection = async () => {
  try {
    const res = await authFetch(`${API_URL}/api/daily-plans/reflection`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ child_reflection: childReflection.value, date: currentViewDate.value, family_code: familyCode })
    })
    const json = await res.json()
    if (json.success) alert('反思日记保存成功！爸爸妈妈会看到你的想法哦。')
  } catch (err) { console.error(err) }
}

const switchDate = (dateStr: string) => { currentViewDate.value = dateStr; fetchDailyTasks(true) }
const onDragStart = (index: number) => { dragIndex.value = index }
const onDragOver = (event: DragEvent) => { event.preventDefault() }

const onDrop = async (index: number) => {
  if (isReadOnly.value || dragIndex.value === null || dragIndex.value === index) return
  const draggedItem = dailyTasks.value[dragIndex.value]
  dailyTasks.value.splice(dragIndex.value, 1); dailyTasks.value.splice(index, 0, draggedItem); dragIndex.value = null 
  const orders = dailyTasks.value.map((item, idx) => ({ id: item.id, order_index: idx + 1 }))
  try { await authFetch(`${API_URL}/api/daily-tasks/reorder`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orders }) }) } catch (err) { console.error(err) }
}

const addChildTaskDirectly = async () => {
  if (!childNewTaskName.value.trim()) return
  try {
    await authFetch(`${API_URL}/api/daily-tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_name: childNewTaskName.value, planned_duration: childNewTaskDuration.value, family_code: familyCode, date: currentViewDate.value }) })
    childNewTaskName.value = ''; await fetchDailyTasks(true) 
  } catch (err) {}
}

const removeDailyTask = async (id: string) => {
  if (!confirm('确定要从计划里删掉这个任务吗？')) return
  try { await authFetch(`${API_URL}/api/daily-tasks/${id}`, { method: 'DELETE' }); await fetchDailyTasks(true) } catch (err) {}
}

const updateDailyTaskStatus = async (id: string, status: 'pending' | 'in_progress' | 'completed') => {
  try { await authFetch(`${API_URL}/api/daily-tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); await fetchDailyTasks() } catch (err) {}
}

const editTimeManually = async (item: any) => {
  const input = prompt(`请输入「${item.task_name}」的真实实际耗时 (分钟):`, item.actual_duration || 30)
  if (input === null) return 
  const duration = parseInt(input, 10)
  if (isNaN(duration) || duration <= 0) return alert('请输入正确整数')
  try { await authFetch(`${API_URL}/api/daily-tasks/${item.id}/manual-time`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actual_duration: duration }) }); await fetchDailyTasks() } catch (err) {}
}

// ==========================================
// 💡 语音输入与朗读逻辑
// ==========================================
const isListeningChild = ref(false)
let recognitionChild: any = null

const startVoiceInput = () => {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SpeechRecognition) return alert('当前浏览器不支持语音输入，请使用 Safari 或 Chrome。')
  isListeningChild.value = true
  recognitionChild = new SpeechRecognition()
  recognitionChild.lang = 'zh-CN'; recognitionChild.continuous = false; recognitionChild.interimResults = false
  recognitionChild.onresult = (event: any) => { childReflection.value = event.results[0][0].transcript; isListeningChild.value = false }
  recognitionChild.onerror = () => { isListeningChild.value = false; alert('语音识别失败，请重试') }
  recognitionChild.start()
}
const stopVoiceInput = () => { if (recognitionChild) { recognitionChild.stop(); isListeningChild.value = false } }

const speakText = (text: string) => {
  if (!text) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'; utterance.rate = 0.9
  window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance)
}

// ==========================================
// 💡 PRD 建议 3：数据导出 (导出当日成长记录)
// ==========================================
const exportTodayData = () => {
  const exportData = {
    export_date: currentViewDate.value,
    family_code: familyCode,
    total_tasks: totalCount.value,
    completed_tasks: completedCount.value,
    total_actual_minutes: totalActualMinutes.value,
    parent_message: parentMessage.value,
    child_reflection: childReflection.value,
    tasks_detail: dailyTasks.value.map(t => ({
      task_name: t.task_name,
      category: t.category_name,
      tags: t.tags || '无',
      planned_duration: t.planned_duration,
      actual_duration: t.actual_duration,
      status: t.status,
      is_required: t.is_required === 1
    }))
  }
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `GrowingOS_${currentViewDate.value}.json`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(async () => {
  // 💡 进入页面先检查本地是否已经有密码 (父母登录过或孩子之前登录过)
  const savedPwd = localStorage.getItem(`growing-parent-auth-${familyCode}`)
  if (savedPwd) {
    // 去后端验证一下密码是否还有效
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ family_code: familyCode, password: savedPwd })
      })
      const json = await res.json()
      if (json.success) {
        isAuthed.value = true
        await initChildView()
      } else {
        localStorage.removeItem(`growing-parent-auth-${familyCode}`)
      }
    } catch (e) {}
  }
})

onUnmounted(() => {
  if (timer) clearInterval(timer) 
  if (eyeRestInterval) clearInterval(eyeRestInterval)
  Object.values(runningTimers).forEach(t => { if (t.intervalId) clearInterval(t.intervalId) })
})
</script>

<template>
  <!-- 孩子端密码门禁拦截器 -->
  <div v-if="!isAuthed" class="login-wrapper">
    <header class="header child-header" style="margin-bottom: 30px;">
      <h1 style="font-size: 2rem;">Growing OS</h1>
      <p class="subtitle">小朋友，请输入爸爸妈妈设置的管理密码进入你的一天。</p>
    </header>
    <section class="card login-card">
      <div class="form-group">
        <label>管理密码</label>
        <input v-model="childInputPassword" type="password" placeholder="请输入密码" @keyup.enter="handleChildLogin" />
      </div>
      <button class="btn" @click="handleChildLogin">安全验证并进入</button>
    </section>
  </div>

  <!-- 正常孩子端界面 -->
  <template v-else>
    <div v-if="isEyeResting" class="eye-protection-overlay">
      <div class="eye-box"><div class="eye-emoji">👁️</div><h2>20-20-20 护眼法则</h2><p>你已经连续专注 20 分钟了！<br/>为了保护视力，请闭上眼睛或向 6 米外远眺。</p><div class="eye-countdown">{{ eyeRestCountdown }}</div><p style="font-size: 0.9rem; color: #888; margin-top: 15px;">(倒计时结束后将自动恢复)</p></div>
    </div>

    <div v-if="showCertificate" class="certificate-overlay" @click="showCertificate = false">
      <div class="certificate-card" @click.stop>
        <div class="cert-border"><h1>自律大满贯成就奖</h1><div class="cert-emoji">🏆</div><p class="cert-desc">兹证明 <strong>今日挑战者</strong> 于</p><p class="cert-date">{{ new Date(currentViewDate).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) }}</p><p class="cert-desc">圆满完成了当日 <strong>{{ totalCount }}</strong> 项所有计划<br>累计深度专注 <strong>{{ totalActualMinutes }}</strong> 分钟！</p><div class="cert-footer"><p>特发此证，以资鼓励。</p><p class="cert-sign">Growing OS 家庭中心</p></div><button class="cert-close-btn" @click="showCertificate = false">开心收下 (关闭)</button></div>
      </div>
    </div>

    <div class="child-container">
      <header class="header child-header">
        <span class="header-date">{{ currentViewDate === todayStr ? '今天' : (currentViewDate === yesterdayStr ? '昨天' : '明天') }} · {{ new Date(currentViewDate).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) }}</span>
        <h1>我的一天</h1>
        <div class="top-controls">
          <button :class="['wake-lock-btn', isWakeLockActive ? 'active' : '']" @click="toggleWakeLock">{{ isWakeLockActive ? '🔋 屏幕常亮：已开启' : '💡 开启屏幕常亮' }}</button>
          <button class="test-eye-btn" @click="triggerEyeRest">🧪 测护眼</button>
        </div>
        <div class="time-travel-nav">
          <button :class="['nav-pill', currentViewDate === yesterdayStr ? 'active' : '']" @click="switchDate(yesterdayStr)">昨天</button>
          <button :class="['nav-pill', currentViewDate === todayStr ? 'active' : '']" @click="switchDate(todayStr)">今天 ☀️</button>
          <button :class="['nav-pill', currentViewDate === tomorrowStr ? 'active' : '']" @click="switchDate(tomorrowStr)">明天</button>
        </div>
        <p class="subtitle" v-if="isReadOnly">🔒 历史与未来均受只读保护，无法篡改执行状态。</p>
        <p class="subtitle" v-else>今天你想怎样度过？开始执行并记录你的精彩一天。</p>
      </header>

      <main class="child-main">
        <section class="card msg-bubble-card" v-if="parentMessage">
          <div class="msg-bubble-title">💬 爸妈的寄语 <button class="speak-btn" @click="speakText(parentMessage)">🔊 朗读</button></div>
          <p class="msg-bubble-content">“ {{ parentMessage }} ”</p>
        </section>

        <section class="card progress-card" v-if="totalCount > 0">
          <div class="progress-info-text">
            <span>🌟 完成进度: <strong>{{ completedCount }}</strong> / {{ totalCount }} 个任务</span>
            <span class="progress-num">{{ progressPercent }}%</span>
          </div>
          <div class="progress-track"><div class="progress-fill" :style="{ width: progressPercent + '%' }"></div></div>
        </section>

        <section class="card daily-card">
          <div class="daily-card-header">
            <h2>📅 任务清单</h2>
            <div class="sync-status">
              <span class="pulse-dot"></span>
              <button :class="['sync-btn', isSyncing ? 'spinning' : '']" @click="fetchDailyTasks(true)">🔄 同步</button>
            </div>
              <!-- 💡 新增：必做任务图例说明 -->
          <div style="text-align: center; font-size: 0.8rem; color: #ff3b30; margin-bottom: 15px; font-weight: bold;">
          ⭐ 标记为必做任务，需全部完成才能达成自律满贯哦！
          </div>
          </div>

          <div class="child-add-box" v-if="!isReadOnly || currentViewDate === tomorrowStr">
            <input v-model="childNewTaskName" type="text" placeholder="➕ 想自主安排点什么？" class="child-add-input" />
            <div class="child-duration-wrapper"><input v-model.number="childNewTaskDuration" type="number" min="5" step="5" class="child-add-duration" /><span class="child-add-unit">分钟</span></div>
            <button class="child-add-btn" @click="addChildTaskDirectly">安排</button>
          </div>

          <div v-if="dailyTasks.length === 0" class="empty-state">该日期下还没有安排任务哦。</div>
          
          <ul v-else class="daily-task-list">
            <li v-for="(item, index) in dailyTasks" :key="item.id" :class="['daily-item', item.status, dragIndex === index ? 'dragging' : '']" :draggable="!isReadOnly" @dragstart="onDragStart(index)" @dragover="onDragOver" @drop="onDrop(index)">
              <div class="daily-info">
                <div class="title-with-badge">
                  <span v-if="!isReadOnly" class="drag-handle">☰</span>
                  <span class="daily-name">{{ item.task_name }} <span v-if="item.is_required === 1" class="required-star">⭐</span></span>
                  <span v-if="item.category_name" class="category-badge" :style="{ backgroundColor: item.category_bg_color, color: item.category_text_color }">{{ item.category_name }}</span>
                  <span v-if="item.tags" class="task-tag-badge">#{{ item.tags }}</span>
                </div>
                <div class="time-meta">
                  <span class="daily-plan-time">⏱️ 计划: {{ item.planned_duration }}分钟</span>
                  <span v-if="item.status === 'completed' && item.actual_duration" class="daily-actual-time">| 🔥 实际耗时: {{ item.actual_duration }} 分钟<span v-if="item.is_manual === 1" class="manual-badge">✍️ 修正</span></span>
                </div>
              </div>
              
              <div class="status-action-group">
                <div class="status-action">
                  <template v-if="!isReadOnly">
                    <button v-if="item.status === 'pending'" class="action-btn start" @click="updateDailyTaskStatus(item.id, 'in_progress')">▶️ 开始</button>
                    <div v-else-if="item.status === 'in_progress'" class="running-group">
                      <span class="running-timer">⏱️ {{ formatTime(runningTimers[item.id]?.seconds || 0) }}</span>
                      <button class="action-btn pause" @click="togglePauseLocalTimer(item.id)">{{ runningTimers[item.id]?.isPaused ? '▶️ 继续' : '⏸️ 暂停' }}</button>
                      <button class="action-btn finish" @click="finishLocalTimer(item)">✅ 完成</button>
                    </div>
                    <div v-else-if="item.status === 'completed'" class="completed-group">
                      <span class="completed-tag">🎉 已完成</span>
                      <button class="edit-time-btn" @click="editTimeManually(item)">✏️ 修正</button>
                    </div>
                  </template>
                  <template v-else>
                    <span v-if="item.status === 'completed'" class="completed-tag">🎉 历史已完成</span>
                    <span v-else-if="item.status === 'in_progress'" class="running-tag">⚠️ 历史中断</span>
                    <span v-else class="daily-plan-time">⏳ 未执行</span>
                  </template>
                </div>
                <button v-if="item.is_child_added === 1 && !isReadOnly" class="remove-item-btn" @click="removeDailyTask(item.id)">×</button>
              </div>
            </li>
          </ul>
        </section>

        <section class="card reflection-card" v-if="progressPercent === 100 && totalCount > 0">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h2>✍️ 今天的自我反思</h2>
            <button class="cert-btn" @click="showCertificate = true">✨ 领取今日奖状</button>
          </div>
          <p class="ref-subtitle">恭喜大满贯！写下一句今天的心得，或者明天想改进的地方吧：</p>
          <div class="ref-input-wrapper">
            <textarea v-model="childReflection" class="ref-textarea" placeholder="例如：今天数学有点卡住，明天我要把数学放上午做..." rows="3"></textarea>
            <button class="voice-btn-child" @mousedown="startVoiceInput" @mouseup="stopVoiceInput" @mouseleave="stopVoiceInput" title="按住说话">
              {{ isListeningChild ? '🔴 听写中...' : '🎤' }}
            </button>
          </div>
          <button class="action-btn start" style="width: 100%; margin-top: 10px;" @click="saveReflection">💾 保存日记到成长档案</button>
        </section>

        <section class="card medal-card">
          <h2>🏆 我的自律勋章墙</h2>
          <div class="medal-shelf">
            <div :class="['medal-item', progressPercent === 100 && totalCount > 0 ? 'unlocked' : 'locked']"><div class="medal-glow"></div><div class="medal-emoji">🏆</div><span class="medal-title">完美自律之星</span></div>
            <div :class="['medal-item', completedCount > 0 ? 'unlocked' : 'locked']"><div class="medal-glow"></div><div class="medal-emoji">🚀</div><span class="medal-title">今日行动派</span></div>
            <div :class="['medal-item', totalActualMinutes >= 60 ? 'unlocked' : 'locked']"><div class="medal-glow"></div><div class="medal-emoji">⏱️</div><span class="medal-title">专注挑战者</span></div>
          </div>
        </section>

        <section class="card export-card" v-if="totalCount > 0">
          <h2>📦 数据属于家庭</h2>
          <p class="ref-subtitle">将今天的成长记录导出为 JSON 文件，永久保存或交给 AI 分析。</p>
          <button class="action-btn finish" style="width: 100%;" @click="exportTodayData">⬇️ 导出我的一天 ({{ currentViewDate }})</button>
        </section>
      </main>
    </div>
  </template>
</template>

<style scoped>
.child-container { max-width: 700px; margin: 0 auto; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, "SF Pro SC", "SF Pro Text", "Helvetica Neue", Arial, sans-serif; color: #1d1d1f; }
.child-header { text-align: center; margin-bottom: 30px; padding-top: 10px; }
.header-date { display: block; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.08em; color: #86868b; margin-bottom: 10px; text-transform: uppercase; }
.child-header h1 { font-size: 2.4rem; font-weight: 700; color: #1d1d1f; margin: 0 0 12px 0; letter-spacing: -0.015em; }
.subtitle { font-size: 1.05rem; font-weight: 400; color: #86868b; margin: 0; }

/* 登录卡片样式 */
.login-wrapper { max-width: 400px; margin: 60px auto; padding: 0 10px; }
.login-card { padding: 32px 28px; box-shadow: 0 12px 40px rgba(0,0,0,0.06); border-radius: 20px; }

.top-controls { display: flex; justify-content: center; gap: 10px; margin-bottom: 20px; }
.wake-lock-btn { background-color: #f2f2f7; border: none; font-size: 0.85rem; font-weight: bold; color: #1d1d1f; padding: 6px 14px; border-radius: 20px; cursor: pointer; transition: all 0.3s; }
.wake-lock-btn.active { background-color: #34c759; color: white; box-shadow: 0 4px 12px rgba(52, 199, 89, 0.3); }
.test-eye-btn { background-color: #ffe0b2; color: #e65100; border: none; font-size: 0.85rem; font-weight: bold; padding: 6px 14px; border-radius: 20px; cursor: pointer; }

.time-travel-nav { display: flex; justify-content: center; gap: 10px; margin-bottom: 20px; }
.nav-pill { background-color: #f2f2f7; border: none; font-size: 0.95rem; font-weight: bold; color: #86868b; padding: 8px 20px; border-radius: 20px; cursor: pointer; transition: all 0.2s; }
.nav-pill:hover { background-color: #e5e5ea; }
.nav-pill.active { background-color: #007aff; color: white; }

.card { background: #ffffff; border-radius: 16px; padding: 24px; box-shadow: 0 8px 30px rgba(0,0,0,0.04); border: 1px solid #f2f2f7; margin-bottom: 24px; }
.card h2 { font-size: 1.25rem; margin-top: 0; margin-bottom: 20px; color: #1d1d1f; border-bottom: 1px solid #f2f2f7; padding-bottom: 12px; }

.eye-protection-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); z-index: 9999; display: flex; align-items: center; justify-content: center; }
.eye-box { text-align: center; background: white; padding: 40px 60px; border-radius: 30px; box-shadow: 0 20px 60px rgba(0,0,0,0.1); border: 1px solid #e0f2f1; }
.eye-emoji { font-size: 4rem; margin-bottom: 20px; animation: breathe 3s infinite ease-in-out; }
.eye-box h2 { font-size: 2rem; color: #00796b; margin-bottom: 15px; }
.eye-box p { font-size: 1.2rem; color: #555; line-height: 1.6; margin-bottom: 30px; }
.eye-countdown { font-size: 4rem; font-weight: bold; color: #009688; font-variant-numeric: tabular-nums; }
@keyframes breathe { 0% { transform: scale(1); } 50% { transform: scale(1.1); } 100% { transform: scale(1); } }

.certificate-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(10px); z-index: 9998; display: flex; align-items: center; justify-content: center; padding: 20px; }
.certificate-card { background: #fffcf2; padding: 15px; border-radius: 8px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); max-width: 500px; width: 100%; text-align: center; }
.cert-border { border: 8px double #ffd54f; padding: 40px 30px; border-radius: 4px; background: #fffdf8; }
.cert-border h1 { color: #d84315; font-size: 2.2rem; margin-bottom: 20px; letter-spacing: 2px; }
.cert-emoji { font-size: 4rem; margin-bottom: 20px; }
.cert-desc { font-size: 1.2rem; color: #424242; margin-bottom: 10px; line-height: 1.6; }
.cert-date { font-size: 1.4rem; font-weight: bold; color: #bf360c; margin: 15px 0; border-bottom: 2px solid #ffd54f; display: inline-block; padding-bottom: 5px; }
.cert-footer { margin-top: 40px; border-top: 1px dashed #ccc; padding-top: 20px; font-size: 1rem; color: #757575; }
.cert-sign { font-family: "Brush Script MT", cursive; font-size: 1.5rem; color: #333; margin-top: 10px; }
.cert-close-btn { margin-top: 30px; background-color: #ff9800; color: white; border: none; padding: 10px 24px; border-radius: 20px; font-weight: bold; font-size: 1.1rem; cursor: pointer; box-shadow: 0 4px 12px rgba(255,152,0,0.3); }
.cert-btn { background: linear-gradient(135deg, #ffd54f 0%, #ffb300 100%); color: #fff; border: none; padding: 6px 14px; border-radius: 20px; font-weight: bold; cursor: pointer; font-size: 0.9rem; box-shadow: 0 4px 10px rgba(255,179,0,0.3); }

.reflection-card { background: linear-gradient(180deg, #fff 0%, #fffbf0 100%); border-color: #ffe082; }
.ref-subtitle { font-size: 0.9rem; color: #86868b; margin-top: -10px; margin-bottom: 15px; }
.ref-input-wrapper { display: flex; gap: 10px; align-items: flex-start; }
.ref-textarea { flex: 1; border: 1.5px solid #e0e0e0; border-radius: 12px; padding: 12px; font-size: 1rem; color: #333; resize: vertical; outline: none; transition: border-color 0.2s; font-family: inherit; }
.ref-textarea:focus { border-color: #ffd54f; }
.voice-btn-child { background: #f5f5f7; border: 1px solid #ccc; border-radius: 12px; padding: 12px; cursor: pointer; font-size: 1.2rem; height: 100%; }

.msg-bubble-card { background: linear-gradient(135deg, #e0f2f1 0%, #e8f5e9 100%); border: 1px solid #b2dfdb; padding: 18px 24px; }
.msg-bubble-title { font-size: 0.8rem; font-weight: bold; color: #00796b; margin-bottom: 6px; letter-spacing: 0.05em; text-transform: uppercase; display: flex; justify-content: space-between; align-items: center; }
.speak-btn { background: rgba(255,255,255,0.5); border: none; color: #00796b; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; cursor: pointer; }
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
.required-star { color: #ff3b30; }
.completed .daily-name { text-decoration: line-through; color: #86868b; }
.title-with-badge { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.task-tag-badge { font-size: 0.7rem; background-color: #f0f0f0; color: #555; padding: 2px 6px; border-radius: 4px; }
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
.running-timer { font-family: monospace; font-size: 1.1rem; font-weight: bold; color: #007aff; background-color: #ffffff; border: 1.5px solid #007aff; padding: 4px 10px; border-radius: 6px; margin-right: 4px; }
.action-btn.pause { background-color: #ff9500; color: white; }
.running-tag { color: #007aff; font-weight: bold; font-size: 0.9rem; }
.action-btn.finish { background-color: #34c759; color: white; }
.completed-group { display: flex; align-items: center; gap: 8px; }
.completed-tag { color: #34c759; font-weight: bold; }
.edit-time-btn { background: none; border: none; cursor: pointer; font-size: 0.9rem; padding: 4px 8px; border-radius: 4px; transition: background 0.2s; }
.remove-item-btn { background: none; border: none; color: #aeaeae; font-size: 1.5rem; font-weight: 300; cursor: pointer; padding: 4px; line-height: 1; transition: color 0.2s; }
.remove-item-btn:hover { color: #ff3b30; }

.medal-card { background: #ffffff; margin-top: 15px; }
.medal-shelf { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 10px; }
.medal-item { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 18px 14px; border-radius: 12px; border: 1px solid #f2f2f7; transition: all 0.4s ease; }
.medal-emoji { font-size: 2.2rem; margin-bottom: 10px; transition: transform 0.4s ease; }
.medal-title { font-size: 0.92rem; font-weight: bold; color: #1d1d1f; margin-bottom: 6px; }
.medal-item.locked { opacity: 0.4; filter: grayscale(100%); background-color: #fafafa; }
.medal-item.unlocked { opacity: 1; filter: none; background-color: #ffffff; border-color: #ffe082; box-shadow: 0 8px 24px rgba(255, 179, 0, 0.08); transform: translateY(-2px); }
.medal-item.unlocked .medal-emoji { transform: scale(1.15) rotate(5deg); }
.medal-item.unlocked .medal-glow { position: absolute; top: -5px; left: -5px; right: -5px; bottom: -5px; border-radius: 16px; border: 2px solid #ffd54f; opacity: 0.2; animation: glow-breathe 2s infinite ease-in-out; }
@keyframes glow-breathe { 0% { transform: scale(0.98); opacity: 0.1; } 50% { transform: scale(1.02); opacity: 0.4; } 100% { transform: scale(0.98); opacity: 0.1; } }

.export-card { background: #f5f5f7; border-color: #e8e8ed; }

/* 表单样式复用 */
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-weight: 600; margin-bottom: 8px; font-size: 0.9rem; color: #555; }
.form-group input { width: 100%; padding: 10px 12px; border: 1.5px solid #ccc; border-radius: 8px; font-size: 1rem; box-sizing: border-box; background: white; }
.form-group input:focus { border-color: #007aff; outline: none; }
.btn { width: 100%; padding: 12px; background-color: #007aff; color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: bold; cursor: pointer; }
.btn:hover { background-color: #0056b3; }
</style>