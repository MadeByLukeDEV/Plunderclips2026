"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient, lastLoginMethodClient } from "better-auth/client/plugins";
import { ac, roles } from "./permissions";

export const authClient = createAuthClient({
  plugins: [adminClient({ ac, roles }), lastLoginMethodClient()],
});

export const { signIn, signOut, useSession, linkSocial, unlinkAccount } = authClient;
