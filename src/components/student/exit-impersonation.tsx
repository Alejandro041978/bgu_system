'use client'

import { LogOut } from 'lucide-react'

export function ExitImpersonation() {
  async function exit() {
    await fetch('/api/student/impersonate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: '' }),
    })
    window.location.href = '/academic/grades'
  }
  return (
    <button onClick={exit} className="flex items-center gap-1.5 text-xs font-medium text-amber-800 hover:text-amber-900 underline">
      <LogOut className="w-3.5 h-3.5" /> Salir de la vista
    </button>
  )
}
