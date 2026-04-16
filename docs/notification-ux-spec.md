# IFMS Notification Center UX Specification

## Overview

The IFMS Notification Center provides a unified interface for managing system and business notifications. This specification defines the exact visual design, interaction patterns, and accessibility requirements for the notification system.

## Core Principles

### Information Hierarchy
- **Critical**: Immediate action required, system failures, security alerts
- **Warning**: Potential issues, deadlines approaching, attention needed
- **Info**: General information, updates, confirmations
- **Success**: Positive confirmations, completed actions

### Interaction States
- **Unseen**: Notification exists but user hasn't interacted
- **Seen**: User has viewed the notification (opened drawer/page)
- **Read**: User has explicitly marked as read or taken action
- **Archived**: User has dismissed/archived the notification

## Component Anatomy

### Notification Item Structure
```
┌─────────────────────────────────────────────────────────────┐
│ ┌─ Severity Indicator ─┐  ┌─ Title ──────────────────────┐  │
│ │        🚨          │  │ Notification Title...         │  │
│ └─────────────────────┘  └───────────────────────────────┘  │
│                                                             │
│ ┌─ Body Text ──────────────────────────────────────────────┐ │
│ │ This is the notification body with additional context...│ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Metadata ──────────────────────────────────────────────┐ │
│ │ 🕒 2 minutes ago  •  inventory  •  Branch: Downtown    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Actions ──────────────────────────────────────────────┐ │
│ │ [Mark Read] [Archive] [View Details]                   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### Spacing & Density
- **Container**: `p-4` (16px padding)
- **Severity Indicator**: `w-8 h-8` (32px)
- **Title**: `text-sm font-medium` (14px)
- **Body**: `text-sm text-muted-foreground mt-1` (14px)
- **Metadata**: `text-xs text-muted-foreground mt-2 flex gap-4` (12px)
- **Actions**: `mt-3 flex gap-2 opacity-0 group-hover:opacity-100`

### Notification Bell (Header)

#### Visual States
```tsx
// Unseen (default)
<Bell className="h-5 w-5 text-gray-600" />

// Has unseen notifications
<Bell className="h-5 w-5 text-gray-600 relative">
  <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
    {count > 99 ? '99+' : count}
  </span>
</Bell>

// Real-time notification received
<Bell className="h-5 w-5 text-gray-600 relative animate-bounce">
  <span className="absolute -top-1 -right-1 h-4 w-4 bg-green-500 text-white text-xs rounded-full flex items-center justify-center font-medium animate-ping">
    {count}
  </span>
</Bell>
```

#### Interaction
- **Click**: Opens NotificationsDrawer
- **Hover**: Subtle background highlight
- **Focus**: Blue ring outline

### Notifications Drawer

#### Layout Structure
```
┌─ Header ────────────────────────────────────────────────────┐
│ ┌─ Bell Icon ─┐  ┌─ Title ─┐  ┌─ Close Button ─┐            │
│ │      🔔     │  │ Notifications │  │     ✕      │            │
│ └─────────────┘  └─────────────┘  └─────────────┘            │
├─ Tabs ───────────────────────────────────────────────────────┤
│ [ All (42) ] [ Unread (8) ] [ Archived (2) ]                 │
├─ Filters ────────────────────────────────────────────────────┤
│ ┌─ Search ──────────────────────────────────────────────────┐ │
│ │ 🔍 Search notifications...                              │ │
│ └───────────────────────────────────────────────────────────┘ │
│ ┌─ Severity ─┐ ┌─ Type ─┐ ┌─ Date ─┐                        │
│ │ All        │ │ All    │ │ Last 7 days                    │ │
│ └────────────┘ └────────┘ └─────────┘                        │
├─ Bulk Actions ───────────────────────────────────────────────┤
│ [☑] Select all  [Mark Read] [Archive]                       │
├─ Notifications List ─────────────────────────────────────────┤
│ ┌─ Notification Item 1 ────────────────────────────────────┐ │
│ │ 🚨 Critical Alert                                       │ │
│ │ System maintenance scheduled...                         │ │
│ │ 5 min ago • system • Mark Read • Archive • Details      │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─ Notification Item 2 ────────────────────────────────────┐ │
│ │ ⚠️  Low Stock Warning                                    │ │
│ │ Tank level below threshold...                           │ │
│ │ 12 min ago • inventory • Mark Read • Archive • Details  │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### Dimensions & Positioning
- **Width**: `w-full max-w-md` (384px max)
- **Height**: `h-full` (full viewport height)
- **Position**: `fixed right-0 top-0`
- **Z-index**: `z-50`

