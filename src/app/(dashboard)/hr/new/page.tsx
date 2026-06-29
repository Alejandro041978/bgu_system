import { Topbar } from '@/components/layout/topbar'
import { NewEmployeeForm } from '@/components/hr/new-employee-form'

export default function NewEmployeePage() {
  return (
    <>
      <Topbar title="Nuevo Colaborador" subtitle="Registrar colaborador y enviar acceso" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <NewEmployeeForm />
        </div>
      </div>
    </>
  )
}
