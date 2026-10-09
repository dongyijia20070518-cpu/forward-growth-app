import { NextRequest, NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { loadState } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getChatGPTUser();
    if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    const localDate = request.nextUrl.searchParams.get("date") ?? "";
    return NextResponse.json(await loadState(user.userId, localDate));
  } catch (error) {
    console.error("state_load_failed", error);
    return NextResponse.json({ error: "暂时无法读取你的数据，请稍后重试。" }, { status: 503 });
  }
}
