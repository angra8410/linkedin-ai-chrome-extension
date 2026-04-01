import type { GenerationInputMode, UserBrandProfile } from "../types";

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function primaryIndustry(profile: UserBrandProfile): string {
  return profile.industries[0] || "data";
}

function topSkills(profile: UserBrandProfile, count = 4): string {
  return profile.skills.slice(0, count).join(", ");
}

function listOrFallback(values: string[], fallback: string): string {
  return values.length > 0 ? values.join(", ") : fallback;
}

function hashString(value: string): number {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  return hash;
}

function pickDeterministic<T>(seed: string, items: T[]): T {
  return items[hashString(seed) % items.length];
}

export function looksLikeSourceMaterial(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length >= 160 ||
    trimmed.includes("\n") ||
    /[.!?][\s\S]+[.!?]/.test(trimmed)
  );
}

function toneGuidance(profile: UserBrandProfile): string {
  switch (profile.tone) {
    case "conversational":
      return "Write like a smart colleague talking plainly after doing the work. Contractions are welcome.";
    case "authoritative":
      return "Sound decisive and experienced, but not polished to the point of losing personality.";
    case "story-driven":
      return "Lean into scene, tension, and what changed without turning it into fiction or fluff.";
    default:
      return "Keep it grounded, clear, and practical, with enough personality to feel lived-in.";
  }
}

const ANTI_CORPORATE_SOFTENERS = [
  '"learning experience"',
  '"let\'s say"',
  '"interesting challenge"',
  '"journey"',
  '"it feels like a step back" unless that exact wording is earned',
  '"the reality is proving pretty different"',
  '"something" as a vague stand-in for a concrete problem',
];

type PostPreset = {
  opening: string;
  angle: string;
  cadence: string;
  closing: string;
};

const POST_PRESETS: PostPreset[] = [
  {
    opening: "Lead with a blunt opinion or a short line of tension.",
    angle: "Focus on a frustrating limitation, tradeoff, or thing that did not work as expected.",
    cadence: "Use short paragraphs with at least one punchy standalone sentence.",
    closing: "End on a sharp observation or a specific question, whichever feels stronger.",
  },
  {
    opening: "Open with an unexpected observation from hands-on work.",
    angle: "Show what looked easy on paper but became messy in practice.",
    cadence: "Mix one short sentence with longer explanatory lines so it feels spoken, not templated.",
    closing: "Close with the practical implication for peers dealing with the same kind of problem.",
  },
  {
    opening: "Start with the decision, shift, or change that triggered the issue.",
    angle: "Contrast expectation versus reality and make the tension obvious.",
    cadence: "Keep the rhythm uneven and natural, not symmetrical paragraph by paragraph.",
    closing: "End with a candid takeaway and, only if earned, invite others to compare experiences.",
  },
  {
    opening: "Start mid-thought with the strongest concrete point, not a generic hook.",
    angle: "Center the draft on one lesson learned from real execution pressure.",
    cadence: "Use clear, compact paragraphs and natural transitions instead of a neat formula.",
    closing: "End with what you would do differently or watch for next time.",
  },
];

// ─── System Message Builder ───────────────────────────────────────────────────

