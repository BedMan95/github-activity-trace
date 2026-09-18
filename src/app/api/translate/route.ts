import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { texts, target = 'id' } = await request.json();

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return NextResponse.json({ translations: [] });
    }

    // Limit batch to 50 texts
    const items = texts.slice(0, 50).map((t: string) => (t || '').replace(/\r?\n/g, ' '));
    const combined = items.join('\n');

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
      target
    )}&dt=t&q=${encodeURIComponent(combined)}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Translation API error: ${res.status}`);
    }

    const data = await res.json();
    const translatedCombined = data[0].map((chunk: [string]) => chunk[0]).join('');
    const translations = translatedCombined.split('\n');

    return NextResponse.json({
      translations: items.map((_, i) => translations[i] || items[i]),
    });
  } catch (error) {
    console.error('Translation error:', error);
    return NextResponse.json(
      { error: 'Failed to translate texts' },
      { status: 500 }
    );
  }
}
