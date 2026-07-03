'use client'

import { useEffect } from 'react'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Dashboard Error]', error)
  }, [error])

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-white border border-red-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-red-700 mb-2">Error al cargar la página</h2>
        <p className="text-sm text-gray-600 mb-4">{error.message}</p>
        {error.digest && (
          <p className="text-xs text-gray-400 font-mono mb-4">Digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  )
}
