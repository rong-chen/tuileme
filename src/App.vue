<script setup>
import { ref, watch, computed, onMounted } from 'vue'
import {
  LayoutDashboard,
  Cpu,
  Globe,
  Sparkles,
  Zap,
  Copy,
  ArrowRight,
  Upload,
  Link,
  RotateCw,
  ExternalLink,
  Lock,
  Plus,
  Trash2,
  Save,
  Plug,
  Image as ImageIcon,
  FileText,
  FileEdit,
  Type,
  Bookmark,
  History,
  FolderDown,
  Clock,
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Crosshair,
  X,
  Send,
  Radio
} from 'lucide-vue-next'

// 基础状态
const activeNav = ref('workspace') // 'workspace' | 'copywriting' | 'ai-config' | 'sites-config'
const toastMessage = ref('')
const toastType = ref('info')
const sidebarCollapsed = ref(false)

// AI 配置 (支持 ds, openai, mimo, antr, custom)
const aiConfig = ref({
  provider: 'ds',
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7
})
const aiTesting = ref(false)
const aiTestResult = ref('')

// 推广目标站点 (手动导入，无需任何 icon 和 emoji)
const targetSites = ref([])
const currentSite = ref(null)

// ==========================================
// 多标签页 Webview 架构 (支持无限开标签页与状态保持)
// ==========================================
const tabs = ref([
  {
    id: 'tab_xhs_default',
    title: '小红书创作平台',
    url: 'https://creator.xiaohongshu.com',
    loading: false,
    siteId: 'xhs'
  }
])
const activeTabId = ref('tab_xhs_default')
const currentTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) || tabs.value[0])
const currentUrlInput = ref('https://creator.xiaohongshu.com')

// 输入框精准标注记忆状态 (以网站 hostname 建立索引，持久化保存用户手动拾取绑定的输入框选择器)
const markedInputs = ref({})
const isMarkingTarget = ref(null) // 'title' | 'content' | null

const currentHostname = computed(() => {
  const url = currentTab.value?.url || currentUrlInput.value || ''
  try {
    return new URL(url).hostname || ''
  } catch (e) {
    return ''
  }
})

const currentHostMarked = computed(() => {
  const host = currentHostname.value
  if (!host || !markedInputs.value) return {}
  return markedInputs.value[host] || {}
})

const currentHostImageTargets = computed(() => {
  const m = currentHostMarked.value
  if (!m) return []
  if (Array.isArray(m.imageTargets) && m.imageTargets.length > 0) {
    return m.imageTargets
  }
  if (m.imageSelector) {
    return [{ id: 'img_0', selector: m.imageSelector, desc: m.imageDesc || m.imageSelector }]
  }
  return []
})

// 半自动化多页面分发配置
const autoPublishEnabled = ref(true) // 填充后自动点击已标注的发布按钮
const broadcasting = ref(false) // 是否正在向全部已打开页面广播

function getHostnameFromUrl(urlStr) {
  try {
    if (!urlStr) return ''
    return new URL(urlStr).hostname || ''
  } catch (e) {
    return ''
  }
}

// 存储所有 webview 实例映射表
const webviewMap = new Map()

function setWebviewRef(el, tabId) {
  if (el) {
    webviewMap.set(tabId, el)
    if (!el._tuilemeBound) {
      el._tuilemeBound = true
      bindSingleWebviewEvents(el, tabId)
    }
  }
}

function getActiveWebview() {
  return webviewMap.get(activeTabId.value)
}

// 平台风格选择 (保留小红书、微博、贴吧，默认小红书)
const promptPlatform = ref('xhs')

// 生成状态与三大核心板块 (初始全部为空，纯净白板让用户输入！)
const generating = ref(false)
const currentTitle = ref('')
const currentContent = ref('')
const currentImages = ref([])

// 自动保存与已存文案草稿状态
const autoSaveStatus = ref('') // 'saving' | 'saved'
const lastSavedTime = ref('')
const savedDrafts = ref([])
const showDraftsModal = ref(false)
let autoSaveTimer = null
let isRestoringDraft = false

function getCleanDraftData() {
  return {
    title: String(currentTitle.value || ''),
    content: String(currentContent.value || ''),
    images: Array.isArray(currentImages.value) ? Array.from(currentImages.value).map(img => String(img || '')) : [],
    platformStyle: String(promptPlatform.value || 'xhs')
  }
}

function triggerAutoSave() {
  if (isRestoringDraft) return
  if (!currentTitle.value && !currentContent.value && (!currentImages.value || currentImages.value.length === 0)) {
    autoSaveStatus.value = ''
    return
  }
  autoSaveStatus.value = 'saving'
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(async () => {
    try {
      if (window.electronAPI && window.electronAPI.saveCurrentDraft) {
        const payload = JSON.parse(JSON.stringify(getCleanDraftData()))
        await window.electronAPI.saveCurrentDraft(payload)
        autoSaveStatus.value = 'saved'
        const now = new Date()
        lastSavedTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      }
    } catch (e) {
      console.error('自动保存失败:', e)
    }
  }, 600)
}

watch([currentTitle, currentContent, currentImages, promptPlatform], () => {
  triggerAutoSave()
}, { deep: true })

async function handleSaveDraftRecord() {
  if (!currentTitle.value.trim() && !currentContent.value.trim()) {
    showToast('标题和内容为空，请先输入文案后再保存', 'warning')
    return
  }
  try {
    if (window.electronAPI && window.electronAPI.saveDraftRecord) {
      const payload = JSON.parse(JSON.stringify(getCleanDraftData()))
      const res = await window.electronAPI.saveDraftRecord(payload)
      if (res && res.success) {
        savedDrafts.value = res.list || []
        autoSaveStatus.value = 'saved'
        showToast('文案已成功保存并归档到草稿箱！', 'success')
      }
    }
  } catch (err) {
    showToast('保存失败: ' + (err?.message || err), 'danger')
  }
}


async function openDraftsModal() {
  try {
    if (window.electronAPI && window.electronAPI.getDraftRecords) {
      savedDrafts.value = await window.electronAPI.getDraftRecords()
    }
  } catch (e) {}
  showDraftsModal.value = true
}

function handleLoadDraft(record) {
  if (!record) return
  isRestoringDraft = true
  currentTitle.value = record.title || ''
  currentContent.value = record.content || ''
  currentImages.value = Array.isArray(record.images) ? record.images : []
  if (record.platformStyle) promptPlatform.value = record.platformStyle
  setTimeout(() => {
    isRestoringDraft = false
    autoSaveStatus.value = 'saved'
  }, 100)
  showDraftsModal.value = false
  showToast('已载入选中的历史文案！', 'success')
}

async function handleDeleteDraftRecord(id) {
  try {
    if (window.electronAPI && window.electronAPI.deleteDraftRecord) {
      const res = await window.electronAPI.deleteDraftRecord(id)
      if (res && res.list) {
        savedDrafts.value = res.list
        showToast('已移除该条历史文案', 'info')
      }
    }
  } catch (e) {}
}

function formatDraftTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 新建站点表单 (无需 icon 和 emoji)
const newSite = ref({
  name: '',
  url: '',
  category: '常用推广',
  description: ''
})

function showToast(msg, type = 'info') {
  toastMessage.value = msg
  toastType.value = type
  setTimeout(() => {
    toastMessage.value = ''
  }, 2500)
}

onMounted(async () => {
  try {
    if (window.electronAPI) {
      const cfg = await window.electronAPI.getAIConfig()
      if (cfg && cfg.provider) {
        const savedModel = cfg.model
        const savedBaseUrl = cfg.baseUrl
        const savedApiKey = cfg.apiKey
        switchAIProvider(cfg.provider)
        aiConfig.value = { ...cfg }
        if (savedModel) aiConfig.value.model = savedModel
        if (savedBaseUrl) aiConfig.value.baseUrl = savedBaseUrl
        if (savedApiKey) aiConfig.value.apiKey = savedApiKey
      }

      const sites = await window.electronAPI.getTargetSites()
      if (sites && sites.length > 0) {
        targetSites.value = sites
        const initialSite = sites.find(s => s.id === 'xhs') || sites[0]
        if (tabs.value.length > 0) {
          tabs.value[0].siteId = initialSite.id
          tabs.value[0].title = initialSite.name
          tabs.value[0].url = initialSite.url
          currentSite.value = initialSite
          currentUrlInput.value = initialSite.url
        }
      }

      // 自动恢复上次未完成或已保存的文案草稿
      if (window.electronAPI.getCurrentDraft) {
        const lastDraft = await window.electronAPI.getCurrentDraft()
        if (lastDraft && (lastDraft.title || lastDraft.content || (lastDraft.images && lastDraft.images.length > 0))) {
          isRestoringDraft = true
          currentTitle.value = lastDraft.title || ''
          currentContent.value = lastDraft.content || ''
          currentImages.value = Array.isArray(lastDraft.images) ? lastDraft.images : []
          if (lastDraft.platformStyle) promptPlatform.value = lastDraft.platformStyle
          setTimeout(() => {
            isRestoringDraft = false
            autoSaveStatus.value = 'saved'
          }, 150)
        }
      }

      // 监听主进程捕获的新页面请求，统一在顶部标签栏新建标签页
      if (window.electronAPI.onOpenNewTab) {
        window.electronAPI.onOpenNewTab((targetUrl) => {
          if (targetUrl && !targetUrl.includes('summon.bytedance.com')) {
            createTab(targetUrl, '新标签页')
          }
        })
      }
      // 载入本地保存的已标注输入框映射表
      try {
        const raw = localStorage.getItem('tuileme_marked_inputs')
        if (raw) {
          markedInputs.value = JSON.parse(raw)
        }
      } catch (e) {}
    }
  } catch (err) {
    console.error('初始化配置失败:', err)
  }
})

// 监听并绑定单个 webview 的加载、标题与安全跳转事件
function bindSingleWebviewEvents(wv, tabId) {
  wv.addEventListener('did-start-loading', () => {
    const t = tabs.value.find(tab => tab.id === tabId)
    if (t) t.loading = true
  })

  wv.addEventListener('did-stop-loading', () => {
    const t = tabs.value.find(tab => tab.id === tabId)
    if (t) {
      t.loading = false
      try {
        const title = wv.getTitle()
        if (title && !title.startsWith('http') && title !== 'about:blank') {
          t.title = title
        }
        const currentUrl = wv.getURL()
        if (currentUrl && !currentUrl.startsWith('about:blank')) {
          t.url = currentUrl
          if (activeTabId.value === tabId) {
            currentUrlInput.value = currentUrl
          }
        }
      } catch (e) {}
    }
  })

  wv.addEventListener('page-title-updated', (e) => {
    const t = tabs.value.find(tab => tab.id === tabId)
    if (t && e.title && !e.title.startsWith('http')) {
      t.title = e.title
    }
  })

  wv.addEventListener('did-navigate', (e) => {
    const t = tabs.value.find(tab => tab.id === tabId)
    if (t && e.url) {
      t.url = e.url
      if (activeTabId.value === tabId) {
        currentUrlInput.value = e.url
      }
    }
  })

  wv.addEventListener('did-navigate-in-page', (e) => {
    const t = tabs.value.find(tab => tab.id === tabId)
    if (t && e.url) {
      t.url = e.url
      if (activeTabId.value === tabId) {
        currentUrlInput.value = e.url
      }
    }
  })

  // 绝不弹出独立弹窗，统一在顶部标签栏新建标签页！
  wv.addEventListener('new-window', (e) => {
    if (!e.url || e.url.startsWith('about:') || e.url.startsWith('javascript:') || e.url.includes('summon.bytedance.com')) {
      return
    }
    e.preventDefault()
    createTab(e.url, '新标签页')
  })

  wv.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return
    console.warn('页面加载事件:', e.errorCode, e.errorDescription)
  })
}

let lastOpenUrl = ''
let lastOpenTime = 0

// 新建标签页 (支持无限开，默认打开百度，400ms 内相同 URL 防重复开)
function createTab(url = 'https://www.baidu.com', title = '百度一下', siteId = null) {
  const now = Date.now()
  if (url && url === lastOpenUrl && (now - lastOpenTime < 400)) {
    return
  }
  lastOpenUrl = url
  lastOpenTime = now

  const newId = 'tab_' + now + '_' + Math.random().toString(36).slice(2, 6)
  tabs.value.push({
    id: newId,
    title: title,
    url: url,
    loading: false,
    siteId: siteId
  })
  switchTab(newId)
  return newId
}

// 切换标签页 (毫秒级显示，保留所有输入与登录会话)
function switchTab(tabId) {
  activeTabId.value = tabId
  const t = tabs.value.find(tab => tab.id === tabId)
  if (t) {
    currentUrlInput.value = t.url || ''
    if (t.siteId) {
      currentSite.value = targetSites.value.find(s => s.id === t.siteId) || null
    } else {
      currentSite.value = targetSites.value.find(s => s.url === t.url) || null
    }
  }
}

// 关闭指定标签页
function closeTab(tabId) {
  const idx = tabs.value.findIndex(t => t.id === tabId)
  if (idx === -1) return

  webviewMap.delete(tabId)
  tabs.value.splice(idx, 1)

  // 如果全部关闭了，自动新建一个默认百度标签
  if (tabs.value.length === 0) {
    createTab('https://www.baidu.com', '百度一下')
    return
  }

  // 如果关闭的是当前激活标签，切换到临近标签
  if (activeTabId.value === tabId) {
    const nextIdx = Math.min(idx, tabs.value.length - 1)
    switchTab(tabs.value[nextIdx].id)
  }
}

