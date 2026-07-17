<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'

const familyCode = 'DEMO123'
const API_URL = import.meta.env.DEV 
  ? 'http://localhost:8787' 
  : 'https://growingworker.evanyin.dpdns.org'

const isLoggedIn = ref(false)
const isInitialized = ref(false)
const inputPassword = ref('')
const registerName = ref('爸爸妈妈')
const registerPassword = ref('')

const tasks = ref<any[]>([])          
const categories = ref<any[]>([])     
const dailyTasks = ref<any[]>([])     
const selectedFilterCategoryId = ref('') 

const selectedDate = ref(new Date().toISOString().split('T')[0])
const parentMessage = ref('')
const selectedTaskIds = ref<string[]>([])
const bundles = ref<{ name: string, task_ids: string[] }[]>([])
const expandedBundleIdx = ref<number | null>(null)

const newTaskName = ref('')
const newTaskDuration = ref(30)
const newTaskCategoryId = ref('')     
const newTaskIsRequired = ref(false)
const newTaskTags = ref('') 
const isSubmitting = ref(false)

const newCategoryName = ref('')
const newCategoryColor = ref('#e3f2fd') 

const useRangeAssign = ref(false)
const rangeStartDate = ref(new Date().toISOString().split('T')[0])
const rangeEndDate = ref(new Date().toISOString().split('T')[0])

let timer: any = null

const isListeningParent = ref(false)
let recognitionParent: any = null

const activeTab = ref('dashboard')
const analyticsData = ref<any>({ daily: [], categories: [], perfectDays: 0 })

const weeklyTemplates = ref<any[]>([])
const showTemplateModal = ref(false)
const newTplName = ref('')
const newTplWeekdays = ref<number[]>([])

const authFetch = (url: string, options: any = {}) => {
  const pwd = localStorage.getItem(`growing-parent-auth-${familyCode}`) || ''
  options.headers = {
    ...options.headers,
    'x-family-code': familyCode,
    'x-family-password': pwd
  }
  return fetch(url, options)
}

const filteredTasks = computed(() => {
  if (!selectedFilterCategoryId.value) return tasks.value
  return tasks.value.filter(t => t.category_id === selectedFilterCategoryId.value)
})

const getBundleDetails = (ids: string[]) => ids.map(id => tasks.value.find(t => t.id === id)?.name || '未知任务').join('、')

const startVoiceInput = () => {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SpeechRecognition) return alert('当前浏览器不支持语音输入，请使用 Safari 或 Chrome。')
  isListeningParent.value = true
  recognitionParent = new SpeechRecognition()
  recognitionParent.lang = 'zh-CN'; recognitionParent.continuous = false; recognitionParent.interimResults = false
  recognitionParent.onresult = (event: any) => { parentMessage.value = event.results[0][0].transcript; isListeningParent.value = false }
  recognitionParent.onerror = () => { isListeningParent.value = false; alert('语音识别失败，请重试') }
  recognitionParent.start()
}
const stopVoiceInput = () => { if (recognitionParent) { recognitionParent.stop(); isListeningParent.value = false } }
const speakText = (text: string) => {
  if (!text) return alert('没有文字可以朗读！')
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'; utterance.rate = 0.9
  window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance)
}

const checkInitializeStatus = async () => {
  try {
    const res = await fetch(`${API_URL}/api/auth/check/${familyCode}`)
    const json = await res.json(); if (json.success) isInitialized.value = json.initialized
  } catch (err) { console.error('检查初始化状态失败:', err) }
}

const handleLogin = async () => {
  if (!inputPassword.value) return alert('请输入管理密码！')
  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ family_code: familyCode, password: inputPassword.value })
    })
    const json = await res.json()
    if (json.success) {
      localStorage.setItem(`growing-parent-auth-${familyCode}`, inputPassword.value)
      isLoggedIn.value = true; await initDashboard()
    } else { alert(json.message || '密码错误！') }
  } catch (err) { alert('密码验证失败，请确保后端服务已启动！') }
}

const handleRegister = async () => {
  if (!registerPassword.value.trim() || !registerName.value.trim()) return alert('请输入名字并设置管理密码！')
  try {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ family_code: familyCode, name: registerName.value, password: registerPassword.value })
    })
    const json = await res.json()
    if (json.success) {
      localStorage.setItem(`growing-parent-auth-${familyCode}`, registerPassword.value)
      isLoggedIn.value = true; isInitialized.value = true
      alert('家庭初始化成功！已为你自动登录。🎉'); await initDashboard()
    } else { alert(json.message) }
  } catch (err) { console.error(err) }
}

const handleReset = async () => {
  if (!confirm('确定要重置并清除旧密码吗？这将允许你重新设置密码。')) return
  try {
    await fetch(`${API_URL}/api/auth/reset/${familyCode}`, { method: 'DELETE' })
    localStorage.removeItem(`growing-parent-auth-${familyCode}`)
    isInitialized.value = false; inputPassword.value = ''; registerPassword.value = ''
    alert('已重置，请重新设置管理密码')
  } catch (err) { alert('重置失败，请稍后重试') }
}

const handleLogout = () => {
  if (confirm('确认退出登录，锁定控制台吗？')) {
    localStorage.removeItem(`growing-parent-auth-${familyCode}`)
    isLoggedIn.value = false; inputPassword.value = ''
    if (timer) clearInterval(timer)
  }
}

