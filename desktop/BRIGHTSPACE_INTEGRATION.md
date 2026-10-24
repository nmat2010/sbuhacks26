# Brightspace Integration Guide

## Overview
This document outlines how to implement Brightspace (D2L) integration for automatic course and assignment syncing.

## What is Brightspace?
Brightspace (by D2L) is Stony Brook University's learning management system. Students use it to:
- Access course materials
- View assignments and due dates
- Check grades
- Submit coursework

## Integration Goals
- **Import Courses**: Automatically fetch enrolled courses for the semester
- **Sync Assignments**: Import assignments with due dates and descriptions
- **Auto-update**: Periodic sync to keep assignments current
- **Plan Integration**: Convert assignments into plan items with due dates

## Implementation Steps

### 1. Brightspace API Setup

Brightspace uses the Valence Learning Framework API. You'll need:

**API Credentials:**
- Application ID
- Application Key
- User ID
- User Key

**Get credentials from:**
- SBU IT or Brightspace administrator
- Register your app in the Brightspace Developer Portal

### 2. OAuth Authentication Flow

```typescript
// src/main/integrations/brightspace/auth.ts

interface BrightspaceConfig {
  host: string; // e.g., 'brightspace.stonybrook.edu'
  appId: string;
  appKey: string;
}

async function authenticateBrightspace(config: BrightspaceConfig) {
  // 1. Generate authentication URL
  const authUrl = generateAuthUrl(config);

  // 2. Open browser for user login
  // 3. Handle callback with tokens
  // 4. Store tokens securely in database
}
```

### 3. Fetch Courses

**API Endpoint:**
```
GET /d2l/api/lp/{version}/enrollments/myenrollments/
```

**Response:**
```json
{
  "Items": [
    {
      "OrgUnit": {
        "Id": 12345,
        "Name": "CSE 214 - Data Structures",
        "Code": "CSE214"
      },
      "Access": {
        "IsActive": true,
        "StartDate": "2026-08-24T00:00:00.000Z",
        "EndDate": "2026-12-18T23:59:59.000Z"
      }
    }
  ]
}
```

**Implementation:**
```typescript
// src/main/integrations/brightspace/courses.ts

interface BrightspaceCourse {
  id: number;
  name: string;
  code: string;
  startDate: string;
  endDate: string;
}

async function fetchCourses(userId: string): Promise<BrightspaceCourse[]> {
  const response = await fetch(
    `https://brightspace.stonybrook.edu/d2l/api/lp/1.28/enrollments/myenrollments/`,
    {
      headers: {
        'Authorization': `Bearer ${getAccessToken()}`
      }
    }
  );

  const data = await response.json();
  return data.Items.map(item => ({
    id: item.OrgUnit.Id,
    name: item.OrgUnit.Name,
    code: item.OrgUnit.Code,
    startDate: item.Access.StartDate,
    endDate: item.Access.EndDate
  }));
}
```

### 4. Fetch Assignments

**API Endpoint:**
```
GET /d2l/api/le/{version}/{orgUnitId}/dropbox/folders/
GET /d2l/api/le/{version}/{orgUnitId}/dropbox/folders/{folderId}/
```

**Response:**
```json
[
  {
    "Id": 67890,
    "Name": "Assignment 1: Linked Lists",
    "DueDate": "2026-09-15T23:59:00.000Z",
    "Instructions": {
      "Text": "Implement a doubly linked list...",
      "Html": "<p>Implement a doubly linked list...</p>"
    }
  }
]
```

**Implementation:**
```typescript
// src/main/integrations/brightspace/assignments.ts

interface BrightspaceAssignment {
  id: number;
  courseId: number;
  name: string;
  dueDate: string;
  description: string;
}

async function fetchAssignments(
  courseId: number
): Promise<BrightspaceAssignment[]> {
  // 1. Get dropbox folders (assignment containers)
  const folders = await fetch(
    `https://brightspace.stonybrook.edu/d2l/api/le/1.43/${courseId}/dropbox/folders/`
  );

  // 2. Fetch assignments from each folder
  const assignments = [];
  for (const folder of folders) {
    const folderAssignments = await fetch(
      `https://brightspace.stonybrook.edu/d2l/api/le/1.43/${courseId}/dropbox/folders/${folder.Id}/`
    );
    assignments.push(...folderAssignments);
  }

  return assignments;
}
```

### 5. Convert to Wolfie Data

```typescript
// src/main/integrations/brightspace/converter.ts

