import { Service, computed, signal } from '@angular/core';

interface OperatorCredentials {
  readonly username: string;
  readonly password: string;
}

/**
 * Holds the signed-in operator's credentials for the venue write API (U7). The real staff/admin
 * identity model is deferred; for now the editor captures a username/password and this service
 * turns them into the `Authorization: Basic` header the {@link operatorAuthInterceptor} attaches
 * to write requests. Single responsibility: credential state + the header; it makes no HTTP calls
 * of its own. In-memory only (a signal) — nothing is persisted, so a reload signs the operator out.
 */
@Service()
export class OperatorAuth {
  private readonly credentials = signal<OperatorCredentials | undefined>(undefined);

  /** Whether an operator credential is currently held. */
  readonly signedIn = computed(() => this.credentials() !== undefined);
  /** The signed-in operator's username, or undefined when signed out. */
  readonly username = computed(() => this.credentials()?.username);

  signIn(username: string, password: string): void {
    this.credentials.set({ username, password });
  }

  signOut(): void {
    this.credentials.set(undefined);
  }

  /** The `Authorization: Basic` header value for operator writes, or undefined when signed out. */
  basicAuthHeader(): string | undefined {
    const c = this.credentials();
    if (!c) {
      return undefined;
    }
    // UTF-8 → base64. `btoa` only accepts Latin-1, so a credential with any character above U+00FF
    // (an accented or non-Latin password) would throw — encode the bytes first.
    const bytes = new TextEncoder().encode(`${c.username}:${c.password}`);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return `Basic ${btoa(binary)}`;
  }
}