const initDashboard = async () => {
  fetchCategories(); fetchTasks(); fetchDailyTasks(); loadBundles(); fetchWeeklyTemplates()
  authFetch(`${API_URL}/api/templates/sync-today`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ family_code: familyCode, date: new Date().toISOString().split('T')[0] })
  }).then(() => fetchDailyTasks())
  
  timer = setInterval(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    if (selectedDate.value === todayStr) fetchDailyTasks(false)
  }, 5000)
}

const fetchAnalytics = async () => {
  try {
    const res = await authFetch(`${API_URL}/api/analytics/summary?family_code=${familyCode}`)
    const json = await res.json(); if (json.success) analyticsData.value = json.data
  } catch (err) { console.error('获取数据看板失败:', err) }
}

const maxDailyMinutes = computed(() => Math.max(...analyticsData.value.daily.map((d: any) => d.totalMinutes), 60))
const pieChartStyle = computed(() => {
  const total = analyticsData.value.categories.reduce((sum: number, c: any) => sum + c.minutes, 0)
  if (total === 0) return 'background: #e5e5ea;'
  let cumulative = 0
  const gradients = analyticsData.value.categories.map((c: any) => {
    const start = (cumulative / total) * 360; cumulative += c.minutes; const end = (cumulative / total) * 360
    return `${c.color} ${start}deg ${end}deg`
  })
  return `background: conic-gradient(${gradients.join(', ')});`
})

const categoryStats = computed(() => {
  const stats: Record<string, { name: string, color: string, duration: number }> = {
    'cat-study': { name: '学科学习', color: '#007aff', duration: 0 },
    'cat-interest': { name: '兴趣爱好', color: '#ff9500', duration: 0 },
    'cat-sport': { name: '体育运动', color: '#34c759', duration: 0 },
    'cat-growth': { name: '日常成长', color: '#af52de', duration: 0 },
    'unclassified': { name: '其他自主', color: '#8e8e93', duration: 0 }
  }
  dailyTasks.value.forEach(item => {
    const catName = item.category_name || ''; const catId = item.category_id || ''
    if (catId.startsWith('cat-study') || catName.includes('学科') || catName.includes('学习') || catName.includes('语文') || catName.includes('编程')) stats['cat-study'].duration += item.planned_duration || 30
    else if (catId.startsWith('cat-interest') || catName.includes('兴趣') || catName.includes('爱好') || catName.includes('乐高') || catName.includes('唱歌')) stats['cat-interest'].duration += item.planned_duration || 30
    else if (catId.startsWith('cat-sport') || catName.includes('体育') || catName.includes('运动') || catName.includes('橄榄球')) stats['cat-sport'].duration += item.planned_duration || 30
    else if (catId.startsWith('cat-growth') || catName.includes('日常') || catName.includes('成长') || catName.includes('自律')) stats['cat-growth'].duration += item.planned_duration || 30
    else stats['unclassified'].duration += item.planned_duration || 30
  })
  const total = Object.values(stats).reduce((sum, i) => sum + i.duration, 0)
  return Object.values(stats).map(item => ({ ...item, percent: total > 0 ? Math.round((item.duration / total) * 100) : 0 })).filter(item => item.duration > 0)
})

const fetchCategories = async () => {
  try {
    const res = await authFetch(`${API_URL}/api/categories/${familyCode}`)
    const json = await res.json(); if (json.success) categories.value = json.data
  } catch (err) { console.error('获取分类失败:', err) }
}

const saveCustomCategory = async () => {
  if (!newCategoryName.value.trim()) return alert('请输入分类名称')
  try {
    const res = await authFetch(`${API_URL}/api/categories`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ family_code: familyCode, name: newCategoryName.value, color: newCategoryColor.value, icon: '#333333' })
    })
    const json = await res.json()
    if (json.success) { newCategoryName.value = ''; await fetchCategories(); alert('自定义分类添加成功！') }
  } catch (err) { console.error('创建分类失败:', err) }
}

const updateCategory = async (cat: any) => {
  if (!cat.name.trim()) return alert('分类名称不能为空')
  try {
    const res = await authFetch(`${API_URL}/api/categories/${cat.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cat.name, color: cat.color })
    })
    const json = await res.json()
    if (json.success) { await fetchCategories(); await fetchTasks(); alert('分类信息已同步更新！') }
  } catch (err) { console.error('更新分类失败:', err) }
}

const deleteCategory = async (cat: any) => {
  if (!confirm(`确定要删除分类「${cat.name}」吗？\n该分类下的任务将自动变为“未分类”。`)) return
  try {
    const res = await authFetch(`${API_URL}/api/categories/${cat.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.success) { await fetchCategories(); await fetchTasks() }
  } catch (err) { console.error('删除分类失败:', err) }
}

const fetchTasks = async () => {
  try {
    const res = await authFetch(`${API_URL}/api/tasks/${familyCode}`)
    const json = await res.json(); if (json.success) tasks.value = json.data
  } catch (err) { console.error('获取任务库失败:', err) }
}

const fetchDailyTasks = async (isInitial = false) => {
  try {
    const res = await authFetch(`${API_URL}/api/daily-tasks?date=${selectedDate.value}&family_code=${familyCode}`)
    const json = await res.json()
    if (json.success) {
      dailyTasks.value = json.data
      if (isInitial) parentMessage.value = json.parent_message || ''
    }
  } catch (err) { console.error('获取今日计划失败:', err) }
}

const saveParentMessage = async () => {
  try {
    const res = await authFetch(`${API_URL}/api/daily-plans/message`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_message: parentMessage.value, date: selectedDate.value, family_code: familyCode })
    })
    const json = await res.json()
    if (json.success) alert('今日鼓励寄语已发送给孩子！💬')
  } catch (err) { console.error('保存寄语失败:', err) }
}