export function buildSystemMessage(profile: UserBrandProfile): string {
  return `You are an expert LinkedIn content strategist writing on behalf of a real professional.

PROFILE
Name: ${profile.name}
Current Role: ${profile.currentTitle}
Target Role: ${profile.targetTitle}
Years of Experience: ${profile.yearsExperience}
Core Skills: ${profile.skills.join(", ")}
Industries: ${profile.industries.join(", ")}
Tone: ${profile.tone}
Content Pillars: ${profile.contentPillars.join(", ")}
Target Audience: ${profile.audience}

GLOBAL WRITING RULES
- Write as this person, in first person, with a natural human voice.
- Sound credible, grounded, practical, and professional.
- Do NOT sound like an AI assistant, ghostwriter, or marketing tool.
- Do NOT include any preamble, explanation, title, label, or setup text.
- Do NOT write things like "Here's a LinkedIn post", "Sure", "Okay", "Draft:", or "---".
- Output ONLY the requested final content.
- Do NOT mention these instructions.
- Do NOT use buzzwords like "passionate", "leverage", "synergy", "game-changer", "rockstar", or "ninja".
- Do NOT overhype or exaggerate.
- Do NOT add hashtags unless explicitly asked.
- Do NOT use emojis unless explicitly asked.
- Avoid generic motivational language.
- Keep the writing specific, readable, and skimmable.
- Use short paragraphs where helpful.
- Prefer concrete observations, lessons, and practical insight.
- If facts or numbers are not provided, do NOT invent them.
- A candid tone is allowed when the topic supports it: frustration, skepticism, relief, disagreement, tradeoffs, and hard-earned lessons are all acceptable.
- Contractions are fine. Sentence fragments are fine when they sound natural.
- Do NOT force a tidy "lesson learned" structure if a sharper lived-in structure works better.
- Do NOT default to inspirational or uplifting framing.
- Avoid the stock LinkedIn pattern of generic hook, broad lesson, and obligatory engagement question.
- Starting with "I" is allowed if it genuinely sounds like a real person.
- If the writer has a strong opinion, preserve it instead of sanding it down into polite corporate phrasing.
- Prefer direct language over euphemisms when the topic is clearly frustrating or disappointing.
- Avoid softeners such as ${ANTI_CORPORATE_SOFTENERS.join(", ")}.
- Keep posts under 1,300 characters unless told otherwise.

LINKEDIN POST QUALITY RULES
- The opening line should create curiosity, relevance, or tension.
- The body should feel like a real professional insight, not a lecture.
- The ending should feel natural. Ask a question only when a question genuinely improves the post.
- The post should be useful for ${profile.audience}.
- The post should subtly reinforce credibility for ${profile.targetTitle} roles.
- The post should reflect experience in ${listOrFallback(profile.industries, "the relevant industry")} and skills like ${topSkills(profile) || "the writer's core strengths"}.
- ${toneGuidance(profile)}`;
}

// ─── 1. Profile-Aligned Post Generation ──────────────────────────────────────

