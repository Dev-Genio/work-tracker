"use client";

import { AuthView } from "@neondatabase/auth-ui";

export default function SignInPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <AuthView pathname="sign-in" />
    </main>
  );
}
