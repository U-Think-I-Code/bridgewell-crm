/**
 * Team & Roster Helper — Bridgewell CRM
 * Supports Manager, Team Leader, and Counselor hierarchy:
 * - Managers oversee the entire company and all counselors.
 * - Team Leaders lead a designated group of counselors and can assign/reassign leads only to members of their team.
 * - Counselors work on leads assigned to them.
 */

export interface TeamMetadata {
  designation?: 'manager' | 'team_leader' | 'counselor'
  team_name?: string
  team_leader_id?: string | null
  team_leader_name?: string | null
  member_ids?: string[]
}

/**
 * Safely parses the JSON metadata stored in users.languages
 */
export function parseUserTeamMeta(languages?: string | null): TeamMetadata {
  if (!languages) return {}
  try {
    const parsed = JSON.parse(languages)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed
    }
  } catch {}
  return {}
}

/**
 * Serializes TeamMetadata back to a string for storage in users.languages
 */
export function serializeUserTeamMeta(meta: TeamMetadata): string {
  return JSON.stringify(meta)
}

/**
 * Determines the effective designation: 'manager' | 'team_leader' | 'counselor'
 */
export function getUserDesignation(user: any): 'manager' | 'team_leader' | 'counselor' {
  if (!user) return 'counselor'
  if (user.role === 'manager' || user.email === 'admin@bridgewell.com') {
    return 'manager'
  }
  const meta = parseUserTeamMeta(user.languages)
  if (meta.designation === 'team_leader') {
    return 'team_leader'
  }
  return 'counselor'
}

export function isManager(user: any): boolean {
  return getUserDesignation(user) === 'manager'
}

export function isTeamLeader(user: any): boolean {
  return getUserDesignation(user) === 'team_leader'
}

export function isCounselor(user: any): boolean {
  return getUserDesignation(user) === 'counselor'
}

/**
 * Whether the user has permission to assign or reassign leads.
 * True for Managers and Team Leaders.
 */
export function canManageLeads(user: any): boolean {
  return isManager(user) || isTeamLeader(user)
}

/**
 * Returns the subset of counselors that currentUser is authorized to assign leads to.
 * - Manager: All counselors.
 * - Team Leader: Only counselors belonging to their team (plus optionally themselves).
 * - Counselor: Empty array (no assignment rights).
 */
export function getAssignableCounselors(currentUser: any, allCounselors: any[], includeSelf: boolean = false): any[] {
  if (!currentUser) return []
  if (isManager(currentUser)) {
    return allCounselors
  }
  if (isTeamLeader(currentUser)) {
    const meta = parseUserTeamMeta(currentUser.languages)
    const allowedIds = new Set<string>(meta.member_ids || [])
    if (includeSelf) {
      allowedIds.add(currentUser.id)
    }

    return allCounselors.filter(c => {
      if (!includeSelf && c.id === currentUser.id) return false
      if (allowedIds.has(c.id)) return true
      const cMeta = parseUserTeamMeta(c.languages)
      return cMeta.team_leader_id === currentUser.id
    })
  }
  return []
}

/**
 * Returns the set of owner IDs that currentUser is authorized to view.
 * Returns null if the user is a manager (unrestricted access to all leads, including unassigned).
 * For Team Leaders: Only leads assigned to the Team Leader or their team counselors (NO unassigned leads).
 * For Counselors: Only leads assigned to that counselor.
 */
export function getAllowedOwnerIds(currentUser: any, allCounselors: any[]): Set<string> | null {
  if (!currentUser || isManager(currentUser)) {
    return null // Unrestricted (sees all, including unassigned leads)
  }
  if (isTeamLeader(currentUser)) {
    const meta = parseUserTeamMeta(currentUser.languages)
    const set = new Set<string>(meta.member_ids || [])
    allCounselors.forEach(c => {
      const cMeta = parseUserTeamMeta(c.languages)
      if (cMeta.team_leader_id === currentUser.id) {
        set.add(c.id)
      }
    })
    set.add(currentUser.id)
    // CRITICAL: Unassigned leads (owner_id IS NULL) are NOT given to TL yet.
    // Team Leader only gets leads once Admin assigns leads to them (owner_id = TL.id).
    return set
  }
  // Regular counselor: only themselves
  return new Set([currentUser.id])
}
