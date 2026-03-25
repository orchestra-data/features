'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Button, Input, Badge } from '@cogedu/ui'
import { Bot, X, Send, Sparkles, Loader2 } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface CalendarAssistantProps {
  companyId: string
  classInstanceIds?: string[]
  visibleEvents?: Array<{ id: string; title: string; start: string; event_type: string }>
  academicYearStats?: {
    compliance?: { schoolDays?: { current: number; target: number } }
  } | null
}

const QUICK_QUESTIONS = [
  'Quantos eventos tem este mes?',
  'Quais conflitos existem?',
  'Resuma o planejamento atual',
  'Quantos dias letivos faltam?',
  'Quais componentes nao tem data?',
]

export function CalendarAssistant({
  companyId,
  classInstanceIds,
  visibleEvents = [],
  academicYearStats,
}: CalendarAssistantProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const processQuestion = useCallback(async (question: string): Promise<string> => {
    const q = question.toLowerCase().trim()

    // Count events
    if (q.includes('quantos eventos') || q.includes('total de eventos')) {
      const total = visibleEvents.length
      const byType: Record<string, number> = {}
      visibleEvents.forEach(e => {
        byType[e.event_type] = (byType[e.event_type] || 0) + 1
      })
      const breakdown = Object.entries(byType)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ')
      return `Existem **${total} eventos** visiveis no calendario.\n\nPor tipo: ${breakdown || 'nenhum'}`
    }

    // Conflicts
    if (q.includes('conflito') || q.includes('conflitos')) {
      try {
        const now = new Date()
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString().split('T')[0]
        const params = new URLSearchParams({ startDate: startDate!, endDate: endDate! })
        if (classInstanceIds?.[0]) params.set('classInstanceId', classInstanceIds[0])
        const res = await fetch(`/api/companies/${companyId}/calendar/detect-conflicts?${params}`, {
          headers: { 'Content-Type': 'application/json' },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.totalConflicts === 0) return 'Nenhum conflito detectado no periodo atual. Tudo certo!'
          return `Foram detectados **${data.totalConflicts} conflitos** em ${data.totalEvents} eventos.\n\nUse o painel de "Resolucao de Conflitos" abaixo do calendario para resolver.`
        }
      } catch {}
      return 'Nao consegui verificar conflitos no momento. Tente novamente.'
    }

    // School days
    if (q.includes('dias letivos') || q.includes('dia letivo')) {
      const stats = academicYearStats?.compliance?.schoolDays
      if (stats) {
        const remaining = stats.target - stats.current
        return `**Dias letivos:** ${stats.current}/${stats.target} (meta MEC)\n\n${remaining > 0 ? `Faltam **${remaining} dias** para atingir a meta.` : 'Meta MEC atingida!'}`
      }
      return 'Nenhum ano letivo configurado. Configure em "Compliance MEC & Ano Letivo" para ver os dias letivos.'
    }

    // Summary
    if (q.includes('resuma') || q.includes('resumo') || q.includes('planejamento')) {
      const now = new Date()
      const monthName = now.toLocaleDateString('pt-BR', { month: 'long' })
      const thisMonth = visibleEvents.filter(e => {
        const d = new Date(e.start)
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      })
      const nextMonth = visibleEvents.filter(e => {
        const d = new Date(e.start)
        return d.getMonth() === now.getMonth() + 1 && d.getFullYear() === now.getFullYear()
      })
      return `**Resumo do planejamento:**\n\n- **${monthName}:** ${thisMonth.length} eventos\n- **Proximo mes:** ${nextMonth.length} eventos\n- **Total visivel:** ${visibleEvents.length} eventos\n\nPara mais detalhes, filtre por turma e explore o calendario.`
    }

    // Components without date
    if (q.includes('componente') && (q.includes('sem data') || q.includes('nao tem data'))) {
      try {
        if (classInstanceIds?.[0]) {
          const res = await fetch(`/api/listComponents?classInstanceId=${classInstanceIds[0]}`, {
            headers: { 'Content-Type': 'application/json' },
          })
          if (res.ok) {
            const data = await res.json()
            const components = data.data || data || []
            const noDate = components.filter((c: any) => !c.scheduled_date && !c.scheduledDate)
            if (noDate.length === 0) return 'Todos os componentes da turma selecionada ja tem data agendada!'
            return `**${noDate.length} componentes** sem data:\n\n${noDate.slice(0, 10).map((c: any) => `- ${c.title || c.name}`).join('\n')}${noDate.length > 10 ? `\n\n... e mais ${noDate.length - 10}` : ''}`
          }
        }
        return 'Selecione uma turma para verificar componentes sem data.'
      } catch {}
      return 'Nao consegui verificar componentes no momento.'
    }

    // Default
    return `Entendi sua pergunta, mas ainda estou aprendendo! Aqui estao coisas que posso ajudar:\n\n- Contar eventos do mes\n- Verificar conflitos\n- Resumir planejamento\n- Verificar dias letivos\n- Listar componentes sem data\n\nTente uma dessas perguntas!`
  }, [companyId, classInstanceIds, visibleEvents, academicYearStats])

  const handleSend = useCallback(async (text?: string) => {
    const question = text || input.trim()
    if (!question) return

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    const answer = await processQuestion(question)

    const assistantMsg: Message = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: answer,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, assistantMsg])
    setLoading(false)
  }, [input, processQuestion])

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
        size="icon"
      >
        <Bot className="h-6 w-6" />
      </Button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-96 h-[500px] bg-background border rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Assistente do Calendario</span>
          <Badge variant="secondary" className="text-[10px]">MVP</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Ola! Sou o assistente do calendario. Posso ajudar com:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => handleSend(q)}
                  className="text-xs px-2.5 py-1.5 rounded-full border bg-muted/50 hover:bg-muted transition-colors text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-xl px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend() }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre o calendario..."
            className="text-sm"
            disabled={loading}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || loading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
