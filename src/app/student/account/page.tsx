import { createClient } from '@/lib/supabase/server'
import { getEffectiveStudent } from '@/lib/student-identity'
import { getAccountStatement, type Statement } from '@/lib/account-statement'
import { AccountStatementView } from '@/components/account/account-statement-view'

export const revalidate = 0

export default async function StudentAccountPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const student = await getEffectiveStudent(user ? { id: user.id, email: user.email } : null)

  let statement: Statement | null = null
  if (student?.document_number || student?.email) {
    statement = await getAccountStatement({
      documentNumber: student.document_number,
      email: student.email,
    })
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Estado de Cuenta</h1>
        <p className="text-sm text-gray-500 mt-0.5">Consulta tus cuotas, pagos y saldo</p>
      </div>
      {statement
        ? <AccountStatementView statement={statement} />
        : <p className="text-sm text-gray-500 py-10 text-center">No encontramos tu estado de cuenta.</p>}
    </div>
  )
}
