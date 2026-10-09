import { chatGPTSignOutPath, requireChatGPTUser } from "@/app/chatgpt-auth";
import { GrowthApp } from "@/components/growth-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <GrowthApp account={{ userId: user.userId, email: user.email }} signOutPath={chatGPTSignOutPath("/")} />;
}
