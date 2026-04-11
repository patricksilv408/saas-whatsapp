// UazAPI SDK wrapper

export interface UazAPIConfig {
  baseUrl: string
  token: string
  adminToken?: string
}

export class UazAPIClient {
  private baseUrl: string
  private token: string
  private adminToken?: string

  constructor(config: UazAPIConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.token = config.token
    this.adminToken = config.adminToken
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    useAdminToken = false
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }
    if (useAdminToken) {
      headers['admintoken'] = this.adminToken || ''
    } else {
      headers['token'] = this.token
    }
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`UazAPI ${path} failed (${res.status}): ${text}\n`)
    }
    return res.json()
  }

  // Instance management
  async initInstance(name: string) {
    return this.request<{ token: string; instance: { token: string } }>(`/instance/init`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }, true)
  }

  async connectInstance() {
    return this.request(`/instance/connect`, { method: 'POST' })
  }

  async disconnectInstance() {
    return this.request(`/instance/disconnect`, { method: 'POST' })
  }

  async getInstanceStatus() {
    return this.request<{
      instance: { status: string; qrcode?: string }
      status: { connected: boolean; loggedIn: boolean }
    }>(`/instance/status`)
  }

  async deleteInstance() {
    return this.request(`/instance/delete`, { method: 'DELETE' }, true)
  }

  async updateChatbotSettings(settings: {
    chatbot_enabled?: boolean
    chatbot_ignoreGroups?: boolean
    chatbot_stopWhenYouSendMsg?: boolean
    chatbot_stopMinutes?: number
  }) {
    return this.request(`/instance/updatechatbotsettings`, {
      method: 'POST',
      body: JSON.stringify(settings),
    })
  }

  // Webhook management
  async registerWebhook(webhookUrl: string, events: string[]) {
    return this.request(`/webhook`, {
      method: 'POST',
      body: JSON.stringify({
        url: webhookUrl,
        events,
        addUrlEvents: true,
      }),
    })
  }

  // Messaging
  async sendText(to: string, text: string, delay = 1500) {
    return this.request(`/send/text`, {
      method: 'POST',
      body: JSON.stringify({ number: to, text, delay }),
    })
  }

  async sendMedia(to: string, mediaUrl: string, type: string, caption?: string) {
    return this.request(`/send/media`, {
      method: 'POST',
      body: JSON.stringify({ number: to, mediaUrl, type, caption }),
    })
  }

  async sendLocation(to: string, lat: number, lng: number, name?: string) {
    return this.request(`/send/location`, {
      method: 'POST',
      body: JSON.stringify({ number: to, latitude: lat, longitude: lng, name }),
    })
  }

  // Media
  async downloadMedia(messageId: string, remoteJid: string) {
    return this.request<{ base64: string; mimetype: string }>(`/message/download`, {
      method: 'POST',
      body: JSON.stringify({ messageId, remoteJid }),
    })
  }

  // Presence
  async sendPresence(remoteJid: string, presence: 'composing' | 'paused' | 'recording') {
    return this.request(`/message/presence`, {
      method: 'POST',
      body: JSON.stringify({ remoteJid, presence }),
    })
  }

  async markAsRead(remoteJid: string) {
    return this.request(`/chat/read`, {
      method: 'POST',
      body: JSON.stringify({ remoteJid, read: true }),
    })
  }

  // Contact
  async addContact(phone: string, name?: string) {
    return this.request(`/contact/add`, {
      method: 'POST',
      body: JSON.stringify({ number: phone, name }),
    })
  }

  // Chat management
  async blockContact(remoteJid: string) {
    return this.request(`/chat/block`, {
      method: 'POST',
      body: JSON.stringify({ remoteJid, action: 'block' }),
    })
  }

  async archiveChat(remoteJid: string) {
    return this.request(`/chat/archive`, {
      method: 'POST',
      body: JSON.stringify({ remoteJid, archive: true }),
    })
  }

  async editLead(remoteJid: string, data: { chatbot_disableUntil?: string }) {
    return this.request(`/chat/editLead`, {
      method: 'POST',
      body: JSON.stringify({ remoteJid, ...data }),
    })
  }

  // Groups
  async listGroups() {
    return this.request<Array<{ id: string; subject: string; pictureUrl?: string }>>(`/group/list`)
  }

  // Profile
  async updateProfileName(name: string) {
    return this.request(`/profile/name`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  }

  // Sender (campaigns)
  async sendBulk(data: {
    messages: Array<{ number: string; text: string }>
    delay?: { min: number; max: number }
  }) {
    return this.request(`/sender/advanced`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }
}

export function createUazAPIClient(
  baseUrl: string,
  token: string,
  adminToken?: string
): UazAPIClient {
  return new UazAPIClient({ baseUrl, token, adminToken })
}

export function getUazAPIBaseUrl(user?: { custom_uazapi_url?: string | null }): string {
  return user?.custom_uazapi_url || process.env.UAZAPI_DEFAULT_URL || 'https://free.uazapi.com'
}

export function getUazAPIAdminToken(user?: { custom_uazapi_admintoken?: string | null }): string {
  return user?.custom_uazapi_admintoken || process.env.UAZAPI_ADMIN_TOKEN || ''
}
