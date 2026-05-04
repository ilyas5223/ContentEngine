import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: userRow } = await supabase
    .from('users')
    .select('full_name')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar email={user.email!} name={userRow?.full_name} />
      <div className="flex flex-col flex-1 min-w-0">
        <main className="flex-1 px-4 py-8 sm:px-8 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
