const { app, BrowserWindow, ipcMain, clipboard, shell, session, webContents } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const https = require('https')
const http = require('http')

// 忽略证书错误并去除自动化受控标记（使 navigator.webdriver 与常规 Chrome 浏览器一致）
app.commandLine.appendSwitch('ignore-certificate-errors')
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
app.userAgentFallback = CHROME_UA

// 用户配置目录 ~/.tuileme/config.json
const CONFIG_DIR = path.join(os.homedir(), '.tuileme')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

const DEFAULT_SITES = [
  {
    id: 'xhs',
    name: '小红书创作者服务',
    url: 'https://creator.xiaohongshu.com',
    category: '种草社区',
    description: '小红书创作者服务平台，笔记与图文发布'
  },
  {
    id: 'weibo',
    name: '微博创作者中心',
    url: 'https://weibo.com',
    category: '社交媒体',
    description: '新浪微博，热点话题与短文案发布'
  },
  {
    id: 'tieba',
    name: '百度贴吧',
    url: 'https://tieba.baidu.com',
    category: '兴趣社区',
    description: '全球最大的中文兴趣社区，适合贴吧讨论与精准垂类发帖'
  },
  {
    id: 'douyin',
    name: '抖音创作者服务平台',
    url: 'https://creator.douyin.com',
    category: '短视频与图文',
    description: '抖音创作者服务平台，支持发布抖音图文、短视频与内容推广'
  }
]

const DEFAULT_AI_CONFIG = {
  provider: 'ds', // 'ds' | 'openai' | 'mimo' | 'antr' | 'custom'
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  temperature: 0.7
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      const loadedAI = data.aiConfig || {}
      if (loadedAI.provider === 'deepseek') {
        loadedAI.provider = 'ds'
      }

      // 保留小红书、微博、贴吧、抖音四大平台，彻底过滤剔除微信平台
      let filteredSites = (data.targetSites || []).filter(s => {
        const id = (s.id || '').toLowerCase()
        const name = s.name || ''
        return (id === 'xhs' || id === 'weibo' || id === 'tieba' || id === 'douyin' ||
               name.includes('小红书') || name.includes('微博') || name.includes('贴吧') || name.includes('抖音')) &&
               !id.includes('wechat') && !name.includes('微信')
      })

      // 确保抖音平台始终存在
      if (!filteredSites.some(s => s.id === 'douyin' || s.name.includes('抖音'))) {
        filteredSites.push({
          id: 'douyin',
          name: '抖音创作者服务平台',
          url: 'https://creator.douyin.com',
          category: '短视频与图文',
          description: '抖音创作者服务平台，支持发布抖音图文、短视频与内容推广'
        })
      }

      if (filteredSites.length === 0) {
        filteredSites = DEFAULT_SITES
      }

      return {
        aiConfig: { ...DEFAULT_AI_CONFIG, ...loadedAI },
        targetSites: filteredSites
      }
    }
  } catch (e) {
    console.error('加载本地配置失败:', e)
  }
  return {
    aiConfig: DEFAULT_AI_CONFIG,
    targetSites: DEFAULT_SITES
  }
}


function saveConfig(cfg) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8')
    return true
  } catch (e) {
    console.error('保存本地配置失败:', e)
    return false
  }
}

let userConfig = loadConfig()
let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    title: '推了么 · AI 自动化推广与多端工作台',
    backgroundColor: '#0f172a',
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      webviewTag: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // 统一设置持久化 session 分区，使用现代 Chrome User-Agent 与标准中文 Accept-Language
  const tuilemeSession = session.fromPartition('persist:tuileme')
  tuilemeSession.setUserAgent(CHROME_UA, 'zh-CN,zh;q=0.9,en;q=0.8')





  const isDev = process.env.NODE_ENV === 'development' || !fs.existsSync(path.join(__dirname, 'dist/index.html'))
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow.loadFile(path.join(__dirname, 'dist/index.html'))
    })
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'))
  }
}

