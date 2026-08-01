'use client'

import { useState } from 'react'
import { ClassroomLinks } from './classroom-links'
import { ClassroomCoverage } from './classroom-coverage'
import { ClassroomCollections } from './classroom-collections'

export function ClassroomLinksTabs() {
  const [tab, setTab] = useState<'vincular' | 'cobertura' | 'colecciones'>('cobertura')
  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-slate-200">
        {([
          ['cobertura', 'Cobertura por programa'],
          ['colecciones', 'Colecciones'],
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
        : tab === 'colecciones'
        ? <>
            <p className="text-sm text-slate-600">
              Una colección es la malla de un programa con un aula en cada casilla: la regular, la del upgrade, la del
              campus asociado, la que se dicte en inglés. Una casilla, un aula — si se crea un aula nueva ocupa la
              posición, y la anterior sale de la colección pero sigue trayendo notas hasta que sus alumnos terminen.
            </p>
            <ClassroomCollections />
          </>
        : <ClassroomLinks />}
    </div>
  )
}
