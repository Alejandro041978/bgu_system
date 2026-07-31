'use client'

import { useState } from 'react'
import { ClassroomLinks } from './classroom-links'
import { ClassroomCoverage } from './classroom-coverage'

export function ClassroomLinksTabs() {
  const [tab, setTab] = useState<'vincular' | 'cobertura'>('cobertura')
  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-slate-200">
        {([
          ['cobertura', 'Cobertura por programa'],
          ['vincular', 'Vincular aulas'],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              tab === k ? 'border-slate-900 font-medium text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'cobertura'
        ? <>
            <p className="text-sm text-slate-600">
              Para cada asignatura del plan, qué aulas la enseñan. Es el inventario de lo heredado: la misma asignatura
              suele tener una aula por modalidad —upgrade, regular, campus asociado— más la plantilla original vacía.
              Lo que hay que resolver está en rojo y ámbar: asignaturas sin ninguna aula, y asignaturas con alumnos
              cuyas aulas no sincronizan.
            </p>
            <ClassroomCoverage />
          </>
        : <ClassroomLinks />}
    </div>
  )
}
