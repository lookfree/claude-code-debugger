import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Check, Settings, Zap, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Provider {
  id: string
  name: string
  displayName: string
  mode: 'api' | 'subscription'
  apiKey?: string
  baseUrl?: string
  model?: string
  enabled: boolean
  isActive: boolean
  icon?: string
  createdAt?: string
  updatedAt?: string
}

const defaultProviders: Omit<Provider, 'id' | 'apiKey' | 'enabled' | 'isActive'>[] = [
  {
    name: 'claude-subscription',
    displayName: 'Claude (订阅模式)',
    mode: 'subscription',
    model: 'claude-3-5-sonnet-20241022',
    icon: '👤'
  },
  {
    name: 'claude-api',
    displayName: 'Claude API',
    mode: 'api',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-20241022',
    icon: '🎯'
  },
  {
    name: 'kimi',
    displayName: 'Kimi (月之暗面)',
    mode: 'api',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    icon: '🌙'
  },
  {
    name: 'zhipu',
    displayName: '智谱 AI (GLM)',
    mode: 'api',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4',
    icon: '💡'
  },
  {
    name: 'deepseek',
    displayName: 'DeepSeek',
    mode: 'api',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    icon: '🔍'
  },
  {
    name: 'openai',
    displayName: 'OpenAI',
    mode: 'api',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4-turbo-preview',
    icon: '⚡'
  }
]