const saveTask = async () => {
  if (!newTaskName.value.trim()) return alert('请输入任务名称')
  isSubmitting.value = true
  try {
    const res = await authFetch(`${API_URL}/api/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: newTaskName.value, 
        family_code: familyCode, 
        category_id: newTaskCategoryId.value || null, 
        default_duration: newTaskDuration.value, 
        is_required: newTaskIsRequired.value,
        tags: newTaskTags.value || null 
      })
    })
    const json = await res.json()
    if (json.success) { 
      newTaskName.value = ''; newTaskDuration.value = 30; newTaskCategoryId.value = ''; newTaskIsRequired.value = false; newTaskTags.value = ''; 
      await fetchTasks() 
    }
  } catch (err) { console.error('保存任务失败:', err) } finally { isSubmitting.value = false }
}

const deleteTask = async (id: string) => {
  if (!confirm('确定要从历史任务库中删除吗？')) return
  try {
    const res = await authFetch(`${API_URL}/api/tasks/${id}`, { method: 'DELETE' })
    const json = await res.json(); if (json.success) await fetchTasks()
  } catch (err) { console.error(err) }
}

const addToDailyPlan = async (task: any, offset: number = 0) => {
  // 💡 修复逻辑：直接基于系统当前时间计算今天和明天，不受日历选中日期干扰
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const targetDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  
  try {
    const res = await authFetch(`${API_URL}/api/daily-tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: task.id, planned_duration: task.default_duration, family_code: familyCode, date: targetDate })
    })
    const json = await res.json()
    if (json.success) { 
      if (offset === 1) alert(`已成功将「${task.name}」指派到明天！`)
      // 💡 只有当目标日期正好是日历当前查看的日期时，才需要刷新页面展示新任务
      if (targetDate === selectedDate.value) {
        await fetchDailyTasks()
      }
    } else {
      alert('指派失败：' + (json.error || json.message || '未知错误'))
    }
  } catch (err: any) { 
    console.error(err)
    alert('指派失败，请检查网络') 
  }
}

const addSelectedToDailyPlan = async () => {
  if (selectedTaskIds.value.length === 0) return
  try {
    let datesPayload: string[] | undefined = undefined
    if (useRangeAssign.value) {
      datesPayload = []; const start = new Date(rangeStartDate.value); const end = new Date(rangeEndDate.value)
      for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) datesPayload.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`)
    }
    const res = await authFetch(`${API_URL}/api/daily-tasks/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_ids: selectedTaskIds.value, family_code: familyCode, date: selectedDate.value, dates: datesPayload })
    })
    const json = await res.json()
    if (json.success) { 
      selectedTaskIds.value = []; useRangeAssign.value = false; await fetchDailyTasks()
      alert('一键组合任务指派成功！🚀 \n(如果任务没增加，说明它们已经在你今天的计划里了)') 
    } else {
      alert('指派失败：' + (json.error || json.message || '未知错误'))
    }
  } catch (err: any) { 
    console.error('批量指派失败:', err)
    alert('指派失败，请检查网络或控制台报错') 
  }
}

const saveSelectedAsBundle = () => {
  if (selectedTaskIds.value.length === 0) return alert('请在右侧建议池先勾选你要组合的任务！')
  const name = prompt('请输入这个任务组合的名字（如：每日铁三角）：')
  if (!name) return
  bundles.value.push({ name, task_ids: [...selectedTaskIds.value] })
  localStorage.setItem('growing-os-bundles', JSON.stringify(bundles.value))
  selectedTaskIds.value = []
  alert(`组合「${name}」已保存成功！下次一键即可指派。`)
}

const toggleBundleDetails = (idx: number) => { expandedBundleIdx.value = expandedBundleIdx.value === idx ? null : idx }

const assignSavedBundle = async (bundle: any) => {
  try {
    let datesPayload: string[] | undefined = undefined
    if (useRangeAssign.value) {
      datesPayload = []; const start = new Date(rangeStartDate.value); const end = new Date(rangeEndDate.value)
      for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) datesPayload.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`)
    }
    const res = await authFetch(`${API_URL}/api/daily-tasks/batch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_ids: bundle.task_ids, family_code: familyCode, date: selectedDate.value, dates: datesPayload })
    })
    const json = await res.json()
    if (json.success) { await fetchDailyTasks(); alert(`常用组合「${bundle.name}」已指派到孩子清单中！🚀`) }
  } catch (err) { console.error(err) }
}

const deleteBundle = (index: number) => {
  if (confirm('确定要删除这个常用组合吗？')) {
    bundles.value.splice(index, 1); localStorage.setItem('growing-os-bundles', JSON.stringify(bundles.value))
  }
}

const loadBundles = () => { const saved = localStorage.getItem('growing-os-bundles'); if (saved) bundles.value = JSON.parse(saved) }

const removeDailyTask = async (id: string) => {
  if (!confirm('确定要帮孩子取消这项今天的任务吗？')) return
  try {
    const res = await authFetch(`${API_URL}/api/daily-tasks/${id}`, { method: 'DELETE' })
    const json = await res.json(); if (json.success) await fetchDailyTasks()
  } catch (err) { console.error('移除计划失败:', err) }
}

