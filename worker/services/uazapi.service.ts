export class UazAPIService {
  constructor(
    private baseUrl: string,
    private token: string
  ) {}

  private async request<T>(path: string, body?: object): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        token: this.token,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`UazAPI ${path}: ${res.status} ${text}`)
    }
    return res.json()
  }

  async sendText(to: string, text: string, delay = 1500) {
    return this.request('/send/text', { number: to, text, delay })
  }

  async sendMedia(to: string, mediaUrl: string, type: string, caption?: string) {
    return this.request('/send/media', { number: to, mediaUrl, type, caption })
  }

  async sendPresence(remoteJid: string, presence: 'composing' | 'paused') {
    return this.request('/message/presence', { remoteJid, presence })
  }

  async markAsRead(remoteJid: string) {
    return this.request('/chat/read', { remoteJid, read: true })
  }

  async downloadMedia(messageId: string, remoteJid: string): Promise<{ base64: string; mimetype: string }> {
    return this.request('/message/download', { messageId, remoteJid })
  }

  async addContact(phone: string, name?: string) {
    return this.request('/contact/add', { number: phone, name })
  }

  async sendToGroup(groupJid: string, text: string, delay = 1500) {
    return this.request('/send/text', { number: groupJid, text, delay })
  }
}