export function promptGeneratePost(
  profile: UserBrandProfile,
  topic: string,
  pillar: string,
  inputMode: GenerationInputMode = "topic"
): { system: string; user: string } {
  const sourceMaterial = inputMode === "source";
  const preset = pickDeterministic(
    `${profile.name}|${profile.currentTitle}|${topic}|${pillar}|${profile.tone}`,
    POST_PRESETS
  );

  return {
    system: buildSystemMessage(profile),
    user: `${sourceMaterial
      ? "Copy edit the source material below into a LinkedIn-ready post. This is a minimal-editing task, not a rewrite and not a fresh writing task."
      : `Write one LinkedIn post about the material below.`}

Context:
- Content pillar: ${pillar}
- Audience: ${profile.audience}
- Writer role: ${profile.currentTitle}
- Target role positioning: ${profile.targetTitle}
- Industry context: ${listOrFallback(profile.industries, primaryIndustry(profile))}
- Useful skill context: ${topSkills(profile, 5) || "the writer's strongest practical skills"}

${sourceMaterial ? "Source material (treat this as authoritative source text, not a loose topic):" : "Topic idea:"}
${topic}

Required outcome:
- Write like a real professional with first-hand experience, not a polished content machine.
- Make it useful to professionals interested in ${pillar || "this topic"}.
- Keep it practical, specific, and human.
- If the topic supports it, allow disappointment, skepticism, tension, disagreement, or frustration to show up naturally.
- Do not force optimism, thought-leadership clichés, or a neat moral at the end.
- Make the writer sound like someone who has actually dealt with the tradeoffs, constraints, and messy reality.
- Preserve concrete software names, workflow details, and exact points of failure when they are available.
- If there is a blunt verdict available, prefer that over a softened paraphrase.
${sourceMaterial
  ? `- Stay close to the source material's actual argument and level of specificity.
- Your job is to copy edit, lightly compress, and format the source, not reinterpret it.
- Preserve exact concrete details like tool names, transformation layers, examples, comparison frames, and time horizons unless trimming is truly necessary.
- Preserve the same narrative stance and pronouns unless a minimal edit is required for readability.
- Keep sentence order unless a tiny move is required for readability.
- If a sentence already works, keep it verbatim or nearly verbatim.
- Reuse exact wording from the source when the source wording is already sharp.
- Prefer deleting weak or repetitive lines over inventing new bridging language.
- Allowed edits: punctuation, grammar cleanup, paragraph breaks, and trimming obvious redundancy.
- Not allowed: new claims, new framing, new self-reflection, softer substitutes, added summary sentences, or motivational spin.
- Do NOT introduce self-reflection, hindsight, personal regret, or career framing unless the source already contains it.
- Do NOT replace sharp lines with softer paraphrases or broaden specific references into vaguer ones.
- Do NOT convert an architecture argument into a personal anecdote.
- Do NOT replace strong negative wording with milder wording.
- Do NOT add new bridge sentences between paragraphs unless the source becomes hard to follow without one.
- If the source already ends with a strong question or challenge, keep that ending with only light cleanup.
- If the source already has a strong final sentence, preserve that final sentence verbatim or nearly verbatim.
- Do NOT append a new concluding sentence after a strong source ending.
- If the source already has a strong structure, follow it instead of reinventing it.`
  : `- Expand only from the actual claim, opinion, comparison, or question present in the topic idea.
- You may infer structure and emphasis from the topic idea, but keep the writing grounded.
- Do NOT invent project anecdotes, timelines, datasets, stakeholders, incidents, or technical failure details unless they are explicitly present in the topic idea.
- Do NOT fabricate scene-setting specifics such as how long something took, what dataset was involved, what broke, or who was affected unless the input already says that.
- If the topic idea is brief, stay general and sharpen the argument instead of making up an example.
- Prefer one defensible argument over a more vivid but fabricated story.`}

${sourceMaterial
  ? "Narrative direction for this draft:\n- Follow the source structure first.\n- Preserve the original emotional intensity.\n- Preserve the source ending if it is already sharp.\n- Only use the guidance below if the source is structurally weak or repetitive."
  : "Narrative direction for this draft:"}
- Opening approach: ${preset.opening}
- Core angle: ${preset.angle}
- Cadence: ${preset.cadence}
- Closing approach: ${preset.closing}
- If the source material already implies a stronger opening, angle, cadence, or closing, follow the source instead of these defaults.

Style constraints:
- No bullet points
- No numbered lists
- No hashtags
- No emojis
- No preamble or explanation
- No separators
- No mention of the person's full name
- 90-220 words
- Use 2-5 short paragraphs
- Use contractions if they sound natural
- Avoid generic phrases, filler, and recycled LinkedIn wording
- Avoid formulas like "One thing I've learned", "This is a reminder", or "In today's fast-paced world"
- Include at least one concrete friction point, constraint, or observation when relevant
- If the topic supports it, a headline-style first line such as "Tool X - disappointing so far." is allowed
- Prefer exact complaint language like "hard no", "couldn't handle it", or "what a letdown" when justified by the input, instead of sanitizing it
- Do not add autobiographical lines like "I should have" or "if I could go back" unless they are already present in the source
- In source mode, change as little as possible while still making the post clean and readable
- In source mode, do not add an extra final sentence if the source already lands cleanly
- In topic mode, do not add made-up scenes, timeframes, datasets, incidents, or implementation details to make the post feel more real
- Do not automatically end with a question if a closing observation is stronger

Return ONLY the final LinkedIn post.`,
  };
}

// ─── 2. Recruiter-Friendly Post Generation ────────────────────────────────────