// 点击常用平台快捷直达：直接载入该平台目标地址，绝不添加任何拦截
function selectSite(site) {
  currentSite.value = site
  const existingTab = tabs.value.find(t => t.siteId === site.id)
  if (existingTab) {
    existingTab.url = site.url
    currentUrlInput.value = site.url
    switchTab(existingTab.id)
    const wv = webviewMap.get(existingTab.id)
    if (wv && typeof wv.loadURL === 'function') {
      wv.loadURL(site.url)
    }
  } else {
    createTab(site.url, site.name, site.id)
  }
}

// 导航控制
function goBack() {
  const wv = getActiveWebview()
  if (wv && typeof wv.canGoBack === 'function' && wv.canGoBack()) {
    wv.goBack()
  }
}

function goForward() {
  const wv = getActiveWebview()
  if (wv && typeof wv.canGoForward === 'function' && wv.canGoForward()) {
    wv.goForward()
  }
}

function refreshBrowser() {
  const wv = getActiveWebview()
  if (wv && typeof wv.reload === 'function') {
    wv.reload()
  }
}

// 重置当前选中的平台登录状态与缓存 (仅重置当前选中的平台，绝不影响其他平台)
async function resetLoginState() {
  const t = currentTab.value
  if (!t) return

  let officialUrl = t.url
  let siteName = t.title || '当前平台'
  if (t.siteId) {
    const s = targetSites.value.find(item => item.id === t.siteId)
    if (s && s.url) {
      officialUrl = s.url
      siteName = s.name
    }
  }

  try {
    if (window.electronAPI && window.electronAPI.clearSessionStorage) {
      await window.electronAPI.clearSessionStorage(officialUrl || t.url)
    }
    t.url = officialUrl
    currentUrlInput.value = officialUrl
    const wv = getActiveWebview()
    if (wv && typeof wv.loadURL === 'function') {
      wv.loadURL(officialUrl)
    }
    showToast(`已重置【${siteName}】的登录状态，其他平台不受影响！`, 'success')
  } catch (err) {
    showToast('重置登录状态失败: ' + (err?.message || err), 'danger')
  }
}

function navigateToUrl() {
  let url = currentUrlInput.value.trim()
  if (!url) return
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
    currentUrlInput.value = url
  }
  const t = currentTab.value
  if (t) {
    t.url = url
  }
  const wv = getActiveWebview()
  if (wv && typeof wv.loadURL === 'function') {
    wv.loadURL(url)
  }
}

function handleOpenExternal() {
  const target = currentUrlInput.value || currentTab.value?.url
  if (target && window.electronAPI) {
    window.electronAPI.openExternal(target)
    showToast('已在系统默认浏览器中打开', 'success')
  }
}

async function handleCopy(text, label = '内容') {
  if (!text) {
    showToast(`当前${label}为空，无法复制`, 'warning')
    return
  }
  try {
    if (window.electronAPI) {
      await window.electronAPI.copyToClipboard(text)
    } else {
      navigator.clipboard.writeText(text)
    }
    showToast(`已复制${label}！`, 'success')
  } catch (e) {
    navigator.clipboard.writeText(text)
    showToast(`已复制${label}！`, 'success')
  }
}

async function handleCopyImage(imgUrl) {
  if (!imgUrl) return
  try {
    if (window.electronAPI && window.electronAPI.copyImageToClipboard) {
      const ok = await window.electronAPI.copyImageToClipboard(imgUrl)
      if (ok) {
        showToast('已复制图片到系统剪贴板！可直接在右侧粘贴 (Cmd+V)', 'success')
        return
      }
    }
  } catch (e) {
    console.warn('复制图片失败:', e)
  }
  handleCopy(imgUrl, '图片链接')
}

function handleAddCustomImage(e) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (event) => {
    if (event.target?.result) {
      currentImages.value.unshift(event.target.result)
      showToast('已添加自定义图片！', 'success')
    }
  }
  reader.readAsDataURL(file)
}

// 核心逻辑：根据用户输入的【标题】和【内容】生成文案！
async function handleGenerateFromInputs() {
  if (!currentTitle.value.trim() && !currentContent.value.trim()) {
    showToast('请至少在标题或内容中输入一些想法或关键词', 'warning')
    return
  }
  generating.value = true
  try {
    if (window.electronAPI) {
      const res = await window.electronAPI.generatePromoteContent({
        title: currentTitle.value.trim(),
        content: currentContent.value.trim(),
        platformStyle: currentTab.value?.siteId || promptPlatform.value || 'xhs'
      })
      if (res) {
        if (res.title) {
          currentTitle.value = res.title
        }
        if (res.content) {
          const tagsStr = (res.tags || []).join(' ')
          currentContent.value = tagsStr ? `${res.content}\n\n${tagsStr}` : res.content
        }
        if (res.suggestedImages && res.suggestedImages.length > 0) {
          currentImages.value = res.suggestedImages
        }
        showToast('文案润色与生成完毕！', 'success')
      }
    }
  } catch (err) {
    showToast('生成失败: ' + (err?.message || err), 'danger')
  } finally {
    generating.value = false
  }
}