#### Tab States
```tsx
// Active tab
<button className="px-4 py-3 text-sm font-medium border-b-2 border-blue-500 text-blue-600">

// Inactive tab
<button className="px-4 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
```

### Details Drawer

#### Layout Structure
```
┌─ Header ────────────────────────────────────────────────────┐
│ ┌─ Back Button ─┐  ┌─ Title ─┐  ┌─ Close ─┐                 │
│ │      ←       │  │ Details    │  │   ✕   │                 │
│ └───────────────┘  └────────────┘  └───────┘                 │
├─ Notification Content ──────────────────────────────────────┤
│ ┌─ Severity Badge ─┐                                        │
│ │     🚨 Critical   │                                        │
│ └───────────────────┘                                        │
│                                                             │
│ ┌─ Title ──────────────────────────────────────────────────┐ │
│ │ System Maintenance Scheduled                             │ │
│ └───────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Body ───────────────────────────────────────────────────┐ │
│ │ The system will be undergoing maintenance from 2:00 AM  │ │
│ │ to 4:00 AM UTC. All services will be unavailable...      │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Data Fields ────────────────────────────────────────────┐ │
│ │ **Scheduled Time:** 2024-01-15 02:00 UTC                │ │
│ │ **Duration:** 2 hours                                    │ │
│ │ **Impact:** All services unavailable                     │ │
│ └──────────────────────────────────────────────────────────┘ │
├─ Metadata ──────────────────────────────────────────────────┤
│ ┌─ Status ─┐  ┌─ Timestamps ─┐  ┌─ Actions ─┐              │
│ │ Sent      │  │ Created: 5 min ago                        │ │
│ │           │  │ Seen: 2 min ago                           │ │
│ │           │  │ Read: Never                               │ │
│ └───────────┘  └───────────────────────────────────────────┘ │
│              [Mark Read] [Archive] [Open Link]              │
└─────────────────────────────────────────────────────────────┘
```

## Interaction Patterns

### Seen vs Read Behavior

#### Seen State
- **Trigger**: User opens NotificationsDrawer or visits /notifications page
- **Visual**: Remove bold font weight, maintain in unread lists
- **Backend**: Updates `seenAt` timestamp
- **Purpose**: Track user awareness without requiring action

#### Read State
- **Trigger**: User clicks "Mark Read" or interacts with notification content
- **Visual**: Remove from unread lists, show as read in all lists
- **Backend**: Updates `readAt` timestamp
- **Purpose**: Track user engagement and completion

#### Archive State
- **Trigger**: User clicks "Archive" or system auto-archives old notifications
- **Visual**: Hidden from main lists, available in archived tab only
- **Backend**: Updates `archivedAt` timestamp
- **Purpose**: Clean up interface while maintaining history

### Hover States

#### Notification Item
```tsx
// Default state
<div className="rounded-lg border p-4 hover:bg-gray-50 transition-colors">

// Hover state
<div className="rounded-lg border p-4 bg-gray-50 shadow-sm transition-colors">
  // Actions become visible
  <div className="opacity-100 transition-opacity">
```

#### Action Buttons
```tsx
// Default (hidden on mobile, visible on hover desktop)
<button className="opacity-0 group-hover:opacity-100 transition-opacity">

// Focus state
<button className="opacity-100 focus:ring-2 focus:ring-blue-500 focus:outline-none">
```

### Focus Management

#### Drawer Opening
1. Focus moves to drawer container
2. First notification item receives focus
3. ESC key closes drawer and returns focus to bell

#### Tab Navigation
- **Tab**: Move between interactive elements
- **Enter/Space**: Activate buttons and links
- **Arrow Keys**: Navigate list items
- **ESC**: Close drawer/details

### Keyboard Shortcuts

#### Global Shortcuts
- **Ctrl/Cmd + N**: Open notifications drawer
- **ESC**: Close current modal/drawer

#### Drawer Shortcuts
- **J/K**: Navigate up/down in list
- **Enter**: Open notification details
- **R**: Mark current notification as read
- **A**: Archive current notification

## Severity System

### Visual Indicators

#### Critical
```tsx
// Badge
<span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 border border-red-200">
  <span className="mr-1">🚨</span>
  Critical
</span>

// Icon
<div className="w-8 h-8 rounded-full bg-red-100 border-2 border-red-200 flex items-center justify-center">
  <span className="text-red-600 text-lg">🚨</span>
</div>
```

#### Warning
```tsx
<span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 border border-yellow-200">
  <span className="mr-1">⚠️</span>
  Warning
</span>
```

