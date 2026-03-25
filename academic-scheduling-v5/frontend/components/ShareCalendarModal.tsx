'use client'

import { useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Input,
  Label,
  Switch,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@cogedu/ui'
import { Copy, Check, Share2 } from 'lucide-react'
import { toast } from 'sonner'

interface ShareCalendarModalProps {
  isOpen: boolean
  onClose: () => void
  companyId: string
  companyName?: string
}

export function ShareCalendarModal({ isOpen, onClose, companyId, companyName }: ShareCalendarModalProps) {
  const [readOnly, setReadOnly] = useState(true)
  const [expiry, setExpiry] = useState('30')
  const [copied, setCopied] = useState(false)

  const generateToken = useCallback(() => {
    const payload = {
      cid: companyId,
      perm: readOnly ? 'read' : 'suggest',
      exp: expiry === '0' ? null : Date.now() + parseInt(expiry) * 86400000,
      v: 1,
    }
    return btoa(JSON.stringify(payload))
  }, [companyId, readOnly, expiry])

  const shareUrl = `${window.location.origin}/calendar/shared/${generateToken()}`

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    toast.success('Link copiado!')
    setTimeout(() => setCopied(false), 2000)
  }, [shareUrl])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Compartilhar Calendario
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {companyName && (
            <p className="text-sm text-muted-foreground">
              Compartilhar o calendario de <strong>{companyName}</strong>
            </p>
          )}

          {/* Permission toggle */}
          <div className="flex items-center justify-between">
            <Label htmlFor="share-readonly">Somente leitura</Label>
            <Switch
              id="share-readonly"
              checked={readOnly}
              onCheckedChange={setReadOnly}
            />
          </div>
          {!readOnly && (
            <p className="text-xs text-yellow-600">
              Destinatarios poderao sugerir eventos (voce aprova antes de publicar).
            </p>
          )}

          {/* Expiry */}
          <div className="space-y-1.5">
            <Label>Expiracao do link</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
                <SelectItem value="0">Sem expiracao</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Generated link */}
          <div className="space-y-1.5">
            <Label>Link de compartilhamento</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="text-xs font-mono"
              />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
