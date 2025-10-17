import { checkAdminRole } from '@/lib/supabase/admin-guard'
import { redirect } from 'next/navigation'
import AdminNav from '@/components/admin/AdminNav'
import AdminHeader from '@/components/admin/AdminHeader'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isAdmin, user } = await checkAdminRole()

  if (!user) {
    redirect('/login')
  }

  if (!isAdmin) {
    redirect('/unauthorized')
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <AdminNav user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader user={user} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
