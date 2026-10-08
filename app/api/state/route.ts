import {NextResponse} from "next/server";
import {loadState} from "@/lib/data";
export async function GET(){try{return NextResponse.json(await loadState());}catch(error){console.error("state_load_failed",error);return NextResponse.json({error:"暂时无法读取你的数据，请稍后重试。"},{status:503});}}
