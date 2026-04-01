const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "of",
  "on",
  "or",
  "our",
  "so",
  "that",
  "the",
  "their",
  "them",
  "there",
  "they",
  "this",
  "to",
  "too",
  "was",
  "we",
  "were",
  "with",
  "you",
  "your",
]);

const GENERIC_TOPIC_EXPANSION_TOKENS = new Set([
  "actually",
  "advantage",
  "advantages",
  "argument",
  "backwards",
  "better",
  "bi",
  "build",
  "building",
  "closer",
  "complexity",
  "control",
  "coupling",
  "dependency",
  "directly",
  "etl",
  "feel",
  "feels",
  "general",
  "good",
  "great",
  "handle",
  "handling",
  "heavy",
  "implementation",
  "implementations",
  "inside",
  "layer",
  "lifting",
  "logic",
  "miss",
  "missing",
  "need",
  "optional",
  "performance",
  "point",
  "presentation",
  "problem",
  "problems",
  "push",
  "pushing",
  "reliable",
  "reliably",
  "robust",
  "simpler",
  "simple",
  "source",
  "tool",
  "tools",
  "upstream",
  "visualization",
  "warehouse",
  "work",
]);

const INVENTED_DETAIL_TOKENS = new Set([
  "affected",
  "append",
  "appends",
  "ballooned",
  "claims",
  "client",
  "clients",
  "customer",
  "customers",
  "dataset",
  "datasets",
  "gateway",
  "gateways",
  "incident",
  "incidents",
  "powerquery",
  "refresh",
  "sprint",
  "stakeholder",
  "stakeholders",
  "table",
  "tables",
  "timeline",
  "update",
  "updates",
  "volume",
  "volumes",
  "week",
  "weeks",
  "month",
  "months",
  "year",
  "years",
]);

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeForMatch(text)
    .split(" ")
    .filter((token) => token && !STOPWORDS.has(token));
}

function wordCount(text: string): number {
  return normalizeWhitespace(text).split(/\s+/).filter(Boolean).length;
}

function splitIntoSentences(paragraph: string): string[] {
  const matches = paragraph.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g);
  return (matches ?? []).map((sentence) => sentence.trim()).filter(Boolean);
}

function extractParagraphs(text: string): string[][] {
  return normalizeWhitespace(text)
    .split(/\n\s*\n/)
    .map((paragraph) => splitIntoSentences(paragraph))
    .filter((paragraph) => paragraph.length > 0);
}

function overlapScore(a: string, b: string): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);

  if (aTokens.length === 0 || bTokens.length === 0) {
    return normalizeForMatch(a) === normalizeForMatch(b) ? 1 : 0;
  }

  const bSet = new Set(bTokens);
  let common = 0;

  for (const token of aTokens) {
    if (bSet.has(token)) {
      common += 1;
    }
  }

  return common / Math.max(1, Math.min(aTokens.length, bTokens.length));
}

function countCommonTokens(aTokens: string[], bTokens: string[]): number {
  const remaining = new Map<string, number>();

  for (const token of bTokens) {
    remaining.set(token, (remaining.get(token) ?? 0) + 1);
  }

  let common = 0;

  for (const token of aTokens) {
    const count = remaining.get(token) ?? 0;
    if (count > 0) {
      common += 1;
      remaining.set(token, count - 1);
    }
  }

  return common;
}

function sentenceStats(candidate: string, source: string) {
  const candidateTokens = tokenize(candidate);
  const sourceTokens = tokenize(source);
  const common = countCommonTokens(candidateTokens, sourceTokens);
  const unsupportedCount = Math.max(0, candidateTokens.length - common);

  return {
    candidateTokens: candidateTokens.length,
    sourceTokens: sourceTokens.length,
    common,
    unsupportedCount,
    unsupportedRatio:
      candidateTokens.length === 0 ? 0 : unsupportedCount / candidateTokens.length,
    sourceCoverage: sourceTokens.length === 0 ? 0 : common / sourceTokens.length,
  };
}

function isShortSourceMaterial(source: string, sentenceCount: number): boolean {
  return (
    source.length <= 280 ||
    wordCount(source) <= 45 ||
    sentenceCount <= 2
  );
}

