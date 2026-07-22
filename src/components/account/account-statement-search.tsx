'use client'

import { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { AccountStatementView } from './account-statement-view'
import type { Statement } from '@/lib/account-statement'

interface StudentHit { id: string; name: string; document_number: string | null; email: string | null }

export function AccountStatementSearch() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<StudentHit[]>([])
  const [statement, setStatement] = useState<Statement | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function search(value: string) {
    setQ(value)
    if (value.trim().length < 2) { setHits([]); return }
    const d = await fetch(`/api/students/search?q=${encodeURIComponent(value.trim())}`).then(r => r.json())
    setHits(d.students ?? [])
  }

  async function loadStatement(id: string) {
    setLoading(true)
    const d = await fetch(`/api/account/statement?student_id=${id}`).then(r => r.json())
    setStatement(d.error ? null : d); setLoading(false)
  }

  async function selectStudent(h: StudentHit) {
    setHits([]); setQ(h.name); setStatement(null); setCurrentId(h.id)
    await loadStatement(h.id)
  }

  return (
    <div className="space-y-5">
      <div className="relative">
        <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 shadow-sm">
          <Search className="w-4 h-4 text-gray-400" />
          <input value={q} onChange={e => search(e.target.value)} placeholder="Buscar estudiante por nombre o documento…"
            className="flex-1 px-3 py-3 text-sm focus:outline-none" />
        </div>
        {hits.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
            {hits.map(h => (
              <button key={h.id} onClick={() => selectStudent(h)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                <p className="text-sm text-gray-800">{h.name}</p>
                <p className="text-xs text-gray-400">{h.document_number ?? h.email}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
      )}

      {!loading && statement && (
        <AccountStatementView statement={statement} showStudent canGenerate canDiscount={(statement as { superadmin?: boolean }).superadmin ?? false}
          onChanged={() => { if (currentId) loadStatement(currentId) }} />
      )}
    </div>
  )
}
