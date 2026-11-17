"use client";

import { signOut } from "next-auth/react";

export function AccountSignOutButton() {
  return <button className="button secondary" type="button" onClick={() => void signOut({ callbackUrl: "/" })}>Sign out</button>;
}