// 模拟 AI 生成兜底逻辑 (根据用户输入的标题和内容进行扩写与优化)
function generateMockContent(form) {
  const inputTitle = (form.title || '').trim()
  const inputContent = (form.content || '').trim()
  const style = form.platformStyle || 'xhs'
  const baseKeyword = inputTitle || inputContent.slice(0, 15) || '推了么'

  let title = ''
  let content = ''
  let tags = []

  switch (style) {
    case 'xhs':
      title = inputTitle ? `挖到宝了！关于【${inputTitle}】我不允许还有人不知道✨` : `绝绝子！效率直接翻倍的宝藏神器【${baseKeyword}】🔥`
      content = `姐妹们！今天必须按头安利一下${inputTitle ? `【${inputTitle}】` : ''}！真的太省心了😭

${inputContent ? `💡 先划重点：\n${inputContent}\n\n` : ''}以前发内容切标签页切到头晕，格式还经常乱！
现在直接一个工作台闭环，网感、效率全都有了，谁懂这种不用反复复制粘贴的快乐啊！！🙌

自媒体运营、打工人赶紧冲，早用早享受～🚀`
      tags = [`#${baseKeyword}`, '#自媒体运营', '#效率神器', '#爆款文案', '#小红书种草']
      break

    case 'weibo':
      title = inputTitle ? `#${inputTitle}# 聊聊最新的体验思考` : `#${baseKeyword}# 今日安利`
      content = `${inputTitle ? `【${inputTitle}】` : ''}${inputContent ? `\n\n${inputContent}\n\n` : ''}效率真的太高了，推荐大家试试！大家怎么看？欢迎转发讨论～`
      tags = [`#${baseKeyword}#`, '#新鲜事#', '#效率工具#']
      break

    case 'tieba':
      title = inputTitle ? `关于【${inputTitle}】，开个贴聊聊真实体验` : `兄弟们，最近试了个真香神器【${baseKeyword}】，不吹不黑进来看`
      content = `如题，最近一直在琢磨${inputTitle ? `【${inputTitle}】` : '这个事情'}。\n\n${inputContent ? `先说结论和核心要点：\n${inputContent}\n\n` : ''}实际用下来发现真的有点东西，省去了好多来回折腾的时间，比想象中顺手多了。\n\n不知道吧里有没有老哥也在用同类的？欢迎进楼里理性探讨，不喜勿喷～`
      tags = [`#${baseKeyword}#`, '#贴吧热议#', '#真实测评#', '#开帖探讨#']
      break

    case 'douyin':
      title = inputTitle ? `建议收藏！关于【${inputTitle}】的实用干货🔥` : `刷到就是赚到！效率直接翻倍的宝藏神器【${baseKeyword}】`
      content = `刷到的朋友先点赞收藏防走丢！✨\n\n今天给大家分享${inputTitle ? `【${inputTitle}】` : '一个绝绝子神器'}！\n\n${inputContent ? `📌 核心亮点：\n${inputContent}\n\n` : ''}不仅操作丝滑，而且效率直接拉满，新手小白也能轻松上手～\n\n快去试试，有什么问题随时在评论区留言！👇`
      tags = [`#${baseKeyword}`, '#抖音图文来了', '#实用干货', '#宝藏工具', '#效率提升']
      break

    default:
      title = inputTitle ? `【精选】${inputTitle}` : `【推荐】关于 ${baseKeyword} 的推广方案`
      content = `${inputContent ? `${inputContent}\n\n` : ''}以上方案专为高效推广量身定制，支持一键填入右侧页面！`
      tags = [`#${baseKeyword}`, '#推广分享']
      break
  }

  return {
    title,
    content,
    tags,
    imagePrompts: [`${baseKeyword} 高清桌面展示`, '数据图表与科技质感光影'],
    suggestedImages: [
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=600&auto=format&fit=crop'
    ]
  }
}

