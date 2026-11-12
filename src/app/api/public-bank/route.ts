import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const { filename, code, repoOwner, repoName } = await request.json();
    const token = process.env.GITHUB_TOKEN;
    if (!token || !repoOwner || !repoName || !filename || !code) return NextResponse.json({ error: "Missing GitHub token or required repository and bank details." }, { status: 400 });
    if (!/^[\w.-]+$/.test(filename) || !filename.endsWith(".js") || !/^[\w.-]+$/.test(repoOwner) || !/^[\w.-]+$/.test(repoName)) return NextResponse.json({ error: "Invalid repository or filename." }, { status: 400 });
    const url = `https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/contents/question-banks/${encodeURIComponent(filename)}`;
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" };
    const existing = await fetch(url + "?ref=main", { headers, cache: "no-store" });
    let sha: string | undefined;
    if (existing.ok) sha = (await existing.json()).sha;
    else if (existing.status !== 404) { if (existing.status === 403) throw new Error('Permission Denied. Ensure your Fine-Grained token has "Contents: Read and Write" access to this repository.'); throw new Error(`Could not check repository (${existing.status}).`); }
    const message = `${sha ? "Update" : "Add"} question bank: ${filename}`;
    const uploaded = await fetch(url, { method: "PUT", headers, body: JSON.stringify({ message, content: Buffer.from(String(code)).toString("base64"), sha, branch: "main" }), cache: "no-store" });
    if (!uploaded.ok) { if ([403, 404].includes(uploaded.status)) throw new Error('Permission Denied. Ensure your Fine-Grained token has "Contents: Read and Write" access to this repository.'); const info = await uploaded.json().catch(() => ({})); throw new Error(info.message || `GitHub rejected the upload (${uploaded.status}).`); }
    const data = await uploaded.json();
    return NextResponse.json({ success: true, message, commitUrl: data.commit?.html_url || null });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Publishing failed." }, { status: 500 }); }
}