const fetchWeeklyTemplates = async () => {
  try {
    const res = await authFetch(`${API_URL}/api/templates/weekly/${familyCode}`)
    const json = await res.json(); if (json.success) weeklyTemplates.value = json.data
  } catch (err) { console.error('获取周模板失败:', err) }
}

const openTemplateModal = () => {
  if (selectedTaskIds.value.length === 0) return alert('请先在任务池勾选要设为模板的任务！')
  newTplName.value = ''; newTplWeekdays.value = []
  showTemplateModal.value = true
}

const toggleWeekday = (day: number) => {
  const idx = newTplWeekdays.value.indexOf(day)
  if (idx > -1) newTplWeekdays.value.splice(idx, 1)
  else newTplWeekdays.value.push(day)
}

const saveWeeklyTemplate = async () => {
  if (!newTplName.value.trim()) return alert('请输入模板名称')
  if (newTplWeekdays.value.length === 0) return alert('请至少选择一天')
  try {
    const res = await authFetch(`${API_URL}/api/templates/weekly`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ family_code: familyCode, name: newTplName.value, task_ids: selectedTaskIds.value, weekdays: newTplWeekdays.value })
    })
    const json = await res.json()
    if (json.success) {
      showTemplateModal.value = false; selectedTaskIds.value = []
      await fetchWeeklyTemplates(); alert('周模板保存成功！系统每天将自动派发。')
    } else {
      alert('保存失败：' + (json.error || json.message || '未知错误，请检查数据库是否已建表'))
    }
  } catch (err: any) { 
    console.error(err)
    alert('保存失败，请检查网络或控制台报错') 
  }
}

const deleteWeeklyTemplate = async (id: string) => {
  if (!confirm('确定删除此周模板吗？')) return
  try {
    await authFetch(`${API_URL}/api/templates/weekly/${id}`, { method: 'DELETE' })
    await fetchWeeklyTemplates()
  } catch (err) { console.error(err) }
}

const onDateChange = () => fetchDailyTasks(true)

onMounted(async () => {
  await checkInitializeStatus()
  const savedPassword = localStorage.getItem(`growing-parent-auth-${familyCode}`)
  if (savedPassword) {
    inputPassword.value = savedPassword
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ family_code: familyCode, password: savedPassword })
      })
      const json = await res.json()
      if (json.success) { isLoggedIn.value = true; await initDashboard() }
      else { localStorage.removeItem(`growing-parent-auth-${familyCode}`) }
    } catch (e) { console.error(e) }
  }
})

onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div class="container">
    <div v-if="!isLoggedIn" class="login-wrapper">
      <header class="header parent-header">
        <h1>Growing OS 控制台</h1>
        <p class="subtitle">让孩子成为一天的设计师，父母成为筑路支持者。</p>
      </header>
      <section class="card login-card" v-if="!isInitialized">
        <h2>🛠️ 初始化自律家庭控制中心</h2>
        <p class="login-desc">这是你第一次访问此家庭空间，请设置管理员尊称及控制台密码，防止他人窥探。</p>
        <div class="form-group"><label>家庭邀请码</label><input :value="familyCode" type="text" disabled class="disabled-input" /></div>
        <div class="form-group"><label>家长名字（如：爸爸妈妈）</label><input v-model="registerName" type="text" placeholder="例如：爸爸妈妈、张先生" /></div>
        <div class="form-group"><label>设置控制台密码</label><input v-model="registerPassword" type="password" placeholder="建议输入 6 位以上数字或密码" /></div>
        <button class="btn" @click="handleRegister">初始化并一键登录</button>
      </section>
      <section class="card login-card" v-else>
        <h2>🔒 父母安全锁</h2>
        <p class="login-desc">该家庭已受安全保护，请输入你初始化时设置的密码进入控制台。</p>
        <div class="form-group"><label>家庭邀请码</label><input :value="familyCode" type="text" disabled class="disabled-input" /></div>
        <div class="form-group"><label>管理密码</label><input v-model="inputPassword" type="password" placeholder="请输入你的管理员密码" @keyup.enter="handleLogin" /></div>
        <button class="btn" @click="handleLogin">安全登录并验证</button>
        <p class="reset-link" @click="handleReset">⚠️ 忘记密码？重置家庭初始化</p>
      </section>
    </div>

    <div v-else>
      <nav class="role-nav">
        <div class="nav-tabs">
          <button :class="['tab-btn', activeTab === 'dashboard' ? 'active' : '']" @click="activeTab = 'dashboard'">📅 计划看板</button>
          <button :class="['tab-btn', activeTab === 'analytics' ? 'active' : '']" @click="fetchAnalytics(); activeTab = 'analytics'">📊 数据中心</button>
        </div>
        <button class="logout-btn" @click="handleLogout" title="退出登录并锁定控制台">🔒 退出登录</button>
      </nav>

      <div v-if="activeTab === 'analytics'">
        <header class="header parent-header"><h1>📊 数据中心</h1><p class="subtitle">科学复盘，宏观掌控孩子过去 30 天的精力投入与成长轨迹。</p></header>
        <div class="analytics-grid">
          <section class="card stat-card"><h3>🏆 满贯达成天数</h3><div class="big-stat-num">{{ analyticsData.perfectDays }}</div><p class="stat-desc">过去 30 天内，完美完成所有计划的天数</p></section>
          <section class="card chart-card"><h3>📈 累计专注时间曲线 (过去 30 天)</h3><div class="bar-chart-wrapper"><div class="bar-chart"><div v-for="d in analyticsData.daily" :key="d.date" class="bar-item" :title="`${d.date}: ${d.totalMinutes}分钟`"><div class="bar" :style="{ height: (d.totalMinutes / maxDailyMinutes * 100) + '%' }"></div></div></div></div></section>
          <section class="card chart-card"><h3>🎨 长期精力分配占比</h3><div class="pie-wrapper"><div class="pie-chart" :style="pieChartStyle"></div><ul class="pie-legend"><li v-for="cat in analyticsData.categories" :key="cat.name"><span class="legend-dot" :style="{ backgroundColor: cat.color }"></span><span class="legend-name">{{ cat.name }}</span><span class="legend-val">{{ cat.minutes }} 分</span></li></ul></div></section>
        </div>
      </div>

      <div v-if="activeTab === 'dashboard'">
        <header class="header parent-header"><span class="header-date">{{ new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) }}</span><h1>父母控制端</h1><p class="subtitle">管理建议任务和分类，实时掌控孩子今天的执行进度。</p></header>
        <main class="main-content">
          <section class="card form-card">
            <h2>➕ 新增任务建议</h2>
            <div class="form-group"><label>任务名称</label><input v-model="newTaskName" type="text" placeholder="例如：数学计算100题、自主阅读" /></div>
            <div class="form-group"><label>任务分类</label><select v-model="newTaskCategoryId" class="form-select"><option value="">-- 未分类 (默认) --</option><option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option></select></div>
            
            <div class="form-group">
              <label>精细化标签 (可选)</label>
              <input v-model="newTaskTags" type="text" placeholder="如：阅读、计算、听力 (多个用逗号分隔)" />
              <p class="input-hint">💡 说明：标签能帮你在数据中心看到更细的投入分布。</p>
            </div>

            <div class="form-group"><label>预计时间 (分钟)</label><input v-model.number="newTaskDuration" type="number" min="1" /></div>
            <div class="form-group required-check-group"><input v-model="newTaskIsRequired" type="checkbox" id="isRequired" /><label for="isRequired" style="margin: 0; color: #ff3b30;">⭐ 标记为必做任务 (影响满贯解锁)</label></div>
            <button class="btn" @click="saveTask" :disabled="isSubmitting">保存任务建议</button>

            <div class="custom-cat-section"><h3>🛠️ 自定义新建分类</h3><div class="custom-cat-form"><input v-model="newCategoryName" type="text" placeholder="输入新分类，如: 🧪 科学实验" class="cat-input" /><div class="color-picker-wrapper" title="选择分类背景色"><input v-model="newCategoryColor" type="color" class="color-picker" /></div><button class="add-cat-btn" @click="saveCustomCategory">添加</button></div></div>
            <div class="manage-cat-section" v-if="categories.length > 0"><h3>📋 管理已有分类 (双端即时同步)</h3><ul class="cat-manage-list"><li v-for="cat in categories" :key="cat.id" class="cat-manage-item"><input v-model="cat.name" type="text" class="cat-manage-input" /><input v-model="cat.color" type="color" class="cat-manage-color" /><button class="save-cat-btn" @click="updateCategory(cat)">💾</button><button class="delete-cat-btn" @click="deleteCategory(cat)">🗑️</button></li></ul></div>
          </section>

          <section class="card daily-monitor-card">
            <div class="card-header-with-loader"><h2>📅 计划执行清单</h2><span class="live-tag">● 实时同步中</span></div>
            <div class="calendar-wrapper"><span class="calendar-label">📅 日历历史穿梭：</span><input type="date" v-model="selectedDate" class="apple-calendar" @change="onDateChange" /></div>
            <div class="parent-message-box">
              <label class="msg-label">💬 今日鼓励寄语：</label>
              <div class="msg-form">
                <input v-model="parentMessage" type="text" placeholder="写一句话鼓励孩子，如：今天做完带你去骑车！" class="msg-input" />
                <button class="voice-btn" @mousedown="startVoiceInput" @mouseup="stopVoiceInput" @mouseleave="stopVoiceInput" title="按住说话">{{ isListeningParent ? '🔴 听写中...' : '🎤' }}</button>
                <button class="voice-btn" @click="speakText(parentMessage)" title="点击朗读">🔊</button>
                <button class="msg-send-btn" @click="saveParentMessage">发送</button>
              </div>
            </div>
            <div class="analytics-wrapper" v-if="categoryStats.length > 0">
              <div class="analytics-header"><span>📊 【{{ selectedDate }}】时间分配比例</span></div>
              <div class="dist-track"><div v-for="stat in categoryStats" :key="stat.name" class="dist-fill" :style="{ width: stat.percent + '%', backgroundColor: stat.color }" :title="`${stat.name}: ${stat.duration}分钟 (${stat.percent}%)`"></div></div>
              <ul class="dist-legend">
                <li v-for="stat in categoryStats" :key="stat.name">
                  <span class="legend-dot" :style="{ backgroundColor: stat.color }"></span>
                  <span class="legend-info">{{ stat.name }} <strong>{{ stat.duration }}</strong>分 ({{ stat.percent }}%)</span>
                </li>
              </ul>
            </div>
            <div v-if="dailyTasks.length === 0" class="empty-state">该日期还没有指派任务。<br>请在右侧任务池中点击【➕ 今日】进行指派。</div>
            <ul v-else class="monitor-list"><li v-for="item in dailyTasks" :key="item.id" :class="['monitor-item', item.status]"><div class="monitor-info"><span class="monitor-name">{{ item.task_name }} <span v-if="item.is_required === 1" class="required-star">⭐</span></span><span class="monitor-plan">计划: {{ item.planned_duration }}分钟</span></div><div class="monitor-action"><span v-if="item.status === 'pending'" class="status-badge pending">⏳ 待执行</span><span v-else-if="item.status === 'in_progress'" class="status-badge running">⚡ 进行中</span><span v-else class="status-badge done">🎉 已完成 ({{ item.actual_duration }}分) <span v-if="item.is_manual === 1" class="manual-warning-badge">✍️ 修正</span></span><button class="remove-daily-btn" @click="removeDailyTask(item.id)" title="取消今天的指派">🗑️</button></div></li></ul>
          </section>

          <section class="card list-card">
            <div class="pool-header"><h2>📋 任务库建议池</h2><button class="batch-assign-btn" @click="addSelectedToDailyPlan" :disabled="selectedTaskIds.length === 0" title="一键指派勾选的所有任务到今日计划">🚀 一键指派 ({{ selectedTaskIds.length }})</button></div>
            <div class="range-assign-box"><label class="range-check-label"><input type="checkbox" v-model="useRangeAssign" /> 启用区间/周期指派 (如每天阅读30分钟)</label><div v-if="useRangeAssign" class="range-inputs"><input type="date" v-model="rangeStartDate" class="range-date" /><span>至</span><input type="date" v-model="rangeEndDate" class="range-date" /></div></div>
            
            <div class="bundle-section" style="background-color: #e8f5e9; border-color: #c8e6c9;">
              <h3>📅 周计划自动派发模板</h3>
              <div class="bundle-actions">
                <button v-if="selectedTaskIds.length > 0" class="save-bundle-btn" style="background-color: #e8f5e9; color: #1b5e20; border-color: #a5d6a7;" @click="openTemplateModal">
                  🗓️ 将勾选的 {{ selectedTaskIds.length }} 项设为周模板
                </button>
                <p v-else style="font-size: 0.8rem; color: #86868b;">👆 请先在下方任务池勾选任务，即可设为周模板</p>

                <div class="bundle-list" v-if="weeklyTemplates.length > 0">
                  <div v-for="tpl in weeklyTemplates" :key="tpl.id" class="bundle-chip-wrapper">
                    <div class="bundle-chip-item" style="border-color: #a5d6a7;">
                      <span style="font-size: 0.8rem; font-weight: bold; color: #1b5e20; padding: 4px 8px;">{{ tpl.name }} ({{ tpl.weekdays.split(',').map((d:string)=>'日一二三四五六'[parseInt(d)]).join('') }})</span>
                      <button class="delete-bundle-btn" @click="deleteWeeklyTemplate(tpl.id)" title="删除此模板">×</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="bundle-section" v-if="bundles.length > 0 || selectedTaskIds.length > 0">
              <h3>📦 我的常用指派组合 (点击 ℹ️ 查看详情)</h3>
              <div class="bundle-actions">
                <button v-if="selectedTaskIds.length > 0" class="save-bundle-btn" @click="saveSelectedAsBundle">💾 将勾选的 {{ selectedTaskIds.length }} 项保存为常用组合</button>
                <div class="bundle-list" v-if="bundles.length > 0">
                  <div v-for="(b, idx) in bundles" :key="b.name" class="bundle-chip-wrapper">
                    <div class="bundle-chip-item"><button class="bundle-chip" @click="assignSavedBundle(b)">🚀 {{ b.name }}</button><button class="info-btn" @click="toggleBundleDetails(idx)" title="查看组合详情">ℹ️</button><button class="delete-bundle-btn" @click="deleteBundle(idx)" title="删除此组合">×</button></div>
                    <div v-if="expandedBundleIdx === idx" class="bundle-tooltip">{{ getBundleDetails(b.task_ids) }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="filter-bar" v-if="categories.length > 0"><span class="filter-label">分类筛选:</span><button :class="['filter-tag', selectedFilterCategoryId === '' ? 'active-tag' : '']" @click="selectedFilterCategoryId = ''">全部 ({{ tasks.length }})</button><button v-for="cat in categories" :key="cat.id" :class="['filter-tag', selectedFilterCategoryId === cat.id ? 'active-tag' : '']" @click="selectedFilterCategoryId = cat.id">{{ cat.name }}</button></div>
            <div v-if="filteredTasks.length === 0" class="empty-state">当前分类下暂无任务建议。</div>
            <ul v-else class="task-list">
              <li v-for="task in filteredTasks" :key="task.id" class="task-item">
                <div class="task-info">
                  <div class="title-with-badge">
                    <input type="checkbox" :value="task.id" v-model="selectedTaskIds" class="task-checkbox" />
                    <span class="task-name">{{ task.name }} <span v-if="task.is_required === 1" class="required-star">⭐</span></span>
                    <span v-if="task.category_name" class="category-badge" :style="{ backgroundColor: task.category_bg_color, color: task.category_text_color }">{{ task.category_name }}</span>
                  </div>
                  <div style="display: flex; gap: 10px; align-items: center;">
                    <span class="task-duration">⏱️ {{ task.default_duration }} 分钟</span>
                    <span v-if="task.tags" style="font-size: 0.75rem; color: #555; background: #f5f5f7; padding: 2px 6px; border-radius: 4px;">🏷️ {{ task.tags }}</span>
                  </div>
                </div>
                <div class="action-group"><button class="add-tomorrow-btn" @click="addToDailyPlan(task, 1)" title="排进明天的计划">➕ 明天</button><button class="add-today-btn" @click="addToDailyPlan(task, 0)" title="排进今天的计划">➕ 今日</button><button class="delete-btn" @click="deleteTask(task.id)">🗑️</button></div>
              </li>
            </ul>
          </section>
        </main>
      </div>
    </div>

    <div v-if="showTemplateModal" class="modal-overlay" @click="showTemplateModal = false">
      <div class="modal-card" @click.stop>
        <h2>🗓️ 保存为周计划模板</h2>
        <p class="modal-desc">系统每天凌晨会自动检查今天是星期几，如果有匹配的模板，会自动把任务派发到孩子的计划里。</p>
        <div class="form-group"><label>模板名称</label><input v-model="newTplName" type="text" placeholder="如：工作日每日基础练习" /></div>
        <div class="form-group"><label>重复执行日</label>
          <div class="weekday-selector">
            <button v-for="day in 7" :key="day" :class="['weekday-btn', newTplWeekdays.includes(day % 7) ? 'active' : '']" @click="toggleWeekday(day % 7)">{{ '日一二三四五六'[(day % 7)] }}</button>
          </div>
        </div>
        <button class="btn" @click="saveWeeklyTemplate">保存模板</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.container { max-width: 1420px; margin: 0 auto; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, "SF Pro SC", "SF Pro Text", "Helvetica Neue", Arial, sans-serif; color: #1d1d1f; }
.login-wrapper { max-width: 450px; margin: 60px auto; padding: 0 10px; }
.login-card { padding: 32px 28px; box-shadow: 0 12px 40px rgba(0,0,0,0.06); border-radius: 20px; }
.login-card h2 { text-align: center; font-size: 1.4rem; color: #1d1d1f; border: none; margin-bottom: 8px; }
.login-desc { font-size: 0.88rem; color: #86868b; text-align: center; line-height: 1.5; margin-bottom: 24px; }
.disabled-input { background-color: #fafafa; color: #999; cursor: not-allowed; }
.reset-link { text-align: center; margin-top: 15px; font-size: 0.8rem; color: #86868b; cursor: pointer; text-decoration: underline; }
.role-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #eaeaea; padding-bottom: 15px; }
.nav-tabs { display: flex; gap: 10px; }
.tab-btn { padding: 8px 20px; font-size: 1rem; font-weight: 600; color: #86868b; background: none; border: none; cursor: pointer; border-radius: 20px; transition: all 0.2s; }
.tab-btn.active { background-color: #1d1d1f; color: white; }
.logout-btn { background: none; border: 1px solid #ff3b30; color: #ff3b30; padding: 6px 14px; font-size: 0.85rem; font-weight: bold; border-radius: 20px; cursor: pointer; transition: all 0.2s; }
.logout-btn:hover { background-color: #ffebee; }
.parent-header { text-align: center; margin-bottom: 48px; padding-top: 10px; }
.header-date { display: block; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.08em; color: #86868b; margin-bottom: 10px; text-transform: uppercase; }
.parent-header h1 { font-size: 2.4rem; font-weight: 700; color: #1d1d1f; margin: 0 0 12px 0; letter-spacing: -0.015em; }
.subtitle { font-size: 1.15rem; line-height: 1.47; font-weight: 400; color: #86868b; margin: 0; letter-spacing: -0.022em; }
.analytics-grid { display: grid; grid-template-columns: 1fr 2fr 1.5fr; gap: 24px; }
.stat-card { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
.stat-card h3 { font-size: 1.1rem; color: #1d1d1f; margin-bottom: 15px; }
.big-stat-num { font-size: 4rem; font-weight: 800; color: #007aff; line-height: 1; margin-bottom: 10px; }
.stat-desc { font-size: 0.85rem; color: #86868b; }
.chart-card h3 { font-size: 1.1rem; color: #1d1d1f; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #f2f2f7; }
.bar-chart-wrapper { height: 300px; display: flex; align-items: flex-end; overflow: hidden; }
.bar-chart { display: flex; align-items: flex-end; gap: 3px; height: 100%; width: 100%; padding-bottom: 20px; border-bottom: 1px solid #e5e5ea; }
.bar-item { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; }
.bar { width: 100%; background-color: #007aff; border-radius: 4px 4px 0 0; transition: height 0.3s ease-out; min-height: 2px; }
.bar:hover { background-color: #0056b3; }
.pie-wrapper { display: flex; flex-direction: column; align-items: center; gap: 20px; }
.pie-chart { width: 200px; height: 200px; border-radius: 50%; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
.pie-legend { list-style: none; padding: 0; margin: 0; width: 100%; }
.pie-legend li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f2f2f7; }
.legend-name { flex: 1; font-size: 0.9rem; color: #1d1d1f; }
.legend-val { font-weight: bold; font-size: 0.9rem; color: #1d1d1f; }
.main-content { display: grid; grid-template-columns: 1fr 1.1fr 1.1fr; gap: 24px; }
.card { background: #ffffff; border-radius: 16px; padding: 24px; box-shadow: 0 8px 30px rgba(0,0,0,0.04); border: 1px solid #f2f2f7; }
.card h2 { font-size: 1.25rem; margin-top: 0; margin-bottom: 20px; color: #1d1d1f; border-bottom: 1px solid #f2f2f7; padding-bottom: 12px; }
.parent-message-box { background-color: #f5f5f7; border-radius: 12px; padding: 12px 16px; margin-bottom: 18px; border: 1px solid #e8e8ed; display: flex; flex-direction: column; gap: 6px; }
.msg-label { font-size: 0.82rem; font-weight: bold; color: #555; }
.msg-form { display: flex; gap: 8px; }
.msg-input { flex: 1; padding: 6px 12px; border: 1.5px solid #ccc; border-radius: 6px; font-size: 0.88rem; background: white; }
.msg-input:focus { border-color: #007aff; outline: none; }
.voice-btn { background: #f5f5f7; border: 1px solid #ccc; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 1rem; }
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
.manual-warning-badge { font-size: 0.7rem; background-color: #ffebee; color: #ff3b30; padding: 2px 6px; border-radius: 4px; margin-left: 5px; font-weight: bold; }
.required-star { color: #ff3b30; }
.remove-daily-btn { background: none; border: none; cursor: pointer; font-size: 1rem; padding: 4px; border-radius: 6px; opacity: 0.5; }
.remove-daily-btn:hover { opacity: 1; background-color: #ffebee; }
.pool-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f2f2f7; margin-bottom: 16px; padding-bottom: 12px; }
.pool-header h2 { border: none; margin: 0; padding: 0; }
.batch-assign-btn { background-color: #007aff; color: white; border: none; padding: 6px 14px; border-radius: 8px; font-weight: bold; font-size: 0.85rem; cursor: pointer; transition: opacity 0.2s; }
.batch-assign-btn:disabled { background-color: #e5e5ea; color: #aeaeae; cursor: not-allowed; }
.range-assign-box { background-color: #fff8e1; border: 1px solid #ffe082; border-radius: 12px; padding: 12px 16px; margin-bottom: 20px; }
.range-check-label { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; font-weight: bold; color: #e65100; cursor: pointer; }
.range-inputs { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.range-date { padding: 4px 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 0.85rem; }
.bundle-section { background-color: #f5f5f7; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; border: 1px solid #e8e8ed; }
.bundle-section h3 { font-size: 0.85rem; margin-top: 0; margin-bottom: 10px; color: #555; }
.bundle-actions { display: flex; flex-direction: column; gap: 10px; }
.save-bundle-btn { background-color: #e3f2fd; color: #0d47a1; border: 1px solid #bbdefb; padding: 6px 12px; border-radius: 6px; font-weight: bold; font-size: 0.82rem; cursor: pointer; align-self: flex-start; }
.bundle-list { display: flex; flex-wrap: wrap; gap: 8px; }
.bundle-chip-wrapper { display: flex; flex-direction: column; gap: 4px; }
.bundle-chip-item { display: flex; align-items: center; background-color: #ffffff; border: 1px solid #e8e8ed; border-radius: 20px; padding: 2px 4px 2px 10px; gap: 4px; }
.bundle-chip { background: none; border: none; font-size: 0.8rem; font-weight: bold; color: #1d1d1f; cursor: pointer; padding: 4px 0; }
.bundle-chip:hover { color: #007aff; }
.info-btn { background: #f5f5f5; border: none; color: #555; font-size: 0.7rem; cursor: pointer; padding: 2px 6px; border-radius: 50%; }
.info-btn:hover { background: #e0e0e0; }
.delete-bundle-btn { background: none; border: none; color: #aeaeae; font-size: 1.1rem; cursor: pointer; padding: 0 4px; line-height: 1; }
.delete-bundle-btn:hover { color: #ff3b30; }
.bundle-tooltip { background: #333; color: white; padding: 8px 12px; border-radius: 8px; font-size: 0.75rem; line-height: 1.4; max-width: 250px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-weight: 600; margin-bottom: 8px; font-size: 0.9rem; color: #555; }
.form-group input, .form-select { width: 100%; padding: 10px 12px; border: 1.5px solid #ccc; border-radius: 8px; font-size: 1rem; box-sizing: border-box; background: white; }
.form-group input:focus, .form-select:focus { border-color: #007aff; outline: none; }
.input-hint { font-size: 0.75rem; color: #86868b; margin-top: 6px; margin-bottom: 0; }
.required-check-group { display: flex; align-items: center; gap: 8px; }
.required-check-group input { width: 18px; height: 18px; }
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
.delete-cat-btn { padding: 6px 10px; background-color: #ffebee; border: 1px solid #ffcdd2; border-radius: 4px; font-size: 0.8rem; cursor: pointer; color: #ff3b30; }
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
.add-tomorrow-btn { background-color: #fff8e1; color: #e65100; border: none; padding: 6px 12px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 0.85rem; }
.delete-btn { background: none; border: none; cursor: pointer; font-size: 1.1rem; padding: 4px; border-radius: 6px; opacity: 0.5; }
.delete-btn:hover { opacity: 1; background-color: #ffebee; }
.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.modal-card { background: white; padding: 30px; border-radius: 16px; width: 90%; max-width: 450px; box-shadow: 0 12px 40px rgba(0,0,0,0.1); }
.modal-card h2 { font-size: 1.3rem; margin-top: 0; margin-bottom: 10px; border: none; }
.modal-desc { font-size: 0.85rem; color: #86868b; margin-bottom: 20px; }
.weekday-selector { display: flex; gap: 8px; }
.weekday-btn { padding: 8px 12px; border: 1px solid #ccc; background: #f5f5f7; border-radius: 50%; width: 36px; height: 36px; cursor: pointer; font-weight: bold; color: #555; }
.weekday-btn.active { background-color: #007aff; color: white; border-color: #007aff; }
</style>