export default function Models() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({
    displayName: '',
    name: '',
    mode: 'api' as 'api' | 'subscription',
    apiKey: '',
    baseUrl: '',
    model: ''
  })

  useEffect(() => {
    loadProviders()
  }, [])

  const loadProviders = async () => {
    try {
      const { api } = await import('@/lib/api')
      const data = await api.providers.getAll()
      console.log('[Models Page] Loaded', data.length, 'providers')
      setProviders(data)
    } catch (error) {
      console.error('[Models Page] Failed to load providers:', error)
    }
  }

  const handleAddProvider = (template: typeof defaultProviders[0]) => {
    setFormData({
      displayName: template.displayName,
      name: template.name,
      mode: template.mode,
      apiKey: '',
      baseUrl: template.baseUrl || '',
      model: template.model || ''
    })
    setEditingProvider(null)
    setDialogOpen(true)
  }

  const handleEditProvider = (provider: Provider) => {
    setFormData({
      displayName: provider.displayName,
      name: provider.name,
      mode: provider.mode,
      apiKey: provider.apiKey || '',
      baseUrl: provider.baseUrl || '',
      model: provider.model || ''
    })
    setEditingProvider(provider)
    setDialogOpen(true)
  }

  const handleSaveProvider = async () => {
    try {
      const { api } = await import('@/lib/api')

      if (editingProvider) {
        // Update existing
        await api.providers.update(editingProvider.id, formData)
      } else {
        // Add new
        await api.providers.add({
          ...formData,
          enabled: true,
          isActive: false
        })
      }

      // Reload providers
      await loadProviders()
      setDialogOpen(false)
    } catch (error) {
      console.error('[Models Page] Failed to save provider:', error)
      alert('保存失败: ' + error)
    }
  }

  const handleSwitchProvider = async (providerId: string) => {
    try {
      const { api } = await import('@/lib/api')
      await api.providers.switch(providerId)
      await loadProviders()
      console.log('[Models Page] Switched to provider:', providerId)
    } catch (error) {
      console.error('[Models Page] Failed to switch provider:', error)
      alert('切换失败: ' + error)
    }
  }

  const handleToggleProvider = async (providerId: string) => {
    try {
      const { api } = await import('@/lib/api')
      const provider = providers.find(p => p.id === providerId)
      if (provider) {
        await api.providers.update(providerId, { enabled: !provider.enabled })
        await loadProviders()
      }
    } catch (error) {
      console.error('[Models Page] Failed to toggle provider:', error)
      alert('操作失败: ' + error)
    }
  }

  const handleDeleteProvider = async (providerId: string) => {
    if (confirm('确定要删除这个配置吗？')) {
      try {
        const { api } = await import('@/lib/api')
        await api.providers.delete(providerId)
        await loadProviders()
      } catch (error) {
        console.error('[Models Page] Failed to delete provider:', error)
        alert('删除失败: ' + error)
      }
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">AI Models Configuration</h1>
          <p className="text-muted-foreground">
            管理和切换不同的 AI 模型提供商，支持 Claude、Kimi、智谱等多种模型
          </p>
        </div>

        {/* Active Provider Card */}
        {providers.find(p => p.isActive) && (
          <Card className="border-primary bg-primary/5">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-2xl">
                    {providers.find(p => p.isActive)?.icon}
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {providers.find(p => p.isActive)?.displayName}
                      <Badge variant="default" className="ml-2">
                        <Check className="w-3 h-3 mr-1" />
                        Active
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      当前使用的 AI 模型
                    </CardDescription>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    const active = providers.find(p => p.isActive)
                    if (active) handleEditProvider(active)
                  }}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  配置
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Base URL:</span>
                  <p className="font-mono mt-1">{providers.find(p => p.isActive)?.baseUrl}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Model:</span>
                  <p className="font-mono mt-1">{providers.find(p => p.isActive)?.model}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add Provider Templates */}
        <div>
          <h2 className="text-xl font-semibold mb-4">添加新的模型配置</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {defaultProviders.map((template) => {
              const isAdded = providers.some(p => p.name === template.name)
              return (
                <Card
                  key={template.name}
                  className={cn(
                    "cursor-pointer transition-all hover:shadow-md",
                    isAdded && "opacity-50"
                  )}
                  onClick={() => !isAdded && handleAddProvider(template)}
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-xl">
                        {template.icon}
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-base">{template.displayName}</CardTitle>
                        {isAdded && (
                          <Badge variant="secondary" className="mt-1">已添加</Badge>
                        )}
                      </div>
                      {!isAdded && <Plus className="w-5 h-5 text-muted-foreground" />}
                    </div>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </div>

        {/* Configured Providers */}
        <div>
          <h2 className="text-xl font-semibold mb-4">已配置的模型</h2>
          <div className="space-y-3">
            {providers.length === 0 ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">
                    还没有配置任何模型，从上面选择一个开始吧
                  </div>
                </CardContent>
              </Card>
            ) : (
              providers.map((provider) => (
                <Card
                  key={provider.id}
                  className={cn(
                    "transition-all",
                    provider.isActive && "border-primary"
                  )}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center text-xl">
                          {provider.icon}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{provider.displayName}</h3>
                            {provider.isActive && (
                              <Badge variant="default" className="text-xs">
                                <Check className="w-3 h-3 mr-1" />
                                Active
                              </Badge>
                            )}
                            {!provider.enabled && (
                              <Badge variant="secondary" className="text-xs">
                                Disabled
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                            {provider.mode === 'subscription' ? (
                              <span className="flex items-center gap-1">
                                👤 订阅模式（使用 Claude 登录）
                              </span>
                            ) : (
                              <>
                                <span className="flex items-center gap-1">
                                  <Globe className="w-3 h-3" />
                                  {provider.baseUrl || 'Default'}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Zap className="w-3 h-3" />
                                  {provider.model}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!provider.isActive && provider.enabled && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleSwitchProvider(provider.id)}
                          >
                            切换使用
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditProvider(provider)}
                        >
                          编辑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleProvider(provider.id)}
                        >
                          {provider.enabled ? '禁用' : '启用'}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteProvider(provider.id)}
                          disabled={provider.isActive}
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Edit/Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? '编辑模型配置' : '添加新模型'}
            </DialogTitle>
            <DialogDescription>
              配置 AI 模型的 API 密钥和相关参数
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">显示名称</label>
              <Input
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                placeholder="例如: Claude (Anthropic)"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">认证模式</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="api"
                    checked={formData.mode === 'api'}
                    onChange={(e) => setFormData({ ...formData, mode: e.target.value as 'api' })}
                    className="w-4 h-4"
                  />
                  <span>API 模式</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    value="subscription"
                    checked={formData.mode === 'subscription'}
                    onChange={(e) => setFormData({ ...formData, mode: e.target.value as 'subscription' })}
                    className="w-4 h-4"
                  />
                  <span>订阅模式</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                {formData.mode === 'subscription'
                  ? '使用 Claude 订阅登录（通过 claude login）'
                  : '使用 API Key 进行认证'}
              </p>
            </div>

            {formData.mode === 'api' && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">API Key</label>
                  <Input
                    type="password"
                    value={formData.apiKey}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder="输入你的 API 密钥"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Base URL</label>
                  <Input
                    value={formData.baseUrl}
                    onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                    placeholder="https://api.example.com/v1"
                  />
                  <p className="text-xs text-muted-foreground">
                    API 端点地址（设置 ANTHROPIC_BASE_URL）
                  </p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Model</label>
              <Input
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="模型名称"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveProvider}>
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
