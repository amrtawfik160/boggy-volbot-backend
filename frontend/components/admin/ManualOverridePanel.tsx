'use client'

import { useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import {
  RiPauseCircleLine,
  RiPlayCircleLine,
  RiUserAddLine,
  RiShieldLine,
  RiToolsLine,
} from '@remixicon/react'

interface OverrideControl {
  id: string
  label: string
  description: string
  icon: typeof RiPauseCircleLine
  enabled: boolean
  variant: 'danger' | 'warning' | 'info'
}

export default function ManualOverridePanel() {
  const [controls, setControls] = useState<OverrideControl[]>([
    {
      id: 'campaigns',
      label: 'All Campaigns',
      description: 'Pause or resume all active campaigns system-wide',
      icon: RiPauseCircleLine,
      enabled: true,
      variant: 'danger',
    },
    {
      id: 'registrations',
      label: 'User Registrations',
      description: 'Enable or disable new user account creation',
      icon: RiUserAddLine,
      enabled: true,
      variant: 'warning',
    },
    {
      id: 'api',
      label: 'API Access',
      description: 'Enable or disable API endpoints for all users',
      icon: RiShieldLine,
      enabled: true,
      variant: 'danger',
    },
    {
      id: 'maintenance',
      label: 'Maintenance Mode',
      description: 'Put the system into maintenance mode',
      icon: RiToolsLine,
      enabled: false,
      variant: 'warning',
    },
  ])

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    controlId: string
    action: 'enable' | 'disable'
  }>({
    isOpen: false,
    controlId: '',
    action: 'enable',
  })

  const handleToggle = (id: string) => {
    const control = controls.find((c) => c.id === id)
    if (!control) return

    setConfirmDialog({
      isOpen: true,
      controlId: id,
      action: control.enabled ? 'disable' : 'enable',
    })
  }

  const handleConfirm = () => {
    setControls((prev) =>
      prev.map((control) =>
        control.id === confirmDialog.controlId
          ? { ...control, enabled: !control.enabled }
          : control
      )
    )
    setConfirmDialog({ isOpen: false, controlId: '', action: 'enable' })
    // TODO: Will be implemented in task 13.5 - Make API call to backend
  }

  const handleCancel = () => {
    setConfirmDialog({ isOpen: false, controlId: '', action: 'enable' })
  }

  const currentControl = controls.find((c) => c.id === confirmDialog.controlId)

  return (
    <>
      <div className="space-y-4">
        {controls.map((control) => {
          const Icon = control.icon
          return (
            <div
              key={control.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`rounded-lg p-2 ${
                    control.enabled
                      ? 'bg-green-100 dark:bg-green-900/20'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 ${
                      control.enabled
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">
                    {control.label}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    {control.description}
                  </p>
                  <span
                    className={`mt-2 inline-block text-xs font-medium ${
                      control.enabled
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    Status: {control.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleToggle(control.id)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  control.enabled
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {control.enabled ? (
                  <>
                    <RiPauseCircleLine className="inline h-4 w-4 mr-1" />
                    Disable
                  </>
                ) : (
                  <>
                    <RiPlayCircleLine className="inline h-4 w-4 mr-1" />
                    Enable
                  </>
                )}
              </button>
            </div>
          )
        })}
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={`${confirmDialog.action === 'enable' ? 'Enable' : 'Disable'} ${currentControl?.label}?`}
        description={`Are you sure you want to ${confirmDialog.action} ${currentControl?.label.toLowerCase()}? This action will take effect immediately.`}
        confirmLabel={confirmDialog.action === 'enable' ? 'Enable' : 'Disable'}
        cancelLabel="Cancel"
        variant={currentControl?.variant || 'warning'}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  )
}