// 为各平台构建深度量身定制的高爆款 Prompt 体系
function buildPlatformPrompts(platform, title, content) {
  const p = platform || 'xhs'

  let platformGuidance = ''

  if (p === 'xhs') {
    platformGuidance = `【目标平台：小红书 (Xiaohongshu)】
- 核心人设：深度体验过的挑剔自用生活家/垂直达人，与闺蜜或同行好友真诚安利。
- 标题法则：20字以内，情绪拉满、痛点聚焦或反常识认知（例如：“被问了800遍的效率神器...”、“后悔没有早点发现这个！”、“打工人别再盲目重复复制了”），可带1-2个吸睛视觉符号（如✨、🔥）。
- 正文排版：
  1. 首句必须是黄金钩子（Hook），一秒吸睛，直击痛点。
  2. 极短段落排版，每1-2句话必须主动空行换行，切忌任何长篇文字块。
  3. 适当穿插 3-5 个贴合情境的 Emoji（如 💡、✨、🔥、👇 等）作为视觉停留锚点，保持页面清新灵动。
  4. 核心亮点与实操步骤采用清单序号（1. 2. 3.）列出，清爽直观。
  5. 文末自然附加 3-5 个高权重垂直话题标签（例如：#自媒体干货 #效率神器 #实用好物）。
- 语气禁忌：绝对杜绝老气横秋的公文腔、官方通稿和教科书口吻。`
  } else if (p === 'weibo') {
    platformGuidance = `【目标平台：微博 (Weibo)】
- 核心人设：全网前沿热点观察员 / 敏锐客观的行业博主。
- 篇幅与结构：短平快，篇幅通常在 140~280 字左右为佳，信息密度高，拒绝拖泥带水。
- 开头法则：前排必须以 1~2 个热门 #双井号话题# 起手，紧接着一句话抛出核心爆点观点或反直觉结论。
- 正文节奏：提炼出最核心的 2-3 个事实要点，语言犀利、幽默或接地气。
- 结尾互动：文末务必留一个开放式提问或征求意见句（如“大家平时怎么选？来评论区聊聊”、“你们觉得这个真香吗？”），强力调动读者转发评论欲望。`
  } else if (p === 'tieba') {
    platformGuidance = `【目标平台：百度贴吧 (Baidu Tieba)】
- 核心原则：【100% 去商业化、去广告营销腔、伪装成老哥/吧友真实发帖】！
- 贴吧致命雷区：吧友和吧务对生硬广告极其敏感，出现任何营销号套话（如“强烈推荐/赶紧抢购/顶级大师/震撼来袭”）秒被删帖封号！
- 标题风格：纯正贴吧老哥口吻，短小、接地气、真实悬念或开贴探讨（如“【实测】折腾了几天这个工具，聊聊真实优缺点”、“兄弟们，最近发现个真香冷门工具，不吹不黑进来看”、“开个贴唠唠这个东西到底实不实用”）。
- 正文结构：
  1. 楼主口吻：“如题”、“最近一直在折腾这个事”、“先说结论”、“客观点说”、“个人用下来的体会”。
  2. 既讲优点和爽点，也客观点出一两处适用门槛或使用心得，显得真实可信。
  3. 文末呼唤吧友互动：“有同样在用的老哥吗？交流下经验”、“大家怎么看，不喜勿喷”。`
  } else if (p === 'douyin') {
    platformGuidance = `【目标平台：抖音图文 / 创作者服务 (Douyin)】
- 核心人设：抖音爆款知识分享博主 / 实用工具测评达人。
- 标题法则：15-25字以内，强吸睛短句、数字量化或利益诱惑（例如：“建议收藏！3分钟搞定...”、“刷到赚到！效率直接翻倍的秘密”、“别再手动复制了！这个方法太绝了”）。
- 正文排版：
  1. 首句吸引停留，引导点赞收藏（如“刷到先点赞收藏防走丢！”、“建议保存，关键时刻用得上”）。
  2. 极简短句，层层递进，直奔核心利益点与爽点。
  3. 文案适配抖音图文轮播或视频文案，重点突出、节奏轻快。
  4. 文末强引导互动：“快@你身边的小伙伴试试”、“评论区留下你的想法”。
  5. 附加热门标签（如 #抖音图文来了 #实用工具 #干货分享 #宝藏神器）。`
  } else {
    platformGuidance = `【目标平台：全网自媒体推广】
- 针对用户核心诉求，提炼爆款标题与结构清晰的正文，兼顾传播度与可信度。`
  }

  const systemPrompt = `你是一个拥有全网千万级爆款经验的顶级自媒体运营专家和文案营销大师。
你的任务是根据用户提供的【原始标题】和【原始内容/要点】，结合【指定平台的目标受众与文风算法逻辑】，深度重构并生成高转化、高质量、极具原生网感的自媒体推广文案。

${platformGuidance}

【全平台严苛通用禁令（违反将视为严重失误）】：
1. 严禁出现任何陈词滥调与 AI 废话：
   - 坚决杜绝“在当今快节奏的数字化时代/当下社会”、“毋庸置疑”、“显而易见”、“总而言之/综上所述”、“让我们拭目以待”、“赋能/闭环/矩阵/底层逻辑”等毫无意义的套话空话。
2. 尊重用户的核心事实：
   - 必须紧密围绕用户输入的标题和要点进行扩写润色与场景化包装，保留用户给出的核心参数、产品名、卖点与业务逻辑，严禁通篇脱靶或无根无据凭空捏造虚假信息。
3. 严格格式规范：
   - 你必须直接输出合法的单层纯 JSON 对象，绝对严禁包裹 \`\`\`json 或任何外部 Markdown 标签。
   - 字段要求：
     {
       "title": "提炼优化后的单个极致吸睛标题（直接可用，切忌给选择题或备选）",
       "content": "根据上述平台专属排版规范生成的完整推广正文（包含自然空行、分段与标签）",
       "tags": ["#标签1", "#标签2", "#标签3"],
       "imagePrompts": ["适合配图的中文搜索关键词1", "适合配图的中文搜索关键词2"]
     }`

  const userPrompt = `【待处理素材】
- 原始标题/主题: ${title ? title.trim() : '（未提供特定标题，请根据内容提炼一个极致吸睛的爆款标题）'}
- 原始内容/要点: ${content ? content.trim() : '（未提供具体内容，请根据标题方向扩写一篇高价值的完整推文）'}
- 目标平台: ${p}

请严格按照 ${p} 平台的文风准则进行创作，消除一切 AI 腔调，直接输出纯 JSON：`

  return { systemPrompt, userPrompt }
}

