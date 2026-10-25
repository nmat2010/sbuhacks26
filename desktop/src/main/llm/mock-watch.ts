// Deterministic Watch-mode replies for DEMO_MODE and tests (no network). The watcher passes what
// it knows as `mockKey`; the mock echoes it back in the observation and answer shapes.

interface ObserveKey {
  appName?: string;
  title?: string | null;
  domain?: string | null;
  contentUrl?: string | null;
  problemId?: string | null;
}

export function mockWatchObserve(key: Record<string, unknown> | undefined): unknown {
  const k = (key ?? {}) as ObserveKey;
  const url = k.contentUrl ?? '';
  const video = /youtube\.com\/watch/.test(url);
  const paper = /\.pdf$|arxiv\.org/.test(url);
  const homework = !!k.problemId;
  return {
    activity: homework ? 'homework' : video ? 'watching_video' : paper ? 'reading_paper' : 'other',
    mode: homework ? 'homework' : video || paper ? 'learning' : 'other',
    subject: k.title || k.appName || 'your work',
    source: {
      kind: video ? 'video' : paper ? 'paper' : homework ? 'webpage' : 'other',
      title: k.title ?? null,
      locator: null
    },
    summary: `The student is looking at ${k.title || k.appName || 'something'}.`,
    key_points: [],
    stuck: { likely: false, confidence: 0, reason: null },
    unanswered_question: null,
    answer_checks: []
  };
}

export function mockWatchAnswer(key: Record<string, unknown> | undefined): unknown {
  const k = (key ?? {}) as { question?: string; mode?: string; sources?: Array<{ n: number; title: string }> };
  const first = k.sources?.[0];
  if (k.mode === 'homework') {
    return {
      answer: 'Look again at the step where your work changes direction. What rule are you applying there?',
      grounded: false,
      citations: []
    };
  }
  if (/\b(recommend|suggest|resources?|materials?|learn more|should i (learn|watch|read))\b/i.test(k.question ?? '')) {
    return {
      answer: 'Start with the basics of the method, then come back to the paper.',
      grounded: false,
      citations: [],
      resources: [
        { kind: 'video', title: 'An intro video', search_query: `${k.question} explained`, url: null, why: 'A short overview' }
      ]
    };
  }
  return {
    answer: first
      ? `Here is what ${first.title} says about that: it is explained in the part you were just reading.`
      : 'Here is a short explanation based on what you have been studying.',
    grounded: !!first,
    citations: first ? [{ n: first.n, locator: null }] : []
  };
}