export function promptRecruiterPost(
  profile: UserBrandProfile,
  achievement: string,
  inputMode: GenerationInputMode = "topic"
): { system: string; user: string } {
  const sourceMaterial = inputMode === "source";
  const preset = pickDeterministic(
    `${profile.name}|${profile.targetTitle}|${achievement}|recruiter`,
    POST_PRESETS
  );

  return {
    system: buildSystemMessage(profile),
    user: `${sourceMaterial
      ? "Copy edit the source material below into a recruiter-friendly LinkedIn post. This is a minimal-editing task, not a rewrite and not a fresh writing task."
      : "Write one recruiter-friendly LinkedIn post based on this achievement:"}

${sourceMaterial ? "Source material:" : `"${achievement}"`}
${sourceMaterial ? achievement : ""}

Goal:
- Help recruiters notice this person as a strong ${profile.targetTitle} candidate.
- Highlight practical value, relevant skills, and business impact.
- Keep it confident, but not boastful.
- Make the writer sound credible for the kinds of roles this profile is targeting.
- Highlight practical problem-solving, stakeholder value, and trust in reporting.
${sourceMaterial
  ? `
- Treat the source as authoritative.
- Copy edit and tighten it without changing the original argument or inventing personal reflection.
- Keep exact concrete details, named tools, and specific business context unless trimming is necessary.
- Keep sentence order and wording as close to the source as possible.
- If a sentence already works, keep it nearly verbatim.
- Preserve sharp wording when the source already has it.`
  : ""}

Recommended direction:
- Opening approach: ${preset.opening}
- Core angle: ${preset.angle}
- Cadence: ${preset.cadence}
- Closing approach: ${preset.closing}

Style constraints:
- Sound like a real professional reflecting on meaningful work
- No humblebrag
- No hype
- No invented metrics
- No hashtags
- No emojis
- No preamble or explanation
- No separators
- 100-200 words
- Avoid sterile résumé wording
- Show judgment, tradeoffs, and why the work mattered
- Do not rewrite strong opinions into watered-down recruiter-safe language
- End with a grounded takeaway, not a slogan

Prioritize skills such as: ${topSkills(profile, 3)}.

Return ONLY the final LinkedIn post.`,
  };
}

// ─── 3. Hook Generation ───────────────────────────────────────────────────────

export function promptGenerateHooks(
  profile: UserBrandProfile,
  topic: string
): { system: string; user: string } {
  return {
    system: buildSystemMessage(profile),
    user: `Generate 5 distinct LinkedIn post opening lines for this topic: "${topic}".

Requirements:
- Each hook must be under 12 words
- Must NOT start with "I"
- Each one should feel natural, sharp, and human
- Use 5 different angles:
  1. provocative question
  2. bold statement
  3. data-oriented angle
  4. honest admission
  5. contrarian take
- Avoid sounding cheesy or clickbait-heavy

Formatting:
- Return ONLY the 5 hooks
- Number them 1 to 5
- No explanations
- No intro sentence`,
  };
}

// ─── 4. CTA Generation ───────────────────────────────────────────────────────

export function promptGenerateCTAs(topic: string): { system: string; user: string } {
  return {
    system: `You are a LinkedIn engagement expert. Write natural, non-cringe calls to action for professional posts.`,
    user: `Generate 3 different CTA lines for a LinkedIn post about "${topic}".

CTA styles:
1. Question-based
2. Action-based
3. Reflection-based

Requirements:
- Each CTA must be 1 sentence
- Under 20 words
- Natural and professional
- No emojis
- No hype
- No generic "thoughts?" style filler unless it reads naturally

Return ONLY the 3 CTAs, numbered 1 to 3.`,
  };
}

// ─── 4B. Hashtag Generation ──────────────────────────────────────────────────

