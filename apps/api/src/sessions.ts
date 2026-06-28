import { randomUUID } from "node:crypto";
import type { Principal } from "@specgate/rbac";

export interface Session {
  id: string;
  principal: Principal;
  /** The user access token (used to call SCM APIs on the user's behalf). */
  token?: string;
  createdAt: number;
}

/** In-memory session store keyed by an opaque cookie id. */
export class SessionStore {
  private readonly map = new Map<string, Session>();

  create(principal: Principal, token?: string): Session {
    const id = randomUUID();
    const session: Session = { id, principal, token, createdAt: Date.now() };
    this.map.set(id, session);
    return session;
  }
  get(id: string): Session | undefined {
    return this.map.get(id);
  }
  delete(id: string): void {
    this.map.delete(id);
  }
}

export const SESSION_COOKIE = "sg_session";

/** Read a named cookie from a Cookie header. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function setCookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Path=/; SameSite=Lax`;
}

export function clearCookie(name: string): string {
  return `${name}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
