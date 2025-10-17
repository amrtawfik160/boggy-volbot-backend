import Link from 'next/link'
import { RiShieldCrossLine } from '@remixicon/react'

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <RiShieldCrossLine className="h-24 w-24 text-red-500" />
        </div>
        <h1 className="mb-4 text-4xl font-bold text-gray-900 dark:text-gray-100">
          Access Denied
        </h1>
        <p className="mb-8 text-lg text-gray-600 dark:text-gray-400">
          You do not have permission to access this page. Admin privileges are
          required.
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="rounded-lg bg-blue-600 px-6 py-3 text-white transition hover:bg-blue-700"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-gray-300 px-6 py-3 text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  )
}
