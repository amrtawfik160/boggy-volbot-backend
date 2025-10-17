import { Metadata } from 'next'
import ManualOverridePanel from '@/components/admin/ManualOverridePanel'
import AuditLogViewer from '@/components/admin/AuditLogViewer'

export const metadata: Metadata = {
  title: 'System Controls',
}

export default function SystemPage() {
  return (
    <div className="space-y-6 md:space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 md:text-3xl">
          System Controls
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Manage system-wide settings and view audit logs
        </p>
      </div>

      {/* Manual Override Controls */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Manual Overrides
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Control system-wide features and operations
          </p>
        </div>
        <ManualOverridePanel />
      </section>

      {/* Audit Log Viewer */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Audit Logs
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Track all administrative actions and system events
          </p>
        </div>
        <AuditLogViewer />
      </section>
    </div>
  )
}