// 真实 AI 接口调用：全面支持 OpenAI, DeepSeek (ds), MiniMax (mimo), Anthropic Claude (antr)
function requestAI(cfg, form) {
  return new Promise((resolve, reject) => {
    const provider = cfg.provider || 'ds'
    let baseURL = (cfg.baseUrl || '').replace(/\/+$/, '')
    const apiKey = cfg.apiKey
    const model = cfg.model

    if (!apiKey) {
      return resolve(generateMockContent(form))
    }

    const { systemPrompt, userPrompt } = buildPlatformPrompts(
      form.platformStyle,
      form.title,
      form.content
    )

    // 判断是否为原生 Anthropic 接口 (antr 且域名为 api.anthropic.com)
    const isAnthropicNative = provider === 'antr' || baseURL.includes('api.anthropic.com')

    let endpoint = ''
    let headers = {}
    let postData = ''

    if (isAnthropicNative) {
      if (!baseURL) baseURL = 'https://api.anthropic.com/v1'
      endpoint = baseURL + '/messages'
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
      postData = JSON.stringify({
        model: model || 'claude-3-5-sonnet-20241022',
        max_tokens: 2500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    } else {
      // 标准 OpenAI 兼容接口：OpenAI, DeepSeek, Xiaomi MiMo, 自定义中转
      if (!baseURL) {
        if (provider === 'ds') baseURL = 'https://api.deepseek.com/v1'
        else if (provider === 'mimo') baseURL = 'https://api.xiaomimimo.com/v1'
        else baseURL = 'https://api.openai.com/v1'
      }
      endpoint = baseURL + '/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
      postData = JSON.stringify({
        model: model || (provider === 'ds' ? 'deepseek-chat' : provider === 'mimo' ? 'mimo-v2.6-pro' : 'gpt-4o-mini'),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: cfg.temperature || 0.7,
        max_tokens: 2500
      })
    }

    headers['Content-Length'] = Buffer.byteLength(postData)

    const parsedUrl = new URL(endpoint)
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: headers,
      timeout: 60000
    }

    const protocol = parsedUrl.protocol === 'https:' ? https : http
    const req = protocol.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`AI 接口返回错误 (${res.statusCode}): ${data}`))
        }
        try {
          const jsonResp = JSON.parse(data)
          let rawContent = ''
          if (isAnthropicNative) {
            rawContent = jsonResp.content?.[0]?.text || ''
          } else {
            rawContent = jsonResp.choices?.[0]?.message?.content || ''
          }

          rawContent = rawContent.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim()
          let parsedJson = null
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            try {
              parsedJson = JSON.parse(jsonMatch[0])
            } catch (je) {}
          }
          if (!parsedJson) {
            parsedJson = JSON.parse(rawContent)
          }

          const result = parsedJson
          result.suggestedImages = [
            'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&auto=format&fit=crop',
            'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=600&auto=format&fit=crop'
          ]
          resolve(result)
        } catch (e) {
          console.warn('AI 解析失败，回退到兜底模板:', e)
          resolve(generateMockContent(form))
        }
      })
    })

    req.on('error', (err) => reject(err))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('AI 请求超时，请检查网络或代理'))
    })
    req.write(postData)
    req.end()
  })
}

