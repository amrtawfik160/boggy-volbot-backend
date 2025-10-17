export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your account settings and preferences
        </p>
      </div>

      <div className="rounded-lg bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900">
            Account Information
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            Update your account details and preferences.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900">
            API Configuration
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            Configure RPC endpoints and API keys.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium leading-6 text-gray-900">
            Webhooks
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            Configure webhooks for campaign events.
          </p>
        </div>
      </div>
    </div>
  )
}

