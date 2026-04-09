import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>
}

export interface LLMTool {
  name: string
  description: string
  parameters: object
}

export interface LLMResponse {
  text: string
  toolCalls?: Array<{ name: string; args: object; id: string }>
  tokensUsed: number
}

export type LLMProvider = 'openai' | 'anthropic' | 'google'

export class LLMService {
  constructor(
    private provider: LLMProvider,
    private model: string,
    private apiKey: string,
    private temperature: number = 0.7,
    private maxTokens: number = 1000
  ) {}

  async chat(
    messages: LLMMessage[],
    tools?: LLMTool[]
  ): Promise<LLMResponse> {
    switch (this.provider) {
      case 'openai':
        return this.chatOpenAI(messages, tools)
      case 'anthropic':
        return this.chatAnthropic(messages, tools)
      case 'google':
        return this.chatGoogle(messages)
      default:
        throw new Error(`Unknown provider: ${this.provider}`)
    }
  }

  private async chatOpenAI(messages: LLMMessage[], tools?: LLMTool[]): Promise<LLMResponse> {
    const openai = new OpenAI({ apiKey: this.apiKey })

    const response = await openai.chat.completions.create({
      model: this.model,
      messages: messages as any,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      tools: tools?.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>,
        },
      })) as any,
      tool_choice: tools?.length ? 'auto' : undefined,
    })

    const choice = response.choices[0]
    const toolCalls = choice.message.tool_calls?.map((tc) => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments || '{}'),
      id: tc.id,
    }))

    return {
      text: choice.message.content || '',
      toolCalls,
      tokensUsed: response.usage?.total_tokens || 0,
    }
  }

  private async chatAnthropic(messages: LLMMessage[], tools?: LLMTool[]): Promise<LLMResponse> {
    const anthropic = new Anthropic({ apiKey: this.apiKey })

    const systemMsg = messages.find((m) => m.role === 'system')
    const userMsgs = messages.filter((m) => m.role !== 'system')

    const response = await anthropic.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: typeof systemMsg?.content === 'string' ? systemMsg.content : undefined,
      messages: userMsgs.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: typeof m.content === 'string' ? m.content : m.content as any,
      })),
      tools: tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as any,
      })),
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const toolBlocks = response.content.filter((b) => b.type === 'tool_use')

    return {
      text: textBlock?.type === 'text' ? textBlock.text : '',
      toolCalls: toolBlocks.map((b: any) => ({
        name: b.name,
        args: b.input,
        id: b.id,
      })),
      tokensUsed: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
    }
  }

  private async chatGoogle(messages: LLMMessage[]): Promise<LLMResponse> {
    const genai = new GoogleGenerativeAI(this.apiKey)
    const model = genai.getGenerativeModel({ model: this.model })

    const systemMsg = messages.find((m) => m.role === 'system')
    const chat = model.startChat({
      systemInstruction: typeof systemMsg?.content === 'string' ? systemMsg.content : undefined,
      history: messages
        .filter((m) => m.role !== 'system')
        .slice(0, -1)
        .map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
        })),
    })

    const lastMsg = messages[messages.length - 1]
    const result = await chat.sendMessage(
      typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content)
    )

    const tokensUsed =
      (await result.response.usageMetadata)?.totalTokenCount || 0

    return {
      text: result.response.text(),
      tokensUsed,
    }
  }
}