function isQuestion(sentence: string): boolean {
  return sentence.trim().endsWith("?");
}

function isShortTopicIdea(topic: string): boolean {
  return topic.length <= 220 || wordCount(topic) <= 36;
}

function containsUnexpectedProperNoun(sentence: string, topic: string): boolean {
  const matches = sentence.match(/\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]+|[A-Z]{2,}))*\b/g) ?? [];
  const normalizedTopic = topic.toLowerCase();

  return matches.some((match) => {
    const normalized = match.trim().toLowerCase();
    if (!normalized || normalized === "i") {
      return false;
    }

    return !normalizedTopic.includes(normalized);
  });
}

function countTopicTokenHits(text: string, topicTokenSet: Set<string>): number {
  const textTokenSet = new Set(tokenize(text));
  let hits = 0;

  for (const token of topicTokenSet) {
    if (textTokenSet.has(token)) {
      hits += 1;
    }
  }

  return hits;
}

function sentenceLooksInventedForTopic(
  topic: string,
  topicTokenSet: Set<string>,
  sentence: string
): boolean {
  const sentenceTokens = tokenize(sentence);

  if (sentenceTokens.length === 0) {
    return false;
  }

  let common = 0;
  let inventedDetailHits = 0;
  let unsupportedGeneric = 0;

  for (const token of sentenceTokens) {
    if (topicTokenSet.has(token)) {
      common += 1;
      continue;
    }

    if (GENERIC_TOPIC_EXPANSION_TOKENS.has(token)) {
      continue;
    }

    if (INVENTED_DETAIL_TOKENS.has(token)) {
      inventedDetailHits += 1;
      unsupportedGeneric += 1;
      continue;
    }

    unsupportedGeneric += 1;
  }

  const overlap = common / Math.max(1, Math.min(sentenceTokens.length, topicTokenSet.size || 1));
  const hasTimelineMarker = /\b\d+\b|\b(day|days|week|weeks|month|months|year|years|quarter|quarters|sprint|sprints)\b/i.test(
    sentence
  );
  const hasUnexpectedProperNoun = containsUnexpectedProperNoun(sentence, topic);
  const hasStrongTopicAnchor = common >= 2 || overlap >= 0.28;

  if (inventedDetailHits >= 1 && unsupportedGeneric >= 3 && overlap < 0.65) {
    return true;
  }

  if (
    (hasTimelineMarker || hasUnexpectedProperNoun) &&
    !hasStrongTopicAnchor &&
    unsupportedGeneric >= 3 &&
    overlap < 0.6
  ) {
    return true;
  }

  return false;
}

function chooseSentence(
  generatedSentence: string,
  sourceSentence: string,
  shortSource: boolean
): string {
  const generatedNormalized = normalizeForMatch(generatedSentence);
  const sourceNormalized = normalizeForMatch(sourceSentence);

  if (generatedNormalized === sourceNormalized) {
    return generatedSentence.trim();
  }

  const stats = sentenceStats(generatedSentence, sourceSentence);
  const lengthExpansion = stats.candidateTokens - stats.sourceTokens;
  const sourceIsQuestion = isQuestion(sourceSentence);
  const generatedIsQuestion = isQuestion(generatedSentence);

  if (shortSource && sourceIsQuestion) {
    const rewroteQuestionTooMuch =
      !generatedIsQuestion ||
      stats.unsupportedCount >= 2 ||
      stats.sourceCoverage < 0.85;

    if (rewroteQuestionTooMuch) {
      return sourceSentence.trim();
    }
  }

  if (
    shortSource &&
    !sourceIsQuestion &&
    !generatedIsQuestion &&
    stats.sourceCoverage >= 0.75 &&
    (stats.unsupportedCount >= 2 || lengthExpansion >= 2)
  ) {
    return sourceSentence.trim();
  }

  const hasLikelyInventedAddition =
    stats.sourceCoverage >= 0.65 &&
    stats.unsupportedCount >= (shortSource ? 3 : 5) &&
    stats.unsupportedRatio >= (shortSource ? 0.2 : 0.28);

  const driftsTooFarFromSource =
    lengthExpansion >= (shortSource ? 3 : 6) &&
    stats.unsupportedRatio >= (shortSource ? 0.18 : 0.25);

  if (hasLikelyInventedAddition || driftsTooFarFromSource) {
    return sourceSentence.trim();
  }

  return generatedSentence.trim();
}

