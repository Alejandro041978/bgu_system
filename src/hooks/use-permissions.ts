'use client'

import { useState, useEffect } from 'react'

type PermMap = Record<string, { can_view: boolean; can_edit: boolean; can_delete: boolean }>
type State = { superadmin: boolean; permissions: PermMap } | null

let cached: State = null

export function usePermissions() {
  const [state, setState] = useState<State>(cached)

  useEffect(() => {
    if (cached !== null) { setState(cached); return }
    fetch('/api/me/permissions')
      .then(r => r.json())
      .then((data: { superadmin: boolean; permissions: PermMap }) => {
        cached = data
        setState(data)
      })
  }, [])

  function canView(pageKey: string): boolean {
    if (state === null) return true  // loading → no flash
    if (state.superadmin) return true
    return state.permissions[pageKey]?.can_view ?? false
  }

  function canEdit(pageKey: string): boolean {
    if (state === null) return true
    if (state.superadmin) return true
    return state.permissions[pageKey]?.can_edit ?? false
  }

  function canDelete(pageKey: string): boolean {
    if (state === null) return true
    if (state.superadmin) return true
    return state.permissions[pageKey]?.can_delete ?? false
  }

  return { loading: state === null, superadmin: state?.superadmin ?? false, canView, canEdit, canDelete }
}
