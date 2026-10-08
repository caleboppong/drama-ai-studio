import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const admin = await requireAdmin(request);
    if (admin.error) {
      return NextResponse.json(
        { success: false, isAdmin: false, message: admin.error },
        { status: admin.status }
      );
    }

    return NextResponse.json({
      success: true,
      isAdmin: true,
      userId: admin.user.id,
    });
  } catch (error) {
    console.error("Admin access error:", error);
    return NextResponse.json(
      { success: false, isAdmin: false, message: "Unable to verify admin access." },
      { status: 500 }
    );
  }
}
