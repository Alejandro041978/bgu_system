'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type PermMap = Record<string, { can_view: boolean; can_edit: boolean }>

let cached: PermMap | null = null

export function usePermissions() {
  const [perms, setPerms] = useState<PermMap | null>(cached)
  const [loading, setLoading] = useState(cached === null)

  useEffect(() => {
    if (cached !== null) { setPerms(cached); setLoading(false); return }

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setPerms({}); setLoading(false); return }

      // Get employee role
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: emp } = await (supabase as any)
        .from('hr_employees')
        .select('role_id')
        .eq('user_id', user.id)
        .single()

      if (!emp?.role_id) {
        // No role = superadmin, allow everything
        cached = {}
        setPerms({})
        setLoading(false)
        return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows } = await (supabase as any)
        .from('role_permissions')
        .select('page_key, can_view, can_edit')
        .eq('role_id', emp.role_id)

      const map: PermMap = {}
      for (const r of rows ?? []) map[r.page_key] = { can_view: r.can_view, can_edit: r.can_edit }
      cached = map
      setPerms(map)
      setLoading(false)
    })
  }, [])

  // null perms = still loading, treat as allowed to avoid flash
  function canView(pageKey: string): boolean {
    if (perms === null) return true
    if (Object.keys(perms).length === 0) return true // superadmin
    return perms[pageKey]?.can_view ?? false
  }

  return { perms, loading, canView }
}
