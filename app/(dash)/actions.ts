"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

/** Prende o apaga el modo liviano (sin desenfoque) para equipos modestos. */
export async function alternarLiviano() {
  const jar = await cookies();
  const actual = jar.get("lite")?.value === "1";
  jar.set("lite", actual ? "0" : "1", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