#### Info
```tsx
<span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 border border-blue-200">
  <span className="mr-1">ℹ️</span>
  Info
</span>
```

#### Success
```tsx
<span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 border border-green-200">
  <span className="mr-1">✅</span>
  Success
</span>
```

### Color Palette
```css
/* Critical */
--severity-critical-bg: #fef2f2;
--severity-critical-border: #fecaca;
--severity-critical-text: #dc2626;
--severity-critical-icon: 🚨;

/* Warning */
--severity-warning-bg: #fffbeb;
--severity-warning-border: #fde68a;
--severity-warning-text: #d97706;
--severity-warning-icon: ⚠️;

/* Info */
--severity-info-bg: #eff6ff;
--severity-info-border: #bfdbfe;
--severity-info-text: #2563eb;
--severity-info-icon: ℹ️;

/* Success */
--severity-success-bg: #f0fdf4;
--severity-success-border: #bbf7d0;
--severity-success-text: #16a34a;
--severity-success-icon: ✅;
```

## Accessibility Requirements

### ARIA Attributes

#### Drawer
```tsx
<div
  role="dialog"
  aria-labelledby="notifications-title"
  aria-describedby="notifications-description"
  aria-modal="true"
>
```

#### Notification Items
```tsx
<article
  role="article"
  aria-labelledby={`notification-${id}-title`}
  aria-describedby={`notification-${id}-body`}
  aria-live="polite"
>
```

#### Action Buttons
```tsx
<button
  aria-label={`Mark ${title} as read`}
  aria-pressed={isRead}
>
```

### Focus Management

#### Drawer Focus Trap
```tsx
// On open: focus first focusable element
const firstFocusable = drawerRef.current?.querySelector(
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
) as HTMLElement;
firstFocusable?.focus();

// On close: return focus to trigger element
triggerRef.current?.focus();
```

#### Time Tags
```tsx
<time
  dateTime={createdAt.toISOString()}
  aria-label={`Created ${formatDistanceToNow(createdAt, { addSuffix: true })}`}
>
  {formatDistanceToNow(createdAt, { addSuffix: true })}
</time>
```

### Screen Reader Support

#### Live Regions
```tsx
<div aria-live="assertive" aria-atomic="true">
  {/* Real-time notification announcements */}
</div>
```

#### Status Updates
```tsx
<div role="status" aria-live="polite">
  Marked as read
</div>
```

## Responsive Design

### Mobile (< 640px)
- Drawer becomes full-screen overlay
- Actions always visible (no hover required)
- Larger touch targets (44px minimum)
- Single-column layout

### Tablet (640px - 1024px)
- Drawer width: 320px
- Two-column filter layout
- Hover states enabled
- Touch-friendly interactions

### Desktop (> 1024px)
- Drawer width: 384px
- Hover states for actions
- Keyboard shortcuts enabled
- Multi-column layouts where appropriate

## Animation & Transitions

### Micro-interactions
```css
/* Notification item hover */
transition: all 0.15s ease-in-out;

/* Action buttons appearance */
transition: opacity 0.2s ease-in-out;

/* Drawer slide in */
transform: translateX(100%);
transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);

/* Real-time pulse */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### Loading States
```tsx
// Skeleton loading
<div className="animate-pulse">
  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
</div>
```

## Error States

### Empty States
```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
    <Bell className="w-8 h-8 text-gray-400" />
  </div>
  <h3 className="text-lg font-medium text-gray-900 mb-2">No notifications</h3>
  <p className="text-sm text-gray-500">You're all caught up!</p>
</div>
```

### Error States
```tsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
    <AlertCircle className="w-8 h-8 text-red-500" />
  </div>
  <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to load notifications</h3>
  <p className="text-sm text-gray-500 mb-4">Please try again later</p>
  <button className="text-blue-600 hover:text-blue-500 text-sm font-medium">
    Retry
  </button>
</div>
```

## Implementation Notes

### Component Architecture
```
NotificationBell (Header)
├── NotificationsDrawer (Overlay)
│   ├── NotificationItem (List Item)
│   ├── NotificationDetailsDrawer (Modal)
│   └── FilterControls
└── NotificationPreferences (Settings Page)
```

### State Management
- Use React Query for server state
- Local state for UI interactions
- Optimistic updates for immediate feedback
- Real-time updates via WebSocket

### Performance Considerations
- Virtual scrolling for large lists
- Debounced search input
- Lazy loading of notification details
- Efficient re-renders with memoization

This specification ensures consistent, accessible, and performant notification experiences across the IFMS platform.