function convertToWolfieCourse(brightspaceCourse: BrightspaceCourse) {
  return {
    name: brightspaceCourse.name,
    credits: 3, // Default, user can edit
    importantDates: '' // Can extract from course calendar
  };
}

function convertToPlanItem(assignment: BrightspaceAssignment) {
  return {
    title: assignment.name,
    due_date: assignment.dueDate,
    status: 'pending',
    notes: assignment.description,
    source: 'brightspace',
    external_id: assignment.id.toString()
  };
}
```

### 6. Sync Schedule

```typescript
// src/main/integrations/brightspace/sync.ts

class BrightspaceSync {
  private syncInterval: NodeJS.Timeout | null = null;

  startAutoSync() {
    // Sync every 4 hours
    this.syncInterval = setInterval(() => {
      this.syncAll();
    }, 4 * 60 * 60 * 1000);
  }

  async syncAll() {
    console.log('[Brightspace] Starting sync...');

    const courses = await fetchCourses();

    for (const course of courses) {
      const assignments = await fetchAssignments(course.id);

      // Update database with new/changed assignments
      await updateAssignmentsInDB(course.id, assignments);
    }

    console.log('[Brightspace] Sync complete');
  }

  stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}
```

### 7. IPC Handlers

```typescript
// src/main/main.ts

import { BrightspaceSync } from './integrations/brightspace/sync';

const brightspaceSync = new BrightspaceSync();

ipcMain.handle('brightspace-connect', async (event, credentials) => {
  try {
    await authenticateBrightspace(credentials);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('brightspace-import-courses', async () => {
  try {
    const courses = await fetchCourses();
    const assignments = [];

    for (const course of courses) {
      const courseAssignments = await fetchAssignments(course.id);
      assignments.push(...courseAssignments);
    }

    return {
      success: true,
      courses,
      assignments
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('brightspace-start-sync', async () => {
  brightspaceSync.startAutoSync();
  return { success: true };
});

ipcMain.handle('brightspace-stop-sync', async () => {
  brightspaceSync.stopAutoSync();
  return { success: true };
});
```

## Security Considerations

1. **Store tokens securely** in the database, encrypted
2. **Use HTTPS** for all API calls
3. **Refresh tokens** before they expire
4. **Clear sensitive data** when user disconnects
5. **Rate limiting** - respect Brightspace API limits

## Settings UI

Add to Settings view:

```typescript
<div className="card">
  <div className="card-header">
    <h2 className="card-title">Brightspace Integration</h2>
  </div>
  <div className="card-content">
    {connected ? (
      <>
        <p>✅ Connected to Brightspace</p>
        <p>Last sync: {lastSyncTime}</p>
        <button onClick={handleSync}>Sync Now</button>
        <button onClick={handleDisconnect}>Disconnect</button>
      </>
    ) : (
      <>
        <p>Import courses and assignments from Brightspace</p>
        <button onClick={handleConnect}>Connect Brightspace</button>
      </>
    )}
  </div>
</div>
```

## Database Schema Updates

```sql
-- Add source tracking to courses
ALTER TABLE goals ADD COLUMN source TEXT DEFAULT 'manual';
ALTER TABLE goals ADD COLUMN external_id TEXT;

-- Add source tracking to plan items
ALTER TABLE plan_items ADD COLUMN source TEXT DEFAULT 'manual';
ALTER TABLE plan_items ADD COLUMN external_id TEXT;

-- Store Brightspace credentials
CREATE TABLE brightspace_auth (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Track sync status
CREATE TABLE brightspace_sync (
  id INTEGER PRIMARY KEY,
  last_sync INTEGER,
  status TEXT,
  error_message TEXT
);
```

## Testing

1. **Manual Testing**: Use SBU Brightspace test account
2. **Mock API**: Create mock responses for development
3. **Error Handling**: Test network failures, invalid tokens, etc.

## Resources

- [Brightspace API Documentation](https://docs.valence.desire2learn.com/)
- [Brightspace Authentication](https://docs.valence.desire2learn.com/basic/apicall.html)
- [D2L Developer Community](https://community.d2l.com/brightspace/kb)

## Next Steps

1. Contact SBU IT to get API credentials
2. Implement OAuth flow
3. Test with a few courses
4. Add sync UI to settings
5. Implement auto-sync with error handling