const PRESET_MODELS = {
  ds: ['deepseek-chat', 'deepseek-reasoner'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o1-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  mimo: ['mimo-v2.6-flash', 'mimo-v2.6-pro', 'mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2.6-pro-ultraspeed'],
  antr: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
  custom: ['gpt-4o', 'gpt-4o-mini', 'deepseek-chat', 'claude-3-5-sonnet-20241022']
}

// 自动拉取远程模型列表方法
async function fetchRemoteModels(cfg) {
  const provider = cfg.provider || 'ds'
  let baseURL = (cfg.baseUrl || '').trim().replace(/\/+$/, '')
  const apiKey = (cfg.apiKey || '').trim()

  if (!apiKey) {
    return {
      models: PRESET_MODELS[provider] || PRESET_MODELS.ds,
      isPreset: true,
      message: '未填写 API Key，已展示该服务商官方推荐模型'
    }
  }

  const isAnthropicNative = provider === 'antr' || baseURL.includes('api.anthropic.com')

  try {
    let endpoint = ''
    let headers = {}

    if (isAnthropicNative) {
      if (!baseURL) baseURL = 'https://api.anthropic.com/v1'
      endpoint = baseURL.endsWith('/v1') ? `${baseURL}/models` : `${baseURL}/v1/models`
      headers = {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    } else {
      if (!baseURL) {
        if (provider === 'ds') baseURL = 'https://api.deepseek.com/v1'
        else if (provider === 'mimo') baseURL = 'https://api.xiaomimimo.com/v1'
        else baseURL = 'https://api.openai.com/v1'
      }
      endpoint = `${baseURL}/models`
      headers = {
        'Authorization': `Bearer ${apiKey}`
      }
    }

    const resp = await fetch(endpoint, {
      method: 'GET',
      headers: headers,
      signal: AbortSignal.timeout(10000)
    })

    if (!resp.ok) {
      return {
        models: PRESET_MODELS[provider] || PRESET_MODELS.ds,
        isPreset: true,
        message: `接口返回状态 (${resp.status})，已自动回退到官方推荐模型`
      }
    }

    const data = await resp.json()
    let list = []

    if (Array.isArray(data.data)) {
      list = data.data.map(m => (typeof m === 'string' ? m : m.id)).filter(Boolean)
    } else if (Array.isArray(data.models)) {
      list = data.models.map(m => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean)
    }

    if (list.length > 0) {
      // 过滤非文字类/系统内部模型并排序
      list = Array.from(new Set(list)).sort()
      return {
        models: list,
        isPreset: false,
        message: `成功拉取到 ${list.length} 个可用模型！`
      }
    }

    return {
      models: PRESET_MODELS[provider] || PRESET_MODELS.ds,
      isPreset: true,
      message: '未解析到模型列表，已展示推荐模型'
    }
  } catch (err) {
    return {
      models: PRESET_MODELS[provider] || PRESET_MODELS.ds,
      isPreset: true,
      message: `网络或接口异常 (${err.message})，已加载推荐模型`
    }
  }
}

// IPC 处理器注册
ipcMain.handle('get-ai-config', () => userConfig.aiConfig)

ipcMain.handle('save-ai-config', (event, cfg) => {
  try {
    if (!cfg) throw new Error('配置参数为空')
    userConfig.aiConfig = {
      provider: cfg.provider || 'ds',
      baseUrl: (cfg.baseUrl || '').trim(),
      apiKey: (cfg.apiKey || '').trim(),
      model: (cfg.model || '').trim(),
      temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 0.7
    }
    const ok = saveConfig(userConfig)
    if (!ok) throw new Error('写入配置文件 ~/.tuileme/config.json 失败')
    return { success: true, aiConfig: userConfig.aiConfig }
  } catch (err) {
    console.error('save-ai-config 失败:', err)
    throw err
  }
})

ipcMain.handle('fetch-ai-models', async (event, cfg) => {
  return await fetchRemoteModels(cfg)
})

ipcMain.handle('test-ai-connection', async (event, cfg) => {
  if (!cfg.apiKey || !cfg.apiKey.trim()) {
    throw new Error('API Key 不能为空')
  }

  const provider = cfg.provider || 'ds'
  let baseURL = (cfg.baseUrl || '').replace(/\/+$/, '')
  const model = cfg.model
  const isAnthropicNative = provider === 'antr' || baseURL.includes('api.anthropic.com')

  let endpoint = ''
  let headers = {}
  let postData = ''

  if (isAnthropicNative) {
    if (!baseURL) baseURL = 'https://api.anthropic.com/v1'
    endpoint = baseURL + '/messages'
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01'
    }
    postData = JSON.stringify({
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    })
  } else {
    if (!baseURL) {
      if (provider === 'ds') baseURL = 'https://api.deepseek.com/v1'
      else if (provider === 'mimo') baseURL = 'https://api.xiaomimimo.com/v1'
      else baseURL = 'https://api.openai.com/v1'
    }
    endpoint = baseURL + '/chat/completions'
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`
    }
    postData = JSON.stringify({
      model: model || (provider === 'ds' ? 'deepseek-chat' : provider === 'mimo' ? 'mimo-v2.6-pro' : 'gpt-4o-mini'),
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 300
    })
  }

  headers['Content-Length'] = Buffer.byteLength(postData)

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(endpoint)
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: headers,
      timeout: 25000
    }
    const protocol = parsedUrl.protocol === 'https:' ? https : http
    const req = protocol.request(options, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve('连接成功！AI 接口响应正常。')
        } else {
          reject(new Error(`连接失败 (${res.statusCode}): ${data}`))
        }
      })
    })
    req.on('error', (err) => reject(new Error('网络连接异常: ' + err.message)))
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
    req.write(postData)
    req.end()
  })
})

ipcMain.handle('get-target-sites', () => userConfig.targetSites)

ipcMain.handle('save-target-sites', (event, sites) => {
  userConfig.targetSites = sites
  saveConfig(userConfig)
  return true
})

ipcMain.handle('generate-promote-content', async (event, form) => {
  if (userConfig.aiConfig && userConfig.aiConfig.apiKey && userConfig.aiConfig.apiKey.trim()) {
    try {
      return await requestAI(userConfig.aiConfig, form)
    } catch (err) {
      console.warn('真实 AI 生成失败，回退到智能模拟引擎:', err.message)
      return generateMockContent(form)
    }
  }
  return generateMockContent(form)
})

ipcMain.handle('copy-to-clipboard', (event, text) => {
  clipboard.writeText(text)
  return true
})

ipcMain.handle('copy-image-to-clipboard', async (event, imageSource) => {
  try {
    const { nativeImage } = require('electron')
    let image
    if (imageSource.startsWith('data:image')) {
      image = nativeImage.createFromDataURL(imageSource)
    } else if (imageSource.startsWith('http')) {
      const res = await fetch(imageSource)
      const arrayBuffer = await res.arrayBuffer()
      image = nativeImage.createFromBuffer(Buffer.from(arrayBuffer))
    }
    if (image) {
      clipboard.writeImage(image)
      return true
    }
  } catch (e) {
    console.error('复制图片到剪贴板失败:', e)
  }
  return false
})

ipcMain.handle('open-external', (event, targetURL) => {
  shell.openExternal(targetURL)
  return true
})



// ================= 草稿与保存文案持久化 =================
const DRAFTS_FILE = path.join(CONFIG_DIR, 'drafts.json')

function loadDraftsData() {
  try {
    if (fs.existsSync(DRAFTS_FILE)) {
      return JSON.parse(fs.readFileSync(DRAFTS_FILE, 'utf-8'))
    }
  } catch (e) {
    console.error('加载草稿文件失败:', e)
  }
  return {
    currentDraft: { title: '', content: '', images: [], platformStyle: 'xhs', updatedAt: null },
    savedRecords: []
  }
}

function saveDraftsData(data) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    fs.writeFileSync(DRAFTS_FILE, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (e) {
    console.error('保存草稿数据失败:', e)
    return false
  }
}

let draftsData = loadDraftsData()

ipcMain.handle('get-current-draft', () => {
  return draftsData.currentDraft || { title: '', content: '', images: [], platformStyle: 'xhs' }
})

ipcMain.handle('save-current-draft', (event, draft) => {
  draftsData.currentDraft = {
    title: draft.title || '',
    content: draft.content || '',
    images: Array.isArray(draft.images) ? draft.images : [],
    platformStyle: draft.platformStyle || 'xhs',
    updatedAt: Date.now()
  }
  saveDraftsData(draftsData)
  return { success: true }
})

ipcMain.handle('save-draft-record', (event, record) => {
  const newRec = {
    id: 'draft_' + Date.now(),
    title: (record.title || '').trim() || (record.content ? record.content.slice(0, 15) : '无标题文案'),
    content: record.content || '',
    images: Array.isArray(record.images) ? record.images : [],
    platformStyle: record.platformStyle || 'zhihu',
    createdAt: Date.now()
  }
  if (!Array.isArray(draftsData.savedRecords)) {
    draftsData.savedRecords = []
  }
  draftsData.savedRecords.unshift(newRec)
  if (draftsData.savedRecords.length > 60) {
    draftsData.savedRecords = draftsData.savedRecords.slice(0, 60)
  }
  saveDraftsData(draftsData)
  return { success: true, record: newRec, list: draftsData.savedRecords }
})

ipcMain.handle('get-draft-records', () => {
  return draftsData.savedRecords || []
})

ipcMain.handle('delete-draft-record', (event, id) => {
  draftsData.savedRecords = (draftsData.savedRecords || []).filter(r => r.id !== id)
  saveDraftsData(draftsData)
  return { success: true, list: draftsData.savedRecords }
})

ipcMain.handle('clear-session-storage', async (event, targetUrl) => {
  try {
    const tuilemeSession = session.fromPartition('persist:tuileme')
    if (!targetUrl) {
      await tuilemeSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'caches', 'indexdb', 'websql', 'serviceworkers', 'cachestorage']
      })
      await tuilemeSession.clearCache()
      return { success: true }
    }

    let origin = ''
    let hostname = ''
    try {
      const parsed = new URL(targetUrl)
      origin = parsed.origin
      hostname = parsed.hostname
    } catch (e) {
      hostname = targetUrl
    }

    // 1. 清除当前选中平台的 origin storage (localStorage, indexdb, service workers 等)
    if (origin) {
      await tuilemeSession.clearStorageData({
        origin: origin,
        storages: ['localstorage', 'caches', 'indexdb', 'websql', 'serviceworkers', 'cachestorage']
      })
    }

    // 2. 清除当前平台及关联域名的 Cookie，绝不影响其他平台（如小红书、微博、贴吧）
    const hostParts = hostname.split('.')
    const rootDomain = hostParts.length >= 2 ? hostParts.slice(-2).join('.') : hostname

    const cookies = await tuilemeSession.cookies.get({})
    for (const cookie of cookies) {
      const cookieDomain = (cookie.domain || '').replace(/^\./, '').toLowerCase()
      const isTargetCookie =
        cookieDomain === hostname.toLowerCase() ||
        hostname.toLowerCase().endsWith('.' + cookieDomain) ||
        (rootDomain.length > 3 && cookieDomain.endsWith(rootDomain.toLowerCase()))

      if (isTargetCookie) {
        const protocol = cookie.secure ? 'https://' : 'http://'
        const domainClean = cookie.domain.replace(/^\./, '')
        const cookieUrl = `${protocol}${domainClean}${cookie.path}`
        try {
          await tuilemeSession.cookies.remove(cookieUrl, cookie.name)
        } catch (err) {
          try {
            await tuilemeSession.cookies.remove(`${protocol}${hostname}${cookie.path}`, cookie.name)
          } catch (e2) {}
        }
      }
    }

    return { success: true, targetDomain: hostname }
  } catch (err) {
    console.error('清除指定站点存储数据失败:', err)
    return { success: false, error: err.message }
  }
})

// ==========================================
// 方案 A：CDP 原生文件注入核心引擎 (零弹窗直灌 input[type="file"])
// ==========================================
async function resolveLocalImagePaths(sources) {
  const localPaths = []
  const tempDir = path.join(os.homedir(), '.tuileme', 'temp_images')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]
    if (!src) continue

    // 1. 本地绝对路径文件
    if (typeof src === 'string' && fs.existsSync(src) && path.isAbsolute(src)) {
      localPaths.push(src)
      continue
    }

    // 2. Data URL (Base64)
    if (typeof src === 'string' && src.startsWith('data:image/')) {
      try {
        const matches = src.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/)
        if (matches) {
          const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1].replace('+xml', '')
          const buffer = Buffer.from(matches[2], 'base64')
          const fileName = `img_${Date.now()}_${i}.${ext}`
          const destPath = path.join(tempDir, fileName)
          fs.writeFileSync(destPath, buffer)
          localPaths.push(destPath)
          continue
        }
      } catch (err) {
        console.warn('解析 DataURL 图片失败:', err)
      }
    }

    // 3. HTTP / HTTPS 远程图片
    if (typeof src === 'string' && (src.startsWith('http://') || src.startsWith('https://'))) {
      try {
        const destPath = path.join(tempDir, `web_${Date.now()}_${i}.jpg`)
        await new Promise((resolve, reject) => {
          const client = src.startsWith('https://') ? https : http
          client.get(src, (res) => {
            if (res.statusCode !== 200) {
              return reject(new Error('下载失败: ' + res.statusCode))
            }
            const fileStream = fs.createWriteStream(destPath)
            res.pipe(fileStream)
            fileStream.on('finish', () => {
              fileStream.close()
              resolve()
            })
          }).on('error', reject)
        })
        if (fs.existsSync(destPath)) {
          localPaths.push(destPath)
          continue
        }
      } catch (err) {
        console.warn('下载远程图片失败:', err)
      }
    }
  }

  return localPaths
}

ipcMain.handle('inject-images-via-cdp', async (event, { webContentsId, selectors, selector, imageSources }) => {
  if (!webContentsId) {
    return { success: false, error: '缺少网页视窗 ID' }
  }

  // 整理所有传入的已标注选择器列表（支持标注多个上传区）
  let selectorList = []
  if (Array.isArray(selectors)) {
    selectorList = selectors.filter(Boolean)
  } else if (typeof selector === 'string' && selector.trim()) {
    selectorList = [selector.trim()]
  }

  // 严格规则：如果用户没标注，直接忽略跳过，绝不全网盲扫！
  if (selectorList.length === 0) {
    return { success: true, ignored: true, count: 0, message: '未标注任何图片上传区，已自动忽略' }
  }

  const targetWc = webContents.fromId(Number(webContentsId))
  if (!targetWc) {
    return { success: false, error: '未找到对应的网页视窗' }
  }

  const filePaths = await resolveLocalImagePaths(imageSources || [])
  if (filePaths.length === 0) {
    return { success: false, error: '文案中暂无可用图片或图片文件解析失败' }
  }

  try {
    if (!targetWc.debugger.isAttached()) {
      try {
        targetWc.debugger.attach('1.3')
      } catch (e1) {
        targetWc.debugger.attach('1.2')
      }
    }

    // 在页面中精确定位用户标注的多个文件上传 input 元素（若标注了按钮或容器，智能向下/向上递归寻找 input[type=file]）
    const findExpr = `
      (() => {
        const selectors = ${JSON.stringify(selectorList)};
        const foundInputs = [];

        function resolveInputFromElement(marked) {
          if (!marked) return null;
          // 1. 如果 marked 本身就是 input[type=file]
          if (marked.tagName === 'INPUT' && marked.type === 'file') {
            return marked;
          }
          // 2. 在 marked 内部寻找 input[type=file]
          const inner = marked.querySelector('input[type="file"]');
          if (inner) return inner;

          // 3. 在父级或同级容器寻找 input[type=file]
          const parent = marked.closest('div, form, label, section, .upload, [class*="upload" i]');
          if (parent) {
            const sibling = parent.querySelector('input[type="file"]');
            if (sibling) return sibling;
          }
          return null;
        }

        // 针对每个已标注的选择器进行定位与递归解析
        for (const sel of selectors) {
          try {
            const targets = Array.from(document.querySelectorAll(sel));
            for (const t of targets) {
              const fileInput = resolveInputFromElement(t);
              if (fileInput && !foundInputs.includes(fileInput)) {
                foundInputs.push(fileInput);
              }
            }
          } catch(e) {}
        }

        // 跨 iframe 寻找已标注的选择器
        const iframes = document.querySelectorAll('iframe');
        for (let k = 0; k < iframes.length; k++) {
          try {
            const doc = iframes[k].contentDocument || iframes[k].contentWindow?.document;
            if (doc) {
              for (const sel of selectors) {
                const targets = Array.from(doc.querySelectorAll(sel));
                for (const t of targets) {
                  const fileInput = resolveInputFromElement(t);
                  if (fileInput && !foundInputs.includes(fileInput)) {
                    foundInputs.push(fileInput);
                  }
                }
              }
            }
          } catch(e) {}
        }

        // 严格模式：未标注或未找到则直接返回空，绝不全网盲扫！
        return foundInputs;
      })()
    `

    const evalRes = await targetWc.debugger.sendCommand('Runtime.evaluate', {
      expression: findExpr,
      returnByValue: false
    })

    if (!evalRes || !evalRes.result || !evalRes.result.objectId || evalRes.result.subtype === 'null') {
      return { success: false, error: '在已标注的区域未定位到文件输入控件' }
    }

    const arrayObjectId = evalRes.result.objectId

    // 获取找到的 input 控件数量
    const lengthRes = await targetWc.debugger.sendCommand('Runtime.callFunctionOn', {
      objectId: arrayObjectId,
      functionDeclaration: 'function() { return this.length; }',
      returnByValue: true
    })

    const inputCount = lengthRes?.result?.value || 0
    if (inputCount === 0) {
      return { success: false, error: '在已标注的区域内未找到文件输入控件，请重新标注上传按钮' }
    }

    let successInjectCount = 0
    // 遍历每一个已标注识别出的 input[type=file]，逐一注入本地图片文件
    for (let idx = 0; idx < inputCount; idx++) {
      const itemRes = await targetWc.debugger.sendCommand('Runtime.callFunctionOn', {
        objectId: arrayObjectId,
        functionDeclaration: 'function(i) { return this[i]; }',
        arguments: [{ value: idx }],
        returnByValue: false
      })

      if (itemRes && itemRes.result && itemRes.result.objectId) {
        const inputObjectId = itemRes.result.objectId

        // CDP 核心特权指令：直接将本地物理文件句柄赋给 input[type=file]，零弹窗！
        await targetWc.debugger.sendCommand('DOM.setFileInputFiles', {
          files: filePaths,
          objectId: inputObjectId
        })

        // 触发 input 和 change 事件，让页面前端立刻感知文件并开始自动上传
        await targetWc.debugger.sendCommand('Runtime.callFunctionOn', {
          objectId: inputObjectId,
          functionDeclaration: `function() {
            try { this.dispatchEvent(new Event('input', { bubbles: true, cancelable: true })); } catch(e) {}
            try { this.dispatchEvent(new Event('change', { bubbles: true, cancelable: true })); } catch(e) {}
          }`
        })
        successInjectCount++
      }
    }

    return { success: true, count: filePaths.length, inputCount: successInjectCount }
  } catch (err) {
    console.error('CDP 文件注入失败:', err)
    return { success: false, error: '底层注入失败: ' + (err?.message || String(err)) }
  }
})

app.whenReady().then(() => {
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault()
    callback(true)
  })

  app.on('web-contents-created', (event, contents) => {
    contents.setUserAgent(CHROME_UA, 'zh-CN,zh;q=0.9,en;q=0.8')
    contents.setWindowOpenHandler(({ url }) => {
      // 拒绝独立弹窗，通知主窗口以内部新标签页的形式打开
      if (url && !url.startsWith('about:') && !url.startsWith('javascript:')) {
        // 智能过滤字节/抖音浮动客服弹窗，避免自动新建干扰标签页
        if (url.includes('summon.bytedance.com')) {
          return { action: 'deny' }
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('open-new-tab', url)
        }
      }
      return { action: 'deny' }
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