export function cleanupSourceAdaptation(source: string, generated: string): string {
  const normalizedSource = normalizeWhitespace(source);
  const normalizedGenerated = normalizeWhitespace(generated);

  if (!normalizedSource) {
    return normalizedGenerated;
  }

  if (!normalizedGenerated) {
    return normalizedSource;
  }

  const sourceParagraphs = extractParagraphs(normalizedSource);
  const sourceSentences = sourceParagraphs.flat();
  const generatedParagraphs = extractParagraphs(normalizedGenerated);
  const generatedSentences = generatedParagraphs.flat();
  const shortSource = isShortSourceMaterial(normalizedSource, sourceSentences.length);

  if (sourceSentences.length === 0 || generatedSentences.length === 0) {
    return normalizedSource;
  }

  const matchedSourceIndexes = new Set<number>();
  const cleanedParagraphs = generatedParagraphs
    .map((paragraph) =>
      paragraph
        .map((generatedSentence) => {
          let bestIndex = -1;
          let bestScore = 0;

          for (let index = 0; index < sourceSentences.length; index += 1) {
            const score = overlapScore(generatedSentence, sourceSentences[index]);
            if (score > bestScore) {
              bestScore = score;
              bestIndex = index;
            }
          }

          if (bestIndex < 0 || bestScore < 0.55) {
            return null;
          }

          matchedSourceIndexes.add(bestIndex);
          return chooseSentence(
            generatedSentence,
            sourceSentences[bestIndex],
            shortSource
          );
        })
        .filter((sentence): sentence is string => Boolean(sentence))
    )
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => paragraph.join(" "));

  const coverage = matchedSourceIndexes.size / sourceSentences.length;
  const cleanedText = cleanedParagraphs.join("\n\n").trim();

  if (cleanedText && coverage >= (shortSource ? 0.5 : 0.65)) {
    return cleanedText;
  }

  if (coverage >= 0.7) {
    return normalizedSource;
  }

  if (cleanedText) {
    return cleanedText;
  }

  return shortSource ? normalizedGenerated : normalizedSource;
}

export function cleanupTopicExpansion(topic: string, generated: string): string {
  const normalizedTopic = normalizeWhitespace(topic);
  const normalizedGenerated = normalizeWhitespace(generated);

  if (!normalizedGenerated || !normalizedTopic) {
    return normalizedGenerated;
  }

  if (!isShortTopicIdea(normalizedTopic)) {
    return normalizedGenerated;
  }

  const topicTokenSet = new Set(tokenize(normalizedTopic));
  const generatedParagraphs = extractParagraphs(normalizedGenerated);
  const generatedWordCount = wordCount(normalizedGenerated);

  if (topicTokenSet.size === 0 || generatedParagraphs.length === 0) {
    return normalizedGenerated;
  }

  const cleanedParagraphs = generatedParagraphs
    .map((paragraph) =>
      paragraph.filter((sentence) => !sentenceLooksInventedForTopic(normalizedTopic, topicTokenSet, sentence))
    )
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => paragraph.join(" "));

  const cleanedText = cleanedParagraphs.join("\n\n").trim();
  const cleanedWordCount = wordCount(cleanedText);
  const generatedTopicHits = countTopicTokenHits(normalizedGenerated, topicTokenSet);
  const cleanedTopicHits = countTopicTokenHits(cleanedText, topicTokenSet);
  const minimumTopicHits = Math.min(3, Math.max(1, generatedTopicHits));
  const lostTooMuchSubstance =
    cleanedWordCount > 0 &&
    generatedWordCount >= 20 &&
    cleanedWordCount < generatedWordCount * 0.55;
  const lostTooManyTopicAnchors =
    cleanedText.length > 0 && cleanedTopicHits < minimumTopicHits;

  if (!cleanedText || lostTooMuchSubstance || lostTooManyTopicAnchors) {
    return normalizedGenerated;
  }

  return cleanedText;
}
