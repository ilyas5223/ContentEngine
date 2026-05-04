'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', exact: true },
  { href: '/projects', label: 'Projects', exact: false },
  { href: '/upgrade', label: 'Upgrade', exact: true },
]

interface Props {
  email: string
  name?: string | null
}

export function Sidebar({ email, name }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const displayName = name ?? email.split('@')[0]

  const navLinks = (
    <nav className="flex flex-col gap-1 flex-1">
      {NAV_LINKS.map(({ href, label, exact }) => {
        const isActive = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )

  const userFooter = (
    <div className="border-t pt-4 space-y-1">
      <p className="px-3 text-sm font-medium truncate">{displayName}</p>
      <p className="px-3 text-xs text-muted-foreground truncate">{email}</p>
      <form action="/logout" method="POST" className="mt-1">
        <button
          type="submit"
          className="w-full px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground text-left rounded-md hover:bg-muted transition-colors"
        >
          Sign out
        </button>
      </form>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:min-h-screen border-r bg-background px-3 py-6 gap-6 shrink-0">
        <Link href="/dashboard" className="px-3 text-xl font-bold">
          ContentEngine
        </Link>
        {navLinks}
        {userFooter}
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-50 border-b bg-background/95 backdrop-blur flex h-14 items-center justify-between px-4">
        <Link href="/dashboard" className="text-lg font-bold">
          ContentEngine
        </Link>
        <button
          onClick={() => setOpen(!open)}
          className="p-2 text-muted-foreground hover:text-foreground"
          aria-label="Toggle menu"
        >
          {open ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="fixed left-0 top-14 bottom-0 w-64 bg-background border-r px-3 py-6 flex flex-col gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            {navLinks}
            {userFooter}
          </div>
        </div>
      )}
    </>
  )
}
