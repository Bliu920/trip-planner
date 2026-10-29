import { handleWorkspace } from "@/services/workspace";
export async function GET(request:Request,{params}:{params:Promise<{reference:string}>}) { return handleWorkspace(request,(await params).reference); }