export function promptGenerateHashtags(
  profile: UserBrandProfile,
  draft: string,
  topic: string,
  pillar: string
): { system: string; user: string } {
  return {
    system: buildSystemMessage(profile),
    user: `Generate 3 to 5 highly relevant LinkedIn hashtags for the post below.

Context:
- Topic: ${topic}
- Content pillar: ${pillar || "general professional insight"}
- Target audience: ${profile.audience}
- Target role: ${profile.targetTitle}
- Skills: ${topSkills(profile, 5)}
- Industry: ${primaryIndustry(profile)}

Post:
${draft}

Hashtag strategy:
- Suggest a balanced mix of:
  1. broad professional discoverability
  2. niche skill/tool relevance
  3. audience or role intent
- Prioritize relevance over popularity.
- Avoid spammy, generic, or overly broad tags unless they are truly useful.
- Avoid duplicate roots like #Data and #DataAnalytics together unless both are clearly justified.
- Do NOT include more than 5 hashtags.
- Do NOT include explanations.
- Do NOT include bullets or numbering.
- Every item must start with #.
- Use hashtag-friendly formatting with no spaces inside a hashtag.

Return ONLY valid JSON in this exact format:
["#ExampleOne", "#ExampleTwo", "#ExampleThree"]`,
  };
}

// ─── 5. Post Rewriting ────────────────────────────────────────────────────────

export type RewriteStyle =
  | "concise"
  | "story"
  | "bold"
  | "candid"
  | "data-driven"
  | "question-led"
  | "linkedin-polish"
  | "shorter"
  | "more-human";

export function promptRewritePost(
  profile: UserBrandProfile,
  originalDraft: string,
  style: RewriteStyle
): { system: string; user: string } {
  const styleInstructions: Record<RewriteStyle, string> = {
    concise:
      "Rewrite it shorter and punchier. Cut filler, keep the strongest point, and do not force a closing question. Max 120 words.",
    story:
      "Rewrite it as a compact professional story with a clear situation, problem, action, and lesson.",
    bold:
      "Rewrite it with a stronger and more confident voice. Make it sharper, but still credible and not arrogant.",
    candid:
      "Rewrite it as a candid first-hand post. Keep the edges, use contractions, allow blunt lines, and preserve any frustration, skepticism, or tension that makes it feel real. If the original has a strong verdict, keep that force.",
    "data-driven":
      "Rewrite it to feel more analytical and evidence-oriented. Lead with specificity, logic, and measurable thinking. Do not invent numbers.",
    "question-led":
      "Rewrite it so it opens with a strong question and then answers that question through the post.",
    "linkedin-polish":
      "Rewrite it into a cleaner LinkedIn-ready post without sanding off personality. Improve flow, tighten wording, remove generic phrasing, but keep the post sounding lived-in rather than corporate.",
    shorter:
      "Rewrite it into a shorter version with the same meaning. Keep the strongest hook and one key insight. End with a sharp closing line only if it helps. Max 90 words.",
    "more-human":
      "Rewrite it to sound more personal, natural, and less AI-like. Use simple wording, natural rhythm, contractions, and realistic professional language. Remove anything overly polished, generic, or workshop-written.",
  };

  return {
    system: buildSystemMessage(profile),
    user: `Rewrite the LinkedIn post below in "${style}" style.

Original post:
${originalDraft}

Style instruction:
${styleInstructions[style]}

Requirements:
- Treat the original post as authoritative source text, not a loose summary.
- Preserve the core meaning
- Preserve all factual claims
- Improve readability and authenticity
- Remove filler and AI-sounding phrasing
- Do not flatten strong opinions or real friction into safe corporate language
- Keep varied sentence lengths so it reads like a person, not a template
- Keep concrete tool names, exact failure points, and blunt conclusions intact whenever possible
- Do not replace a sharp opener with a safer paraphrase
- Do not introduce new self-reflection, hindsight, or personal regret unless it already exists in the source
- Do not generalize specific references such as tool names, layers, examples, or time horizons into broader language
- No preamble
- No commentary
- No labels
- Return ONLY the rewritten post`,
  };
}

// ─── 6. Draft Scoring ─────────────────────────────────────────────────────────

