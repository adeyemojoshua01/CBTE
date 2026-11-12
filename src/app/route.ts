// src/app/api/ai-brain/route.ts
import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

type GroqModel = { id: string };

export async function POST(request: NextRequest) {
  try {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY is not configured. AI grading is currently unavailable.");

    const { studentAnswer, imageBase64, referenceAnswer, maxMarks, isImage } = await request.json();

    if (isImage ? !imageBase64 || !String(imageBase64).startsWith("data:image/") : !studentAnswer) {
      return NextResponse.json({ error: "An answer is required." }, { status: 400 });
    }

    const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    const marks = Math.max(1, Math.min(100, Number(maxMarks) || 10));
    const reference = String(referenceAnswer || "General knowledge").slice(0, 10000);

    // ---- 1. Discover available models (validated) ----
    const modelsResponse = await fetch("https://api.groq.com/openai/v1/models", { headers, cache: "no-store" });
    if (!modelsResponse.ok) {
      return NextResponse.json({ error: `Groq models endpoint returned ${modelsResponse.status}` }, { status: 502 });
    }
    const modelsPayload = await modelsResponse.json();
    const availableModels: string[] = Array.isArray(modelsPayload?.data)
      ? (modelsPayload.data as GroqModel[]).map(m => m.id)
      : [];
    if (!availableModels.length) {
      return NextResponse.json({ error: "Groq returned an unexpected model payload." }, { status: 502 });
    }

    // ---- 2. Build ordered candidate list ----
    const candidates: string[] = isImage
      ? [
          "meta-llama/llama-4-maverick-17b-128e-instruct",
          "meta-llama/llama-4-scout-17b-16e-instruct",
          ...availableModels.filter(id => /vision|llava/i.test(id))
        ]
      : [
          "llama-3.3-70b-versatile",
          "llama-3.1-8b-instant",
          ...availableModels
            .filter(id => !/vision|whisper|guard|tts/i.test(id))
            .sort((a, b) => {
              const size = (id: string) => parseInt(id.match(/(\d+)b/i)?.[1] || "0", 10);
              return size(b) - size(a);
            })
        ];

    const usable = [...new Set(candidates.filter(id => availableModels.includes(id)))];
    if (!usable.length) {
      return NextResponse.json(
        { error: isImage ? "No vision model is available for image grading." : "No text grading model is available." },
        { status: 500 }
      );
    }

    // ---- 3. Build prompt + messages (once) ----
    const prompt = `You are a fair, constructive exam grader. ${
      isImage
        ? "First transcribe the student's handwritten answer faithfully, then grade it."
        : "Grade the student's written answer."
    } Compare the answer with the reference answer, award an integer or decimal score from 0 to ${marks}, and give specific helpful feedback. Reference answer: ${reference}. ${
      isImage
        ? "Return ONLY a JSON object with keys score, reason, transcription."
        : `Student answer: ${String(studentAnswer).slice(0, 10000)}. Return ONLY a JSON object with keys score and reason.`
    }`;

    const messages = isImage
      ? [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageBase64 } }] }]
      : [{ role: "user", content: prompt }];

    // ---- 4. Try each candidate until one succeeds ----
    let lastError: unknown = null;
    let parsed: { score?: number; reason?: string; transcription?: string } | null = null;

    for (const model of usable) {
      try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages,
            response_format: { type: "json_object" },
            max_tokens: 800,
            temperature: 0.1
          }),
          cache: "no-store"
        });

        const completion = await response.json();
        if (!response.ok) {
          const err = Object.assign(new Error(completion.error?.message || `Groq returned ${response.status}`), {
            status: response.status
          });
          lastError = err;
          if (response.status >= 500 || response.status === 429) continue; // try next model
          throw err; // fail fast on non-transient 4xx
        }

        const content: string = completion.choices?.[0]?.message?.content || "";
        try {
          parsed = JSON.parse(content);
        } catch {
          const match = content.match(/\{[\s\S]*\}/);
          if (!match) throw new Error("The AI returned an invalid grade.");
          parsed = JSON.parse(match[0]);
        }
        console.log(`AI Brain: graded with ${model}`);
        break;
      } catch (err) {
        lastError = err;
        const status = (err as { status?: number }).status;
        if (status && status < 500 && status !== 429) throw err;
      }
    }

    if (!parsed) throw lastError instanceof Error ? lastError : new Error("All candidate models failed.");

    return NextResponse.json({
      score: Math.max(0, Math.min(marks, Number(parsed.score) || 0)),
      reason: String(parsed.reason || "No feedback provided."),
      transcription: parsed.transcription ? String(parsed.transcription) : null
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The AI Brain is currently offline." },
      { status: 500 }
    );
  }
}