// ==========================================
// 交互式输入框与发布按钮精准标注 (Element Picker)
// ==========================================
function pickerScript(targetType, targetName) {
  return new Promise((resolve) => {
    // 移除已有的拾取层
    const oldBanner = document.getElementById('__tuileme_picker_banner');
    if (oldBanner) oldBanner.remove();
    const oldTip = document.getElementById('__tuileme_tip_pill');
    if (oldTip) oldTip.remove();
    const oldStyle = document.getElementById('__tuileme_picker_styles');
    if (oldStyle) oldStyle.remove();

    // 动态注入样式
    const styleEl = document.createElement('style');
    styleEl.id = '__tuileme_picker_styles';
    styleEl.textContent = `
      @keyframes tlmPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(1.15); }
      }
      .__tuileme_hover_target {
        outline: 2px dashed #2563eb !important;
        outline-offset: 2px !important;
        cursor: crosshair !important;
      }
      .__tuileme_selected_anim {
        outline: 3px solid #10b981 !important;
        outline-offset: 3px !important;
        transition: outline 0.3s ease !important;
      }
    `;
    document.head.appendChild(styleEl);

    // 顶部全宽横幅
    const banner = document.createElement('div');
    banner.id = '__tuileme_picker_banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;height:42px;background:#0f172a;color:#f8fafc;z-index:2147483647;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,0.4);border-bottom:2px solid #3b82f6;user-select:none;';
    const subTip = targetType === 'publish' ? '请点击页面中的“发布”或“发表”按钮' : '请点击想要绑定的输入框';
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#3b82f6;animation:tlmPulse 1.2s infinite;"></span>
        <span style="font-weight:600;color:#60a5fa;">🎯 正在标注【${targetName}】</span>
        <span style="color:#cbd5e1;font-size:12px;">${subTip}</span>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-size:11px;color:#94a3b8;">[ESC 键退出]</span>
        <button id="__tuileme_picker_cancel_btn" style="background:#ef4444;color:#fff;border:none;border-radius:4px;padding:4px 12px;font-size:12px;font-weight:500;cursor:pointer;">取消标注</button>
      </div>
    `;
    document.body.appendChild(banner);

    // 悬停提示气泡
    const tipPill = document.createElement('div');
    tipPill.id = '__tuileme_tip_pill';
    tipPill.style.cssText = 'position:fixed;display:none;background:#2563eb;color:#fff;font-size:11px;padding:3px 8px;border-radius:4px;pointer-events:none;z-index:2147483646;font-family:sans-serif;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);';
    tipPill.textContent = `🎯 点击绑定为【${targetName}】`;
    document.body.appendChild(tipPill);

    let currentHoverEl = null;

    function cleanup() {
      if (currentHoverEl) {
        currentHoverEl.classList.remove('__tuileme_hover_target');
      }
      banner.remove();
      tipPill.remove();
      styleEl.remove();
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
    }

    function getBestTarget(el) {
      if (!el || el === banner || banner.contains(el) || el === tipPill) return null;
      if (targetType === 'publish') {
        // 向上寻找最近的可点击容器 (包括包含 class 的 div, button, a)
        const btn = el.closest('button, [role="button"], input[type="button"], input[type="submit"], a, .btn, [class*="btn" i], [class*="Button" i], [class*="publish" i], [class*="submit" i], [class*="send" i], [class*="action" i]');
        if (btn) return btn;

        // 如果自身或祖先纯文本是“发布/发表/发送”，返回包含该文本的最近块级/内联块容器
        let cur = el;
        let found = null;
        while (cur && cur !== document.body && cur !== document.documentElement) {
          const txt = (cur.innerText || cur.textContent || '').trim().replace(/\s+/g, '');
          if (['发布', '发表', '发送', '立即发布', '发布笔记', '发布动态', '发帖', '完成并发布', '确定发布', '提交'].includes(txt)) {
            found = cur;
          }
          cur = cur.parentElement;
        }
        if (found) return found;

        return el;
      }
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
        return el;
      }
      const editParent = el.closest('[contenteditable="true"], div[role="textbox"], .ProseMirror, .public-DraftEditor-content, textarea, input');
      if (editParent) return editParent;

      const editChild = el.querySelector('textarea, input[type="text"], [contenteditable="true"], div[role="textbox"]');
      if (editChild) return editChild;

      return el;
    }

    function generateSelector(el) {
      if (!el) return '';
      if (el.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(el.id)) {
        try {
          if (document.querySelectorAll('#' + el.id).length === 1) {
            return '#' + el.id;
          }
        } catch (e) {}
      }
      const placeholder = el.getAttribute('placeholder');
      if (placeholder) {
        const sel = `${el.tagName.toLowerCase()}[placeholder="${CSS.escape(placeholder)}"]`;
        try {
          if (document.querySelectorAll(sel).length === 1) return sel;
        } catch (e) {}
      }
      const name = el.getAttribute('name');
      if (name) {
        const sel = `${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`;
        try {
          if (document.querySelectorAll(sel).length === 1) return sel;
        } catch (e) {}
      }
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(/\s+/).filter(c => c && !c.startsWith('__tuileme') && !c.includes(':') && /^[a-zA-Z0-9_-]+$/.test(c));
        for (const cls of classes) {
          const sel = `${el.tagName.toLowerCase()}.${cls}`;
          try {
            if (document.querySelectorAll(sel).length === 1) return sel;
          } catch (e) {}
        }
      }
      const path = [];
      let curr = el;
      while (curr && curr.nodeType === Node.ELEMENT_NODE && curr !== document.body && curr !== document.documentElement) {
        let tag = curr.tagName.toLowerCase();
        if (curr.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(curr.id)) {
          path.unshift('#' + curr.id);
          break;
        } else {
          let s = tag;
          if (curr.className && typeof curr.className === 'string') {
            const firstValidClass = curr.className.split(/\s+/).find(c => c && !c.startsWith('__tuileme') && /^[a-zA-Z0-9_-]+$/.test(c));
            if (firstValidClass) s += '.' + firstValidClass;
          }
          let siblingIndex = 1;
          let sib = curr.previousElementSibling;
          while (sib) {
            if (sib.tagName === curr.tagName) siblingIndex++;
            sib = sib.previousElementSibling;
          }
          s += `:nth-of-type(${siblingIndex})`;
          path.unshift(s);
        }
        curr = curr.parentElement;
        if (path.length >= 5) break;
      }
      return path.join(' > ');
    }

    function onMouseMove(e) {
      const rawTarget = document.elementFromPoint(e.clientX, e.clientY);
      const target = getBestTarget(rawTarget);
      if (!target || target === banner || banner.contains(target)) {
        if (currentHoverEl) {
          currentHoverEl.classList.remove('__tuileme_hover_target');
          currentHoverEl = null;
        }
        tipPill.style.display = 'none';
        return;
      }

      if (currentHoverEl !== target) {
        if (currentHoverEl) {
          currentHoverEl.classList.remove('__tuileme_hover_target');
        }
        currentHoverEl = target;
        currentHoverEl.classList.add('__tuileme_hover_target');
      }

      const rect = target.getBoundingClientRect();
      tipPill.style.display = 'block';
      let top = rect.top - 24;
      if (top < 46) top = rect.bottom + 6;
      tipPill.style.top = `${Math.max(46, top)}px`;
      tipPill.style.left = `${Math.max(10, rect.left)}px`;
    }

    function onClick(e) {
      e.preventDefault();
      e.stopPropagation();

      const cancelBtn = document.getElementById('__tuileme_picker_cancel_btn');
      if (e.target === cancelBtn || banner.contains(e.target)) {
        cleanup();
        resolve({ cancelled: true });
        return;
      }

      const rawTarget = document.elementFromPoint(e.clientX, e.clientY);
      const target = getBestTarget(rawTarget);
      if (!target || target === banner || banner.contains(target)) {
        return;
      }

      // 给目标元素打上标注戳记
      target.setAttribute('data-tuileme-target', targetType);
      // 若是发布按钮，同时给父容器与子容器打上附属标记，彻底杜绝父子层级点击失效
      if (targetType === 'publish') {
        if (target.parentElement && target.parentElement !== document.body) {
          target.parentElement.setAttribute('data-tuileme-target-parent', targetType);
        }
        const inner = target.querySelector('span, div, b');
        if (inner) {
          inner.setAttribute('data-tuileme-target-child', targetType);
        }
      }

      const selector = generateSelector(target);

      target.classList.remove('__tuileme_hover_target');
      target.classList.add('__tuileme_selected_anim');

      const desc = (target.innerText || target.textContent || target.getAttribute('placeholder') || target.getAttribute('aria-label') || selector || '').trim();

      setTimeout(() => {
        try { target.classList.remove('__tuileme_selected_anim'); } catch (err) {}
        cleanup();
        resolve({
          success: true,
          selector,
          targetType,
          desc: desc ? desc.slice(0, 30) : selector.slice(0, 30),
          tagName: target.tagName
        });
      }, 350);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        cleanup();
        resolve({ cancelled: true });
      }
    }

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  });
}

async function startElementPicker(type) {
  const wv = getActiveWebview()
  if (!wv) {
    showToast('当前标签页网页视窗未就绪', 'warning')
    return
  }
  const typeName = type === 'title' ? '标题输入框' : (type === 'content' ? '正文输入框' : (type === 'image' ? '图片上传区' : '发布按钮'))
  showToast(`🎯 请在右侧网页中点击选定【${typeName}】`, 'info')
  isMarkingTarget.value = type

  try {
    const code = `(${pickerScript.toString()})(${JSON.stringify(type)}, ${JSON.stringify(typeName)})`
    const res = await wv.executeJavaScript(code)
    isMarkingTarget.value = null
    if (res && res.success) {
      const host = currentHostname.value
      if (!markedInputs.value[host]) {
        markedInputs.value[host] = {}
      }
      if (type === 'title') {
        markedInputs.value[host].titleSelector = res.selector
        markedInputs.value[host].titleDesc = res.desc
        markedInputs.value[host].titleMarked = true
      } else if (type === 'content') {
        markedInputs.value[host].contentSelector = res.selector
        markedInputs.value[host].contentDesc = res.desc
        markedInputs.value[host].contentMarked = true
      } else if (type === 'image') {
        if (!Array.isArray(markedInputs.value[host].imageTargets)) {
          markedInputs.value[host].imageTargets = []
          if (markedInputs.value[host].imageSelector) {
            markedInputs.value[host].imageTargets.push({
              id: 'img_' + Date.now(),
              selector: markedInputs.value[host].imageSelector,
              desc: markedInputs.value[host].imageDesc || markedInputs.value[host].imageSelector
            })
          }
        }
        const exists = markedInputs.value[host].imageTargets.some(t => t.selector === res.selector)
        if (!exists) {
          markedInputs.value[host].imageTargets.push({
            id: 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
            selector: res.selector,
            desc: res.desc
          })
        }
        markedInputs.value[host].imageSelector = res.selector
        markedInputs.value[host].imageDesc = res.desc
        markedInputs.value[host].imageMarked = true
      } else if (type === 'publish') {
        markedInputs.value[host].publishSelector = res.selector
        markedInputs.value[host].publishDesc = res.desc
        markedInputs.value[host].publishMarked = true
      }
      localStorage.setItem('tuileme_marked_inputs', JSON.stringify(markedInputs.value))
      showToast(`已成功绑定【${typeName}】！后续将精准推送到该位置`, 'success')
    } else if (res && res.cancelled) {
      showToast(`已取消标注【${typeName}】`, 'info')
    }
  } catch (err) {
    console.error('拾取标注失败:', err)
    isMarkingTarget.value = null
    showToast('拾取模式已退出', 'info')
  }
}

function removeImageTarget(index) {
  const host = currentHostname.value
  if (!host || !markedInputs.value[host]) return
  if (Array.isArray(markedInputs.value[host].imageTargets)) {
    markedInputs.value[host].imageTargets.splice(index, 1)
    if (markedInputs.value[host].imageTargets.length > 0) {
      const last = markedInputs.value[host].imageTargets[markedInputs.value[host].imageTargets.length - 1]
      markedInputs.value[host].imageSelector = last.selector
      markedInputs.value[host].imageDesc = last.desc
    } else {
      delete markedInputs.value[host].imageSelector
      delete markedInputs.value[host].imageDesc
      delete markedInputs.value[host].imageMarked
      delete markedInputs.value[host].imageTargets
    }
  } else {
    delete markedInputs.value[host].imageSelector
    delete markedInputs.value[host].imageDesc
    delete markedInputs.value[host].imageMarked
  }
  localStorage.setItem('tuileme_marked_inputs', JSON.stringify(markedInputs.value))
  showToast('已移除该图片上传区标注', 'info')
}

function clearMarkedInput(type) {
  const host = currentHostname.value
  if (!host || !markedInputs.value[host]) return
  const typeName = type === 'title' ? '标题' : (type === 'content' ? '正文' : (type === 'image' ? '图片上传区' : '发布按钮'))
  if (type === 'title') {
    delete markedInputs.value[host].titleSelector
    delete markedInputs.value[host].titleDesc
    delete markedInputs.value[host].titleMarked
  } else if (type === 'content') {
    delete markedInputs.value[host].contentSelector
    delete markedInputs.value[host].contentDesc
    delete markedInputs.value[host].contentMarked
  } else if (type === 'image') {
    delete markedInputs.value[host].imageSelector
    delete markedInputs.value[host].imageDesc
    delete markedInputs.value[host].imageMarked
    delete markedInputs.value[host].imageTargets
  } else if (type === 'publish') {
    delete markedInputs.value[host].publishSelector
    delete markedInputs.value[host].publishDesc
    delete markedInputs.value[host].publishMarked
  }
  localStorage.setItem('tuileme_marked_inputs', JSON.stringify(markedInputs.value))
  showToast(`已清除当前站点的【${typeName}】标注`, 'info')
}

// 核心通用执行 Worker 函数（被单个标签页或多标签页群发调用）
function commonWebviewWorker(targetMode, titleText, contentText, markedConfig, shouldAutoPublish) {
  function fireInputEvents(el) {
    if (!el) return;
    try {
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' }));
    } catch (e) {}
  }

  function fillTitle(el, text) {
    if (!el || !text) return false;
    try { el.focus(); } catch (e) {}
    if ('value' in el) {
      const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      if (nativeInputSetter) {
        nativeInputSetter.call(el, text);
      } else {
        el.value = text;
      }
    } else {
      el.innerText = text;
    }
    fireInputEvents(el);
    return true;
  }

  function fillContent(el, text) {
    if (!el || !text) return false;
    try { el.focus(); } catch (e) {}

    if (el.isContentEditable) {
      try { document.execCommand('selectAll', false, null); } catch (e) {}

      const lines = text.split(/\r?\n/);
      const paragraphsHtml = lines.map(function(line) {
        if (!line || line.trim() === '') {
          return '<p><br></p>';
        }
        const safe = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return '<p>' + safe + '</p>';
      }).join('');

      let htmlOk = false;
      try {
        htmlOk = document.execCommand('insertHTML', false, paragraphsHtml);
      } catch (e) {}

      const curText = (el.innerText || el.textContent || '').trim();
      const lastLine = (lines[lines.length - 1] || '').trim();
      const hasLast = lastLine ? curText.includes(lastLine.slice(-10)) : curText.length > 0;

      if (!htmlOk || !hasLast) {
        try {
          document.execCommand('selectAll', false, null);
          for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (l) {
              document.execCommand('insertText', false, l);
            }
            if (i < lines.length - 1) {
              const ok = document.execCommand('insertParagraph');
              if (!ok) {
                document.execCommand('insertLineBreak');
              }
            }
          }
        } catch (e) {
          try {
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, text);
          } catch (err) {}
        }
      }

      if (!el.innerText || el.innerText.trim().length === 0) {
        try {
          el.innerHTML = paragraphsHtml;
        } catch (e) {}
      }

      fireInputEvents(el);
      return true;
    } else if ('value' in el) {
      const nativeTextareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      if (nativeTextareaSetter) {
        nativeTextareaSetter.call(el, text);
      } else {
        el.value = text;
      }
      fireInputEvents(el);
      return true;
    }
    return false;
  }

  function doFillTitle(tVal) {
    if (!tVal) return false;

    // 严格模式：只有标注了才允许填入，未标注不自动查找
    if (!markedConfig || (!markedConfig.titleSelector && !markedConfig.titleMarked)) {
      return false;
    }

    let el = document.querySelector('[data-tuileme-target="title"]');
    if (!el && markedConfig.titleSelector) {
      try { el = document.querySelector(markedConfig.titleSelector); } catch (e) {}
    }
    if (el) return fillTitle(el, tVal);

    try {
      const iframes = document.querySelectorAll('iframe');
      for (let i = 0; i < iframes.length; i++) {
        const doc = iframes[i].contentDocument || iframes[i].contentWindow?.document;
        if (doc) {
          let ifrEl = doc.querySelector('[data-tuileme-target="title"]');
          if (!ifrEl && markedConfig.titleSelector) {
            try { ifrEl = doc.querySelector(markedConfig.titleSelector); } catch (e) {}
          }
          if (ifrEl) return fillTitle(ifrEl, tVal);
        }
      }
    } catch (e) {}
    return false;
  }

  function doFillContent(cVal) {
    if (!cVal) return false;

    // 严格模式：只有标注了才允许填入，未标注不自动查找
    if (!markedConfig || (!markedConfig.contentSelector && !markedConfig.contentMarked)) {
      return false;
    }

    let el = document.querySelector('[data-tuileme-target="content"]');
    if (!el && markedConfig.contentSelector) {
      try { el = document.querySelector(markedConfig.contentSelector); } catch (e) {}
    }
    if (el) return fillContent(el, cVal);

    try {
      const iframes = document.querySelectorAll('iframe');
      for (let i = 0; i < iframes.length; i++) {
        const doc = iframes[i].contentDocument || iframes[i].contentWindow?.document;
        if (doc) {
          let ifrEl = doc.querySelector('[data-tuileme-target="content"]');
          if (!ifrEl && markedConfig.contentSelector) {
            try { ifrEl = doc.querySelector(markedConfig.contentSelector); } catch (e) {}
          }
          if (ifrEl) return fillContent(ifrEl, cVal);
        }
      }
    } catch (e) {}
    return false;
  }

  function triggerPhysicalClick(el) {
    if (!el) return false;
    try {
      el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    } catch (e) {
      try { el.scrollIntoView(); } catch (err) {}
    }

    let clientX = 0;
    let clientY = 0;
    try {
      const rect = el.getBoundingClientRect();
      clientX = rect.left + rect.width / 2;
      clientY = rect.top + rect.height / 2;
    } catch (e) {}

    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      detail: 1,
      screenX: clientX,
      screenY: clientY,
      clientX: clientX,
      clientY: clientY,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true
    };

    // 构成触发链：自身 + 父级 + 子级，全方位渗透触发（针对 div、span 嵌套结构）
    const targetChain = [];
    const child = el.querySelector('span, div, b, [class*="text" i]');
    if (child) targetChain.push(child);
    targetChain.push(el);
    if (el.parentElement && el.parentElement !== document.body) {
      targetChain.push(el.parentElement);
      if (el.parentElement.parentElement && el.parentElement.parentElement !== document.body) {
        targetChain.push(el.parentElement.parentElement);
      }
    }

    for (let k = 0; k < targetChain.length; k++) {
      const node = targetChain[k];
      try { node.focus?.(); } catch (e) {}
      try { node.dispatchEvent(new PointerEvent('pointerover', eventInit)); } catch (e) {}
      try { node.dispatchEvent(new MouseEvent('mouseover', eventInit)); } catch (e) {}
      try { node.dispatchEvent(new PointerEvent('pointerenter', eventInit)); } catch (e) {}
      try { node.dispatchEvent(new MouseEvent('mouseenter', eventInit)); } catch (e) {}
      try { node.dispatchEvent(new PointerEvent('pointerdown', eventInit)); } catch (e) {}
      try { node.dispatchEvent(new MouseEvent('mousedown', eventInit)); } catch (e) {}
      try { node.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, buttons: 0 })); } catch (e) {}
      try { node.dispatchEvent(new MouseEvent('mouseup', { ...eventInit, buttons: 0 })); } catch (e) {}
      try { node.dispatchEvent(new MouseEvent('click', { ...eventInit, buttons: 0 })); } catch (e) {}
      try { node.click?.(); } catch (e) {}
    }
    return true;
  }

  function findPublishElement() {
    // 严格模式：只有标注了发布按钮，才允许触发发布，未标注不自动查找
    if (!markedConfig || !markedConfig.publishSelector) {
      return null;
    }

    let btn = document.querySelector('[data-tuileme-target="publish"]');
    if (!btn) btn = document.querySelector('[data-tuileme-target-parent="publish"]');
    if (!btn) btn = document.querySelector('[data-tuileme-target-child="publish"]');

    if (!btn && markedConfig.publishSelector) {
      try { btn = document.querySelector(markedConfig.publishSelector); } catch (e) {}
    }
    if (btn) return btn;

    // 尝试 iframe
    try {
      const iframes = document.querySelectorAll('iframe');
      for (let i = 0; i < iframes.length; i++) {
        const doc = iframes[i].contentDocument || iframes[i].contentWindow?.document;
        if (doc) {
          let ifrBtn = doc.querySelector('[data-tuileme-target="publish"]') ||
                       doc.querySelector('[data-tuileme-target-parent="publish"]');
          if (!ifrBtn && markedConfig.publishSelector) {
            try { ifrBtn = doc.querySelector(markedConfig.publishSelector); } catch (e) {}
          }
          if (ifrBtn) return ifrBtn;
        }
      }
    } catch (e) {}

    return null;
  }

  return new Promise((resolve) => {
    let tRes = false;
    let cRes = false;

    if (targetMode === 'title' || targetMode === 'all') {
      tRes = doFillTitle(titleText);
    }
    if (targetMode === 'content' || targetMode === 'all') {
      cRes = doFillContent(contentText);
    }

    if (shouldAutoPublish) {
      // 阶段 1：等待 1000ms（留足页面响应 input 事件并更新发布按钮状态的时间）
      setTimeout(() => {
        const btn1 = findPublishElement();
        if (btn1) {
          triggerPhysicalClick(btn1);
          // 阶段 2：等待 600ms 补刀重试，彻底杜绝单次点击被防抖忽略
          setTimeout(() => {
            const btn2 = findPublishElement();
            if (btn2) triggerPhysicalClick(btn2);
            resolve({ tRes, cRes, pRes: true });
          }, 600);
        } else {
          resolve({ tRes, cRes, pRes: false });
        }
      }, 1000);
    } else {
      resolve({ tRes, cRes, pRes: false });
    }
  });
}

// 纯净封装：通过 CDP 注入文件，彻底净化并剥离 Vue Proxy，杜绝 "An object could not be cloned" 错误
async function callInjectImagesViaCDP(wcId, selectors, imageSources) {
  if (!window.electronAPI?.injectImagesViaCDP) {
    return { success: false, error: '当前环境不支持底层文件注入' }
  }
  const cleanId = Number(wcId)
  if (!cleanId) {
    return { success: false, error: '无效的网页视窗句柄' }
  }

  // 确保选择器和图片源为纯原生字符串数组，避免 Vue Proxy / 内部属性在 contextBridge 边界触发克隆失败
  let cleanSelectors = []
  if (Array.isArray(selectors)) {
    cleanSelectors = selectors.map(s => String(s || '')).filter(Boolean)
  } else if (selectors) {
    cleanSelectors = [String(selectors)]
  }

  let cleanImages = []
  if (Array.isArray(imageSources)) {
    cleanImages = imageSources.map(img => String(img || '')).filter(Boolean)
  }

  if (cleanSelectors.length === 0) {
    return { success: true, ignored: true, count: 0 }
  }
  if (cleanImages.length === 0) {
    return { success: false, error: '文案中暂无可用配图' }
  }

  // 100% 纯原生 Plain Object
  const payload = JSON.parse(JSON.stringify({
    webContentsId: cleanId,
    selectors: cleanSelectors,
    imageSources: cleanImages
  }))

  return await window.electronAPI.injectImagesViaCDP(payload)
}

// 填充单个当前激活标签页
async function injectToWebview(mode) {
  const wv = getActiveWebview()
  if (!wv) {
    showToast('当前标签页网页视窗未就绪', 'warning')
    return
  }

  const title = currentTitle.value || ''
  const content = currentContent.value || ''

  if (!title && !content) {
    showToast('标题和内容均为空，请先输入或生成', 'warning')
    return
  }

  try {
    if (window.electronAPI) {
      if (mode === 'title') window.electronAPI.copyToClipboard(title)
      else if (mode === 'content') window.electronAPI.copyToClipboard(content)
      else window.electronAPI.copyToClipboard(title + '\n\n' + content)
    }
  } catch (e) {}

  const host = currentHostname.value
  const markedCfg = (host && markedInputs.value[host]) ? markedInputs.value[host] : null

  // 严格拦截：只有标注了才允许填入，未标注不允许填入
  if (mode === 'title' && !markedCfg?.titleSelector) {
    showToast('当前页面未标注标题框，不允许填入！请先点击【🎯 标注标题框】', 'warning')
    return
  }
  if (mode === 'content' && !markedCfg?.contentSelector) {
    showToast('当前页面未标注正文框，不允许填入！请先点击【🎯 标注正文框】', 'warning')
    return
  }
  if (mode === 'all') {
    if (!markedCfg?.titleSelector && !markedCfg?.contentSelector) {
      showToast('当前页面未标注标题或正文输入框，不允许填入！请先进行标注', 'warning')
      return
    }
  }

  try {
    const shouldPub = mode === 'all' ? autoPublishEnabled.value : false
    const code = `(${commonWebviewWorker.toString()})(${JSON.stringify(mode)}, ${JSON.stringify(title)}, ${JSON.stringify(content)}, ${JSON.stringify(markedCfg)}, ${Boolean(shouldPub)})`;
    const res = await wv.executeJavaScript(code)

    if (res) {
      if (mode === 'all') {
        const fillOk = res.tRes || res.cRes
        if (fillOk) {
          // 如果当前页面标注了图片上传区，且文案中有配图，通过 CDP 协议零弹窗注入
          let injectedImageCount = 0
          const imgSelectors = (markedCfg?.imageTargets && markedCfg.imageTargets.length > 0)
            ? markedCfg.imageTargets.map(t => t.selector)
            : (markedCfg?.imageSelector ? [markedCfg.imageSelector] : [])

          if (imgSelectors.length > 0 && currentImages.value && currentImages.value.length > 0) {
            try {
              const wcId = wv.getWebContentsId()
              const imgRes = await callInjectImagesViaCDP(wcId, imgSelectors, currentImages.value)
              if (imgRes && imgRes.success) {
                injectedImageCount = imgRes.count
              }
            } catch (err) {
              console.warn('自动灌图失败:', err)
            }
          }

          if (res.pRes) {
            showToast(`已填入文案${injectedImageCount > 0 ? `并注入 ${injectedImageCount} 张图片` : ''}，成功触发自动发布！`, 'success')
          } else {
            showToast(`已成功填入已标注的输入框${injectedImageCount > 0 ? `并注入 ${injectedImageCount} 张图片` : ''}！` + (autoPublishEnabled.value ? '（未标注发布按钮，已跳过发布）' : ''), 'success')
          }
        } else {
          showToast('未能填入，请检查已标注的选择器是否仍然有效', 'warning')
        }
      } else if (mode === 'title') {
        if (res.tRes) showToast('已成功将标题填入已标注的输入框！', 'success')
        else showToast('未能填入标题，请检查已标注的选择器', 'warning')
      } else {
        if (res.cRes) showToast('已成功将正文填入已标注的输入框！', 'success')
        else showToast('未能填入正文，请检查已标注的选择器', 'warning')
      }
    }
  } catch (e) {
    console.error('executeJavaScript error:', e)
    showToast('已复制到剪贴板，可直接在输入框粘贴', 'info')
  }
}

// 核心大招：一键向所有已打开的标签页半自动化导入并发布！
async function injectToAllTabs() {
  if (tabs.value.length === 0) {
    showToast('未打开任何网页标签', 'warning')
    return
  }

  const title = currentTitle.value || ''
  const content = currentContent.value || ''
  if (!title && !content) {
    showToast('标题和内容均为空，请先在左侧输入或生成文案', 'warning')
    return
  }

  try {
    if (window.electronAPI) {
      window.electronAPI.copyToClipboard(title + '\n\n' + content)
    }
  } catch (e) {}

  broadcasting.value = true
  showToast(`🚀 正在向已标注页面自动导入${autoPublishEnabled.value ? '并发布' : ''}...`, 'info')

  const total = tabs.value.length
  let fillSuccessCount = 0
  let publishSuccessCount = 0
  let imageSuccessCount = 0
  let skippedUnmarkedCount = 0

  for (let i = 0; i < total; i++) {
    const tab = tabs.value[i]
    const wv = webviewMap.get(tab.id)
    if (!wv) continue

    const host = getHostnameFromUrl(tab.url)
    const markedCfg = (host && markedInputs.value[host]) ? markedInputs.value[host] : null

    // 严格限制：只有标注过的页面才允许填入，未标注的页面直接跳过
    const hasImageMarked = markedCfg?.imageSelector || (Array.isArray(markedCfg?.imageTargets) && markedCfg.imageTargets.length > 0)
    if (!markedCfg || (!markedCfg.titleSelector && !markedCfg.contentSelector && !hasImageMarked)) {
      skippedUnmarkedCount++
      continue
    }

    try {
      const code = `(${commonWebviewWorker.toString()})('all', ${JSON.stringify(title)}, ${JSON.stringify(content)}, ${JSON.stringify(markedCfg)}, ${Boolean(autoPublishEnabled.value)})`
      const res = await wv.executeJavaScript(code)
      if (res) {
        if (res.tRes || res.cRes) fillSuccessCount++
        if (res.pRes) publishSuccessCount++
      }

      // 如果当前页面标注了图片上传区，且文案有配图，自动通过 CDP 注入文件
      const tabImgSelectors = (markedCfg?.imageTargets && markedCfg.imageTargets.length > 0)
        ? markedCfg.imageTargets.map(t => t.selector)
        : (markedCfg?.imageSelector ? [markedCfg.imageSelector] : [])

      if (tabImgSelectors.length > 0 && currentImages.value && currentImages.value.length > 0) {
        try {
          const wcId = wv.getWebContentsId()
          const imgRes = await callInjectImagesViaCDP(wcId, tabImgSelectors, currentImages.value)
          if (imgRes && imgRes.success) {
            imageSuccessCount++
          }
        } catch (imgErr) {
          console.warn(`页面 [${tab.title}] CDP 图片注入失败:`, imgErr)
        }
      }
    } catch (err) {
      console.error(`向标签页 [${tab.title}] 导入失败:`, err)
    }
  }

  broadcasting.value = false

  let summary = `处理完毕！已向 ${fillSuccessCount} 个页面填入文案`
  if (imageSuccessCount > 0) {
    summary += `（${imageSuccessCount} 个页面注入图片）`
  }
  if (autoPublishEnabled.value) {
    summary += `（触发 ${publishSuccessCount} 个发布）`
  }
  if (skippedUnmarkedCount > 0) {
    summary += `，跳过 ${skippedUnmarkedCount} 个未标注页面`
  }
  showToast(summary, (fillSuccessCount > 0 || imageSuccessCount > 0) ? 'success' : 'warning')
}

// 单独测试注入图片 (方案 A：CDP 原生文件注入)
async function doInjectImagesOnly() {
  const wv = getActiveWebview()
  if (!wv) {
    showToast('当前标签页网页视窗未就绪', 'warning')
    return
  }
  let wcId = null
  try {
    wcId = wv.getWebContentsId()
  } catch (e) {
    showToast('网页视窗尚未准备就绪，请刷新重试', 'warning')
    return
  }
  if (!wcId) {
    showToast('未能获取当前网页视窗句柄', 'warning')
    return
  }

  const host = currentHostname.value
  const markedCfg = (host && markedInputs.value[host]) ? markedInputs.value[host] : null
  const imgSelectors = (markedCfg?.imageTargets && markedCfg.imageTargets.length > 0)
    ? markedCfg.imageTargets.map(t => t.selector)
    : (markedCfg?.imageSelector ? [markedCfg.imageSelector] : [])

  if (imgSelectors.length === 0) {
    showToast('当前页面未标注图片上传区，不允许注入！请先点击【🎯 标注图片上传区】', 'warning')
    return
  }
  if (!currentImages.value || currentImages.value.length === 0) {
    showToast('当前文案暂无配图，请先在【文案】专区添加配图', 'warning')
    return
  }
  showToast('🚀 正在通过 CDP 底层协议零弹窗注入图片...', 'info')
  try {
    const res = await callInjectImagesViaCDP(wcId, imgSelectors, currentImages.value)
    if (res && res.success) {
      showToast(`✅ 成功向网页注入 ${res.count} 张图片！页面已开始自动上传`, 'success')
    } else {
      showToast('图片注入失败: ' + (res?.error || '未能找到目标上传框'), 'warning')
    }
  } catch (err) {
    showToast('注入图片失败: ' + (err?.message || String(err)), 'danger')
  }
}

async function doTestPublishOnly() {
  const wv = getActiveWebview()
  if (!wv) {
    showToast('当前标签页网页视窗未就绪', 'warning')
    return
  }
  const host = currentHostname.value
  const markedCfg = (host && markedInputs.value[host]) ? markedInputs.value[host] : null

  // 严格限制：只有标注了发布按钮才允许触发
  if (!markedCfg || !markedCfg.publishSelector) {
    showToast('当前页面未标注发布按钮，不允许触发！请先点击【🎯 标注发布按钮】', 'warning')
    return
  }

  showToast('正在向当前页面触发发布点击...', 'info')
  try {
    const code = `(${commonWebviewWorker.toString()})('none', '', '', ${JSON.stringify(markedCfg)}, true)`
    const res = await wv.executeJavaScript(code)
    if (res && res.pRes) {
      showToast('已成功触发发布按钮点击！', 'success')
    } else {
      showToast('未能触发发布按钮，建议重新点击【🎯 标注发布按钮】进行绑定', 'warning')
    }
  } catch (e) {
    showToast('触发失败: ' + (e?.message || e), 'danger')
  }
}

// 模型拉取状态与可用列表
const availableModels = ref(['deepseek-chat', 'deepseek-reasoner'])
const fetchingModels = ref(false)

// 切换 AI 服务商预设 (支持 ds, openai, mimo, antr, custom)
function switchAIProvider(p) {
  aiConfig.value.provider = p
  if (p === 'ds') {
    aiConfig.value.baseUrl = 'https://api.deepseek.com/v1'
    aiConfig.value.model = 'deepseek-chat'
    availableModels.value = ['deepseek-chat', 'deepseek-reasoner']
  } else if (p === 'openai') {
    aiConfig.value.baseUrl = 'https://api.openai.com/v1'
    aiConfig.value.model = 'gpt-4o-mini'
    availableModels.value = ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o1-mini', 'gpt-4-turbo']
  } else if (p === 'mimo') {
    aiConfig.value.baseUrl = 'https://api.xiaomimimo.com/v1'
    aiConfig.value.model = 'mimo-v2.6-pro'
    availableModels.value = ['mimo-v2.6-flash', 'mimo-v2.6-pro', 'mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2.6-pro-ultraspeed']
  } else if (p === 'antr') {
    aiConfig.value.baseUrl = 'https://api.anthropic.com/v1'
    aiConfig.value.model = 'claude-3-5-sonnet-20241022'
    availableModels.value = ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229']
  } else {
    availableModels.value = []
  }
}

// 自动拉取远程模型列表
async function handleFetchModels() {
  fetchingModels.value = true
  try {
    if (window.electronAPI && window.electronAPI.fetchAIModels) {
      const rawCfg = JSON.parse(JSON.stringify(aiConfig.value))
      const res = await window.electronAPI.fetchAIModels(rawCfg)
      if (res && res.models && res.models.length > 0) {
        availableModels.value = res.models
        if (!aiConfig.value.model || !res.models.includes(aiConfig.value.model)) {
          aiConfig.value.model = res.models[0]
        }
        showToast(res.message || `成功获取 ${res.models.length} 个模型`, 'success')
      }
    }
  } catch (err) {
    showToast('拉取失败: ' + (err?.message || err), 'danger')
  } finally {
    fetchingModels.value = false
  }
}

async function handleTestAI() {
  aiTesting.value = true
  aiTestResult.value = ''
  try {
    if (window.electronAPI) {
      const rawCfg = JSON.parse(JSON.stringify(aiConfig.value))
      const msg = await window.electronAPI.testAIConnection(rawCfg)
      aiTestResult.value = msg || '连接正常'
      showToast('AI 接口连接成功！', 'success')
    }
  } catch (err) {
    aiTestResult.value = '测试失败: ' + (err?.message || err)
    showToast('连接失败，请检查配置', 'danger')
  } finally {
    aiTesting.value = false
  }
}

async function handleSaveAI() {
  if (!aiConfig.value.model || !aiConfig.value.model.trim()) {
    showToast('模型名称不能为空，请输入或拉取模型', 'warning')
    return
  }
  try {
    if (window.electronAPI) {
      // 关键修复：深拷贝解除 Vue 3 Proxy，防止 Electron IPC 无法克隆
      const rawCfg = JSON.parse(JSON.stringify(aiConfig.value))
      const res = await window.electronAPI.saveAIConfig(rawCfg)
      if (res && res.success) {
        showToast('AI 配置已成功保存！', 'success')
      } else {
        showToast('保存失败，请重试', 'danger')
      }
    }
  } catch (err) {
    showToast('保存失败: ' + (err?.message || err), 'danger')
  }
}

async function handleAddSite() {
  if (!newSite.value.name.trim() || !newSite.value.url.trim()) {
    showToast('请填写平台名称和后台网址', 'warning')
    return
  }
  let url = newSite.value.url.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
    newSite.value.url = url
  }
  try {
    const list = [...targetSites.value, { ...newSite.value, id: 'site_' + Date.now() }]
    if (window.electronAPI) {
      await window.electronAPI.saveTargetSites(list)
      targetSites.value = list
      newSite.value = { name: '', url: '', category: '常用推广', description: '' }
      showToast('新推广平台添加成功！', 'success')
    }
  } catch (err) {
    showToast('添加失败: ' + err, 'danger')
  }
}

async function handleDeleteSite(id) {
  try {
    const list = targetSites.value.filter(s => s.id !== id)
    if (window.electronAPI) {
      await window.electronAPI.saveTargetSites(list)
      targetSites.value = list
      showToast('平台已移除', 'info')
    }
  } catch (err) {
    showToast('删除失败: ' + err, 'danger')
  }
}
</script>

<template>
  <div class="tuileme-container">
    <div v-if="toastMessage" :class="['toast-bubble', toastType]">
      {{ toastMessage }}
    </div>

    <!-- ============================================== -->
    <!-- 第一栏：左侧导航栏 (固定 170px，矢量图标)       -->
    <!-- ============================================== -->
    <aside v-show="!sidebarCollapsed" class="sidebar-col">
      <div class="sidebar-brand">
        <div class="brand-badge">推</div>
        <div class="brand-text">
          <span class="brand-title">推了么</span>
          <span class="brand-sub">半自动推广工作台</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <button
          :class="['nav-item', { active: activeNav === 'workspace' }]"
          @click="activeNav = 'workspace'"
        >
          <LayoutDashboard :size="15" class="nav-icon-svg" />
          <span class="nav-label">推广工作台</span>
        </button>

        <button
          :class="['nav-item', { active: activeNav === 'copywriting' }]"
          @click="activeNav = 'copywriting'"
        >
          <FileEdit :size="15" class="nav-icon-svg" />
          <span class="nav-label">文案</span>
        </button>

        <button
          :class="['nav-item', { active: activeNav === 'ai-config' }]"
          @click="activeNav = 'ai-config'"
        >
          <Cpu :size="15" class="nav-icon-svg" />
          <span class="nav-label">配置 AI 模型</span>
        </button>

        <button
          :class="['nav-item', { active: activeNav === 'sites-config' }]"
          @click="activeNav = 'sites-config'"
        >
          <Globe :size="15" class="nav-icon-svg" />
          <span class="nav-label">配置推广页面</span>
        </button>
      </nav>

      <div class="sidebar-footer">
        <div class="status-card">
          <div class="status-row">
            <span class="status-dot"></span>
            <span class="status-text">AI: {{ aiConfig.model || aiConfig.provider?.toUpperCase() || 'DS' }}</span>
          </div>
          <div class="status-row sub">
            <span class="proxy-tag">架构引擎</span>
            <span class="proxy-port">Electron 原生</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- ============================================== -->
    <!-- 第二栏模式 1：推广工作台 (集中展示标注状态与批量分发控制) -->
    <!-- ============================================== -->
    <section v-if="activeNav === 'workspace' && !sidebarCollapsed" class="middle-col">
      <!-- 顶部：一键全平台分发与发布核心大面板 -->
      <div class="col-header">
        <div class="col-title-badge">
          <LayoutDashboard :size="14" class="btn-icon-svg" />
          <span>推广工作台 · 标注与分发控制</span>
        </div>

        <!-- 当前页面与域名提示 -->
        <div class="current-site-indicator">
          <span class="indicator-label">当前网页:</span>
          <span class="indicator-title" :title="currentTab?.title || currentHostname">{{ currentTab?.title || currentHostname || '未就绪' }}</span>
        </div>

        <!-- 半自动化核心：一键分发到所有已打开页面并自动发布 -->
        <div class="batch-broadcast-box">
          <button
            class="btn-broadcast-all"
            :disabled="broadcasting"
            @click="injectToAllTabs"
            :title="`向当前打开的全部 ${tabs.length} 个页面同时填充文案${autoPublishEnabled ? '并自动点击发布' : ''}`"
          >
            <Radio :size="14" class="btn-icon-svg" :class="{ spin: broadcasting }" />
            <span>{{ broadcasting ? '正在向所有页面分发并发布...' : `一键导入所有页面并发布 (${tabs.length} 个页面)` }}</span>
          </button>

          <div class="broadcast-options-row">
            <label class="auto-publish-label" title="开启后，在向页面填入标题正文后，将自动模拟物理点击已标注的“发布”按钮">
              <input type="checkbox" v-model="autoPublishEnabled" class="checkbox-clean" />
              <span>填充后自动点击发布按钮</span>
            </label>
            <button
              :class="['btn-inject-single-sub', { 'btn-disabled': !currentHostMarked.titleSelector && !currentHostMarked.contentSelector }]"
              :disabled="!currentHostMarked.titleSelector && !currentHostMarked.contentSelector"
              @click="injectToWebview('all')"
              :title="(!currentHostMarked.titleSelector && !currentHostMarked.contentSelector) ? '当前页面未标注任何输入框，不允许填入' : '仅将文案填充到当前已标注的输入框'"
            >
              <Zap :size="11" class="btn-svg-inline" />
              填入当前单页
            </button>
          </div>
        </div>
      </div>

      <!-- 核心主体：当前页面的精准标注与单项操作看板 (直观大方！) -->
      <div class="middle-content workspace-cards-scroll">
        <!-- 标注引导说明条 -->
        <div class="workspace-tip-bar">
          <Crosshair :size="13" class="tip-icon" />
          <span>在下方点击【标注】按钮，在右侧网页中点击对应元素即可锁定绑定（仅针对已标注元素填入/发布）。</span>
        </div>

        <!-- 1. 标题输入框标注卡片 -->
        <div class="marker-control-card">
          <div class="marker-card-top">
            <div class="marker-badge-wrap">
              <span class="card-badge badge-blue">
                <Type :size="12" class="badge-icon-svg" />
                1. 标题输入框
              </span>
              <span :class="['marker-status-pill', currentHostMarked.titleSelector ? 'locked' : 'unlocked']">
                {{ currentHostMarked.titleSelector ? '已锁定目标 ✓' : '未标注' }}
              </span>
            </div>
            <button
              v-if="currentHostMarked.titleSelector"
              class="btn-tiny btn-clear-mark"
              @click="clearMarkedInput('title')"
              title="清除标题标注"
            >
              <X :size="10" />
              清除
            </button>
          </div>

          <div class="marker-selector-desc" :title="currentHostMarked.titleDesc || currentHostMarked.titleSelector">
            {{ currentHostMarked.titleDesc || currentHostMarked.titleSelector || '未标注（只有标注后才允许填入，未标注不自动查找）' }}
          </div>

          <div class="marker-actions-grid">
            <button
              :class="['btn-marker-act', currentHostMarked.titleSelector ? 'btn-re-mark' : 'btn-do-mark']"
              @click="startElementPicker('title')"
            >
              <Crosshair :size="12" class="btn-svg-inline" />
              {{ currentHostMarked.titleSelector ? '重新标注标题框' : '🎯 标注标题框' }}
            </button>
            <button
              :class="['btn-marker-act', 'btn-single-fill', { 'btn-disabled': !currentHostMarked.titleSelector }]"
              :disabled="!currentHostMarked.titleSelector"
              @click="injectToWebview('title')"
              :title="currentHostMarked.titleSelector ? '仅把文案标题填入当前页面已标注的输入框' : '当前页面未标注标题框，不允许填入'"
            >
              <Type :size="12" class="btn-svg-inline" />
              填入标题
            </button>
          </div>
        </div>

        <!-- 2. 正文输入框标注卡片 -->
        <div class="marker-control-card">
          <div class="marker-card-top">
            <div class="marker-badge-wrap">
              <span class="card-badge badge-green">
                <FileText :size="12" class="badge-icon-svg" />
                2. 正文输入框
              </span>
              <span :class="['marker-status-pill', currentHostMarked.contentSelector ? 'locked' : 'unlocked']">
                {{ currentHostMarked.contentSelector ? '已锁定目标 ✓' : '未标注' }}
              </span>
            </div>
            <button
              v-if="currentHostMarked.contentSelector"
              class="btn-tiny btn-clear-mark"
              @click="clearMarkedInput('content')"
              title="清除正文标注"
            >
              <X :size="10" />
              清除
            </button>
          </div>

          <div class="marker-selector-desc" :title="currentHostMarked.contentDesc || currentHostMarked.contentSelector">
            {{ currentHostMarked.contentDesc || currentHostMarked.contentSelector || '未标注（只有标注后才允许填入，未标注不自动查找）' }}
          </div>

          <div class="marker-actions-grid">
            <button
              :class="['btn-marker-act', currentHostMarked.contentSelector ? 'btn-re-mark' : 'btn-do-mark']"
              @click="startElementPicker('content')"
            >
              <Crosshair :size="12" class="btn-svg-inline" />
              {{ currentHostMarked.contentSelector ? '重新标注正文框' : '🎯 标注正文框' }}
            </button>
            <button
              :class="['btn-marker-act', 'btn-single-fill', { 'btn-disabled': !currentHostMarked.contentSelector }]"
              :disabled="!currentHostMarked.contentSelector"
              @click="injectToWebview('content')"
              :title="currentHostMarked.contentSelector ? '仅把文案正文填入当前页面已标注的输入框' : '当前页面未标注正文框，不允许填入'"
            >
              <FileText :size="12" class="btn-svg-inline" />
              填入正文
            </button>
          </div>
        </div>

        <!-- 3. 图片上传区标注卡片 (方案 A：CDP 原生文件直灌引擎，支持多选，未标注自动忽略) -->
        <div class="marker-control-card">
          <div class="marker-card-top">
            <div class="marker-badge-wrap">
              <span class="card-badge badge-amber">
                <ImageIcon :size="12" class="badge-icon-svg" />
                3. 图片上传区
              </span>
              <span :class="['marker-status-pill', currentHostImageTargets.length > 0 ? 'locked' : 'unlocked']">
                {{ currentHostImageTargets.length > 0 ? `已锁定 ${currentHostImageTargets.length} 个上传区 ✓` : '未标注' }}
              </span>
            </div>
            <button
              v-if="currentHostImageTargets.length > 0"
              class="btn-tiny btn-clear-mark"
              @click="clearMarkedInput('image')"
              title="清除所有图片上传区标注"
            >
              <X :size="10" />
              全部清除
            </button>
          </div>

          <!-- 未标注时提示（不盲扫，未标注直接忽略） -->
          <div v-if="currentHostImageTargets.length === 0" class="marker-selector-desc">
            未标注（若不传图直接忽略；支持标注多个上传按钮/区域，CDP底层直灌）
          </div>

          <!-- 已标注多个目标时卡片内以清单展示 -->
          <div v-else class="marked-targets-list">
            <div v-for="(item, idx) in currentHostImageTargets" :key="item.id || idx" class="marked-target-chip">
              <span class="chip-index">#{{ idx + 1 }}</span>
              <span class="chip-desc" :title="item.selector">{{ item.desc || item.selector }}</span>
              <button class="btn-remove-chip" @click="removeImageTarget(idx)" title="移除此上传区标注">
                <X :size="10" />
              </button>
            </div>
          </div>

          <div class="marker-actions-grid">
            <button
              :class="['btn-marker-act', currentHostImageTargets.length > 0 ? 'btn-re-mark' : 'btn-do-mark']"
              @click="startElementPicker('image')"
            >
              <Crosshair :size="12" class="btn-svg-inline" />
              {{ currentHostImageTargets.length > 0 ? '➕ 添加/标注上传区' : '🎯 标注图片上传区' }}
            </button>
            <button
              :class="['btn-marker-act', 'btn-single-fill', { 'btn-disabled': currentHostImageTargets.length === 0 || currentImages.length === 0 }]"
              :disabled="currentHostImageTargets.length === 0 || currentImages.length === 0"
              @click="doInjectImagesOnly"
              :title="currentHostImageTargets.length === 0 ? '当前页面未标注图片上传区，不允许注入' : (currentImages.length === 0 ? '暂无可用配图，请先在文案专区添加' : `通过CDP原生协议向 ${currentHostImageTargets.length} 个上传区注入 ${currentImages.length} 张图片`)"
            >
              <Upload :size="12" class="btn-svg-inline" />
              注入图片 ({{ currentImages.length }})
            </button>
          </div>
        </div>

        <!-- 4. 发布按钮标注卡片 -->
        <div class="marker-control-card">
          <div class="marker-card-top">
            <div class="marker-badge-wrap">
              <span class="card-badge badge-purple">
                <Send :size="12" class="badge-icon-svg" />
                4. 发布按钮
              </span>
              <span :class="['marker-status-pill', currentHostMarked.publishSelector ? 'locked' : 'unlocked']">
                {{ currentHostMarked.publishSelector ? '已锁定发布按钮 ✓' : '未标注' }}
              </span>
            </div>
            <button
              v-if="currentHostMarked.publishSelector"
              class="btn-tiny btn-clear-mark"
              @click="clearMarkedInput('publish')"
              title="清除发布按钮标注"
            >
              <X :size="10" />
              清除
            </button>
          </div>

          <div class="marker-selector-desc" :title="currentHostMarked.publishDesc || currentHostMarked.publishSelector">
            {{ currentHostMarked.publishDesc || currentHostMarked.publishSelector || '未标注（只有标注后才允许触发，未标注不自动盲点）' }}
          </div>

          <div class="marker-actions-grid">
            <button
              :class="['btn-marker-act', currentHostMarked.publishSelector ? 'btn-re-mark' : 'btn-do-mark']"
              @click="startElementPicker('publish')"
            >
              <Crosshair :size="12" class="btn-svg-inline" />
              {{ currentHostMarked.publishSelector ? '重新标注发布' : '🎯 标注发布按钮' }}
            </button>
            <button
              :class="['btn-marker-act', 'btn-single-fill', { 'btn-disabled': !currentHostMarked.publishSelector }]"
              :disabled="!currentHostMarked.publishSelector"
              @click="doTestPublishOnly"
              :title="currentHostMarked.publishSelector ? '单独模拟物理点击已标注的发布按钮进行测试' : '当前页面未标注发布按钮，不允许触发'"
            >
              <Zap :size="12" class="btn-svg-inline" />
              测试点击发布
            </button>
          </div>
        </div>

        <!-- 4. 当前文案快照与切换 -->
        <div class="current-copy-preview-card">
          <div class="copy-preview-header">
            <span class="copy-preview-title">
              <FileEdit :size="12" class="btn-svg-inline" />
              待发布文案预览
            </span>
            <button class="btn-jump-copy" @click="activeNav = 'copywriting'" title="切换到文案编辑菜单进行修改或AI生成">
              编辑文案 ↗
            </button>
          </div>
          <div class="copy-preview-body">
            <div class="preview-item-title">{{ currentTitle || '（尚未填写标题）' }}</div>
            <div class="preview-item-content">{{ currentContent ? (currentContent.slice(0, 100) + (currentContent.length > 100 ? '...' : '')) : '（尚未填写正文）' }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================================== -->
    <!-- 第二栏模式 2：文案 (专门负责标题、内容、图片编辑与AI生成) -->
    <!-- ============================================== -->
    <section v-else-if="activeNav === 'copywriting' && !sidebarCollapsed" class="middle-col">
      <!-- 顶部操作区：生成按钮 + 保存草稿按钮 -->
      <div class="col-header">
        <button
          class="btn-generate-main"
          :disabled="generating"
          @click="handleGenerateFromInputs"
        >
          <Sparkles :size="14" class="btn-icon-svg" />
          <span>{{ generating ? 'AI 正在根据标题和内容生成中...' : '根据标题和内容生成文案' }}</span>
        </button>

        <div class="draft-toolbar-row">
          <button
            class="btn-draft-action primary"
            @click="handleSaveDraftRecord"
            title="将当前文案归档保存到本地历史库"
          >
            <Bookmark :size="12" class="btn-svg-inline" />
            <span>保存当前文案</span>
          </button>

          <button
            class="btn-draft-action"
            @click="openDraftsModal"
            title="查看已保存的历史文案草稿"
          >
            <History :size="12" class="btn-svg-inline" />
            <span>历史文案记录 ({{ savedDrafts.length }})</span>
          </button>
        </div>

        <button class="btn-quick-to-workspace" @click="activeNav = 'workspace'">
          <LayoutDashboard :size="13" class="btn-icon-svg" />
          <span>前往推广工作台进行标注与分发 →</span>
        </button>
      </div>

      <!-- 核心三大内容板块：1 标题、2 内容、3 图片 -->
      <div class="middle-content">
        <!-- 板块 1：标题 -->
        <div class="section-card">
          <div class="card-header">
            <span class="card-badge badge-blue">
              <Type :size="12" class="badge-icon-svg" />
              1. 标题
            </span>
            <div class="card-actions">
              <button class="btn-tiny" @click="handleCopy(currentTitle, '标题')">
                <Copy :size="11" class="btn-svg-inline" />
                复制标题
              </button>
            </div>
          </div>
          <input
            v-model="currentTitle"
            type="text"
            class="title-input-box"
            placeholder="请输入推广标题或主题..."
          />
        </div>

        <!-- 板块 2：内容 -->
        <div class="section-card content-card-flex">
          <div class="card-header">
            <span class="card-badge badge-green">
              <FileText :size="12" class="badge-icon-svg" />
              2. 内容
            </span>
            <div class="card-actions">
              <button class="btn-tiny" @click="handleCopy(currentContent, '正文')">
                <Copy :size="11" class="btn-svg-inline" />
                复制正文
              </button>
            </div>
          </div>
          <textarea
            v-model="currentContent"
            class="content-textarea-box fill-height"
            placeholder="请输入推广正文、要点或草稿，点击上方按钮将为你扩写润色..."
          ></textarea>
          <div class="content-bottom-bar">
            <div class="auto-save-tag" v-if="autoSaveStatus">
              <span class="save-dot" :class="{ saved: autoSaveStatus === 'saved' }"></span>
              <span class="save-status-text">
                {{ autoSaveStatus === 'saving' ? '正在自动保存...' : `已自动保存 (${lastSavedTime || '刚刚'})` }}
              </span>
            </div>
            <span class="char-count">总字数: {{ currentContent?.length || 0 }} 字</span>
          </div>
        </div>

        <!-- 板块 3：图片 -->
        <div class="section-card">
          <div class="card-header">
            <span class="card-badge badge-purple">
              <ImageIcon :size="12" class="badge-icon-svg" />
              3. 图片
            </span>
            <div class="card-actions">
              <label class="btn-upload-label" title="选择本地图片添加">
                <Upload :size="11" class="btn-svg-inline" />
                上传图片
                <input type="file" accept="image/*" class="file-hidden" @change="handleAddCustomImage" />
              </label>
              <button v-if="currentImages.length > 0" class="btn-tiny" @click="handleCopy(currentImages[0], '首图链接')">
                <Link :size="11" class="btn-svg-inline" />
                复制首图链接
              </button>
            </div>
          </div>
          <div v-if="currentImages.length > 0" class="images-grid">
            <div v-for="(img, idx) in currentImages" :key="idx" class="image-item-card">
              <img :src="img" class="card-preview-img" alt="配图" />
              <div class="img-overlay-bar">
                <button class="btn-img-act" @click="handleCopyImage(img)" title="复制图片到剪贴板">
                  <Copy :size="10" class="btn-svg-inline" />
                  复制图片
                </button>
                <button class="btn-img-act" @click="handleCopy(img, '图片链接')">
                  <Link :size="10" class="btn-svg-inline" />
                  链接
                </button>
              </div>
            </div>
          </div>
          <div v-else class="images-empty-placeholder">
            <span>暂无配图，点击上方按钮生成文案后将自动匹配，或点击右上角「上传图片」</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================================== -->
    <!-- 配置面板：AI 模型配置 (支持 ds, openai, mimo, antr)-->
    <!-- ============================================== -->
    <section v-else-if="activeNav === 'ai-config' && !sidebarCollapsed" class="config-view-col">
      <div class="col-header-config">
        <h2 class="config-title">
          <Cpu :size="18" class="title-icon-svg" />
          AI 模型配置
        </h2>
        <span class="config-sub">支持 DeepSeek(ds)、OpenAI、MiniMax(mimo)、Anthropic Claude(antr) 及自定义</span>
      </div>

      <div class="config-card-box">
        <!-- 服务商切换药丸 (无 emoji，纯文字优雅) -->
        <div class="form-group">
          <label class="form-label">服务商预设</label>
          <div class="provider-button-grid">
            <button
              :class="['provider-pill', { active: aiConfig.provider === 'ds' }]"
              @click="switchAIProvider('ds')"
            >
              DeepSeek (ds)
            </button>
            <button
              :class="['provider-pill', { active: aiConfig.provider === 'openai' }]"
              @click="switchAIProvider('openai')"
            >
              OpenAI
            </button>
            <button
              :class="['provider-pill', { active: aiConfig.provider === 'mimo' }]"
              @click="switchAIProvider('mimo')"
            >
              小米 MiMo (mimo)
            </button>
            <button
              :class="['provider-pill', { active: aiConfig.provider === 'antr' }]"
              @click="switchAIProvider('antr')"
            >
              Anthropic (antr)
            </button>
            <button
              :class="['provider-pill', { active: aiConfig.provider === 'custom' }]"
              @click="switchAIProvider('custom')"
            >
              自定义
            </button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">API Base URL</label>
          <input
            v-model="aiConfig.baseUrl"
            type="text"
            class="config-input"
            placeholder="例如: https://api.deepseek.com/v1 或 https://api.anthropic.com/v1"
          />
        </div>

        <div class="form-group">
          <label class="form-label">API Key</label>
          <input
            v-model="aiConfig.apiKey"
            type="password"
            class="config-input"
            placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
          />
          <span class="form-note">未填写 API Key 时，将自动使用本地智能模拟引擎进行兜底。</span>
        </div>

        <div class="form-group">
          <div class="label-with-action">
            <label class="form-label">模型名称 (Model)</label>
            <button
              type="button"
              class="btn-fetch-models"
              :disabled="fetchingModels"
              @click="handleFetchModels"
              title="根据当前 Base URL 和 Key 自动拉取云端可用模型列表"
            >
              <RotateCw :size="11" :class="['btn-svg-inline', { spin: fetchingModels }]" />
              <span>{{ fetchingModels ? '正在拉取...' : '自动拉取模型' }}</span>
            </button>
          </div>
          <div class="model-input-box-wrapper">
            <input
              v-model="aiConfig.model"
              type="text"
              class="config-input"
              list="ai-models-datalist"
              placeholder="输入或从下拉列表选择模型..."
            />
            <datalist id="ai-models-datalist">
              <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
            </datalist>
          </div>

          <!-- 候选模型快速切换胶囊 -->
          <div v-if="availableModels.length > 0" class="model-quick-chips">
            <span class="chips-label">候选模型:</span>
            <span
              v-for="m in availableModels.slice(0, 8)"
              :key="m"
              :class="['model-chip', { active: aiConfig.model === m }]"
              @click="aiConfig.model = m"
              :title="m"
            >
              {{ m }}
            </span>
          </div>
        </div>

        <div class="config-actions-row">
          <button class="btn-save" @click="handleSaveAI">
            <Save :size="13" class="btn-icon-svg" />
            保存配置
          </button>
          <button class="btn-test" :disabled="aiTesting" @click="handleTestAI">
            <Plug :size="13" class="btn-icon-svg" />
            {{ aiTesting ? '测试连接中...' : '测试连接' }}
          </button>
        </div>

        <div v-if="aiTestResult" class="test-feedback-box">
          {{ aiTestResult }}
        </div>
      </div>
    </section>

    <!-- ============================================== -->
    <!-- 配置面板：推广目标平台管理 (纯手动导入，无图标/Emoji)-->
    <!-- ============================================== -->
    <section v-else-if="activeNav === 'sites-config' && !sidebarCollapsed" class="config-view-col">
      <div class="col-header-config">
        <h2 class="config-title">
          <Globe :size="18" class="title-icon-svg" />
          推广目标平台管理
        </h2>
        <span class="config-sub">管理你在右侧嵌入式浏览器中常去的创作者后台</span>
      </div>

      <!-- 添加新站点卡片 (去掉图标和emoji，纯手动导入) -->
      <div class="config-card-box">
        <h3 class="box-header-title">添加新推广平台</h3>
        <div class="form-group">
          <label class="form-label">平台名称</label>
          <input v-model="newSite.name" type="text" class="config-input" placeholder="例如：哔哩哔哩创作中心" />
        </div>

        <div class="form-group">
          <label class="form-label">后台发布网址 (URL)</label>
          <input v-model="newSite.url" type="text" class="config-input" placeholder="https://member.bilibili.com/platform/upload-manager/article" />
        </div>

        <button class="btn-save full-btn" @click="handleAddSite">
          <Plus :size="13" class="btn-icon-svg" />
          添加到平台列表
        </button>
      </div>

      <!-- 已有平台列表卡片 (纯文字卡片，无图标和emoji) -->
      <div class="config-card-box mt-4">
        <h3 class="box-header-title">当前已配置平台 ({{ targetSites.length }})</h3>
        <div class="site-card-list">
          <div v-for="site in targetSites" :key="site.id" class="site-card-item">
            <div class="site-detail-box">
              <span class="site-title-name">{{ site.name }}</span>
              <span class="site-link-url" :title="site.url">{{ site.url }}</span>
            </div>
            <div class="site-act-btns">
              <button class="btn-open-site" @click="selectSite(site); activeNav = 'workspace'" title="在右侧浏览器打开此页面">
                打开
              </button>
              <button class="btn-remove-site" @click="handleDeleteSite(site.id)" title="从列表中删除">
                <Trash2 :size="12" class="btn-svg-inline" />
                删除
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ============================================== -->
    <!-- 第三栏：嵌入式浏览器视窗 (真正的 Electron webview)-->
    <!-- ============================================== -->
    <main class="browser-col">
      <!-- 浏览器多标签页导航栏 (支持无限开标签页与快速切换) -->
      <div class="tabs-header-bar">
        <div class="tabs-list-scroll">
          <div
            v-for="tab in tabs"
            :key="tab.id"
            :class="['browser-tab-item', { active: activeTabId === tab.id }]"
            @click="switchTab(tab.id)"
            :title="tab.title || tab.url"
          >
            <span v-if="tab.loading" class="tab-spinner-dot"></span>
            <Globe v-else :size="12" class="tab-icon-svg" />
            <span class="tab-title-text">{{ tab.title || '正在加载...' }}</span>
            <button
              class="btn-close-tab"
              @click.stop="closeTab(tab.id)"
              title="关闭此标签页"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- 新建标签页按钮 -->
        <button class="btn-new-tab" @click="createTab('https://www.baidu.com', '百度一下')" title="新建标签页 (打开百度)">
          <Plus :size="13" />
        </button>

        <div class="tabs-right-control">
          <button class="tool-btn-collapse" @click="sidebarCollapsed = !sidebarCollapsed" :title="sidebarCollapsed ? '展开工作区' : '宽屏全屏浏览'">
            {{ sidebarCollapsed ? '展开工作区' : '宽屏浏览' }}
          </button>
        </div>
      </div>

      <!-- 浏览器第二行：前进/后退/刷新/地址栏与注入操作 -->
      <header class="browser-toolbar">
        <div class="nav-control-group">
          <button class="tool-btn btn-icon-only" @click="goBack" title="后退">
            <ChevronLeft :size="13" />
          </button>
          <button class="tool-btn btn-icon-only" @click="goForward" title="前进">
            <ChevronRight :size="13" />
          </button>
          <button class="tool-btn btn-icon-only" @click="refreshBrowser" title="刷新页面">
            <RotateCw :size="13" />
          </button>
          <button class="btn-reset-state" @click="resetLoginState" title="仅重置当前选中平台的登录状态 (不影响其他平台)">
            <RotateCcw :size="11" class="btn-svg-inline" />
            重置当前登录
          </button>
        </div>

        <!-- 页面 URL 地址栏 -->
        <div class="address-bar">
          <Lock :size="12" class="lock-icon-svg" />
          <input
            v-model="currentUrlInput"
            type="text"
            class="address-input"
            @keyup.enter="navigateToUrl"
            placeholder="输入推广目标网址并回车..."
          />
          <button class="btn-go" @click="navigateToUrl">前往</button>
        </div>

        <!-- 浏览器右侧操作区 (仅保留外部打开) -->
        <div class="browser-actions">
          <button
            class="btn-external"
            @click="handleOpenExternal"
            title="在系统外部浏览器中打开"
          >
            <ExternalLink :size="12" class="btn-svg-inline" />
            外部
          </button>
        </div>
      </header>

      <!-- 常用平台快捷书签栏 (点击秒切或新建对应平台标签页) -->
      <div class="quick-sites-bar">
        <span class="quick-title">快捷平台:</span>
        <button
          v-for="s in targetSites"
          :key="s.id"
          :class="['quick-chip', { active: currentTab?.siteId === s.id || currentTab?.url === s.url }]"
          @click="selectSite(s)"
          :title="'切换或在独立标签页打开 ' + s.name"
        >
          <span>{{ s.name }}</span>
        </button>
        <div class="quick-sites-right">
          <button class="quick-reset-btn" @click="resetLoginState" title="仅重置当前选中的平台登录状态与缓存 (其他平台保持登录)">
            <RotateCcw :size="11" class="btn-svg-inline" />
            重置当前平台
          </button>
        </div>
      </div>

      <!-- 核心多 webview 视窗 (视口分层常驻机制，无限开标签页并行存活，渲染管线永远在线！) -->
      <div class="webview-container">
        <div v-if="currentTab?.loading" class="webview-loading-bar">
          <div class="loading-line"></div>
        </div>
        <webview
          v-for="tab in tabs"
          :key="tab.id"
          :ref="el => setWebviewRef(el, tab.id)"
          :src="tab.url"
          partition="persist:tuileme"
          useragent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
          allowpopups
          webpreferences="nativeWindowOpen=yes"
          :class="['embedded-webview', { 'webview-active': activeTabId === tab.id, 'webview-hidden': activeTabId !== tab.id }]"
        ></webview>
      </div>
    </main>

    <!-- ============================================== -->
    <!-- 历史已保存文案草稿弹窗模态框                   -->
    <!-- ============================================== -->
    <div v-if="showDraftsModal" class="modal-overlay" @click.self="showDraftsModal = false">
      <div class="drafts-modal-card">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <Bookmark :size="15" class="modal-header-icon" />
            <h3 class="modal-title">已保存的历史文案草稿 ({{ savedDrafts.length }})</h3>
          </div>
          <button class="btn-close-modal" @click="showDraftsModal = false">✕</button>
        </div>

        <div class="modal-body-scroll">
          <div v-if="savedDrafts.length === 0" class="empty-drafts-box">
            <Clock :size="32" class="empty-icon" />
            <p class="empty-text">暂无手动归档的文案草稿</p>
            <span class="empty-sub">在工作台点击【保存文案】即可将文案成果留存在此</span>
          </div>

          <div v-else class="drafts-record-list">
            <div
              v-for="draft in savedDrafts"
              :key="draft.id"
              class="draft-record-card"
            >
              <div class="draft-card-top">
                <span class="draft-platform-tag">{{ draft.platformStyle?.toUpperCase() || 'COMMON' }}</span>
                <span class="draft-time">{{ formatDraftTime(draft.createdAt) }}</span>
              </div>
              <h4 class="draft-record-title">{{ draft.title || '（未命名标题）' }}</h4>
              <p class="draft-record-snippet">{{ (draft.content || '').slice(0, 90) }}{{ (draft.content || '').length > 90 ? '...' : '' }}</p>
              <div class="draft-card-footer">
                <span class="draft-length-tag">共 {{ draft.content?.length || 0 }} 字</span>
                <div class="draft-act-group">
                  <button class="btn-load-draft" @click="handleLoadDraft(draft)">
                    <Check :size="12" class="btn-svg-inline" />
                    恢复到工作台
                  </button>
                  <button class="btn-del-draft" @click="handleDeleteDraftRecord(draft.id)" title="删除此记录">
                    <Trash2 :size="12" class="btn-svg-inline" />
                    删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tuileme-container {
  display: flex;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: var(--bg-primary);
  position: relative;
}

.toast-bubble {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  padding: 8px 20px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  animation: fadeInDown 0.25s ease-out;
}
.toast-bubble.info { background: rgba(30, 41, 59, 0.95); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
.toast-bubble.success { background: rgba(6, 78, 59, 0.95); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.3); }
.toast-bubble.warning { background: rgba(120, 53, 15, 0.95); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
.toast-bubble.danger { background: rgba(127, 29, 29, 0.95); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); }

/* 第一栏：左侧导航 */
.sidebar-col {
  width: 170px;
  min-width: 170px;
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  user-select: none;
}

.sidebar-brand {
  padding: 16px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--border-color);
}

.brand-badge {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.5px;
}

.brand-sub {
  font-size: 10px;
  color: var(--text-muted);
}

.sidebar-nav {
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s ease;
  text-align: left;
}

.nav-item:hover {
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
}

.nav-item.active {
  background-color: rgba(59, 130, 246, 0.15);
  color: var(--accent-color);
  font-weight: 600;
}

.nav-icon-svg {
  color: inherit;
  flex-shrink: 0;
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--border-color);
}

.status-card {
  background: var(--bg-tertiary);
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-row.sub {
  justify-content: space-between;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.status-text {
  font-size: 11px;
  color: var(--text-secondary);
}

.proxy-tag {
  font-size: 10px;
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  padding: 1px 5px;
  border-radius: 4px;
}

.proxy-port {
  font-size: 10px;
  color: var(--text-muted);
}

/* 第二栏：推广工坊 */
.middle-col {
  width: 390px;
  min-width: 390px;
  max-width: 440px;
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.col-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.style-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.row-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}

.style-chips {
  display: flex;
  gap: 5px;
}

.chip-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 3px 9px;
  border-radius: 12px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.chip-btn:hover {
  border-color: var(--accent-color);
  color: var(--text-primary);
}

.chip-btn.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: var(--accent-color);
  color: #93c5fd;
  font-weight: 600;
}

.actions-button-grid {
  display: flex;
  gap: 6px;
  align-items: stretch;
}

.btn-generate-main {
  flex: 1;
  background: linear-gradient(135deg, #10b981, #059669);
  color: #fff;
  border: none;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-generate-main:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.5);
}

.btn-generate-main:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.draft-toolbar-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.btn-draft-action {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  transition: all 0.15s;
  white-space: nowrap;
}

.btn-draft-action:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.2);
}

.btn-draft-action.primary {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  color: #93c5fd;
  font-weight: 600;
}

.btn-draft-action.primary:hover {
  background: rgba(59, 130, 246, 0.3);
  border-color: #3b82f6;
  color: #fff;
}

.btn-icon-svg {
  flex-shrink: 0;
}


.btn-svg-inline {
  display: inline-block;
  vertical-align: -1px;
  margin-right: 2px;
}

.batch-broadcast-box {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.btn-broadcast-all {
  background: linear-gradient(135deg, #ec4899, #8b5cf6, #3b82f6);
  background-size: 200% 200%;
  animation: gradientShift 4s ease infinite;
  color: #fff;
  border: none;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(139, 92, 246, 0.4);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.btn-broadcast-all:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(139, 92, 246, 0.6);
}

.btn-broadcast-all:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.broadcast-options-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 2px;
}

.auto-publish-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #93c5fd;
  cursor: pointer;
  user-select: none;
}

.checkbox-clean {
  width: 14px;
  height: 14px;
  accent-color: #3b82f6;
  cursor: pointer;
}

.btn-inject-single-sub {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.btn-inject-single-sub:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
  color: #fff;
}

.btn-inject-all {
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  border: none;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-inject-all:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.6);
}

/* 推广工作台专属样式 */
.col-title-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #60a5fa;
  padding: 4px 0;
}

.current-site-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 11px;
}

.indicator-label {
  color: var(--text-muted);
  flex-shrink: 0;
}

.indicator-title {
  color: #38bdf8;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-tip-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(59, 130, 246, 0.08);
  border: 1px dashed rgba(59, 130, 246, 0.35);
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: #93c5fd;
  line-height: 1.4;
}

.tip-icon {
  color: #60a5fa;
  flex-shrink: 0;
}

.marker-control-card {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  transition: all 0.2s ease;
}

.marker-control-card:hover {
  border-color: rgba(59, 130, 246, 0.4);
}

.marker-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.marker-badge-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.marker-status-pill {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 10px;
  font-weight: 600;
}

.marker-status-pill.locked {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.35);
}

.marker-status-pill.unlocked {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-muted);
  border: 1px solid var(--border-color);
}

.btn-clear-mark {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 3px;
  transition: all 0.15s;
}

.btn-clear-mark:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.4);
}

.marker-selector-desc {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.25);
  padding: 6px 8px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.marked-targets-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 120px;
  overflow-y: auto;
  padding: 2px 0;
}

.marked-target-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 11px;
}

.chip-index {
  color: #fbbf24;
  font-weight: 700;
  font-size: 10px;
  flex-shrink: 0;
}

.chip-desc {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.btn-remove-chip {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  transition: all 0.15s;
  flex-shrink: 0;
}

.btn-remove-chip:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.marker-actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.btn-marker-act {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}

.btn-do-mark {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: #fff;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
}

.btn-do-mark:hover {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  transform: translateY(-1px);
}

.btn-re-mark {
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
  border: 1px solid rgba(59, 130, 246, 0.4);
}

.btn-re-mark:hover {
  background: rgba(59, 130, 246, 0.25);
  color: #fff;
}

.btn-single-fill {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.btn-single-fill:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
}

.btn-marker-act:disabled,
.btn-marker-act.btn-disabled {
  opacity: 0.35 !important;
  cursor: not-allowed !important;
  pointer-events: auto !important;
  filter: grayscale(80%);
}

.btn-inject-single-sub:disabled,
.btn-inject-single-sub.btn-disabled {
  opacity: 0.35 !important;
  cursor: not-allowed !important;
  pointer-events: auto !important;
}

.current-copy-preview-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.copy-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.copy-preview-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-jump-copy {
  background: transparent;
  border: none;
  color: #60a5fa;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
  font-weight: 500;
  transition: color 0.15s;
}

.btn-jump-copy:hover {
  color: #93c5fd;
  text-decoration: underline;
}

.copy-preview-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: rgba(0, 0, 0, 0.2);
  padding: 7px 9px;
  border-radius: 4px;
}

.preview-item-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-item-content {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.btn-quick-to-workspace {
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #93c5fd;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s;
  width: 100%;
  margin-top: 4px;
}

.btn-quick-to-workspace:hover {
  background: rgba(59, 130, 246, 0.22);
  color: #fff;
  border-color: rgba(59, 130, 246, 0.6);
}

.middle-content {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 核心板块卡片 */
.section-card {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.badge-icon-svg {
  flex-shrink: 0;
}
.badge-blue { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
.badge-green { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.badge-purple { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
.badge-amber { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }

.card-actions {
  display: flex;
  gap: 5px;
  align-items: center;
}

.btn-tiny {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 3px;
}

.btn-tiny:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.btn-tiny.btn-accent {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.5);
  color: #93c5fd;
  font-weight: 600;
}

.btn-tiny.btn-accent:hover {
  background: #2563eb;
  color: #fff;
}

.btn-tiny.btn-mark {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.4);
  color: #c4b5fd;
}
.btn-tiny.btn-mark:hover {
  background: rgba(139, 92, 246, 0.3);
  color: #fff;
}

.btn-tiny.btn-marked-active {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.6);
  color: #34d399;
  font-weight: 600;
}
.btn-tiny.btn-marked-active:hover {
  background: rgba(16, 185, 129, 0.35);
  color: #fff;
}

.btn-tiny.btn-clear-mark {
  padding: 3px 5px;
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.35);
  color: #f87171;
}
.btn-tiny.btn-clear-mark:hover {
  background: #ef4444;
  color: #fff;
}

.title-input-box {
  width: 100%;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 600;
  outline: none;
}
.title-input-box:focus {
  border-color: var(--accent-color);
}

.content-card-flex {
  flex: 1;
  min-height: 220px;
  display: flex;
  flex-direction: column;
}

.content-textarea-box {
  width: 100%;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  padding: 10px;
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}
.content-textarea-box.fill-height {
  flex: 1;
  height: 100%;
  min-height: 160px;
  resize: none;
}
.content-textarea-box:focus {
  border-color: var(--accent-color);
}

.content-bottom-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.auto-save-tag {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--text-muted);
}

.save-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #64748b;
  transition: all 0.3s;
}

.save-dot.saved {
  background-color: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
}

.save-status-text {
  color: var(--text-secondary);
}

.char-count {
  font-size: 10px;
  color: var(--text-muted);
}

/* 历史草稿全屏遮罩与居中弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(11, 15, 25, 0.78);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
  animation: modalOverlayFade 0.15s ease-out;
}

.drafts-modal-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  width: 560px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.75);
  overflow: hidden;
  animation: modalContentPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.02);
  flex-shrink: 0;
}

.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-header-icon {
  color: var(--accent-color);
  flex-shrink: 0;
}

.modal-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.btn-close-modal {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-close-modal:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.modal-body-scroll {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  min-height: 160px;
  max-height: calc(85vh - 60px);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-drafts-box {
  padding: 48px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
}

.empty-icon {
  opacity: 0.35;
}

.empty-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0;
}

.empty-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.drafts-record-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.draft-record-card {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.15s;
}

.draft-record-card:hover {
  border-color: rgba(59, 130, 246, 0.45);
  background: rgba(30, 41, 59, 0.85);
}

.draft-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.draft-platform-tag {
  font-size: 10px;
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.draft-time {
  font-size: 11px;
  color: var(--text-muted);
}

.draft-record-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.draft-record-snippet {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.draft-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.draft-length-tag {
  font-size: 11px;
  color: var(--text-muted);
}

.draft-act-group {
  display: flex;
  gap: 8px;
}

.btn-load-draft {
  background: rgba(16, 185, 129, 0.18);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #34d399;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-load-draft:hover {
  background: #10b981;
  color: #fff;
}

.btn-del-draft {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #f87171;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-del-draft:hover {
  background: #ef4444;
  color: #fff;
}

@keyframes modalOverlayFade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modalContentPop {
  from { opacity: 0; transform: scale(0.96) translateY(-6px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}


/* 图片板块 */
.images-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.image-item-card {
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: #000;
}

.card-preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s;
}

.image-item-card:hover .card-preview-img {
  transform: scale(1.05);
}

.img-overlay-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(4px);
  padding: 4px;
  display: flex;
  gap: 4px;
  justify-content: center;
}

.btn-img-act {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: #fff;
  font-size: 9px;
  padding: 2px 4px;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
}

.btn-img-act:hover {
  background: #2563eb;
}

.btn-upload-label {
  background: rgba(168, 85, 247, 0.2);
  border: 1px solid rgba(168, 85, 247, 0.4);
  color: #c084fc;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.btn-upload-label:hover {
  background: #a855f7;
  color: #fff;
}

.file-hidden {
  display: none;
}

.images-empty-placeholder {
  padding: 18px;
  text-align: center;
  color: var(--text-muted);
  font-size: 11px;
  border: 1px dashed var(--border-color);
  border-radius: 4px;
  background: rgba(15, 23, 42, 0.3);
}

/* 配置专区面板 (宽度自适应美观) */
.config-view-col {
  width: 460px;
  min-width: 460px;
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 20px;
}

.col-header-config {
  margin-bottom: 16px;
}

.config-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon-svg {
  color: var(--accent-color);
}

.config-sub {
  font-size: 11px;
  color: var(--text-muted);
}

.config-card-box {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.box-header-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.provider-button-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.provider-pill {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 6px 11px;
  border-radius: 14px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.provider-pill:hover {
  border-color: var(--accent-color);
  color: #fff;
}

.provider-pill.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: var(--accent-color);
  color: #93c5fd;
  font-weight: 600;
}

.label-with-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.btn-fetch-models {
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.35);
  color: #93c5fd;
  font-size: 10px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 3px;
  transition: all 0.15s;
}

.btn-fetch-models:hover:not(:disabled) {
  background: #2563eb;
  color: #fff;
}

.btn-fetch-models:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spin {
  animation: spinAnim 1s linear infinite;
}

@keyframes spinAnim {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.model-input-box-wrapper {
  width: 100%;
}

.model-quick-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  margin-top: 2px;
}

.chips-label {
  font-size: 10px;
  color: var(--text-muted);
}

.model-chip {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.12s;
}

.model-chip:hover {
  border-color: var(--accent-color);
  color: #fff;
}

.model-chip.active {
  background: rgba(59, 130, 246, 0.25);
  border-color: #3b82f6;
  color: #93c5fd;
  font-weight: 600;
}

.config-input {
  width: 100%;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  padding: 8px 10px;
  font-size: 12px;
  outline: none;
}
.config-input:focus {
  border-color: var(--accent-color);
}

.form-note {
  font-size: 10px;
  color: var(--text-muted);
}

.config-actions-row {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.btn-save {
  background: var(--accent-color);
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-save.full-btn {
  width: 100%;
  padding: 9px;
}

.btn-test {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.test-feedback-box {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 11px;
  color: #38bdf8;
}

.mt-4 {
  margin-top: 14px;
}

/* 平台管理列表样式精修 (无图标无emoji，整洁纯净) */
.site-card-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 400px;
  overflow-y: auto;
}

.site-card-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.15s;
}

.site-card-item:hover {
  border-color: rgba(59, 130, 246, 0.4);
}

.site-detail-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: 2px;
}

.site-title-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.site-link-url {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.site-act-btns {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.btn-open-site {
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.4);
  color: #93c5fd;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}

.btn-open-site:hover {
  background: #2563eb;
  color: #fff;
}

.btn-remove-site {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 3px;
}

/* 浏览器多标签页栏 (支持无限开与平滑滚动) */
.tabs-header-bar {
  height: 38px;
  background-color: #080c14;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 6px;
  user-select: none;
}

.tabs-list-scroll {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  max-width: calc(100% - 120px);
  padding: 2px 0;
}

.tabs-list-scroll::-webkit-scrollbar {
  height: 0px;
}

.browser-tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  max-width: 170px;
  min-width: 90px;
  transition: all 0.15s;
  flex-shrink: 0;
}

.browser-tab-item:hover {
  background: rgba(30, 41, 59, 0.7);
  color: var(--text-secondary);
}

.browser-tab-item.active {
  background: var(--bg-secondary);
  border-color: rgba(59, 130, 246, 0.5);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.tab-icon-svg {
  color: #60a5fa;
  flex-shrink: 0;
}

.tab-spinner-dot {
  width: 10px;
  height: 10px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.tab-title-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-close-tab {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  padding: 1px 3px;
  border-radius: 3px;
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.15s;
  flex-shrink: 0;
  line-height: 1;
}

.btn-close-tab:hover {
  opacity: 1;
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.btn-new-tab {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  width: 26px;
  height: 26px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.btn-new-tab:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
  color: #fff;
}

.tabs-right-control {
  margin-left: auto;
  display: flex;
  align-items: center;
}

.tool-btn-collapse {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.tool-btn-collapse:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

/* 第三栏：嵌入式浏览器 */
.browser-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: #0b0f19;
}

.browser-toolbar {
  height: 48px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 10px;
  user-select: none;
}

.nav-control-group {
  display: flex;
  gap: 6px;
}

.tool-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tool-btn.btn-icon-only {
  padding: 5px 7px;
}

.tool-btn:hover {
  color: #fff;
  border-color: var(--accent-color);
}

.address-bar {
  flex: 1;
  height: 32px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 6px;
}

.lock-icon-svg {
  color: #10b981;
  flex-shrink: 0;
}

.address-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 12px;
}

.btn-go {
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.4);
  color: #93c5fd;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  cursor: pointer;
}

.btn-go:hover {
  background: #2563eb;
  color: #fff;
}

.browser-actions {
  display: flex;
  gap: 6px;
}

.btn-inject-pill {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: #38bdf8;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-inject-pill:hover {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
}

.btn-inject-pill.btn-marked-highlight {
  background: rgba(16, 185, 129, 0.18);
  border-color: rgba(16, 185, 129, 0.5);
  color: #34d399;
}
.btn-inject-pill.btn-marked-highlight:hover {
  background: rgba(16, 185, 129, 0.3);
  border-color: #10b981;
}

.btn-inject-all-pill {
  background: linear-gradient(135deg, #2563eb, #6366f1);
  border: none;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 14px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-inject-all-pill:hover {
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.6);
}

.btn-inject-broadcast-pill {
  background: linear-gradient(135deg, #ec4899, #8b5cf6);
  border: none;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 5px 12px;
  border-radius: 14px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(236, 72, 153, 0.4);
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.btn-inject-broadcast-pill:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(236, 72, 153, 0.6);
}

.btn-inject-broadcast-pill:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.btn-external {
  background: transparent;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 3px;
}

/* 快捷平台书签栏 (纯文字，无图标与emoji) */
.quick-sites-bar {
  height: 34px;
  background-color: rgba(15, 23, 42, 0.7);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 8px;
  overflow-x: auto;
}

.quick-title {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}

.quick-chip {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 3px 9px;
  border-radius: 10px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}

.quick-chip:hover {
  background: var(--bg-tertiary);
  color: #fff;
  border-color: var(--accent-color);
}

.quick-chip.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: var(--accent-color);
  color: #93c5fd;
  font-weight: 600;
}

.btn-reset-state {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.btn-reset-state:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: #ef4444;
  color: #fff;
}

.quick-sites-right {
  margin-left: auto;
  display: flex;
  align-items: center;
}

.quick-reset-btn {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.35);
  color: #fca5a5;
  padding: 3px 9px;
  border-radius: 10px;
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.quick-reset-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: #ef4444;
  color: #fff;
}

.webview-container {
  flex: 1;
  position: relative;
  background-color: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.webview-loading-bar {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background-color: rgba(59, 130, 246, 0.2);
  overflow: hidden;
  z-index: 20;
}

.loading-line {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #6366f1, #38bdf8);
  animation: loadingAnim 1.2s infinite;
}

@keyframes loadingAnim {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.embedded-webview {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: none;
  background-color: #ffffff;
  transition: opacity 0.15s ease;
}

.embedded-webview.webview-active {
  opacity: 1;
  pointer-events: auto;
  z-index: 10;
  transform: translate(0, 0);
}

.embedded-webview.webview-hidden {
  opacity: 0;
  pointer-events: none;
  z-index: 1;
  transform: translate(-99999px, -99999px);
}
</style>
