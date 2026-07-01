'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type PermMap = Record<string, { can_view: boolean; can_edit: boolean }>
type State = { map: PermMap; superadmin: boolean } | null

let cached: State = null

export function usePermissions() {
  const [state, setState] = useState<State>(cached)

  useEffect(() => {
    if (cached !== null) { setState(cached); return }

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        cached = { map: {}, superadmin: false }
        setState(cached)
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: emp } = await (supabase as any)
        .from('hr_employees')
        .select('role_id')
        .eq('user_id', user.id)
        .single()

      if (!emp?.role_id) {
        // No employee record or no role = superadmin
        cached = { map: {}, superadmin: true }
        setState(cached)
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows } = await (supabase as any)
        .from('role_permissions')
        .select('page_key, can_view, can_edit')
        .eq('role_id', emp.role_id)

      const map: PermMap = {}
      for (const r of rows ?? []) map[r.page_key] = { can_view: r.can_view, can_edit: r.can_edit }
      cached = { map, superadmin: false }
      setState(cached)
    })
  }, [])

  function canView(pageKey: string): boolean {
    if (state === null) return true   // still loading → avoid flash
    if (state.superadmin) return true  // no role = admin total
    return state.map[pageKey]?.can_view ?? false
  }

  function canEdit(pageKey: string): boolean {
    if (state === null) return true
    if (state.superadmin) return true
    return state.map[pageKey]?.can_edit ?? false
  }

  return { loading: state === null, canView, canEdit }
}
