import { Topbar } from '@/components/layout/topbar'
import { BooksOperations } from '@/components/finance/books-operations'

export const revalidate = 0

export default function BooksOperationsPage() {
  return (
    <>
      <Topbar title="Operaciones Books" subtitle="Returns and Allowances · Corporate Sales · Individual Sales — extraídas de Zoho Books" />
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <BooksOperations />
        </div>
      </div>
    </>
  )
}
