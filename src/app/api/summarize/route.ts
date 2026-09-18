import { NextResponse } from 'next/server';

interface GroupedItem {
  date: string;
  repo: string;
  messages: string[];
}

export async function POST(request: Request) {
  try {
    const { groups } = (await request.json()) as { groups: GroupedItem[] };

    if (!groups || !Array.isArray(groups) || groups.length === 0) {
      return NextResponse.json({ summaries: {} });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const rawBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const baseUrl = rawBaseUrl.replace(/\/+$/, '');
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    // If no OpenAI key is configured, fallback to bullet list combination
    if (!apiKey) {
      const fallbackSummaries: Record<string, string> = {};
      for (const g of groups) {
        const key = `${g.date}__${g.repo}`;
        fallbackSummaries[key] = g.messages.map((m) => `• ${m}`).join('\n');
      }
      return NextResponse.json({ summaries: fallbackSummaries });
    }

    // Prepare prompt with items
    const promptLines = groups.map((g, idx) => {
      return `[Item ${idx + 1}]
Tanggal: ${g.date}
Repo: ${g.repo}
Daftar Commit:
${g.messages.map((m) => `- ${m}`).join('\n')}`;
    });

    const systemPrompt = `Anda adalah asisten perangkum pekerjaan developer profesional.
Tugas Anda merangkum daftar commit menjadi 1 ringkasan pekerjaan harian (Bahasa Indonesia) yang padat, rapi, dan mudah dibaca oleh tim atau manajemen.
Format output: Kembalikan HANYA JSON objek dengan kunci string format "YYYY-MM-DD__owner/repo" (atau "DD-MM-YYYY__owner/repo" sesuai yang diberikan) dan nilai ringkasan pekerjaannya.
Contoh:
{
  "01-03-2026__owner/repo": "Memperbaiki autentikasi token dan merapikan komponen dropdown."
}`;

    const userPrompt = `Rangkum masing-masing item berikut menjadi 1 ringkasan task per tanggal dan repo:\n\n${promptLines.join(
      '\n\n'
    )}`;

    const endpoint = baseUrl.endsWith('/chat/completions')
      ? baseUrl
      : `${baseUrl}/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        stream: false,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[Summarize API] OpenAI error:', response.status, errText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const rawText = await response.text();
    let content = '';

    // Handle SSE stream response (e.g. providers defaulting to text/event-stream)
    if (rawText.trim().startsWith('data:')) {
      const lines = rawText.split('\n');
      const chunks: string[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data:') && !trimmed.includes('[DONE]')) {
          try {
            const parsed = JSON.parse(trimmed.replace(/^data:\s*/, ''));
            const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content;
            if (delta) chunks.push(delta);
          } catch {
            // ignore malformed SSE line
          }
        }
      }
      content = chunks.join('');
    } else {
      const data = JSON.parse(rawText);
      content = data.choices?.[0]?.message?.content || '';
    }

    let parsedResult: Record<string, string> = {};
    if (content) {
      try {
        // Strip markdown code block markers if present (e.g. ```json ... ```)
        const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        parsedResult = JSON.parse(cleaned);
      } catch {
        // Fallback if parsing fails
      }
    }

    // Ensure all groups have a summary
    const finalSummaries: Record<string, string> = {};
    for (const g of groups) {
      const key = `${g.date}__${g.repo}`;
      finalSummaries[key] =
        parsedResult[key] ||
        parsedResult[g.repo] ||
        g.messages.map((m) => `• ${m}`).join('\n');
    }

    return NextResponse.json({ summaries: finalSummaries });
  } catch (error) {
    console.error('[Summarize API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to summarize work' },
      { status: 500 }
    );
  }
}
