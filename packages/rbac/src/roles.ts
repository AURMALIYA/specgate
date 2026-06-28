/**
 * Roles and capabilities. Neutral: this is the access model, not any vendor's.
 * Identity *sources* (e.g. an OAuth provider that maps repo permissions to these
 * roles) live in adapters; this package only knows the roles and what each can do.
 */

export const ROLES = ["viewer", "developer", "contributor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = ["view", "author", "approve", "run", "merge", "override"] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** What each role may do. Higher roles are supersets, but kept explicit for clarity. */
export const CAPABILITY_MATRIX: Record<Role, readonly Capability[]> = {
  viewer: ["view"],
  developer: ["view", "author"],
  contributor: ["view", "author", "approve"],
  admin: ["view", "author", "approve", "run", "merge", "override"],
};

/** True when a role holds a capability. */
export function can(role: Role, capability: Capability): boolean {
  return CAPABILITY_MATRIX[role]?.includes(capability) ?? false;
}

/** Authorize a (possibly absent) role for a capability. */
export function authorize(role: Role | null | undefined, capability: Capability): boolean {
  return !!role && can(role, capability);
}

/** Capabilities that only admins hold — the privileged actions. */
export const ADMIN_ONLY: Capability[] = ["run", "merge", "override"];
