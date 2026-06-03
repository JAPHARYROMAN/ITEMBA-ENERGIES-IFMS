import React, { useState } from "react";
import {
  Save,
  Clock,
  Bell,
  Mail,
  MessageSquare,
  Info,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";
import { useNotificationPreferences } from "@/lib/hooks/notifications";
import PageHeader from "@/components/ifms/PageHeader";
import { useAppStore } from "@/store";

interface NotificationSettingsPageProps {}

export default function NotificationSettingsPage({}: NotificationSettingsPageProps) {
  const { preferences, isLoading, updatePreferences, isUpdating } =
    useNotificationPreferences();

  const [localPreferences, setLocalPreferences] = useState({
    channels: {
      inapp: true,
      email: false,
      sms: false,
      push: false,
    },
    severityMin: "info" as "info" | "warning" | "critical",
    quietHours: {
      enabled: false,
      start: "22:00",
      end: "08:00",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    digestMode: "none" as "none" | "daily" | "weekly",
  });

  // Update local state when preferences load
  React.useEffect(() => {
    if (preferences) {
      setLocalPreferences({
        channels: preferences.channels,
        severityMin: preferences.severityMin,
        quietHours: preferences.quietHours || {
          enabled: false,
          start: "22:00",
          end: "08:00",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        digestMode: preferences.digestMode,
      });
    }
  }, [preferences]);

  const handleSave = async () => {
    try {
      await updatePreferences(localPreferences);
      useAppStore
        .getState()
        .addToast("Notification preferences saved.", "success");
    } catch (error) {
      console.error("Failed to save preferences:", error);
      useAppStore
        .getState()
        .addToast(
          "Failed to save notification preferences. Please try again.",
          "error",
        );
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "info":
        return <Info className="h-4 w-4 text-blue-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "critical":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Notification Settings"
          description="Manage your notification preferences"
          icon={Bell}
        />
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-muted/30 rounded-lg" />
          <div className="h-48 bg-muted/30 rounded-lg" />
          <div className="h-24 bg-muted/30 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Notification Settings"
        description="Customize how and when you receive notifications"
        icon={Bell}
      />

      {/* Channels Section */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Channels
        </h3>

        <div className="space-y-4">
          {/* In-App Notifications */}
          <div className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium">In-App Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Receive notifications within the application
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={localPreferences.channels.inapp}
              onChange={(e) =>
                setLocalPreferences((prev) => ({
                  ...prev,
                  channels: { ...prev.channels, inapp: e.target.checked },
                }))
              }
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
          </div>

          {/* Email Notifications */}
          <div className="flex items-center justify-between p-4 border border-border rounded-lg opacity-60">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-gray-400" />
              <div>
                <p className="font-medium">Email Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Receive notifications via email
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={localPreferences.channels.email}
                onChange={(e) =>
                  setLocalPreferences((prev) => ({
                    ...prev,
                    channels: { ...prev.channels, email: e.target.checked },
                  }))
                }
                disabled
                className="h-4 w-4 text-gray-400 border-gray-300 rounded"
              />
              <span className="text-xs text-muted-foreground">Coming soon</span>
            </div>
          </div>

          {/* SMS Notifications */}
          <div className="flex items-center justify-between p-4 border border-border rounded-lg opacity-60">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-gray-400" />
              <div>
                <p className="font-medium">SMS Notifications</p>
                <p className="text-sm text-muted-foreground">
                  Receive notifications via SMS
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={localPreferences.channels.sms}
                onChange={(e) =>
                  setLocalPreferences((prev) => ({
                    ...prev,
                    channels: { ...prev.channels, sms: e.target.checked },
                  }))
                }
                disabled
                className="h-4 w-4 text-gray-400 border-gray-300 rounded"
              />
              <span className="text-xs text-muted-foreground">Coming soon</span>
            </div>
          </div>
        </div>
      </div>

      {/* Severity Threshold */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Minimum Severity Level
        </h3>

        <p className="text-sm text-muted-foreground mb-4">
          Choose the minimum severity level for notifications you want to
          receive.
        </p>

        <div className="space-y-3">
          {[
            {
              value: "info",
              label: "Info",
              description: "All notifications including informational messages",
            },
            {
              value: "warning",
              label: "Warning",
              description: "Only warnings and critical notifications",
            },
            {
              value: "critical",
              label: "Critical",
              description: "Only critical notifications",
            },
          ].map((option) => (
            <label
              key={option.value}
              className="flex items-start gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-muted/50"
            >
              <input
                type="radio"
                name="severity"
                value={option.value}
                checked={localPreferences.severityMin === option.value}
                onChange={(e) =>
                  setLocalPreferences((prev) => ({
                    ...prev,
                    severityMin: e.target.value as
                      | "info"
                      | "warning"
                      | "critical",
                  }))
                }
                className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {getSeverityIcon(option.value)}
                  <span className="font-medium">{option.label}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {option.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Quiet Hours */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Quiet Hours
        </h3>

        <p className="text-sm text-muted-foreground mb-4">
          Suppress non-critical notifications during specified hours.
        </p>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="quiet-hours-enabled"
              checked={localPreferences.quietHours.enabled}
              onChange={(e) =>
                setLocalPreferences((prev) => ({
                  ...prev,
                  quietHours: { ...prev.quietHours, enabled: e.target.checked },
                }))
              }
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label
              htmlFor="quiet-hours-enabled"
              className="text-sm font-medium"
            >
              Enable quiet hours
            </label>
          </div>

          {localPreferences.quietHours.enabled && (
            <div className="ml-7 space-y-3 p-4 bg-muted/30 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={localPreferences.quietHours.start}
                    onChange={(e) =>
                      setLocalPreferences((prev) => ({
                        ...prev,
                        quietHours: {
                          ...prev.quietHours,
                          start: e.target.value,
                        },
                      }))
                    }
                    className="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={localPreferences.quietHours.end}
                    onChange={(e) =>
                      setLocalPreferences((prev) => ({
                        ...prev,
                        quietHours: { ...prev.quietHours, end: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Timezone
                </label>
                <select
                  value={localPreferences.quietHours.timezone}
                  onChange={(e) =>
                    setLocalPreferences((prev) => ({
                      ...prev,
                      quietHours: {
                        ...prev.quietHours,
                        timezone: e.target.value,
                      },
                    }))
                  }
                  className="w-full px-3 py-2 border border-border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {![
                    'UTC',
                    'America/New_York',
                    'America/Chicago',
                    'America/Denver',
                    'America/Los_Angeles',
                  ].includes(Intl.DateTimeFormat().resolvedOptions().timeZone) && (
                    <option
                      value={Intl.DateTimeFormat().resolvedOptions().timeZone}
                    >
                      {Intl.DateTimeFormat().resolvedOptions().timeZone} (Current)
                    </option>
                  )}
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Non-critical notifications will be suppressed between{" "}
                {localPreferences.quietHours.start} and{" "}
                {localPreferences.quietHours.end} in your local timezone.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isUpdating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4" />
          {isUpdating ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}
