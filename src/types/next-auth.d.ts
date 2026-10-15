import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  /** The User row as the adapter / authorize() hand it to the jwt callback. */
  interface User {
    username?: string | null
    hasSetupProfile?: boolean
  }

  interface Session {
    user: {
      id: string
      username?: string
      currency?: number
      hasSetupProfile?: boolean
    } & DefaultSession["user"]
  }
}