export function promptScoreDraft(draft: string): { system: string; user: string } {
  return {
    system: `You are a LinkedIn content quality analyst. Score posts objectively using a structured rubric. Always respond in valid JSON.`,
    user: `Score this LinkedIn post on 5 dimensions, each from 0 to 10.

POST:
${draft}

Return ONLY a valid JSON object with this exact structure:
{
  "scores": {
    "hook": <0-10>,
    "clarity": <0-10>,
    "relevance": <0-10>,
    "cta": <0-10>,
    "authenticity": <0-10>
  },
  "feedback": [
    "<specific improvement suggestion 1>",
    "<specific improvement suggestion 2>",
    "<specific improvement suggestion 3>"
  ]
}

Scoring criteria:
- hook: Does the first line stop the scroll?
- clarity: Is the message clear and easy to follow?
- relevance: Is this useful or interesting to a professional audience?
- cta: Does it end with a natural invitation to engage?
- authenticity: Does it sound like a real human, not AI?`,
  };
}

// ─── 7. Content Pillar Generation ────────────────────────────────────────────

export function promptGeneratePillars(
  profile: UserBrandProfile
): { system: string; user: string } {
  return {
    system: buildSystemMessage(profile),
    user: `Generate 4 LinkedIn content pillars tailored to this professional.

For each pillar provide:
- name
- description
- 3 exampleTopics

Requirements:
- Make them specific to ${profile.targetTitle} positioning
- Make them relevant to ${primaryIndustry(profile)}
- Keep them practical, not generic personal-brand fluff
- Ensure the pillars are distinct from each other

Return ONLY valid JSON in this exact shape:
[
  {
    "name": "",
    "description": "",
    "exampleTopics": ["", "", ""]
  }
]`,
  };
}

// ─── 8. Weekly Content Planning ───────────────────────────────────────────────

export function promptWeeklyPlan(
  profile: UserBrandProfile,
  pillars: string[],
  postsPerWeek: number
): { system: string; user: string } {
  return {
    system: buildSystemMessage(profile),
    user: `Create a ${postsPerWeek}-post LinkedIn content plan for next week.

Available pillars: ${pillars.join(", ")}

For each planned post provide:
- dayOfWeek
- pillar
- topicIdea
- format

Requirements:
- Topic ideas must be specific, not generic
- Balance the pillars across the week
- Vary the formats across: list, story, insight, question, data
- Start the week with the strongest hook-friendly topic
- Make the plan relevant for attracting ${profile.targetTitle} opportunities

Return ONLY valid JSON in this exact shape:
[
  {
    "dayOfWeek": 1,
    "pillar": "",
    "topicIdea": "",
    "format": ""
  }
]`,
  };
}

// ─── 9. Recruiter Visibility Suggestions ──────────────────────────────────────

export function promptRecruiterVisibility(
  profile: UserBrandProfile
): { system: string; user: string } {
  return {
    system: buildSystemMessage(profile),
    user: `Provide 5 specific LinkedIn positioning suggestions to improve recruiter visibility for ${profile.targetTitle} roles in the ${profile.industries.join("/")} industry.

Focus on:
- which skills to mention more often from: ${profile.skills.join(", ")}
- what proof-of-work content to create
- which topics to associate with
- what type of posts get recruiter attention for this role
- how to differentiate from similar candidates

Requirements:
- Be specific
- Be practical
- No generic advice
- Each suggestion must be actionable within 1 week

Return ONLY the 5 suggestions as a numbered list.`,
  };
}

// ─── 10. Performance Reflection ───────────────────────────────────────────────

export function promptPerformanceReflection(
  logsJson: string
): { system: string; user: string } {
  return {
    system: `You are a LinkedIn analytics coach. Analyze post performance data and extract actionable patterns. Be specific and data-driven. Always return valid JSON.`,
    user: `Analyze the following LinkedIn post performance logs:

${logsJson}

Return ONLY valid JSON in this exact shape:
{
  "topPillar": "",
  "topFormat": "",
  "bestTiming": "",
  "recommendation": "",
  "stopDoing": ""
}

Interpretation rules:
- topPillar: best performing pillar by engagement rate if possible
- topFormat: best performing content format
- bestTiming: any useful day or time pattern visible in the data
- recommendation: one clear thing to do more of
- stopDoing: one clear thing to reduce or avoid`,
  };
}
