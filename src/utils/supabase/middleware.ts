import { NextResponse } from "next/server";

export async function updateSession() {
  // DEV MODE: Skip auth checks entirely — pass through all requests
  return NextResponse.next();
}
